// Correos de avisos para n8n (n8n los envía con Gmail/SMTP; aquí no se envía nada).
// Solo para uso interno: clave de servicio en el encabezado apikey o Authorization.
// POST { accion: 'pendientes', limite?: 20 } -> correos listos para enviar: [{ id, to, subject, html, text }] (ya descarta los que no aplican: baja, ya pagó, sin correo…)
// POST { accion: 'marcar', id, estado: 'enviado' | 'error', error? } -> actualiza la cola rnm_avisos_email.
// Los correos salen como "no responder": el pie lo dice y manda a la app (Perfil > Hablar con el equipo).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const APP_URL = (Deno.env.get('APP_URL') ?? 'https://rnm-flujo-flujo-escala.vercel.app').replace(/\/$/, '');
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const limpio = (t: unknown, max = 200) => String(t ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
const reales = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const AVISO_NO_RESPONDER = 'Este es un correo automático: por favor no respondas a este mensaje. Si necesitas ayuda, abre la app, entra a Perfil y toca «Hablar con el equipo».';

const DELEGACIAS: Record<string, string> = { "AGA/TO": "Araguaína", "ANS/GO": "Anápolis", "AQA/SP": "Araraquara", "ARS/RJ": "Angra dos Reis", "ARU/SP": "Araçatuba", "ATM/PA": "Altamira", "BGE/RS": "Bagé", "BRA/BA": "Barreiras", "BRG/MT": "Barra do Garças", "BRU/SP": "Bauru", "CAC/PR": "Cascavel", "CAE/MT": "Cáceres", "CAS/SP": "Campinas", "CCM/SC": "Criciúma", "CGE/PB": "Campina Grande", "CHI/RS": "Chuí", "CIT/ES": "Cachoeiro de Itapemirim", "CRA/MS": "Corumbá", "CRU/PE": "Caruaru", "CSC/PR": "Cascavel", "CXA/MA": "Caxias", "CXS/RS": "Caxias do Sul", "CZO/SP": "Cruzeiro", "CZS/AC": "Cruzeiro do Sul", "DCQ/SC": "Dionísio Cerqueira", "DRS/MS": "Dourados", "DVS/MG": "Divinópolis", "EPA/AC": "Epitaciôndia", "FIG/PR": "Foz do Iguaçu", "GMI/RO": "Guajará-Mirim", "GOY/RJ": "Campos dos Goytacazes", "GRA/PR": "Guaíra", "GVS/MG": "Governador Valadares", "IJI/SC": "Itajaí", "ILS/BA": "Ilhéus", "ITZ/MA": "Imperatriz", "JFA/MG": "Juiz de Fora", "JGO/RS": "Jaguarão", "JLS/SP": "Jales", "JNE/CE": "Juazeiro do Norte", "JPN/RO": "Ji-Paraná", "JTI/GO": "Jataí", "JVE/SC": "Joinville", "JZO/BA": "Juazeiro", "LDA/PR": "Londrina", "LGE/SC": "Lages", "LIV/RS": "Santana do Livramento", "MBA/PA": "Marabá", "MCE/RJ": "Macaé", "MGA/PR": "Maringá", "MII/SP": "Marília", "MOC/MG": "Montes Claros", "MOS/RN": "Mossoró", "NIG/RJ": "Nova Iguaçu", "NRI/RJ": "Niterói", "NVI/MS": "Naviraí", "OPE/AP": "Oiapoque", "PAC/RR": "Pacaraima", "PAT/PB": "Patos", "PCA/SP": "Piracicaba", "PDE/SP": "Presidente Prudente", "PFO/RS": "Passo Fundo", "PGZ/PR": "Ponta Grossa", "PHB/PI": "Parnaíba", "PNG/PR": "Paranaguá", "PPA/MS": "Ponta Porã", "PSO/BA": "Porto Seguro", "PTS/RS": "Pelotas", "RDO/PA": "Redenção", "RGE/RS": "Rio Grande", "ROO/MT": "Rondonópolis", "RPO/SP": "Ribeirão Preto", "SAG/RS": "Santo Ângelo", "SBA/RS": "São Borja", "SCS/RS": "Santa Cruz do Sul", "SGO/PE": "Salgueiro", "SIC/MT": "Sinop", "SJE/SP": "São José do Rio Preto", "SJK/SP": "São José dos Campos", "SMA/RS": "Santa Maria", "SMT/ES": "São Mateus", "SNM/PA": "Santarém", "SOD/SP": "Sorocaba", "SSB/SP": "São Sebastião", "STS/SP": "Santos", "TBA/AM": "Tabatinga", "TLS/MS": "Três Lagoas", "UDI/MG": "Uberlândia", "UGA/RS": "Uruguaiana", "URA/MG": "Uberaba", "VAG/MG": "Varginha", "VDC/BA": "Vitória da Conquista", "VLA/RO": "Vilhena", "VRA/RJ": "Volta Redonda", "XAP/SC": "Chapecó" };
const CAPITALES: Record<string, string> = { AC: "Rio Branco", AL: "Maceió", AP: "Macapá", AM: "Manaus", BA: "Salvador", CE: "Fortaleza", DF: "Brasília", ES: "Vitória", GO: "Goiânia", MA: "São Luís", MT: "Cuiabá", MS: "Campo Grande", MG: "Belo Horizonte", PA: "Belém", PB: "João Pessoa", PR: "Curitiba", PE: "Recife", PI: "Teresina", RJ: "Rio de Janeiro", RN: "Natal", RS: "Porto Alegre", RO: "Porto Velho", RR: "Boa Vista", SC: "Florianópolis", SP: "São Paulo", SE: "Aracaju", TO: "Palmas" };
const ESTADOS_BR: Record<string, string> = { AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins" };
function ciudadDeUnidad(unidad: string): string | null {
  const u = unidad || '';
  const d = /DPF\/([A-Z]{3})\/([A-Z]{2})\b/.exec(u);
  if (d && DELEGACIAS[d[1] + '/' + d[2]]) return DELEGACIAS[d[1] + '/' + d[2]];
  const s = /\bSR\/(?:D?PF)\/([A-Z]{2})\b/.exec(u);
  if (s && CAPITALES[s[1]]) return CAPITALES[s[1]];
  return null;
}
function ufDeUnidad(unidad: string): string | null { const m = /\/([A-Z]{2})\s*$/.exec(unidad || ''); return m && ESTADOS_BR[m[1]] ? m[1] : null; }
function lugarDeUnidad(codigo: string): string { const c = ciudadDeUnidad(codigo), uf = ufDeUnidad(codigo); return c ? c + (uf ? '/' + uf : '') : (uf ? ESTADOS_BR[uf] : codigo); }

async function firmaBaja(userId: string, clave: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('baja-correo:' + userId));
  return Array.from(new Uint8Array(s)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function armar(a: any, precioDesde: number) {
  const p = a.parametros || {};
  const nombre = limpio(p.nombre, 40) || 'cliente';
  const rnm = limpio(p.rnm_final, 8) || '----';
  let asunto = '', parrafos: string[] = [], boton = 'Abrir la app', enlace = APP_URL;
  switch (a.tipo) {
    case 'listo':
      asunto = '¡Tu RNM ya está listo para retirar!';
      parrafos = [`Hola ${nombre}, ¡buenas noticias! Tu RNM terminado en ${rnm} ya está listo para retirar en la unidad ${limpio(p.unidad ? lugarDeUnidad(String(p.unidad)) : '', 80) || 'la Policía Federal'} de la Policía Federal.`, 'Entra a la app para ver cómo retirarlo.'];
      break;
    case 'etapa':
      asunto = 'Novedades de tu RNM';
      parrafos = [`Hola ${nombre}, hay novedades de tu RNM terminado en ${rnm}: sigue en trámite en la Policía Federal.`, 'Te avisaremos apenas vuelva a cambiar.'];
      break;
    case 'impresion':
      asunto = 'Tu carné fue enviado a impresión';
      parrafos = [`Hola ${nombre}, ¡buenas noticias! Tu RNM terminado en ${rnm} fue enviado a impresión en la Policía Federal.`, 'Es el paso previo a quedar listo para retirar: te avisaremos apenas esté disponible.'];
      break;
    case 'problema':
      asunto = 'Tu RNM tiene una pendencia';
      parrafos = [`Hola ${nombre}, la Policía Federal registró una pendencia o un problema en tu RNM terminado en ${rnm}.`, 'Revisa los detalles en la app: si necesitas ayuda, allí puedes escribirle al equipo.'];
      break;
    case 'direccion':
      asunto = 'Novedades de tu cambio de dirección';
      parrafos = [`Hola ${nombre}, hay novedades del cambio de dirección de tu RNM terminado en ${rnm}: ${limpio(p.cambio, 200) || 'actualizado'}.`, 'Mira el detalle en la app.'];
      break;
    case 'corregir':
      asunto = 'No encontramos tu RNM: corrígelo en la app';
      parrafos = [`Hola ${nombre}, la Policía Federal no encontró el RNM terminado en ${rnm}. Casi siempre es un error al escribir el número o la fecha.`, 'Abre la app, entra a ese RNM y toca «Corregir RNM o fecha»: lo consultamos de nuevo.'];
      break;
    case 'plan':
      asunto = 'Sigue tu RNM con el plan de FLUJO';
      parrafos = [`Hola ${nombre}, revisamos tu RNM terminado en ${rnm} y sigue en trámite.`, `Si quieres que te avisemos apenas cambie, activa un plan desde R$ ${reales(precioDesde)}. Puedes pagar con Pix en un toque.`];
      boton = 'Ver los planes'; enlace = `${APP_URL}/?ir=planes`;
      break;
    case 'opinion':
      asunto = '¿Qué tal te fue con tu RNM?';
      parrafos = [`Hola ${nombre}, ¡nos alegra que tu RNM ya esté listo! ¿Nos cuentas qué tal te fue con el seguimiento? Toma 1 minuto y ayuda a otras personas a confiar.`];
      boton = 'Dejar mi opinión'; enlace = `${APP_URL}/?opinar=1`;
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
</div><p style="margin:16px 8px 0;font-size:12px;color:#6b7686;line-height:1.5">${esc(AVISO_NO_RESPONDER)}</p><p style="margin:8px 8px 0;font-size:12px;color:#6b7686;line-height:1.5">FLUJO Migração${baja ? ` · <a href="${esc(baja)}" style="color:#6b7686">No quiero recibir estos correos</a>` : ''}</p></div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const clave = (req.headers.get('apikey') || req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (clave !== serviceKey) return json({ error: 'Solo para uso interno' }, 403);
  const admin = createClient(url, serviceKey);
  let body: any = {}; try { body = await req.json(); } catch { /* sin cuerpo */ }

  if (body.accion === 'marcar') {
    const id = String(body.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'id inválido' }, 400);
    const ok = body.estado === 'enviado';
    if (!ok && body.estado !== 'error') return json({ error: 'estado debe ser enviado o error' }, 400);
    const { error } = await admin.from('rnm_avisos_email').update(ok ? { estado: 'enviado', enviado_at: new Date().toISOString(), error: null } : { estado: 'error', error: String(body.error ?? '').slice(0, 300) }).eq('id', id);
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }

  if (body.accion !== 'pendientes') return json({ error: 'accion debe ser pendientes o marcar' }, 400);
  const limite = Math.max(1, Math.min(Number(body.limite) || 20, 40));
  await admin.from('rnm_avisos_email').update({ estado: 'cancelado', error: 'muy antiguo' }).eq('estado', 'pendiente').lt('created_at', new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString());
  const { data: todos, error } = await admin.from('rnm_avisos_email').select('*').eq('estado', 'pendiente').order('created_at').limit(80);
  if (error) return json({ error: error.message }, 500);
  const avisos = (todos || []).filter((a: any) => !a.enviar_despues_at || new Date(a.enviar_despues_at) <= new Date()).slice(0, limite);
  const { data: precioQuincenal } = await admin.rpc('rnm_precio_plan_tipo', { p_tipo: 'quincenal' });
  const salida: unknown[] = [];

  for (const a of avisos) {
    const cancelar = (motivo: string) => admin.from('rnm_avisos_email').update({ estado: 'cancelado', error: motivo }).eq('id', a.id);
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
      const m = armar(a, Number.isInteger(precioQuincenal) ? (precioQuincenal as number) : 499);
      const baja = promo ? `${url}/functions/v1/rnm-baja-email?u=${a.user_id}&t=${await firmaBaja(a.user_id, serviceKey)}` : null;
      const texto = m.parrafos.join('\n\n') + `\n\n${m.boton}: ${m.enlace}\n\n${AVISO_NO_RESPONDER}\nFLUJO Migração` + (baja ? `\nNo quiero recibir estos correos: ${baja}` : '');
      salida.push({ id: a.id, to: correo, subject: m.asunto, html: html(m.parrafos, m.boton, m.enlace, baja), text: texto });
    } catch (e) {
      await admin.from('rnm_avisos_email').update({ estado: 'error', error: String((e as Error).message || e).slice(0, 300) }).eq('id', a.id);
    }
  }
  return json({ ok: true, correos: salida });
});
