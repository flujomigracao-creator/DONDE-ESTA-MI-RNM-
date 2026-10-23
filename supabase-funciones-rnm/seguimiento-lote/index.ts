// Envía la plantilla de Meta `seguimiento_tramite` a los leads de la tabla seguimiento_lote que aún no la recibieron.
// Pedido del dueño (9-oct-2026): se manda ya y también a los leads con Nora apagada/pausada. Solo se salta un lead si pagó o pasó a
// operaciones, si el cliente escribió de nuevo (lo atiende quien tenga el chat) o si alguien le escribió en las últimas 3 horas.
// Es inerte si la tabla no tiene pendientes, así que llamarla por error no manda nada que no esté en la tabla.
// Solo para uso interno: la llama pg_cron (seguimiento_lote_plantilla) con x-cron-token (rnm_config.interno_cron_token) o la clave de servicio.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { timingSafeEqual } from 'node:crypto';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

const igual = (a: string, b: string) => {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
async function esInterno(req: Request, admin: SupabaseClient, serviceKey: string) {
  const clave = (req.headers.get('apikey') || req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (clave && igual(clave, serviceKey)) return true;
  const cron = (req.headers.get('x-cron-token') || '').trim();
  if (cron.length < 32) return false;
  const { data } = await admin.from('rnm_config').select('valor').eq('clave', 'interno_cron_token').maybeSingle();
  return !!data?.valor && igual(String(data.valor), cron);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, key);
  if (!(await esInterno(req, admin, key))) return json({ error: 'Solo para uso interno' }, 403);

  const { data: pend } = await admin.from('seguimiento_lote').select('*').is('enviado_at', null).is('omitido', null).order('created_at').limit(20);
  if (!pend?.length) return json({ ok: true, pendientes: 0 });

  const resultados: unknown[] = [];
  for (const p of pend) {
    const { data: l } = await admin.from('comercial_leads')
      .select('kommo_lead_id, enviado_operacional_at, last_inbound_at, comprobante_at')
      .eq('kommo_lead_id', p.kommo_lead_id).maybeSingle();
    let motivo: string | null = null;
    if (!l) motivo = 'lead no encontrado';
    else if (l.enviado_operacional_at || l.comprobante_at) motivo = 'ya pagó o pasó a operaciones';
    else if (new Date(l.last_inbound_at).getTime() > new Date(p.last_inbound_snapshot).getTime() + 1000) motivo = 'el cliente escribió de nuevo';
    if (!motivo) {
      const { data: reciente } = await admin.from('messages').select('id').eq('kommo_lead_id', p.kommo_lead_id).eq('direction', 'outbound')
        .gt('created_at', new Date(Date.now() - 3 * 3600 * 1000).toISOString()).limit(1);
      if (reciente?.length) motivo = 'ya se le escribió en las últimas 3 horas';
    }
    if (motivo) {
      await admin.from('seguimiento_lote').update({ omitido: motivo }).eq('kommo_lead_id', p.kommo_lead_id);
      resultados.push({ id: p.kommo_lead_id, omitido: motivo });
      continue;
    }
    const texto = `Hola ${p.nombre}, soy Nora de FLUJO Migração. Te escribo por tu trámite de ${p.tramite}: ¿pudiste pensarlo? Si te quedó alguna duda, respóndeme por aquí y lo vemos juntos.`;
    // Reserva el lead antes de enviar para que dos llamadas simultáneas no manden dos veces.
    const { data: reservado } = await admin.from('seguimiento_lote').update({ enviado_at: new Date().toISOString() }).eq('kommo_lead_id', p.kommo_lead_id).is('enviado_at', null).select('kommo_lead_id').maybeSingle();
    if (!reservado) continue;
    const r = await fetch(`${url}/functions/v1/enviar-whatsapp-atendente`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ kommo_lead_id: p.kommo_lead_id, fase: 'seguimiento_plantilla', ignorar_pausa: true, plantilla: { nombre: 'seguimiento_tramite', idioma: 'es', parametros: [p.nombre, p.tramite], texto } }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d?.ok === true) {
      await admin.rpc('comercial_marcar_seguimiento', { p_kommo_lead_id: p.kommo_lead_id, p_intento: 3 });
      resultados.push({ id: p.kommo_lead_id, enviado: true });
    } else {
      // Error de Meta (plantilla no aprobada, número inválido, etc.): se libera y se anota; tras 3 errores se descarta.
      const intentos = String(p.error || '').split('|').filter(Boolean).length + 1;
      await admin.from('seguimiento_lote').update(intentos >= 3
        ? { enviado_at: null, omitido: 'error: ' + String(d?.error || r.status), error: (p.error ? p.error + '|' : '') + String(d?.error || r.status) }
        : { enviado_at: null, error: (p.error ? p.error + '|' : '') + String(d?.error || r.status) }).eq('kommo_lead_id', p.kommo_lead_id);
      resultados.push({ id: p.kommo_lead_id, error: d?.error || r.status });
    }
    await new Promise((ok) => setTimeout(ok, 700));
  }
  return json({ ok: true, resultados });
});
