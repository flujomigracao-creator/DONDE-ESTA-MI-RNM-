// Enlace de baja de los correos de plan y de pedir opinión. Se abre desde el correo (GET ?u=<user_id>&t=<firma>),
// marca rnm_perfiles.avisos_email = false y devuelve al cliente a la app. Los avisos de estado de su RNM siguen llegando.
// La firma es HMAC del user_id con la clave de servicio: sin ella no se puede dar de baja a otra persona.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const APP_URL = (Deno.env.get('APP_URL') ?? 'https://rnm-flujo-flujo-escala.vercel.app').replace(/\/$/, '');
const volver = (r: string) => new Response(null, { status: 302, headers: { Location: `${APP_URL}/?baja_correo=${r}` } });

async function firma(userId: string, clave: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('baja-correo:' + userId));
  return Array.from(new Uint8Array(s)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  // Algunos clientes de correo hacen la baja con POST ("un clic"); GET es el enlace normal.
  if (req.method !== 'GET' && req.method !== 'POST') return new Response('Método no permitido', { status: 405 });
  const q = new URL(req.url).searchParams;
  const u = q.get('u') || '', t = q.get('t') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!/^[0-9a-f-]{36}$/i.test(u) || !igual(t, await firma(u, serviceKey))) return volver('error');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
  const { error } = await admin.from('rnm_perfiles').update({ avisos_email: false, avisos_email_baja_at: new Date().toISOString() }).eq('user_id', u);
  if (error) return volver('error');
  return req.method === 'POST' ? new Response('ok') : volver('ok');
});
