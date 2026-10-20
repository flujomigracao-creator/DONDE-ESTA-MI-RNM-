// Envío por correo (Resend) de los avisos que quedaron en la cola public.rnm_avisos_email.
// Los avisos de estado salen a todos los clientes; plan y pedir opinión solo a quien no se dio de baja (rnm_perfiles.avisos_email).
// Secretos: RESEND_API_KEY y EMAIL_FROM (p. ej. "FLUJO Migração <avisos@tudominio.com>"); EMAIL_REPLY_TO es opcional.
// Sin esos secretos no se envía nada y los avisos esperan en la cola (los de más de 3 días se descartan al activarse).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type CtxCorreos = {
  appUrl: string; supabaseUrl: string; claveFirma: string;
  lugarDeUnidad: (u: string) => string; reales: (c: number) => string; limpio: (t: unknown, max?: number) => string;
  dormir: (ms: number) => Promise<unknown>;
};

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Firma del enlace de baja: solo quien recibió el correo conoce la firma de su propio user_id.
export async function firmaBaja(userId: string, clave: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('baja-correo:' + userId));
  return Array.from(new Uint8Array(s)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function armar(a: any, c: CtxCorreos, precioSemanal: number | null) {
  const p = a.parametros || {};
  const nombre = c.limpio(p.nombre, 40) || 'cliente';
  const rnm = c.limpio(p.rnm_final, 8) || '----';
  const app = c.appUrl;
  let asunto = '', parrafos: string[] = [], boton = 'Abrir la app', enlace = app;
  switch (a.tipo) {
    case 'listo':
      asunto = '¡Tu RNM ya está listo para retirar!';
      parrafos = [`Hola ${nombre}, ¡buenas noticias! Tu RNM terminado en ${rnm} ya está listo para retirar en la unidad ${c.limpio(p.unidad ? c.lugarDeUnidad(String(p.unidad)) : '', 80) || 'la Policía Federal'} de la Policía Federal.`, 'Entra a la app para ver cómo retirarlo.'];
      break;
    case 'etapa':
      asunto = 'Novedades de tu RNM';
      parrafos = [`Hola ${nombre}, hay novedades de tu RNM terminado en ${rnm}: sigue en trámite en la Policía Federal.`, 'Te avisaremos apenas vuelva a cambiar.'];
      break;
    case 'problema':
      asunto = 'Tu RNM tiene una pendencia';
      parrafos = [`Hola ${nombre}, la Policía Federal registró una pendencia o un problema en tu RNM terminado en ${rnm}.`, 'Revisa los detalles en la app o respóndenos este correo y te ayudamos.'];
      break;
    case 'direccion':
      asunto = 'Novedades de tu cambio de dirección';
      parrafos = [`Hola ${nombre}, hay novedades del cambio de dirección de tu RNM terminado en ${rnm}: ${c.limpio(p.cambio, 200) || 'actualizado'}.`, 'Mira el detalle en la app.'];
      break;
    case 'corregir':
      asunto = 'No encontramos tu RNM: corrígelo en la app';
      parrafos = [`Hola ${nombre}, la Policía Federal no encontró el RNM terminado en ${rnm}. Casi siempre es un error al escribir el número o la fecha.`, 'Abre la app, entra a ese RNM y toca «Corregir RNM o fecha»: lo consultamos de nuevo.'];
      break;
    case 'plan':
      asunto = 'Sigue tu RNM con el plan de FLUJO';
      parrafos = [`Hola ${nombre}, revisamos tu RNM terminado en ${rnm} y sigue en trámite.`, `Para que te avisemos apenas cambie, activa tu plan por R$ ${c.reales(precioSemanal ?? 999)} al mes. Puedes pagar con Pix en un toque.`];
      boton = 'Activar mi plan'; enlace = `${app}/?plan=semanal&pago=pix`;
      break;
    case 'opinion':
      asunto = '¿Qué tal te fue con tu RNM?';
      parrafos = [`Hola ${nombre}, ¡nos alegra que tu RNM ya esté listo! ¿Nos cuentas qué tal te fue con el seguimiento? Toma 1 minuto y ayuda a otras personas a confiar.`];
      boton = 'Dejar mi opinión'; enlace = `${app}/?opinar=1`;
      break;
    default: throw new Error('tipo desconocido: ' + a.tipo);
  }
  return { asunto, parrafos, boton, enlace };
}

function html(parrafos: string[], boton: string, enlace: string, baja: string | null): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#1b2430">
<div style="max-width:520px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:14px;padding:28px 24px">
<p style="margin:0 0 18px;font-weight:bold;font-size:16px">¿Dónde está mi RNM?</p>
${parrafos.map((t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${esc(t)}</p>`).join('\n')}
<p style="margin:22px 0 6px"><a href="${esc(enlace)}" style="display:inline-block;background:#1f6feb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;font-size:15px">${esc(boton)}</a></p>
</div><p style="margin:16px 8px 0;font-size:12px;color:#6b7686;line-height:1.5">FLUJO Migração${baja ? ` · <a href="${esc(baja)}" style="color:#6b7686">No quiero recibir estos correos</a>` : ''}</p></div></body></html>`;
}

export async function enviarCorreos(admin: SupabaseClient, c: CtxCorreos) {
  const llave = (Deno.env.get('RESEND_API_KEY') || '').trim();
  const desde = (Deno.env.get('EMAIL_FROM') || '').trim();
  if (!llave || !desde) return { omitido: 'faltan RESEND_API_KEY / EMAIL_FROM' };
  const responderA = (Deno.env.get('EMAIL_REPLY_TO') || '').trim();

  // Los avisos de más de 3 días ya no sirven (p. ej. si el envío estuvo apagado).
  await admin.from('rnm_avisos_email').update({ estado: 'cancelado', error: 'muy antiguo' }).eq('estado', 'pendiente').lt('created_at', new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString());
  const { data: todos, error } = await admin.from('rnm_avisos_email').select('*').eq('estado', 'pendiente').order('created_at').limit(60);
  if (error) return { error: error.message };
  const avisos = (todos || []).filter((a: any) => !a.enviar_despues_at || new Date(a.enviar_despues_at) <= new Date()).slice(0, 25);
  const { data: precioSemanal } = await admin.rpc('rnm_precio_plan_tipo', { p_tipo: 'semanal' });
  const resultados: unknown[] = [];

  for (const a of avisos) {
    const cancelar = async (motivo: string) => { await admin.from('rnm_avisos_email').update({ estado: 'cancelado', error: motivo }).eq('id', a.id); resultados.push({ id: a.id, estado: 'cancelado', motivo }); };
    const promo = a.tipo === 'plan' || a.tipo === 'opinion';
    if (promo) {
      const { data: perfil } = await admin.from('rnm_perfiles').select('avisos_email').eq('user_id', a.user_id).maybeSingle();
      if (perfil && perfil.avisos_email === false) { await cancelar('baja'); continue; }
    }
    if (a.tipo === 'plan' || a.tipo === 'corregir') {
      const { data: plan } = await admin.from('rnm_planes').select('vence_at').eq('user_id', a.user_id).maybeSingle();
      const { data: reg } = await admin.from('rnm_registros').select('cerrado, estado_pf').eq('id', a.registro_id).maybeSingle();
      const planActivo = !!(plan?.vence_at && new Date(plan.vence_at) > new Date());
      const noAplica = a.tipo === 'plan' ? (planActivo || reg?.cerrado || reg?.estado_pf === 'no_encontrado') : (reg?.cerrado || reg?.estado_pf !== 'no_encontrado');
      if (noAplica) { await cancelar('ya no aplica'); continue; }
    }
    if (a.tipo === 'opinion') {
      const { count } = await admin.from('rnm_opiniones').select('id', { count: 'exact', head: true }).eq('user_id', a.user_id).gt('creado_at', new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString());
      if ((count ?? 0) > 0) { await cancelar('ya opinó'); continue; }
    }
    try {
      const { data: u, error: eu } = await admin.auth.admin.getUserById(a.user_id);
      const correo = u?.user?.email;
      if (eu || !correo) { await cancelar('sin correo'); continue; }
      const m = armar(a, c, Number.isInteger(precioSemanal) ? (precioSemanal as number) : null);
      const baja = promo ? `${c.supabaseUrl}/functions/v1/rnm-baja-email?u=${a.user_id}&t=${await firmaBaja(a.user_id, c.claveFirma)}` : null;
      const texto = m.parrafos.join('\n\n') + `\n\n${m.boton}: ${m.enlace}\n\nFLUJO Migração` + (baja ? `\nNo quiero recibir estos correos: ${baja}` : '');
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'rnm-aviso-' + a.id },
        body: JSON.stringify({
          from: desde, to: [correo], subject: m.asunto, html: html(m.parrafos, m.boton, m.enlace, baja), text: texto,
          ...(responderA ? { reply_to: responderA } : {}),
          ...(baja ? { headers: { 'List-Unsubscribe': `<${baja}>` } } : {}),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`(${r.status}) ` + (d?.message || 'Resend error'));
      await admin.from('rnm_avisos_email').update({ estado: 'enviado', enviado_at: new Date().toISOString(), error: null, resend_id: d?.id ?? null }).eq('id', a.id);
      resultados.push({ id: a.id, estado: 'enviado' });
    } catch (e) {
      await admin.from('rnm_avisos_email').update({ estado: 'error', error: String((e as Error).message || e).slice(0, 300) }).eq('id', a.id);
      resultados.push({ id: a.id, estado: 'error', error: String((e as Error).message || e) });
    }
    await c.dormir(600);
  }
  return { procesados: resultados.length, resultados };
}
