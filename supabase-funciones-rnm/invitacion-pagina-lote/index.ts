// Envía la plantilla de Meta `invitacion_pagina` (aquí estaremos + visita y sigue nuestra página) a los clientes de la tabla
// invitacion_pagina_lote. Si Meta aún no aprobó la plantilla, el envío falla y se reintenta en la siguiente vuelta (hasta 40 intentos).
// Inerte si no hay pendientes.
// Solo para uso interno: la llama pg_cron (invitacion_pagina_lote) con x-cron-token (rnm_config.interno_cron_token) o la clave de servicio.
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
  const { data: pend } = await admin.from('invitacion_pagina_lote').select('*').is('enviado_at', null).lt('intentos', 40).order('created_at').limit(15);
  if (!pend?.length) return json({ ok: true, pendientes: 0 });
  const res: unknown[] = [];
  for (const p of pend) {
    const { data: l } = await admin.from('comercial_leads').select('last_inbound_at, enviado_operacional_at, comprobante_at').eq('kommo_lead_id', p.kommo_lead_id).maybeSingle();
    if (!l || l.enviado_operacional_at || l.comprobante_at || new Date(l.last_inbound_at).getTime() > new Date(p.last_inbound_snapshot).getTime() + 1000) {
      await admin.from('invitacion_pagina_lote').update({ intentos: 99, error: 'omitido: pagó, pasó a operaciones o escribió de nuevo' }).eq('kommo_lead_id', p.kommo_lead_id);
      continue;
    }
    const texto = `Hola ${p.nombre}, gracias por escribirnos a FLUJO Migração. Aquí estaremos cuando nos necesites. Si quieres apoyarnos, te invitamos a visitar nuestra página y seguirnos para conocer más casos y novedades. [Botón: Visitar nuestra página]`;
    const r = await fetch(`${url}/functions/v1/enviar-whatsapp-atendente`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ kommo_lead_id: p.kommo_lead_id, fase: 'invitacion_pagina', ignorar_pausa: true, plantilla: { nombre: 'invitacion_pagina', idioma: 'es', parametros: [p.nombre], texto } }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d?.ok === true) {
      await admin.from('invitacion_pagina_lote').update({ enviado_at: new Date().toISOString(), error: null }).eq('kommo_lead_id', p.kommo_lead_id);
      res.push({ id: p.kommo_lead_id, enviado: true });
    } else {
      await admin.from('invitacion_pagina_lote').update({ intentos: p.intentos + 1, error: String(d?.error || r.status).slice(0, 200) }).eq('kommo_lead_id', p.kommo_lead_id);
      res.push({ id: p.kommo_lead_id, error: d?.error || r.status });
      break; // si Meta rechaza (plantilla pendiente), no se insiste con los demás en esta vuelta
    }
    await new Promise((ok) => setTimeout(ok, 700));
  }
  return json({ ok: true, res });
});
