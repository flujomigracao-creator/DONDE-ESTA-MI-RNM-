// Envía notificaciones push (Web Push + VAPID, sin Firebase) por cada aviso de public.rnm_avisos
// a los dispositivos suscritos del usuario. Independiente de rnm-enviar-avisos (WhatsApp): solo lee la misma cola.
// Lo programa pg_cron (rnm_enviar_push). Secretos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const TEXTOS: Record<string, (n: string) => { title: string; body: string }> = {
  listo: (n) => ({ title: '¡Tu RNM está listo!', body: `${n}, abre la app para ver dónde retirarlo.` }),
  etapa: (n) => ({ title: 'Tu RNM avanzó', body: `${n}, hay una novedad en tu trámite.` }),
  problema: (n) => ({ title: 'Tu RNM tiene una pendencia', body: `${n}, abre la app para ver qué hacer.` }),
  direccion: (n) => ({ title: 'Cambió la dirección de retiro', body: `${n}, revisa la novedad en la app.` }),
  corregir: (n) => ({ title: 'Corrige tu dato del RNM', body: `${n}, no encontramos tu RNM: revísalo en la app.` }),
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!, serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const clave = (req.headers.get('apikey') || req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const cron = (req.headers.get('x-cron-token') || '').trim();
  let autorizado = clave === serviceKey;
  if (!autorizado && cron.length >= 32) {
    // pg_cron manda un token propio guardado en rnm_config (tabla privada), distinto de la clave de servicio.
    const { data: cfg } = await createClient(url, serviceKey).from('rnm_config').select('valor').eq('clave', 'push_cron_token').maybeSingle();
    autorizado = !!cfg?.valor && cfg.valor === cron;
  }
  if (!autorizado) return json({ error: 'Solo para uso interno' }, 403);
  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return json({ ok: true, omitido: 'Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY' });
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:devplataformacubanosbr@gmail.com', pub, priv);
  const appUrl = (Deno.env.get('APP_URL') ?? 'https://rnm-flujo-flujo-escala.vercel.app').replace(/\/$/, '');
  const admin = createClient(url, serviceKey);

  const desde = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: avisos, error } = await admin.from('rnm_avisos').select('id, user_id, tipo, parametros')
    .in('tipo', Object.keys(TEXTOS)).neq('estado', 'cancelado').gte('created_at', desde).order('created_at').limit(50);
  if (error) return json({ error: error.message }, 500);
  if (!avisos?.length) return json({ ok: true, procesados: 0 });
  const { data: subs } = await admin.from('rnm_push_subs').select('endpoint, p256dh, auth, user_id').in('user_id', [...new Set(avisos.map((a) => a.user_id))]);
  if (!subs?.length) return json({ ok: true, procesados: 0, omitido: 'sin dispositivos suscritos' });
  const { data: ya } = await admin.from('rnm_push_enviados').select('aviso_id, endpoint').in('aviso_id', avisos.map((a) => a.id));
  const hechos = new Set((ya || []).map((x) => `${x.aviso_id}|${x.endpoint}`));

  const resultados: unknown[] = [];
  for (const a of avisos) {
    for (const s of subs.filter((x) => x.user_id === a.user_id)) {
      if (hechos.has(`${a.id}|${s.endpoint}`)) continue;
      const nombre = String(a.parametros?.nombre ?? 'Hola').split(' ')[0].slice(0, 30);
      const msg = { ...TEXTOS[a.tipo](nombre), tag: `rnm-${a.tipo}`, url: `${appUrl}/` };
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 86400 });
        await admin.from('rnm_push_enviados').insert({ aviso_id: a.id, endpoint: s.endpoint });
        resultados.push({ aviso: a.id, ok: true });
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('rnm_push_subs').delete().eq('endpoint', s.endpoint);
        resultados.push({ aviso: a.id, error: e?.statusCode ?? String(e?.message || e) });
      }
    }
  }
  return json({ ok: true, procesados: resultados.length, resultados });
});
