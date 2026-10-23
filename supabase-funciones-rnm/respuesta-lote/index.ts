// Respuesta de un cliente del lote de seguimiento (tabla seguimiento_lote) después de recibir la plantilla seguimiento_tramite
// (botones: "Quiero continuar" / "Tengo una duda" / "Ahora no").
//  - "Ahora no" / "no gracias" / "más adelante" (sin pedir continuar ni dudas): mensaje de cortesía (aquí estaremos + invitación a visitar y seguir la página).
//  - Cualquier otra respuesta: se reactiva a Nora en ese lead para que responda sus dudas (pedido del dueño, 9-oct-2026).
// Solo actúa sobre leads de la tabla con plantilla ya enviada y sin respuesta procesada, así que es inerte para cualquier otro lead.
// Solo para uso interno: la llama el trigger seguimiento_lote_respuesta con x-cron-token (rnm_config.interno_cron_token) o la clave de servicio.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { timingSafeEqual } from 'node:crypto';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const PAGINA = 'https://www.facebook.com/people/Flujo-de-Migra%C3%A7%C3%A3o/61593849497909/';
const MENSAJE_CORTESIA = `Entendido, ¡sin problema! 🙌 Aquí estaremos cuando nos necesites. Si quieres apoyarnos, te invitamos a visitar nuestra página y seguirnos para conocer más casos y novedades: ${PAGINA}`;
const RECHAZO = /(ahora no|por ahora no|ahorita no|agora n[aã]o|m[aá]s adelante|mas adelante|despu[eé]s te|depois|luego te|no tengo (el )?(dinero|plata|reales)|sem dinheiro|no gracias|n[aã]o obrigad|ya no (lo )?(quiero|necesito)|no me interesa|n[aã]o tenho interesse|todav[ií]a no|no puedo ahora|no por ahora)/i;
const QUIERE_SEGUIR = /(tengo una duda|quiero continuar|\?|cu[aá]nto|c[oó]mo|cuando|cuándo|precio|pago)/i;

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
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const id = Number(body.kommo_lead_id);
  if (!id) return json({ error: 'Falta kommo_lead_id' }, 400);

  // Pequeña espera para juntar mensajes que el cliente manda seguidos.
  await new Promise((ok) => setTimeout(ok, 4000));
  // Reserva atómica: una sola vez por lead.
  const { data: s } = await admin.from('seguimiento_lote').update({ respondio_at: new Date().toISOString() })
    .eq('kommo_lead_id', id).not('enviado_at', 'is', null).is('respondio_at', null).select('kommo_lead_id, enviado_at').maybeSingle();
  if (!s) return json({ ok: true, omitido: 'sin respuesta pendiente' });

  const { data: msgs } = await admin.from('messages').select('content').eq('kommo_lead_id', id).eq('direction', 'inbound').gte('created_at', s.enviado_at).order('created_at');
  const texto = (msgs || []).map((m: any) => String(m.content || '')).join(' ').toLowerCase();
  const rechazo = RECHAZO.test(texto) && !QUIERE_SEGUIR.test(texto);

  if (rechazo) {
    // Nora no debe contestar además de la cortesía: se marca el mensaje como ya atendido.
    await admin.from('comercial_leads').update({ last_atendido_at: new Date().toISOString() }).eq('kommo_lead_id', id);
    const r = await fetch(`${url}/functions/v1/enviar-whatsapp-atendente`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ kommo_lead_id: id, mensaje: MENSAJE_CORTESIA, fase: 'cortesia_pagina', idioma: 'es', ignorar_pausa: true }),
    });
    const d = await r.json().catch(() => ({}));
    await admin.from('seguimiento_lote').update({ respuesta_tipo: r.ok && d?.ok ? 'rechazo_cortesia' : 'rechazo_error:' + String(d?.error || r.status) }).eq('kommo_lead_id', id);
    return json({ ok: r.ok, tipo: 'rechazo' });
  }

  // Respuesta normal: Nora vuelve a atender este lead. Si estaba pausado, al despausar el trigger reactivar_nora ya le avisa;
  // si no lo estaba, se le avisa directamente (así no contesta dos veces).
  const { data: antes } = await admin.from('comercial_leads').select('atendente_pausado').eq('kommo_lead_id', id).maybeSingle();
  const { error } = await admin.from('comercial_leads').update({ atendente_pausado: false }).eq('kommo_lead_id', id);
  await admin.from('seguimiento_lote').update({ respuesta_tipo: error ? 'nora_error' : 'nora_reactivada' }).eq('kommo_lead_id', id);
  if (!antes?.atendente_pausado) await admin.rpc('avisar_nora', { p_kommo_lead_id: id });
  return json({ ok: !error, tipo: 'nora' });
});
