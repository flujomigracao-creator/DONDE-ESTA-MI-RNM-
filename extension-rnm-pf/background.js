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
  const { autoTotal = false } = await chrome.storage.local.get('autoTotal');
  if (tabId) await chrome.tabs.update(tabId, { url });
  else if (autoTotal) {
    // Modo automático: ventana aparte que no le quita el foco a quien esté trabajando.
    const w = await chrome.windows.create({ url, focused: false, width: 1100, height: 800 });
    await chrome.storage.local.set({ ventanaAuto: w.id });
  } else await chrome.tabs.create({ url, active: true });
}

// Reintentos inteligentes: si Cloudflare o la PF no dejan consultar un RNM, se reintenta con espera creciente
// (2, 5, 15 y 30 min); tras 4 fallos ese RNM descansa 3 h. Con 3 fallos seguidos (de cualquier RNM) todo el bot descansa 30 min.
const ESPERAS_MIN = [2, 5, 15, 30];
const PAUSA_RNM_MS = 3 * 3600_000;
const PAUSA_GLOBAL_MS = 30 * 60_000;
const FALLOS_PARA_DESCANSAR = 3;

async function estadoReintentos() {
  const st = await chrome.storage.local.get(['intentos', 'pausaGlobal']);
  return { intentos: st.intentos || {}, pausaGlobal: st.pausaGlobal || 0 };
}
// Lo que se puede consultar ahora: sin descanso global y sin RNM en espera de su reintento.
async function disponibles(pendientes) {
  const { intentos, pausaGlobal } = await estadoReintentos();
  const ahora = Date.now();
  if (pausaGlobal > ahora) return [];
  return (pendientes || []).filter((c) => !(intentos[c.id]?.proximo > ahora));
}
// ¿hay algo cuyo reintento ya venció? (se abre aunque se haya abierto hace poco)
async function reintentoVencido(id) {
  const { intentos } = await estadoReintentos();
  const p = intentos[id]?.proximo;
  return !!p && p <= Date.now();
}
async function registrarFallo(id, motivo, ventanaId) {
  const st = await chrome.storage.local.get(['intentos', 'fallosSeguidos']);
  const intentos = st.intentos || {};
  const it = intentos[id] || { n: 0 };
  it.n += 1;
  let mensaje, notificar = false;
  if (it.n <= ESPERAS_MIN.length) {
    it.proximo = Date.now() + ESPERAS_MIN[it.n - 1] * 60_000;
    mensaje = 'Reintento automático ' + it.n + '/' + ESPERAS_MIN.length + ' en ' + ESPERAS_MIN[it.n - 1] + ' min.';
  } else {
    it.proximo = Date.now() + PAUSA_RNM_MS;
    it.n = 0;
    mensaje = 'Este RNM descansa 3 h tras ' + (ESPERAS_MIN.length + 1) + ' fallos.';
    notificar = true;
  }
  intentos[id] = it;
  const upd = { intentos, fallosSeguidos: (st.fallosSeguidos || 0) + 1, ultimoFallo: { id, motivo, t: Date.now() } };
  if (upd.fallosSeguidos >= FALLOS_PARA_DESCANSAR) {
    upd.pausaGlobal = Date.now() + PAUSA_GLOBAL_MS;
    upd.fallosSeguidos = 0;
    mensaje += ' ' + FALLOS_PARA_DESCANSAR + ' fallos seguidos: el bot descansa 30 min.';
    notificar = true;
  }
  await chrome.storage.local.set(upd);
  if (notificar) await avisar('FLUJO · Consulta RNM', 'La PF no dejó consultar (' + motivo + '). ' + mensaje);
  // En modo automático la ventana se cierra; el reintento la vuelve a abrir cuando toque.
  const { ventanaAuto } = await chrome.storage.local.get('ventanaAuto');
  if (ventanaAuto && ventanaAuto === ventanaId) {
    await chrome.storage.local.remove('ventanaAuto');
    setTimeout(() => chrome.windows.remove(ventanaAuto).catch(() => {}), 5000);
  }
  return { mensaje };
}
async function registrarExito(id) {
  const { intentos = {} } = await chrome.storage.local.get('intentos');
  delete intentos[id];
  await chrome.storage.local.set({ intentos, fallosSeguidos: 0 });
}
async function avisar(titulo, texto) {
  await chrome.notifications.create({ type: 'basic', iconUrl: chrome.runtime.getURL('icono.png'), title: titulo, message: texto, priority: 2 });
}

async function siguiente(tabId, excluir) {
  const pendientes = await rpc('rnm_pendientes');
  const sig = (await disponibles(pendientes)).find((c) => c.id !== excluir);
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
  const libres = await disponibles(pendientes);
  let sig = null;
  for (const c of libres) {
    if ((await reintentoVencido(c.id)) || !abiertos[c.id] || ahora - abiertos[c.id] > REABRIR_MS) { sig = c; break; }
  }
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
      case 'avisar':
        await avisar(msg.titulo, msg.texto);
        return true;
      case 'fallo':
        return registrarFallo(msg.id, msg.motivo, sender.tab?.windowId);
      case 'exito':
        await registrarExito(msg.id);
        return true;
      case 'estadoBot': {
        const st = await chrome.storage.local.get(['intentos', 'pausaGlobal', 'ultimoFallo']);
        const ahora = Date.now();
        const enEspera = Object.values(st.intentos || {}).filter((x) => x.proximo > ahora).length;
        return { pausaGlobalMin: st.pausaGlobal > ahora ? Math.ceil((st.pausaGlobal - ahora) / 60000) : 0, enEspera, ultimoFallo: st.ultimoFallo || null };
      }
      case 'cerrarAuto': {
        const { ventanaAuto } = await chrome.storage.local.get('ventanaAuto');
        if (ventanaAuto && sender.tab?.windowId === ventanaAuto) { await chrome.storage.local.remove('ventanaAuto'); await chrome.windows.remove(ventanaAuto); }
        return true;
      }
      case 'autoTotal':
        await chrome.storage.local.set({ autoTotal: msg.valor });
        if (msg.valor) await chrome.storage.local.set({ automatico: true });
        return msg.valor;
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
