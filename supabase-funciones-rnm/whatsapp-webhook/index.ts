// Webhook de WhatsApp Cloud API (Meta) para el número propio, ahora que ya no pasa por Kommo.
// GET  → verificación de Meta (hub.challenge).
// POST → guarda cada mensaje entrante (texto y archivos) en `messages` con registrar_mensagem_kommo,
//        asociado al lead por teléfono. Si el número no se conoce, lo deja en `whatsapp_contactos_nuevos`
//        para que n8n cree el lead en Kommo (pipeline Comercial) y lo vincule. Si el chat viene de un
//        anuncio de Meta, guarda el `referral` en meta_ads_referidos (atribución anuncio → lead).
// Excepción: el botón "Registrarme" del plan de la app de RNM (payload rnm_reg:...) y el CPF que se espera tras ese botón
//        los atiende la función rnm-registrarme y NO entran al CRM ni a Nora (son clientes de la app, no leads comerciales).
// Secretos: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID y WHATSAPP_APP_SECRET (obligatorio: sin él se rechaza todo POST).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { timingSafeEqual } from 'node:crypto';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const BUCKET = 'chat-media';
const VERIFY_TOKEN = 'flujo-migracao-verify-2026';
const GRAPH = 'https://graph.facebook.com/v23.0';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'video/mp4': 'mp4', 'video/3gpp': '3gp', 'application/pdf': 'pdf',
};

// Respuestas de la encuesta "¿por qué no contrataste?" (plantilla motivo_no_contrato, botones de respuesta rápida).
const MOTIVOS: Record<string, string> = {
  'no me atendieron': 'no_atendido',
  'me pareció muy caro': 'muy_caro',
  'no confié': 'no_confia',
  'no tenía dinero': 'sin_dinero',
};

async function firmaValida(req: Request, raw: string): Promise<boolean> {
  const secret = Deno.env.get('WHATSAPP_APP_SECRET');
  if (!secret) { console.error('Falta WHATSAPP_APP_SECRET: se rechaza el webhook'); return false; }
  const header = req.headers.get('x-hub-signature-256') || '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const esperado = new TextEncoder().encode(`sha256=${hex}`), recibido = new TextEncoder().encode(header);
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}

function contenidoDe(m: any): { texto: string | null; media: any | null; tipo: string | null } {
  switch (m.type) {
    case 'text': return { texto: m.text?.body ?? null, media: null, tipo: null };
    case 'image': return { texto: m.image?.caption ?? null, media: m.image, tipo: 'image' };
    case 'audio': return { texto: null, media: m.audio, tipo: 'audio' };
    case 'video': return { texto: m.video?.caption ?? null, media: m.video, tipo: 'video' };
    case 'document': return { texto: m.document?.caption ?? null, media: m.document, tipo: 'document' };
    case 'sticker': return { texto: null, media: m.sticker, tipo: 'sticker' };
    case 'button': return { texto: m.button?.text ?? null, media: null, tipo: null };
    case 'interactive': return { texto: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null, media: null, tipo: null };
    case 'location': {
      const l = m.location || {};
      return { texto: `Ubicación: ${l.latitude}, ${l.longitude}${l.name ? ` (${l.name})` : ''}`, media: null, tipo: null };
    }
    case 'reaction': return { texto: m.reaction?.emoji ? `Reacción: ${m.reaction.emoji}` : null, media: null, tipo: null };
    default: return { texto: `[Mensaje de tipo "${m.type}" no soportado]`, media: null, tipo: null };
  }
}

async function procesar(body: any) {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (Deno.env.get('WHATSAPP_TOKEN') || '').trim();
  const phoneNumberId = (Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '').trim();

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      if (value?.metadata?.phone_number_id && value.metadata.phone_number_id !== phoneNumberId) continue;
      const nombres: Record<string, string> = {};
      for (const c of value.contacts || []) nombres[c.wa_id] = c.profile?.name;

      // Estado de entrega de lo que mandamos (enviado / entregado / leído / falló), para verlo en el panel.
      for (const s of value.statuses || []) {
        const e = s.errors?.[0];
        const detalle = e ? [e.title, e.error_data?.details, e.code ? `(código ${e.code})` : null].filter(Boolean).join(' — ') : null;
        const { error: sErr } = await admin.rpc('whatsapp_actualizar_estado', { p_wamid: s.id, p_estado: s.status, p_error: detalle });
        if (sErr) console.error('estado', sErr.message);
        if (s.status === 'failed') console.error('envío fallido', s.id, detalle);
      }

      for (const m of value.messages || []) {
        try {
          const from = String(m.from || '').replace(/\D/g, '');

          // Botón "Registrarme" del plan de la app de RNM, o CPF esperado para generar el Pix: lo atiende rnm-registrarme.
          // Si esa función dice que no es suyo (manejado:false), el mensaje sigue su camino normal.
          let cuerpoRnm: Record<string, unknown> | null = null;
          const payloadRnm = m.type === 'button' ? String(m.button?.payload || '') : '';
          if (payloadRnm.startsWith('rnm_reg:')) cuerpoRnm = { accion: 'boton', telefono: from, payload: payloadRnm };
          else if (m.type === 'text') {
            const { data: pend } = await admin.from('rnm_wa_pendientes').select('telefono').eq('telefono', from).gt('creado_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()).maybeSingle();
            if (pend) cuerpoRnm = { accion: 'texto', telefono: from, texto: m.text?.body || '' };
          }
          if (cuerpoRnm) {
            try {
              const rr = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/rnm-registrarme`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
                body: JSON.stringify(cuerpoRnm),
              });
              const jj = await rr.json().catch(() => ({}));
              if (jj?.manejado) continue;
            } catch (e) { console.error('rnm-registrarme', e); }
          }

          const { data: lead } = await admin.rpc('whatsapp_resolver_lead', { p_telefono: from });
          const chave = lead?.telefono_chave || from;
          const { texto, media, tipo } = contenidoDe(m);

          // Chat abierto desde un anuncio de Meta ("clic a WhatsApp"): se guarda de qué anuncio vino.
          // Los triggers de meta_ads_referidos lo asignan al lead, ya exista o lo cree n8n después.
          const ref = m.referral;
          if (ref && typeof ref === 'object') {
            const { error: rErr } = await admin.from('meta_ads_referidos').upsert({
              wamid: m.id,
              organization_id: ORG_ID,
              telefono_chave: chave,
              source_type: ref.source_type ?? null,
              ad_id: ref.source_type === 'ad' ? (ref.source_id ?? null) : null,
              source_url: ref.source_url ?? null,
              headline: ref.headline ?? null,
              body: ref.body ?? null,
              ctwa_clid: ref.ctwa_clid ?? null,
              raw: ref,
              recibido_at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
            }, { onConflict: 'wamid', ignoreDuplicates: true });
            if (rErr) console.error('referral', rErr.message);
          }

          // Elección de trámite (botón o lista) que manda el atendente: se guarda en el lead antes de registrar
          // el mensaje, así el atendente pasa directo a la fase de propuesta.
          const eleccion = String(m.interactive?.button_reply?.id || m.interactive?.list_reply?.id || '');
          const enumElegido = Number(eleccion.replace(/^tramite:/, ''));
          if (eleccion.startsWith('tramite:') && enumElegido && lead?.kommo_lead_id) {
            const { error: eErr } = await admin.rpc('whatsapp_elegir_tramite', { p_kommo_lead_id: lead.kommo_lead_id, p_tramite_enum_id: enumElegido });
            if (eErr) console.error('elegir_tramite', eErr.message);
          }
          // Segundo paso del agendamiento (para qué es la cita): guarda el trámite exacto sin repetir la propuesta.
          const motivo = Number(eleccion.replace(/^motivo:/, ''));
          if (eleccion.startsWith('motivo:') && motivo && lead?.kommo_lead_id) {
            const { error: mErr } = await admin.rpc('whatsapp_elegir_motivo', { p_kommo_lead_id: lead.kommo_lead_id, p_tramite_enum_id: motivo });
            if (mErr) console.error('elegir_motivo', mErr.message);
          }
          // Vía de la residencia permanente (reunión familiar / Mercosur): define qué lista de datos se manda.
          if (eleccion.startsWith('variante:') && lead?.kommo_lead_id) {
            const { error: vErr } = await admin.rpc('whatsapp_elegir_variante', { p_kommo_lead_id: lead.kommo_lead_id, p_variante: eleccion.replace(/^variante:/, '') });
            if (vErr) console.error('elegir_variante', vErr.message);
          }
          // "Quiero pagar ya": Nora cierra (manda los datos de pago y la lista). Antes se comprueba que ya sepamos qué gestión del
          // agendamiento necesita (el cliente pudo tocar el botón sin elegirla) y en qué ciudad está (de eso depende el precio).
          let faltaPrimero: 'gestion' | 'ciudad' | null = null;
          if (eleccion === 'pagar:ya' && lead?.kommo_lead_id) {
            const { data: st } = await admin.from('comercial_leads').select('tramite_enum_id, tramite_variante, ciudad_brasil').eq('kommo_lead_id', lead.kommo_lead_id).maybeSingle();
            const e = Number(st?.tramite_enum_id);
            const familiaAgendamiento = [239444, 165690, 165692, 166572].includes(e) || (e === 166574 && st?.tramite_variante === 'agendamiento');
            if (e === 239444) faltaPrimero = 'gestion';
            else if (familiaAgendamiento && !st?.ciudad_brasil) faltaPrimero = 'ciudad';
          }
          // Respuesta a la encuesta "¿por qué no contrataste?": se guarda el motivo en el lead.
          const motivoNoContrato = m.type === 'button' && lead?.kommo_lead_id ? MOTIVOS[String(m.button?.text || '').trim().toLowerCase()] : undefined;
          if (motivoNoContrato) {
            const { error: nErr } = await admin.from('comercial_leads').update({ motivo_no_contrato: motivoNoContrato, motivo_no_contrato_at: new Date().toISOString() }).eq('kommo_lead_id', lead.kommo_lead_id);
            if (nErr) console.error('motivo_no_contrato', nErr.message);
          }

          let storagePath: string | null = null;
          let mime: string | null = null;
          let fileName: string | null = null;
          if (media?.id && token) {
            const info = await fetch(`${GRAPH}/${media.id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
            if (info?.url) {
              const archivo = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } });
              if (archivo.ok) {
                mime = (info.mime_type || archivo.headers.get('content-type') || 'application/octet-stream').split(';')[0];
                const ext = EXT[mime] || mime.split('/')[1] || 'bin';
                fileName = media.filename || `${tipo}-${m.id}.${ext}`;
                const path = `${ORG_ID}/whatsapp/${chave}/${m.id}.${ext}`;
                const { error: upErr } = await admin.storage.from(BUCKET).upload(path, await archivo.blob(), { contentType: mime, upsert: true });
                if (!upErr) storagePath = path;
                else console.error('upload', upErr.message);
              }
            }
          }

          const { error: regErr } = await admin.rpc('registrar_mensagem_kommo', {
            p_message_id: m.id,
            p_direction: 'inbound',
            p_chat_id: `wa:${chave}`,
            p_contact_id: lead?.kommo_contact_id ?? null,
            p_lead_id: lead?.kommo_lead_id ?? null,
            p_text: texto,
            p_origin: 'whatsapp_cloud_api',
            p_author_name: nombres[m.from] || null,
            p_attachment_type: tipo,
            p_attachment_name: fileName,
            p_storage_path: storagePath,
            p_mime_type: mime,
            p_created_at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
            p_raw: m,
          });
          if (regErr) console.error('registrar', regErr.message);

          // Tocó "Quiero pagar ya" sin haber dicho qué gestión necesita o en qué ciudad está: se le pregunta (Nora no contesta
          // este mensaje: se marca como atendido). Con todo claro, Nora contesta sola y manda los datos de pago.
          if (faltaPrimero) {
            await admin.from('comercial_leads').update({ last_atendido_at: new Date().toISOString() }).eq('kommo_lead_id', lead.kommo_lead_id);
            try {
              const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-whatsapp-atendente`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
                body: JSON.stringify(faltaPrimero === 'gestion'
                  ? { kommo_lead_id: lead.kommo_lead_id, mensaje: 'Antes de pasarte los datos del pago necesito saber para qué es el agendamiento. Elige una opción 👇', submenu: 'agendamiento', fase: 'conversacion', idioma: 'es' }
                  : { kommo_lead_id: lead.kommo_lead_id, mensaje: 'Antes de pasarte los datos del pago, ¿en qué ciudad de Brasil estás? El valor del agendamiento depende de la ciudad.', fase: 'conversacion', idioma: 'es' }),
              });
              if (!r.ok) console.error('pregunta previa', r.status, await r.text());
            } catch (e) { console.error('pregunta previa', e); }
          }

          // Agradecimiento por contestar la encuesta.
          if (motivoNoContrato) {
            try {
              const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-whatsapp-atendente`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
                body: JSON.stringify({ kommo_lead_id: lead.kommo_lead_id, mensaje: '¡Gracias por contarnos! Con tu respuesta mejoramos. Si más adelante necesitas ayuda con tu trámite, aquí estamos para ti 🙌', fase: 'motivo_no_contrato', idioma: 'es', ignorar_pausa: true }),
              });
              if (!r.ok) console.error('gracias motivo', r.status, await r.text());
            } catch (e) { console.error('gracias motivo', e); }
          }

          if (!lead?.kommo_lead_id) {
            await admin.from('whatsapp_contactos_nuevos').upsert(
              { telefono_chave: chave, telefono: from, nombre: nombres[m.from] || null },
              { onConflict: 'telefono_chave', ignoreDuplicates: true },
            );
          }
        } catch (err) {
          console.error('mensaje', m?.id, err);
        }
      }
    }
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200 }) : new Response('Forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const raw = await req.text();
  if (!(await firmaValida(req, raw))) return new Response('Invalid signature', { status: 401 });

  let body: any;
  try { body = JSON.parse(raw); } catch { return new Response('ok', { status: 200 }); }

  // Meta reintenta si no recibe 200 rápido: se responde ya y se procesa en segundo plano.
  EdgeRuntime.waitUntil(procesar(body));
  return new Response('ok', { status: 200 });
});
