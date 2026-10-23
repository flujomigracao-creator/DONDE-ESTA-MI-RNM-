// Envía por WhatsApp (Cloud API) los avisos que quedaron en la cola public.rnm_avisos.
// - Los avisos salen del número de FLUJO Migração (secretos WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID).
// - Clientes de un aliado (rnm_cuentas_aliado): si el aliado tiene número PROPIO activo (tabla rnm_aliado_envio), sale de ese número;
//   si no lo tiene, sale del número de FLUJO igual (decisión del dueño: nadie se queda sin aviso por ser de un aliado).
// Solo para uso interno (clave de servicio). Solo existen avisos para quien marcó "Quiero avisos por WhatsApp".
// Plantillas aprobadas por Meta (necesarias fuera de las 24 h, idioma es; el aliado debe crearlas con los mismos nombres en su cuenta):
//   rnm_listo, rnm_etapa, rnm_problema, rnm_direccion  (cambios de estado)
//   rnm_impresion  (el carné pasó a impresión). Mientras Meta no la apruebe (o si el aliado no la tiene) sale rnm_etapa.
//   rnm_corregir_dato  (el RNM no se encontró: corregirlo en la app; botón "Abrir la app")
//   rnm_pedir_opinion  (RNM listo: pide una opinión; botón "Dejar mi opinión" -> /?opinar=1). Se envía 24 h después del aviso de listo.
//   rnm_registrar_rnm  (cuenta creada con avisos aceptados pero sin ningún RNM: invita a registrarlo y hacer la primera consulta; botón "Registrar mi RNM"). Solo número de FLUJO.
//   rnm_plan_boton_v2 / rnm_plan_boton  (invitación al plan tras la primera consulta gratis, con botón "Registrarme": al tocarlo, rnm-registrarme
//                    le manda el enlace de la app para elegir plan). Solo para el número de FLUJO. La v2 (planes desde R$ 4,99) se usa en cuanto
//                    Meta la aprueba; mientras tanto, o si falla, sale la anterior.
//   rnm_plan_semana  (recordatorio una semana después de la invitación, a quien sigue sin plan; mismo botón; solo número de FLUJO)
//   rnm_plan  (misma invitación pero con enlace a la app: se usa con el número propio de un aliado, porque allí el botón llegaría a otro webhook)
// La unidad de la PF se dice con el nombre de la ciudad (Curitiba/PR, Florianópolis/SC), no con el código.
// Interruptor: avisos automáticos activos si el secreto RNM_AVISOS_ACTIVOS es "1" o si rnm_config.avisos_activos = '1'; si no, no sale nada.
// Si una plantilla aún no está aprobada por Meta (error 132001) el aviso se reintenta solo, pero con un cupo aparte (máx. 8 por pasada) para que NUNCA bloquee a los avisos nuevos.
// Al enviar se guarda el texto exacto (texto_enviado) y el wamid: n8n lo copia al chat de Kommo del lead del cliente.
// Correo: los avisos por correo salen por n8n (función rnm-correos-n8n); aquí ya no se envía correo.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { enviarCorreos } from './correos.ts';

const GRAPH = 'https://graph.facebook.com/v23.0';
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://rnm-flujo-flujo-escala.vercel.app').replace(/\/$/, '');
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
// Los parámetros de plantilla no admiten saltos de línea ni espacios repetidos.
const limpio = (t: unknown, max = 200) => String(t ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reales = (centavos: number) => (centavos / 100).toFixed(2).replace('.', ',');

// ---- Unidad de la PF -> ciudad (misma tabla que usa la app) ----
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
function ufDeUnidad(unidad: string): string | null {
  const m = /\/([A-Z]{2})\s*$/.exec(unidad || '');
  return m && ESTADOS_BR[m[1]] ? m[1] : null;
}
// "Curitiba/PR", "Florianópolis/SC"; si no se reconoce, el estado o, como último recurso, el código.
function lugarDeUnidad(codigo: string): string {
  const c = ciudadDeUnidad(codigo), uf = ufDeUnidad(codigo);
  return c ? c + (uf ? '/' + uf : '') : (uf ? ESTADOS_BR[uf] : codigo);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const clave = (req.headers.get('apikey') || req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const esServicio = clave === serviceKey || (clave.length > 20 && (await fetch(`${url}/auth/v1/admin/users?per_page=1`, {
    headers: { apikey: clave, Authorization: `Bearer ${clave}` },
  })).ok);
  if (!esServicio) return json({ error: 'Solo para uso interno' }, 403);

  const admin = createClient(url, serviceKey);
  const { data: cfg } = await admin.from('rnm_config').select('valor').eq('clave', 'avisos_activos').maybeSingle();
  if (Deno.env.get('RNM_AVISOS_ACTIVOS') !== '1' && cfg?.valor !== '1') return json({ ok: true, omitido: 'avisos automáticos apagados (RNM_AVISOS_ACTIVOS / rnm_config.avisos_activos)' });

  const tokenFlujo = (Deno.env.get('WHATSAPP_TOKEN') || '').trim();
  const phoneFlujo = (Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '').trim();

  // Pendientes primero (con su hora de envío). Aparte, un cupo pequeño para reintentar los que fallaron por plantilla sin aprobar o aliado sin número:
  // así nunca ocupan el lugar de los avisos nuevos.
  const { data: pend, error } = await admin.from('rnm_avisos').select('*').eq('estado', 'pendiente').order('created_at').limit(40);
  if (error) return json({ error: error.message }, 500);
  const { data: reint } = await admin.from('rnm_avisos').select('*')
    .or('and(estado.eq.error,error.like.aliado sin número%),and(estado.eq.error,error.like.%132001%),and(estado.eq.error,error.ilike.%template%)').order('created_at', { ascending: false }).limit(8);
  const ahoraMs = Date.now();
  const listos = [...(pend || []), ...(reint || [])].filter((a: any) => !a.enviar_despues_at || new Date(a.enviar_despues_at).getTime() <= ahoraMs);
  const avisos = [...listos.filter((a: any) => a.estado === 'pendiente').slice(0, 20), ...listos.filter((a: any) => a.estado !== 'pendiente')];

  // Precio real del plan semanal (el que se cobra hoy) y del más barato (quincenal), para la invitación al plan.
  const { data: precioSemanal } = await admin.rpc('rnm_precio_plan_tipo', { p_tipo: 'semanal' });
  const { data: precioQuincenal } = await admin.rpc('rnm_precio_plan_tipo', { p_tipo: 'quincenal' });

  // Desde qué número sale el aviso de cada usuario: el propio del aliado si lo tiene activo; si no, el de FLUJO.
  type Emisor = { token: string; phone: string; aliado: boolean } | { falta: string };
  const emisores = new Map<string, Emisor>();
  async function emisorDe(userId: string): Promise<Emisor> {
    const en = emisores.get(userId);
    if (en) return en;
    let e: Emisor;
    const flujo: Emisor = tokenFlujo && phoneFlujo ? { token: tokenFlujo, phone: phoneFlujo, aliado: false } : { falta: 'Faltan WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID' };
    const { data: cu } = await admin.from('rnm_cuentas_aliado').select('aliado_id').eq('user_id', userId).maybeSingle();
    if (cu?.aliado_id) {
      const { data: env } = await admin.from('rnm_aliado_envio').select('phone_number_id, token, activo').eq('aliado_id', cu.aliado_id).maybeSingle();
      e = env?.activo && env.phone_number_id && env.token
        ? { token: String(env.token).trim(), phone: String(env.phone_number_id).trim(), aliado: true }
        : flujo;
    } else e = flujo;
    emisores.set(userId, e);
    return e;
  }

  // Texto exacto que recibió el cliente (cuerpo de la plantilla con sus datos + nombre de los botones), para el chat de Kommo.
  async function textoEnviado(plantilla: string, params: string[]): Promise<string | null> {
    const { data: pl } = await admin.from('whatsapp_plantillas').select('cuerpo, botones').eq('nombre', plantilla).eq('idioma', 'es').maybeSingle();
    if (!pl?.cuerpo) return null;
    let t = String(pl.cuerpo);
    params.forEach((v, i) => { t = t.split('{{' + (i + 1) + '}}').join(v); });
    const botones = ((pl.botones as any[]) || []).map((b) => b?.text).filter(Boolean);
    return botones.length ? `${t}\n\n[Botón: ${botones.join(' / ')}]` : t;
  }

  const PLANTILLAS: Record<string, string> = { listo: 'rnm_listo', etapa: 'rnm_etapa', impresion: 'rnm_impresion', problema: 'rnm_problema', direccion: 'rnm_direccion', plan: 'rnm_plan', plan_semana: 'rnm_plan_semana', corregir: 'rnm_corregir_dato', opinion: 'rnm_pedir_opinion', registrar: 'rnm_registrar_rnm' };
  const resultados: unknown[] = [];
  for (const a of avisos || []) {
    // Reconfirmar el permiso justo antes de enviar (por si lo quitó mientras esperaba).
    const { data: perfil } = await admin.from('rnm_perfiles').select('avisos_whatsapp').eq('user_id', a.user_id).maybeSingle();
    if (!perfil?.avisos_whatsapp) {
      await admin.from('rnm_avisos').update({ estado: 'cancelado', error: 'sin permiso' }).eq('id', a.id);
      resultados.push({ id: a.id, estado: 'cancelado' });
      continue;
    }
    // La invitación a registrar el RNM no tiene sentido si ya registró alguno mientras esperaba.
    if (a.tipo === 'registrar') {
      const { count } = await admin.from('rnm_registros').select('id', { count: 'exact', head: true }).eq('user_id', a.user_id);
      if ((count ?? 0) > 0) {
        await admin.from('rnm_avisos').update({ estado: 'cancelado', error: 'ya registró su RNM' }).eq('id', a.id);
        resultados.push({ id: a.id, estado: 'cancelado' });
        continue;
      }
    }
    // El aviso de plan no tiene sentido si ya pagó, si el RNM ya no está en trámite o si el RNM no se encontró (primero hay que corregirlo).
    if (a.tipo === 'plan' || a.tipo === 'plan_semana' || a.tipo === 'corregir') {
      const { data: plan } = await admin.from('rnm_planes').select('vence_at').eq('user_id', a.user_id).maybeSingle();
      const { data: reg } = await admin.from('rnm_registros').select('cerrado, estado_pf').eq('id', a.registro_id).maybeSingle();
      const planActivo = !!(plan?.vence_at && new Date(plan.vence_at) > new Date());
      const noAplica = a.tipo === 'corregir'
        ? (reg?.cerrado || reg?.estado_pf !== 'no_encontrado')
        : (planActivo || reg?.cerrado || reg?.estado_pf === 'no_encontrado' || (a.tipo === 'plan_semana' && ['listo', 'entregado'].includes(String(reg?.estado_pf))));
      if (noAplica) {
        await admin.from('rnm_avisos').update({ estado: 'cancelado', error: 'ya no aplica' }).eq('id', a.id);
        resultados.push({ id: a.id, estado: 'cancelado' });
        continue;
      }
    }
    // La petición de opinión no se manda a quien ya opinó hace poco.
    if (a.tipo === 'opinion') {
      const { count } = await admin.from('rnm_opiniones').select('id', { count: 'exact', head: true }).eq('user_id', a.user_id).gt('creado_at', new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString());
      if ((count ?? 0) > 0) {
        await admin.from('rnm_avisos').update({ estado: 'cancelado', error: 'ya opinó' }).eq('id', a.id);
        resultados.push({ id: a.id, estado: 'cancelado' });
        continue;
      }
    }
    // Teléfonos de prueba (DDD 00): no se llama a WhatsApp.
    if (String(a.telefono).startsWith('5500')) {
      await admin.from('rnm_avisos').update({ estado: 'enviado', enviado_at: new Date().toISOString(), error: 'simulado' }).eq('id', a.id);
      resultados.push({ id: a.id, estado: 'simulado' });
      continue;
    }
    const emisor = await emisorDe(a.user_id);
    if ('falta' in emisor) {
      if (a.error !== emisor.falta) await admin.from('rnm_avisos').update({ estado: 'error', error: emisor.falta }).eq('id', a.id);
      resultados.push({ id: a.id, estado: 'esperando', motivo: emisor.falta });
      continue;
    }
    // El recordatorio de la semana y la invitación a registrar solo existen con el número de FLUJO (los aliados con número propio no tienen esas plantillas).
    if ((a.tipo === 'plan_semana' || a.tipo === 'registrar') && emisor.aliado) {
      await admin.from('rnm_avisos').update({ estado: 'cancelado', error: 'aliado: sin esa plantilla' }).eq('id', a.id);
      resultados.push({ id: a.id, estado: 'cancelado' });
      continue;
    }
    const p = a.parametros || {};
    const nombre = limpio(p.nombre, 40) || 'cliente';
    const rnmFinal = limpio(p.rnm_final, 8) || '----';
    const params: string[] = (a.tipo === 'opinion' || a.tipo === 'registrar') ? [nombre] : [nombre, rnmFinal];
    const componentes: any[] = [];
    let plantilla = PLANTILLAS[a.tipo];
    // Intentos: (plantilla, parámetros). Para la invitación al plan, primero la versión nueva (desde R$ 4,99) y, si Meta aún no la aprobó, la anterior.
    let intentos: { plantilla: string; params: string[] }[] = [];
    if (a.tipo === 'listo') params.push(limpio(p.unidad ? lugarDeUnidad(String(p.unidad)) : '', 80) || 'la Policía Federal');
    if (a.tipo === 'direccion') params.push(limpio(p.cambio, 200) || 'actualizado');
    const precioSem = reales(Number.isInteger(precioSemanal) ? (precioSemanal as number) : 999);
    const precioDesde = reales(Number.isInteger(precioQuincenal) ? (precioQuincenal as number) : 499);
    if (a.tipo === 'plan' || a.tipo === 'plan_semana') {
      if (!emisor.aliado) {
        // Número de FLUJO: plantilla con botón "Registrarme" (el botón llega a whatsapp-webhook -> rnm-registrarme).
        componentes.push({ type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `rnm_reg:${a.registro_id}` }] });
        if (a.tipo === 'plan_semana') intentos = [{ plantilla: 'rnm_plan_semana', params: [...params, precioDesde] }];
        else intentos = [{ plantilla: 'rnm_plan_boton_v2', params: [...params, precioDesde] }, { plantilla: 'rnm_plan_boton', params: [...params, precioSem] }];
      } else {
        // Número propio de un aliado: el botón no llegaría a nuestro webhook, así que se manda el enlace de la app.
        intentos = [{ plantilla: 'rnm_plan', params: [...params, precioSem, `${APP_URL}/?plan=semanal&pago=pix`] }];
      }
    } else if (a.tipo === 'impresion') {
      // Si Meta aún no aprobó rnm_impresion (o el aliado no la tiene), sale el aviso genérico de novedades.
      intentos = [{ plantilla: 'rnm_impresion', params }, { plantilla: 'rnm_etapa', params }];
    } else intentos = [{ plantilla, params }];
    try {
      let ultimoError = '';
      let enviado: { plantilla: string; params: string[]; wamid: string | null } | null = null;
      for (const it of intentos) {
        const r = await fetch(`${GRAPH}/${emisor.phone}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${emisor.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp', to: a.telefono, type: 'template',
            template: { name: it.plantilla, language: { code: 'es' }, components: [{ type: 'body', parameters: it.params.map((t) => ({ type: 'text', text: t })) }, ...componentes] },
          }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok) { enviado = { plantilla: it.plantilla, params: it.params, wamid: d?.messages?.[0]?.id ?? null }; break; }
        ultimoError = `(#${d?.error?.code ?? r.status}) ` + (d?.error?.message || `WhatsApp Cloud API ${r.status}`);
        // Solo se prueba la siguiente plantilla si esta no existe / no está aprobada.
        if (!(d?.error?.code === 132001 || /template/i.test(String(d?.error?.message || '')))) break;
      }
      if (!enviado) throw new Error(ultimoError);
      const texto = await textoEnviado(enviado.plantilla, enviado.params).catch(() => null);
      await admin.from('rnm_avisos').update({ estado: 'enviado', enviado_at: new Date().toISOString(), error: null, texto_enviado: texto, wamid: enviado.wamid }).eq('id', a.id);
      resultados.push({ id: a.id, estado: 'enviado', plantilla: enviado.plantilla });
    } catch (e) {
      await admin.from('rnm_avisos').update({ estado: 'error', error: String((e as Error).message || e).slice(0, 300) }).eq('id', a.id);
      resultados.push({ id: a.id, estado: 'error', error: String((e as Error).message || e) });
    }
    await dormir(700);
  }

  // Correo: ahora lo envía n8n (rnm-correos-n8n); este módulo queda inactivo.
  const correos = await enviarCorreos(admin, { appUrl: APP_URL, supabaseUrl: url, claveFirma: serviceKey, lugarDeUnidad, reales, limpio, dormir })
    .catch((e) => ({ error: String((e as Error).message || e) }));
  return json({ ok: true, procesados: resultados.length, resultados, correos });
});
