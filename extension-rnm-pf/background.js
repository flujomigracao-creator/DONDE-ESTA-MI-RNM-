// Service worker: sesión de Supabase del operador y llamadas a la base.
// El content script nunca toca tokens: todo pasa por aquí.

const SUPABASE_URL = 'https://rumpfqevyspdmhaggxtq.supabase.co';
// Llave publicable (pública por diseño): todo se lee y escribe con la sesión del operador, protegido por RLS.
const SUPABASE_KEY = 'sb_publishable_7znj3ENrTWXDE2dibUzv_A_a7HUoud_';
const PF_URL = 'https://servicos.pf.gov.br/sismigra-internet/faces/restrito/atendimento/pesquisarRequerimento.seam';
const PF_TABS = 'https://servicos.pf.gov.br/sismigra-internet/*';
const REABRIR_MS = 30 * 60 * 1000; // un caso ignorado no se vuelve a abrir solo antes de 30 min

async function getSession() {
  const { session } = await chrome.storage.local.get('session');
  if (!session) return null;
  if (session.expires_at - 60_000 > Date.now()) return session;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) {
    await chrome.storage.local.remove('session');
    return null;
  }
  return saveSession(await res.json());
}

async function saveSession(data) {
  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    email: data.user?.email,
  };
  await chrome.storage.local.set({ session });
  return session;
}

async function login(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'No se pudo iniciar sesión');
  const s = await saveSession(data);
  return { email: s.email };
}

async function authHeaders() {
  const s = await getSession();
  if (!s) throw new Error('SIN_SESION');
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}` };
}

async function rpc(name, args = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
  return data;
}

async function select(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: await authHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
  return data;
}

const dmy = (iso) => iso.split('-').reverse().join('/');

// Datos de un caso para llenar la consulta.
async function caso(id) {
  const filas = await select(`rnm_registros?id=eq.${encodeURIComponent(id)}&select=id,rnm,fecha_nacimiento,cerrado,ultima_consulta_at`);
  const r = filas[0];
  if (!r) throw new Error('Caso no encontrado');
  // Se consulta lo que está en la cola: 1.ª consulta gratis del 1.er RNM, o RNM cubierto por el plan activo de la cuenta.
  const cola = await rpc('rnm_pendientes');
  return { id: r.id, rnm: r.rnm, nacimiento: dmy(r.fecha_nacimiento), primera: !r.ultima_consulta_at, cerrado: r.cerrado,
           consultable: !r.cerrado && (cola || []).some((c) => c.id === r.id) };
}

// ---------- Abrir casos ----------
async function abrir(id, tabId) {
  const { abiertos = {} } = await chrome.storage.local.get('abiertos');
  abiertos[id] = Date.now();
  await chrome.storage.local.set({ abiertos, casoActivo: id });
  const url = `${PF_URL}#flujo=${id}`;
  if (tabId) await chrome.tabs.update(tabId, { url });
  else await chrome.tabs.create({ url, active: true });
}

async function siguiente(tabId, excluir) {
  const pendientes = await rpc('rnm_pendientes');
  const sig = (pendientes || []).find((c) => c.id !== excluir);
  await actualizarBadge(pendientes);
  if (!sig) {
    await chrome.storage.local.remove('casoActivo');
    return { hayMas: false };
  }
  await abrir(sig.id, tabId);
  return { hayMas: true };
}

async function actualizarBadge(pendientes) {
  await chrome.action.setBadgeText({ text: pendientes?.length ? String(pendientes.length) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#0b5fff' });
}

// Cada 2 min: si hay RNM por consultar y no hay una pestaña de la PF abierta, abre el siguiente.
async function revisarPendientes() {
  if (!(await getSession())) return;
  let pendientes;
  try { pendientes = await rpc('rnm_pendientes'); } catch { return; }
  await actualizarBadge(pendientes);
  const { automatico = true, abiertos = {} } = await chrome.storage.local.get(['automatico', 'abiertos']);
  if (!automatico || !pendientes?.length) return;
  if ((await chrome.tabs.query({ url: PF_TABS })).length) return;
  const ahora = Date.now();
  const sig = pendientes.find((c) => !abiertos[c.id] || ahora - abiertos[c.id] > REABRIR_MS);
  if (sig) await abrir(sig.id);
}

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('revisar', { periodInMinutes: 2 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('revisar', { periodInMinutes: 2 }));
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'revisar') revisarPendientes(); });

// Cuentas a las que hay que cobrar el plan del mes: tienen RNM sin cubrir (primera consulta gratis ya hecha, plan vencido,
// plan más chico que sus RNM, o RNM adicional). Mientras no haya pasarela, el pago se registra a mano.
async function porPagar() {
  return rpc('rnm_por_cobrar');
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const run = async () => {
    switch (msg.type) {
      case 'session': {
        const s = await getSession();
        return s ? { email: s.email } : null;
      }
      case 'login': {
        const r = await login(msg.email, msg.password);
        revisarPendientes();
        return r;
      }
      case 'logout':
        await chrome.storage.local.remove(['session', 'casoActivo']);
        await chrome.action.setBadgeText({ text: '' });
        return true;
      case 'pendientes': {
        const p = await rpc('rnm_pendientes');
        await actualizarBadge(p);
        return p;
      }
      case 'porPagar':
        return porPagar();
      case 'activarPlan':
        await rpc('rnm_activar_plan', { p_user: msg.user, p_cupos: msg.cupos, p_ref: 'manual' });
        return true;
      case 'caso': {
        const id = msg.id || (await chrome.storage.local.get('casoActivo')).casoActivo;
        return id ? caso(id) : null;
      }
      case 'guardar':
        return rpc('rnm_guardar_resultado', { p_registro: msg.id, p_texto: msg.texto, p_unidad: msg.unidad || null, p_cambio_direccion: msg.cambio || null });
      case 'siguiente':
        return siguiente(sender.tab?.id, msg.excluir);
      case 'empezar':
        return siguiente(null, null);
      case 'cfLog': {
        const { cfLog = [] } = await chrome.storage.local.get('cfLog');
        cfLog.push({ t: Date.now(), seg: msg.seg, solo: !!msg.solo, timeout: !!msg.timeout });
        await chrome.storage.local.set({ cfLog: cfLog.slice(-50) });
        return true;
      }
      case 'cfStats': {
        const { cfLog = [] } = await chrome.storage.local.get('cfLog');
        const validos = cfLog.filter((x) => !x.timeout);
        const solos = validos.filter((x) => x.solo);
        const med = solos.length ? solos.map((x) => x.seg).sort((a, b) => a - b)[Math.floor(solos.length / 2)] : null;
        return { total: cfLog.length, verificados: validos.length, solos: solos.length, tiempoOut: cfLog.length - validos.length, medianaSolo: med };
      }
      case 'cfReset':
        await chrome.storage.local.remove('cfLog');
        return true;
      case 'automatico':
        await chrome.storage.local.set({ automatico: msg.valor });
        return msg.valor;
      default:
        throw new Error('Mensaje desconocido');
    }
  };
  run().then((data) => sendResponse({ ok: true, data }), (err) => sendResponse({ ok: false, error: err.message }));
  return true;
});
