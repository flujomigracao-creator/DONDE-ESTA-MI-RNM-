// Configuración pública (la clave "publishable" está pensada para ir en el navegador; los datos los protege RLS).
var SUPABASE_URL = "https://rumpfqevyspdmhaggxtq.supabase.co";
var SUPABASE_KEY = "sb_publishable_7znj3ENrTWXDE2dibUzv_A_a7HUoud_";
// WhatsApp de FLUJO, solo dígitos con código de país (ej: 5511912345678). Vacío = no se muestra el botón.
var WHATSAPP = "5548984553309";
// Clave pública de Mercado Pago (pensada para ir en el navegador; no permite cobrar ni leer nada).
var MP_PUBLIC_KEY = "APP_USR-d9efd8e3-53cb-4c67-bb1f-585c8fcd5358";
// Contacto de respaldo mientras no haya WhatsApp configurado (así nunca se muestra un enlace roto ni se pide escribir sin dar un canal).
var CONTACTO_EMAIL = "flujoescalaempresas@gmail.com";
var VIA_CONTACTO = WHATSAPP ? "por WhatsApp" : "a " + CONTACTO_EMAIL;

var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* Enlace directo desde un aviso de WhatsApp: ?plan=2&pago=pix abre el pago de ese plan con el método ya elegido.
   Se guarda unos días porque el inicio de sesión con Google no conserva la dirección. */
(function () {
  try {
    var q = new URLSearchParams(location.search), planParam = String(q.get("plan") || "").toLowerCase(), metodo = q.get("pago");
    var tipoPlan = planParam === "manual" ? "manual" : planParam === "quincenal" ? "quincenal" : ((planParam === "semanal" || (Number(planParam) >= 1 && Number(planParam) <= 4)) ? "semanal" : null);
    var ref = String(q.get("ref") || "").toLowerCase();
    if (/^[a-z0-9_-]{3,40}$/.test(ref)) {
      localStorage.setItem("rnm_ref", ref);
      history.replaceState(null, "", location.pathname + location.hash);
    }
    if (tipoPlan) {
      localStorage.setItem("rnm_ir_pago", JSON.stringify({ plan: tipoPlan, metodo: metodo === "boleto" ? "boleto" : "pix", t: Date.now() }));
      history.replaceState(null, "", location.pathname + location.hash);
    }
  } catch (e) { /* sin almacenamiento: simplemente no se abre el pago solo */ }
})();
function asignarAliado() {
  var ref;
  try { ref = localStorage.getItem("rnm_ref"); } catch (e) { return; }
  if (!ref || !usuarioActual) return;
  sb.rpc("rnm_asignar_aliado", { p_codigo: ref }).then(function (r) {
    if (!r.error) { try { localStorage.removeItem("rnm_ref"); } catch (e) { /* sin almacenamiento */ } }
  });
}
function consumirIrAPago() {
  var d;
  try { d = JSON.parse(localStorage.getItem("rnm_ir_pago") || "null"); localStorage.removeItem("rnm_ir_pago"); } catch (e) { return; }
  if (!d || Date.now() - d.t > 7 * 24 * 3600 * 1000) return;
  var tipoIr = d.plan === "manual" ? "manual" : (d.plan === "quincenal" ? "quincenal" : "semanal");
  navegarA("planes");
  setTimeout(function () {
    mostrarPago(tipoIr);
    var b = document.querySelector('.metodo[data-m="' + d.metodo + '"]');
    if (b) b.click();
  }, 400);
}
var $ = function (id) { return document.getElementById(id); };

function msg(id, texto, bien) {
  var el = $(id);
  el.textContent = texto || "";
  el.className = "msg" + (bien ? " bien" : "");
}

/* ---------- Sesión ---------- */
async function iniciar() {
  if (/[?&]preapproval_id=/.test(location.search)) {
    esperandoPago = Date.now();
    history.replaceState(null, "", location.pathname);
  }
  var r = await sb.auth.getSession();
  mostrar(r.data.session);
  sb.auth.onAuthStateChange(function (_e, session) { mostrar(session); });
}

var usuarioActual = null;
window.rnmMetaServidor = async function (cuerpo) {
  try {
    var ses = await sb.auth.getSession();
    var tk = ses && ses.data && ses.data.session && ses.data.session.access_token;
    if (!tk) return;
    fetch(SUPABASE_URL + "/functions/v1/meta-capi-web", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tk, "apikey": SUPABASE_KEY }, body: JSON.stringify(cuerpo) }).catch(function () { /* sin red */ });
  } catch (e) { /* sin sesión */ }
};
var perfilActual = null;
var seccionActual = "inicio";
var registrosCargados = [];
var planCargado = null;
var filtroMisRnm = "todos";
var detalleActual = null;
var salidaManual = false;

var SECCIONES_INFO = {
  "inicio": { titulo: "Inicio", sub: "Resumen de tus trámites y estado disponible" },
  "mis-rnm": { titulo: "Mis RNM", sub: "Todos tus documentos y su estado" },
  "detalle-rnm": { titulo: "Detalle del RNM", sub: "Información detallada, ubicación policial e historial" },
  "nueva-consulta": { titulo: "Agregar RNM", sub: "Registra un nuevo documento para monitorear" },
  "historial": { titulo: "Historial de consultas", sub: "Registro de operaciones y consultas realizadas" },
  "planes": { titulo: "Planes y pagos", sub: "Cobertura mensual para supervisión continua" },
  "ayuda": { titulo: "Ayuda y soporte", sub: "Orientación sobre tu trámite y canales de contacto" },
  "perfil": { titulo: "Mi cuenta", sub: "Información de tu perfil y preferencias" }
};

/* Diálogo de Confirmación Accesible (ConfirmDialog) */
function mostrarConfirmacion(opts) {
  return new Promise(function (resolve) {
    var modal = $("modal-confirmar");
    if (!modal) {
      return resolve(window.confirm(opts.desc || opts.titulo || "¿Confirmar?"));
    }
    var focoPrevio = document.activeElement;
    var tit = $("confirm-titulo"), desc = $("confirm-desc");
    var btnCanc = $("confirm-btn-cancelar"), btnAcc = $("confirm-btn-accion");

    if (tit) tit.textContent = opts.titulo || "¿Confirmar acción?";
    if (desc) desc.textContent = opts.desc || "Esta acción no se puede deshacer.";
    if (btnCanc) btnCanc.textContent = opts.cancelarTexto || "Cancelar";
    if (btnAcc) {
      btnAcc.textContent = opts.accionTexto || "Confirmar";
      btnAcc.className = "btn " + (opts.esPeligroso ? "danger" : "");
    }

    function limpiar() {
      modal.classList.add("oculto");
      document.body.style.overflow = "";
      if (focoPrevio && document.contains(focoPrevio)) { try { focoPrevio.focus(); } catch (e) { /* sin foco */ } }
      btnCanc.removeEventListener("click", onCanc);
      btnAcc.removeEventListener("click", onAcc);
      document.removeEventListener("keydown", onKey);
    }
    function onCanc() { limpiar(); resolve(false); }
    function onAcc() { limpiar(); resolve(true); }
    function onKey(e) { if (e.key === "Escape") onCanc(); }

    btnCanc.addEventListener("click", onCanc);
    btnAcc.addEventListener("click", onAcc);
    document.addEventListener("keydown", onKey);

    modal.classList.remove("oculto");
    document.body.style.overflow = "hidden";
    if (btnAcc) btnAcc.focus();
  });
}

// La dirección (#sección) permite usar el botón "atrás" del navegador.
function navegarA(id) {
  if (!SECCIONES_INFO[id]) id = "inicio";
  if (location.hash !== "#" + id) { location.hash = "#" + id; return; }
  mostrarSeccion(id);
}
function seccionInicial() {
  var id = location.hash.replace("#", "");
  return SECCIONES_INFO[id] && id !== "detalle-rnm" ? id : "inicio";
}
window.addEventListener("hashchange", function () {
  if ($("vista-app").classList.contains("oculto")) return;
  var id = location.hash.replace("#", "");
  if (id === "detalle-rnm" && !detalleActual) id = "inicio";
  mostrarSeccion(SECCIONES_INFO[id] ? id : "inicio");
});

function mostrarSeccion(id) {
  seccionActual = id;

  // Actualizar estado en navegación de sidebar y barra móvil
  document.querySelectorAll("[data-seccion]").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-seccion") === id);
  });

  // Alternar visibilidad de las secciones
  document.querySelectorAll(".seccion-app").forEach(function (sec) {
    sec.classList.toggle("oculto", sec.id !== "seccion-" + id);
  });

  // Título de la cabecera
  var t = $("app-header-titulo"); if (t) t.textContent = SECCIONES_INFO[id].titulo;

  // Sincronizar contenidos específicos
  if (id === "planes") renderizarPlanes(registrosCargados, planCargado);
  if (id === "nueva-consulta" && typeof irSubPaso === "function") irSubPaso(1);
  if (id === "historial") {
    cargarHistorialConsultas();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function vista(nombre) { // "login" | "perfil" | "app"
  ["login", "perfil", "app"].forEach(function (v) {
    $("vista-" + v).classList.toggle("oculto", v !== nombre);
  });
}

function actualizarResumenPerfil() {
  var n = $("perfil-n-rnm"); if (n) { if (window.contarHasta) contarHasta(n, registrosCargados.length); else n.textContent = String(registrosCargados.length); }
  var activo = !!planCargado && new Date(planCargado.vence_at) > new Date();
  var p = $("perfil-plan"), ps = $("perfil-plan-sub");
  if (p) p.textContent = activo ? nombrePlan(planCargado.tipo) : "Sin plan";
  if (ps) ps.textContent = activo ? (planCargado.cancelado_at ? "Cancelado · hasta " : "Activo hasta ") + fechaCorta(planCargado.vence_at) : "Ver planes";
  var bc = $("btn-cancelar-plan-perfil");
  if (bc) bc.classList.toggle("oculto", !(activo && !planCargado.cancelado_at));
  var del = $("perfil-eliminar");
  if (del) del.href = WHATSAPP ? "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent("Hola, quiero solicitar la eliminación de mi cuenta y mis datos en ¿Dónde está mi RNM?") : "mailto:" + CONTACTO_EMAIL + "?subject=" + encodeURIComponent("Eliminar mi cuenta");
}

function actualizarInfoUsuario(user, perfil) {
  var email = (user && user.email) || "";
  var meta = (user && user.user_metadata) || {};
  var nombre = (perfil && perfil.nombre) || meta.full_name || meta.name || email.split("@")[0] || "Usuario";
  var inicial = (nombre.charAt(0) || "U").toUpperCase();

  document.querySelectorAll(".user-avatar-circle").forEach(function (a) { a.textContent = inicial; });
  var q = $("quien"); if (q) q.textContent = email;
  var nd = $("perfil-nombre-display"); if (nd) nd.textContent = nombre;
  var ed = $("perfil-email-display"); if (ed) ed.textContent = email;
  var pt = $("perfil-tel-display"); if (pt) pt.textContent = (perfil && perfil.telefono) ? "+" + perfil.telefono : "—";
  actualizarResumenPerfil();
  var pd = $("perfil-dir-display"); if (pd) pd.textContent = (perfil && perfil.direccion) ? perfil.direccion + (perfil.cep ? " · CEP " + perfil.cep.slice(0, 5) + "-" + perfil.cep.slice(5) : "") : "—";
  var pc = $("perfil-ciudad-display"); if (pc) pc.textContent = perfil && perfil.ciudad ? perfil.ciudad + (perfil.estado ? " / " + perfil.estado : "") : "—";
}

async function mostrar(session) {
  var habiaSesion = !!usuarioActual;
  var cambio = (session && session.user && session.user.id) !== (usuarioActual && usuarioActual.id);
  usuarioActual = session ? session.user : null;
  if (!session) {
    perfilActual = null;
    if (habiaSesion && !salidaManual) msg("msg-login", "Tu sesión necesita actualizarse. Inicia sesión de nuevo.");
    salidaManual = false;
    detenerTiempoReal();
    return vista("login");
  }
  asignarAliado();
  if (!cambio) return;
  var r = await sb.from("rnm_perfiles").select("*").eq("user_id", session.user.id).maybeSingle();
  perfilActual = r.data || null;
  actualizarInfoUsuario(session.user, perfilActual);
  if (window.rnmIdentificar) rnmIdentificar(session.user, perfilActual);
  if (!perfilActual) { abrirPerfil(false); }
  else { vista("app"); navegarA(seccionInicial()); cargarRegistros(); iniciarTiempoReal(); setTimeout(revisarOpinionPendiente, 6000); }
}

/* ---------- Onboarding / perfil ---------- */
function abrirPerfil(editando) {
  var p = perfilActual;
  var meta = (usuarioActual && usuarioActual.user_metadata) || {};
  $("p-nombre").value = p ? p.nombre : (meta.full_name || meta.name || "");
  $("p-tel").value = p ? p.telefono : "";
  $("p-dir").value = p ? p.direccion : "";
  $("p-ciudad").value = p ? p.ciudad : "";
  $("p-uf").value = p && p.estado ? p.estado : "";
  $("p-cep").value = p && p.cep ? p.cep.slice(0, 5) + "-" + p.cep.slice(5) : "";
  $("p-consiento").checked = !!p;
  $("p-avisos").checked = !!(p && p.avisos_whatsapp);
  $("btn-perfil-cancelar").classList.toggle("oculto", !editando);
  msg("msg-perfil", "");
  irAPaso(1);
  vista("perfil");
}

/* Asistente de 3 pantallas: nombre -> teléfono -> dirección */
var pasoActual = 1;
function irAPaso(n) {
  pasoActual = n;
  document.querySelectorAll(".paso-ob").forEach(function (d) {
    d.classList.toggle("oculto", +d.getAttribute("data-paso") !== n);
  });
  document.querySelectorAll(".progreso i").forEach(function (b, i) { b.classList.toggle("on", i < n); });
  var pg = document.querySelector(".progreso"); if (pg) pg.setAttribute("aria-valuenow", String(n));
  $("perfil-paso").textContent = "Paso " + n + " de 3";
  $("btn-perfil-atras").classList.toggle("oculto", n === 1);
  $("btn-perfil").textContent = n < 3 ? "Siguiente" : "Guardar y continuar";
  msg("msg-perfil", "");
  limpiarErroresPerfil();
  var foco = { 1: "p-nombre", 2: "p-tel", 3: "p-cep" }[n];
  setTimeout(function () { $(foco).focus(); }, 0);
}

var campoConError = "";
function errorPaso(n) {
  campoConError = "";
  function fallo(id, txt) { campoConError = id; return txt; }
  if (n === 1) {
    if ($("p-nombre").value.trim().length < 3) return fallo("p-nombre", "Escribe tu nombre completo (mínimo 3 letras).");
  } else if (n === 2) {
    if (!/^\d{10,15}$/.test($("p-tel").value.replace(/\D/g, ""))) return fallo("p-tel", "Revisa tu teléfono: incluye el código de ciudad (y el de país si es de otro país).");
  } else {
    var uf = $("p-uf").value.trim().toUpperCase(), cep = $("p-cep").value.replace(/\D/g, "");
    if (cep && !/^\d{8}$/.test(cep)) return fallo("p-cep", "El CEP tiene 8 números.");
    if ($("p-dir").value.trim().length < 5) return fallo("p-dir", "Escribe tu dirección actual.");
    if ($("p-ciudad").value.trim().length < 2) return fallo("p-ciudad", "Escribe tu ciudad.");
    if (uf && !/^[A-Z]{2}$/.test(uf)) return fallo("p-uf", "El estado son 2 letras, por ejemplo SP.");
    if (!$("p-consiento").checked) return fallo("p-consiento", "Debes aceptar la autorización para continuar.");
  }
  return "";
}

/* Error pegado al campo (aria-invalid + aria-describedby); se borra al corregir y no se pierde lo escrito */
function limpiarErroresEn(sel) {
  document.querySelectorAll(sel + " .error-campo").forEach(function (p) { p.remove(); });
  document.querySelectorAll(sel + " [aria-invalid]").forEach(function (c) { c.removeAttribute("aria-invalid"); c.removeAttribute("aria-describedby"); });
}
function marcarCampoEn(sel, id, texto, msgId) {
  limpiarErroresEn(sel);
  var c = $(id);
  if (!c || !texto) return msg(msgId, texto);
  var p = el("p", "error-campo", texto);
  p.id = "err-" + id; p.setAttribute("role", "alert");
  var ancla = c.type === "checkbox" ? c.closest("label") : c;
  var apoyo = ancla.nextElementSibling;
  (apoyo && apoyo.classList.contains("ayuda-campo") ? apoyo : ancla).insertAdjacentElement("afterend", p);
  c.setAttribute("aria-invalid", "true"); c.setAttribute("aria-describedby", p.id);
  msg(msgId, "");
  c.focus();
}
function limpiarErroresPerfil() { limpiarErroresEn("#vista-perfil"); }
function marcarCampo(id, texto) { marcarCampoEn("#vista-perfil", id, texto, "msg-perfil"); }
document.querySelectorAll("#form-perfil input, #form-rnm input").forEach(function (c) {
  c.addEventListener("input", function () {
    var p = $("err-" + c.id); if (p) p.remove();
    c.removeAttribute("aria-invalid"); c.removeAttribute("aria-describedby");
  });
  c.addEventListener("change", function () { var p = $("err-" + c.id); if (p) p.remove(); });
});

$("btn-perfil-atras").addEventListener("click", function () { irAPaso(pasoActual - 1); });
/* Autocompletar con el CEP (ViaCEP, servicio público de Brasil: solo recibe el CEP) */
var ultimoCep = "";
$("p-cep").addEventListener("input", async function (e) {
  var d = e.target.value.replace(/\D/g, "").slice(0, 8);
  e.target.value = d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
  var estado = $("cep-estado");
  function cepEstado(t, tipo) { estado.textContent = t; estado.className = "sub ayuda-campo cep-" + (tipo || "info"); }
  if (d.length < 8) { ultimoCep = ""; cepEstado("Escribe tu CEP y completamos calle, ciudad y estado."); return; }
  if (d === ultimoCep) return;
  ultimoCep = d;
  cepEstado("Buscando tu dirección…", "busca");
  try {
    var r = await fetch("https://viacep.com.br/ws/" + d + "/json/");
    var j = await r.json();
    if (d !== ultimoCep) return; // el usuario ya cambió el CEP
    if (!r.ok || j.erro) { cepEstado("No encontramos ese CEP. Completa tu dirección a mano.", "fallo"); return; }
    var calle = [j.logradouro, j.bairro].filter(Boolean).join(", ");
    if (calle) $("p-dir").value = calle + (j.logradouro ? ", " : "");
    if (j.localidade) $("p-ciudad").value = j.localidade;
    if (j.uf) $("p-uf").value = j.uf;
    cepEstado("Listo: completamos calle, ciudad y estado. Agrega el número de tu casa o apartamento.", "ok");
    var dir = $("p-dir"); dir.focus(); dir.setSelectionRange(dir.value.length, dir.value.length);
  } catch (_) {
    cepEstado("No pudimos buscar el CEP. Completa tu dirección a mano.", "fallo");
  }
});

$("btn-perfil-cancelar").addEventListener("click", function () { vista("app"); });

$("form-perfil").addEventListener("submit", async function (e) {
  e.preventDefault();
  msg("msg-perfil", "");
  limpiarErroresPerfil();
  var err = errorPaso(pasoActual);
  if (err) return marcarCampo(campoConError, err);
  if (pasoActual < 3) return irAPaso(pasoActual + 1);
  for (var n = 1; n < 3; n++) { // por si algo quedó mal en un paso anterior
    var e2 = errorPaso(n);
    if (e2) { irAPaso(n); return marcarCampo(campoConError, e2); }
  }
  var nombre = $("p-nombre").value.trim().replace(/\s+/g, " ");
  var tel = $("p-tel").value.replace(/\D/g, "");
  var dir = $("p-dir").value.trim();
  var ciudad = $("p-ciudad").value.trim();
  var uf = $("p-uf").value.trim().toUpperCase();
  var cep = $("p-cep").value.replace(/\D/g, "");
  var datos = { nombre: nombre, telefono: tel, direccion: dir, ciudad: ciudad, estado: uf || null, cep: cep || null };
  var quiereAvisos = $("p-avisos").checked;
  datos.avisos_whatsapp = quiereAvisos;
  if (quiereAvisos && !(perfilActual && perfilActual.avisos_whatsapp)) datos.avisos_whatsapp_at = new Date().toISOString();
  var btn = $("btn-perfil"); btn.disabled = true;
  var r = perfilActual
    ? await sb.from("rnm_perfiles").update(datos).eq("user_id", usuarioActual.id).select().single()
    : await sb.from("rnm_perfiles").insert(Object.assign({ user_id: usuarioActual.id }, datos)).select().single();
  btn.disabled = false;
  if (r.error) return msg("msg-perfil", "No pudimos guardar tus datos. Intenta de nuevo.");
  perfilActual = r.data;
  if (window.rnmIdentificar && usuarioActual) rnmIdentificar(usuarioActual, perfilActual);
  vista("app");
  cargarRegistros();
});

$("btn-google").addEventListener("click", async function () {
  var b = this, texto = b.innerHTML;
  msg("msg-login", "");
  b.disabled = true; b.setAttribute("aria-busy", "true");
  b.innerHTML = '<span class="spinner" aria-hidden="true"></span> Conectando con Google…';
  var r;
  try {
    r = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  } catch (e) { r = { error: e }; }
  if (r.error) {
    b.disabled = false; b.removeAttribute("aria-busy"); b.innerHTML = texto;
    msg("msg-login", "No pudimos iniciar sesión. Revisa tu conexión e intenta de nuevo.");
  }
});
async function confirmarSalir() {
  var ok = await mostrarConfirmacion({
    titulo: "¿Cerrar sesión?",
    desc: "Tendrás que volver a entrar con Google para ver tus RNM.",
    accionTexto: "Cerrar sesión",
    esPeligroso: false
  });
  if (!ok) return;
  salidaManual = true;
  sb.auth.signOut();
}
$("btn-salir").addEventListener("click", confirmarSalir);
var btnSalirPerfil = $("btn-salir-perfil");
if (btnSalirPerfil) btnSalirPerfil.addEventListener("click", confirmarSalir);

/* ---------- Cancelar plan ---------- */
// Corta la renovación (en tarjeta, cancela la suscripción en Mercado Pago). Lo ya pagado sigue activo hasta su fecha.
async function cancelarPlan(boton) {
  var plan = planCargado;
  if (!plan || new Date(plan.vence_at) <= new Date() || plan.cancelado_at) return;
  var ok = await mostrarConfirmacion({
    titulo: "¿Cancelar tu plan?",
    desc: "No se volverá a cobrar. Sigues con todo activo hasta el " + fechaCorta(plan.vence_at) + " (ya lo pagaste); después tus RNM dejan de revisarse cada semana. Puedes volver a activarlo cuando quieras.",
    accionTexto: "Sí, cancelar plan",
    cancelarTexto: "Mantener mi plan",
    esPeligroso: true
  });
  if (!ok) return;
  var textoBoton = boton ? boton.textContent : "";
  if (boton) { boton.disabled = true; boton.setAttribute("aria-busy", "true"); boton.textContent = "Cancelando…"; }
  var j = null, bien = false;
  try {
    var s = await sb.auth.getSession();
    var token = s.data.session && s.data.session.access_token;
    var r = await fetch(SUPABASE_URL + "/functions/v1/mp-cancelar-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + token },
      body: "{}"
    });
    j = await r.json().catch(function () { return {}; });
    bien = r.ok && j.ok === true;
  } catch (e) { bien = false; }
  if (boton) { boton.disabled = false; boton.removeAttribute("aria-busy"); boton.textContent = textoBoton; }
  if (!bien) {
    if (window.toast) toast("No pudimos cancelar el plan. Tu plan sigue igual; inténtalo de nuevo en un momento" + (WHATSAPP ? " o escríbenos " + VIA_CONTACTO : "") + ".", "error");
    return;
  }
  if (window.toast) toast("Plan cancelado. No se volverá a cobrar.", "ok");
  await cargarRegistros();
}
var btnCancelarPerfil = $("btn-cancelar-plan-perfil");
if (btnCancelarPerfil) btnCancelarPerfil.addEventListener("click", function () { cancelarPlan(null); });

/* ---------- Formulario ---------- */
$("nac").addEventListener("input", function (e) {
  var d = e.target.value.replace(/\D/g, "").slice(0, 8), s = d;
  if (d.length > 4) s = d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4);
  else if (d.length > 2) s = d.slice(0, 2) + "/" + d.slice(2);
  e.target.value = s;
});

function fechaISO(txt) {
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(txt);
  if (!m) return null;
  var d = +m[1], mo = +m[2], y = +m[3], f = new Date(Date.UTC(y, mo - 1, d));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== mo - 1 || f.getUTCDate() !== d) return null;
  if (f > new Date() || y < 1900) return null;
  return m[3] + "-" + m[2] + "-" + m[1];
}

/* ---------- Flujo de Consulta por Pasos (Pantallas 9, 10 y 11) ---------- */
var consultaPendiente = { rnm: "", iso: "", nacTexto: "" };

function irAPasoConsulta(n) {
  var p1 = $("paso-consulta-1"), p2 = $("paso-consulta-2");
  if (n === 1 && typeof irSubPaso === "function") irSubPaso(1);
  if (p1) p1.classList.toggle("oculto", n !== 1);
  if (p2) p2.classList.toggle("oculto", n !== 2);

  var s1 = $("step-indicador-1"), s2 = $("step-indicador-2");
  if (s1) {
    s1.classList.toggle("active", n === 1);
    s1.classList.toggle("completed", n > 1);
  }
  if (s2) s2.classList.toggle("active", n === 2);
  msg("msg-form", "");
  msg("msg-confirmar", "");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* Onboarding guiado: una pregunta por pantalla (RNM -> fecha -> autorización), con animación */
var subPaso = 1;
var SUB_TITULOS = { 1: "¿Cuál es tu número de RNM?", 2: "¿Cuál es tu fecha de nacimiento?", 3: "Última cosa: tu autorización" };
function irSubPaso(n, dir) {
  subPaso = n;
  var campos = document.querySelectorAll("#form-rnm .form-field, #form-rnm label.check");
  campos.forEach(function (c, i) {
    var mostrar = i + 1 === n;
    c.classList.toggle("oculto", !mostrar);
    if (mostrar) { c.classList.remove("wiz-der", "wiz-izq"); void c.offsetWidth; c.classList.add(dir < 0 ? "wiz-izq" : "wiz-der"); }
  });
  var pts = document.querySelectorAll("#wiz-puntos i");
  pts.forEach(function (p, i) { p.classList.toggle("on", i < n); });
  var barra = $("wiz-puntos"); if (barra) barra.setAttribute("aria-valuenow", String(n));
  var t = $("wiz-titulo"); if (t) t.textContent = SUB_TITULOS[n];
  var at = $("btn-wiz-atras"); if (at) at.classList.toggle("oculto", n === 1);
  var go = $("btn-registrar"); if (go) go.textContent = n < 3 ? "Continuar" : "Revisar mis datos";
  limpiarErroresEn("#form-rnm"); msg("msg-form", "");
  var foco = { 1: "rnm", 2: "nac", 3: "consiento" }[n];
  setTimeout(function () { var f = $(foco); if (f && f.offsetParent !== null) f.focus({ preventScroll: true }); }, 60);
}
var rnmSoloNumerosAvisado = "";
function soloNumerosSinAviso(rnm) {
  if (!/^[0-9]+$/.test(rnm) || rnmSoloNumerosAvisado === rnm) return false;
  rnmSoloNumerosAvisado = rnm; return true;
}
var MSG_SOLO_NUMEROS = "Ese número solo tiene dígitos y un RNM suele llevar letras, por ejemplo A123456B. Revísalo en tu carné; si está bien, pulsa Continuar otra vez.";
function validarSubPaso(n) {
  var ME = function (id, t) { marcarCampoEn("#form-rnm", id, t, "msg-form"); return false; };
  limpiarErroresEn("#form-rnm");
  if (n === 1) {
    var rnm = $("rnm").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!rnm) return ME("rnm", "Escribe tu número de RNM.");
    if (!/^[A-Z0-9]{6,12}$/.test(rnm)) return ME("rnm", "Revisa tu RNM: deben ser entre 6 y 12 letras y números, sin espacios ni símbolos.");
    if (soloNumerosSinAviso(rnm)) return ME("rnm", MSG_SOLO_NUMEROS);
  } else if (n === 2) {
    var nt = $("nac").value.trim();
    if (!nt) return ME("nac", "Escribe tu fecha de nacimiento (dd/mm/aaaa).");
    if (!fechaISO(nt)) return ME("nac", "Esa fecha no es válida. Usa el formato dd/mm/aaaa, por ejemplo 14/03/1992, y que no sea una fecha futura.");
  }
  return true;
}
$("rnm").addEventListener("input", function (e) {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  e.target.parentNode.classList.toggle("valido", /^[A-Z0-9]{6,12}$/.test(e.target.value));
});
$("nac").addEventListener("input", function (e) { e.target.parentNode.classList.toggle("valido", !!fechaISO(e.target.value.trim())); });

var btnWizAtras = $("btn-wiz-atras");
if (btnWizAtras) btnWizAtras.addEventListener("click", function () { if (subPaso > 1) irSubPaso(subPaso - 1, -1); });

$("form-rnm").addEventListener("submit", function (e) {
  e.preventDefault();
  if (subPaso < 3) { if (validarSubPaso(subPaso)) irSubPaso(subPaso + 1, 1); return; }
  msg("msg-form", "");
  var rnm = $("rnm").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  var nacTxt = $("nac").value.trim();
  var iso = fechaISO(nacTxt);

  limpiarErroresEn("#form-rnm");
  var ME = function (id, t) { return marcarCampoEn("#form-rnm", id, t, "msg-form"); };
  if (!rnm) return ME("rnm", "Escribe tu número de RNM.");
  if (!/^[A-Z0-9]{6,12}$/.test(rnm)) return ME("rnm", "Revisa tu RNM: deben ser entre 6 y 12 letras y números, sin espacios ni símbolos.");
  if (soloNumerosSinAviso(rnm)) return ME("rnm", MSG_SOLO_NUMEROS);
  if (!nacTxt) return ME("nac", "Escribe tu fecha de nacimiento (dd/mm/aaaa).");
  if (!iso) return ME("nac", "Esa fecha no es válida. Usa el formato dd/mm/aaaa, por ejemplo 14/03/1992, y que no sea una fecha futura.");
  if (!$("consiento").checked) return ME("consiento", "Marca la autorización para poder continuar.");

  consultaPendiente = { rnm: rnm, iso: iso, nacTexto: nacTxt };

  var confRnm = $("conf-rnm-val"); if (confRnm) confRnm.textContent = rnm;
  var confNac = $("conf-nac-val"); if (confNac) confNac.textContent = nacTxt;

  var confCosto = $("conf-costo-val");
  if (confCosto) {
    confCosto.textContent = "Primera verificación gratis";
    confCosto.style.color = "var(--success)";
  }

  irAPasoConsulta(2);
});

var btnConfEditar = $("btn-confirmar-editar");
if (btnConfEditar) {
  btnConfEditar.addEventListener("click", function () {
    irAPasoConsulta(1);
  });
}

var btnConfEnviar = $("btn-confirmar-enviar");
if (btnConfEnviar) {
  btnConfEnviar.addEventListener("click", async function () {
    if (!consultaPendiente.rnm || !consultaPendiente.iso) return irAPasoConsulta(1);

    var btn = this;
    btn.disabled = true;
    msg("msg-confirmar", "Registrando documento y preparando consulta…", true);

    var r = await sb.from("rnm_registros").insert({
      user_id: usuarioActual.id,
      rnm: consultaPendiente.rnm,
      fecha_nacimiento: consultaPendiente.iso
    });

    btn.disabled = false;

    if (r.error) {
      if ((r.error.message || "").indexOf("limite_4_rnm") >= 0) {
        return msg("msg-confirmar", "Has alcanzado el límite máximo de 4 RNM por cuenta.");
      }
      return msg("msg-confirmar", r.error.code === "23505"
        ? "Ese RNM ya está registrado en una cuenta. Si es tuyo y no lo ves en tu lista, contáctanos a " + CONTACTO_EMAIL + "."
        : "No pudimos procesar el registro. Intenta de nuevo.");
    }

    if (window.rnmTrack && !localStorage.getItem("rnm_reg_tracked")) { try { localStorage.setItem("rnm_reg_tracked", "1"); } catch (e) { /* sin almacenamiento */ } rnmTrack("CompleteRegistration", { content_name: "registro_rnm" }, "reg-" + usuarioActual.id); }
    $("form-rnm").reset();
    await mostrarConsultando(function () { return cargarRegistros(); });
    irAPasoConsulta(1);
    var nuevo = registrosCargados.find(function (x) { return x.rnm === consultaPendiente.rnm; });
    if (nuevo) abrirDetalleRnm(nuevo.id); else navegarA("inicio");
    opinionPendienteMostrada = false; setTimeout(function () { revisarOpinionPendiente("registro"); }, 30000); // respaldo: lo normal es pedirla al cerrar el aviso del plan
  });
}

/* Pantalla de progreso: pasos que se marcan uno a uno mientras se carga el seguimiento */
async function mostrarConsultando(trabajo) {
  var ov = $("consultando");
  if (!ov) { await trabajo(); return; }
  var pasos = ov.querySelectorAll(".cons-pasos li");
  pasos.forEach(function (l) { l.classList.remove("hecho", "activo"); });
  ov.classList.remove("oculto"); document.body.style.overflow = "hidden";
  var dormir = function (ms) { return new Promise(function (r2) { setTimeout(r2, ms); }); };
  var t0 = Date.now();
  var marcar = async function (i) { pasos[i].classList.add("activo"); await dormir(i === 2 ? 600 : 750); pasos[i].classList.remove("activo"); pasos[i].classList.add("hecho"); };
  var anim = (async function () { for (var i = 0; i < pasos.length; i++) await marcar(i); })();
  try { await trabajo(); } catch (e) { /* si falla la carga, el detalle mostrará lo que haya */ }
  await anim; await dormir(350);
  ov.classList.add("oculto"); document.body.style.overflow = "";
}

/* ---------- Lista de RNM ---------- */
var gratisDisponible = true;
// Muestra un solo aviso: primera consulta gratis, cubierto por el plan, RNM adicional con plan, o límite de 4.
function mostrarCosteAplicable() {
  var lleno = registrosCargados.length >= 4;
  var activo = !!planCargado && new Date(planCargado.vence_at) > new Date();
  var cual = lleno ? "tope-4" : "reg-gratis"; // cada RNM (hasta 4) tiene su primera verificación gratis
  ["reg-gratis", "reg-cubierto", "reg-adicional", "tope-4"].forEach(function (id) { var n = $(id); if (n) n.classList.toggle("oculto", id !== cual); });
}
async function actualizarAvisoRegistro() {
  gratisDisponible = true;
  mostrarCosteAplicable();
}

/* Tres planes, todos de hasta 4 RNM: Quincenal (revisión cada 15 días), Semanal (cada 7 días) y Manual (todo lo del semanal + "Verificar ahora"). */
var PRECIOS = { quincenal: 499, semanal: 999, manual: 1999 }; // centavos al mes
var ORDEN_PLAN = { quincenal: 1, semanal: 2, manual: 3 };
function planSuperior(tipo) { return tipo === "quincenal" ? "semanal" : (tipo === "semanal" ? "manual" : null); }
function reales(c) { return "R$ " + (c / 100).toFixed(2).replace(".", ","); }
var PLANES = {
  quincenal: { nombre: "Quincenal", etiqueta: "Plan quincenal", insignia: "Más económico", lema: "Actualización automática cada 15 días",
    puntos: ["Hasta 4 RNM en una sola cuenta", "Revisión automática cada 15 días", "Ves dónde está tu RNM y qué hacer", "Primera verificación gratis en cada RNM"] },
  semanal: { nombre: "Semanal", etiqueta: "Plan semanal", insignia: "Más elegido", lema: "Lo revisamos por ti, cada semana",
    puntos: ["Hasta 4 RNM en una sola cuenta", "Revisión automática cada 7 días", "Ves dónde está tu RNM y qué hacer", "Primera verificación gratis en cada RNM"] },
  manual: { nombre: "Manual", etiqueta: "Plan manual", insignia: "Control total", lema: "Verifica tú, el día que quieras",
    puntos: ["Todo lo del plan semanal", "Botón «Verificar ahora» en cada RNM", "1 verificación por día y por RNM", "Ideal si estás por retirar tu documento"] }
};
function nombrePlan(tipo) { return (PLANES[tipo] || PLANES.semanal).etiqueta; }
function frecuenciaPlan(tipo) { return tipo === "quincenal" ? "cada 15 días" : "cada semana"; }
var ICO_CHECK_PLAN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function tarjetaPlan(tipo, o) {
  var p = PLANES[tipo], b = el("button", "plan-op " + tipo + (o.sel ? " sel" : "") + (o.actual ? " actual" : ""));
  b.type = "button";
  if (o.off) b.disabled = true;
  b.appendChild(el("span", "plan-op-insignia" + (o.actual ? " actual" : ""), o.actual ? "Tu plan" : p.insignia));
  var cab = el("div", "plan-op-cab");
  cab.appendChild(el("b", "plan-op-nombre", p.nombre));
  var pr = el("div", "plan-op-precio");
  pr.appendChild(el("strong", "", reales(PRECIOS[tipo]))); pr.appendChild(el("span", "", "/mes"));
  cab.appendChild(pr); b.appendChild(cab);
  b.appendChild(el("p", "plan-op-lema", p.lema));
  var ul = el("ul", "plan-op-puntos");
  p.puntos.forEach(function (t) { var li = el("li", "", ""); li.innerHTML = ICO_CHECK_PLAN; li.appendChild(document.createTextNode(t)); ul.appendChild(li); });
  b.appendChild(ul);
  if (o.aviso) b.appendChild(el("small", "plan-op-aviso", o.aviso));
  if (o.onClick && !o.off) b.addEventListener("click", o.onClick);
  return b;
}
var planElegido = "semanal";
var ultimoTipoPedido = ""; // el plan que la persona está pagando ahora (para saber cuándo quedó activo)
var ampliando = false; // el cliente con plan semanal activo quiere pasar al manual

var esperandoPago = 0; // hora en que la persona volvió de Mercado Pago; mientras tanto se confirma el cobro

// Pide al servidor que cree la suscripción con el código de la tarjeta (los datos de la tarjeta nunca pasan por FLUJO).
async function pedirSuscripcion(tipo, tarjetaToken) {
  var s = await sb.auth.getSession();
  var token = s.data.session && s.data.session.access_token;
  var r = await fetch(SUPABASE_URL + "/functions/v1/mp-crear-suscripcion", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + token },
    body: JSON.stringify({ plan: tipo, card_token_id: tarjetaToken })
  });
  var j = await r.json().catch(function () { return {}; });
  return { ok: r.ok && j.ok === true, j: j };
}

function textoErrorPago(j) {
  var textos = {
    pago_no_configurado: "Estamos activando el pago. Vuelve en unos días.",
    registra_un_rnm_primero: "Primero registra tu RNM.",
    sin_sesion: "Tu sesión venció. Sal y vuelve a entrar.",
    tarjeta_invalida: "No pudimos leer la tarjeta. Revisa los datos e intenta de nuevo.",
    cpf_invalido: "Ese CPF no es válido. Revísalo e intenta de nuevo.",
    faltan_datos_boleto: "Para el boleto necesitamos tu dirección completa (CEP, ciudad y estado). Complétala en Mi cuenta.",
    metodo_no_disponible: "Esta forma de pago no está disponible por ahora. Prueba con otra."
  };
  if (textos[j.error]) return textos[j.error];
  if (j.motivo === "mismo_usuario") return "Esta cuenta no puede pagar su propio plan. Entra con otro correo.";
  if (j.motivo === "tarjeta_rechazada") return "La tarjeta no fue aceptada. Revisa los datos o prueba con otra.";
  return "No pudimos procesar el pago. Revisa la tarjeta o prueba con otra." + (j.mp_status ? " (código " + j.mp_status + ")" : "");
}

/* ---------- Pantalla de pago dentro de la app: Tarjeta, Pix o Boleto ---------- */
var pagandoPlan = 0; // plan que se está pagando; mientras sea > 0 el cuadro no se redibuja (si no, se borraría lo escrito)
var mpSdk = null, formTarjeta = null, pollPago = null, relojPago = null;

function salirDePago() {
  pagandoPlan = 0;
  try { if (formTarjeta) formTarjeta.unmount(); } catch (e) { /* ya desmontado */ }
  formTarjeta = null;
  if (pollPago) { clearInterval(pollPago); pollPago = null; }
  if (relojPago) { clearInterval(relojPago); relojPago = null; }
}

// Pix y Boleto: pago de un mes (no se renueva solo). El servidor crea el cobro y devuelve el código.
async function pedirPagoUnico(tipo, metodo, cpf) {
  var s = await sb.auth.getSession();
  var token = s.data.session && s.data.session.access_token;
  var r = await fetch(SUPABASE_URL + "/functions/v1/mp-crear-pago", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + token },
    body: JSON.stringify({ plan: tipo, metodo: metodo, cpf: cpf })
  });
  var j = await r.json().catch(function () { return {}; });
  return { ok: r.ok && j.ok === true, j: j };
}

function copiarTexto(texto, boton) {
  var original = boton.textContent;
  var listo = function () { boton.textContent = "¡Copiado!"; boton.classList.add("copiado"); setTimeout(function () { boton.textContent = original; boton.classList.remove("copiado"); }, 1800); };
  var sinCopiar = function () {
    // Respaldo: se selecciona el código para copiarlo a mano
    var campo = $("px-codigo"); if (campo) { campo.focus(); campo.select(); }
    boton.textContent = "Copia a mano ↑"; setTimeout(function () { boton.textContent = original; }, 3000);
    var av = $("msg-pago-codigo"); if (av) av.textContent = "No pudimos copiar automáticamente. El código quedó seleccionado: mantén pulsado y elige Copiar.";
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(listo, sinCopiar);
  else { var tmp = document.createElement("textarea"); tmp.value = texto; document.body.appendChild(tmp); tmp.select(); try { document.execCommand("copy") ? listo() : sinCopiar(); } catch (e) { sinCopiar(); } tmp.remove(); }
}

var ICONOS_PAGO = {
  tarjeta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/></svg>',
  pix: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l4 4-4 4-4-4zM12 13l4 4-4 4-4-4zM3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4"/></svg>',
  boleto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5v14M7.5 5v14M11 5v14M14 5v14M17.5 5v14M20 5v14"/></svg>'
};

function mostrarPago(tipo) {
  var cont = $("cartel");
  if (!window.MercadoPago) { // el script de Mercado Pago no cargó (sin internet o bloqueado)
    var av = $("msg-pago"); if (av) av.textContent = "No pudimos cargar el pago seguro. Revisa tu internet e intenta de nuevo.";
    return;
  }
  salirDePago();
  pagandoPlan = tipo; ultimoTipoPedido = tipo;
  if (window.rnmTrack) rnmTrack("InitiateCheckout", { value: PRECIOS[tipo] / 100, currency: "BRL", content_name: tipo });
  cont.textContent = "";
  var precio = reales(PRECIOS[tipo]);
  var c = el("div", "pay");
  c.innerHTML =
    '<div class="pay-top"><button type="button" class="sec" id="btn-volver-planes"><svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M19 12H5M11 6l-6 6 6 6\"/></svg> Cambiar plan</button><span class="pay-paso">Paso 2 de 2</span></div>' +
    '<h2 class="pay-titulo">Finaliza tu suscripción</h2>' +
    '<div class="pay-resumen"><div><b>' + nombrePlan(tipo) + '</b><span>' + (tipo === "manual" ? "Hasta 4 RNM · revisión semanal + Verificar ahora" : (tipo === "quincenal" ? "Hasta 4 RNM · revisión automática cada 15 días" : "Hasta 4 RNM · revisión automática cada 7 días")) + '</span></div>' +
      '<div class="pay-precio"><b>' + precio + '</b><span>por mes</span></div></div>' +
    '<p class="pay-sub">Elige cómo quieres pagar</p>' +
    '<div class="metodos" role="radiogroup" aria-label="Forma de pago">' +
      '<button type="button" class="metodo sel" data-m="pix" role="radio" aria-checked="true">' + ICONOS_PAGO.pix + '<b>Pix</b><small>Al instante</small></button>' +
      '<button type="button" class="metodo" data-m="tarjeta" role="radio" aria-checked="false">' + ICONOS_PAGO.tarjeta + '<b>Tarjeta</b><small>Se renueva solo</small></button>' +
      '<button type="button" class="metodo" data-m="boleto" role="radio" aria-checked="false">' + ICONOS_PAGO.boleto + '<b>Boleto</b><small>1-2 días hábiles</small></button>' +
    '</div>' +
    '<form id="form-pago" class="pay-panel" novalidate>' +
      '<label>Número de tarjeta</label><div id="mp-numero" class="campo-mp"></div>' +
      '<div class="fila" style="gap:12px;align-items:flex-start">' +
        '<div style="flex:1"><label>Vencimiento</label><div id="mp-venc" class="campo-mp"></div></div>' +
        '<div style="flex:1"><label>Código (CVV)</label><div id="mp-cvv" class="campo-mp"></div></div>' +
      '</div>' +
      '<label for="mp-nombre">Nombre en la tarjeta</label>' +
      '<input type="text" id="mp-nombre" autocomplete="cc-name" maxlength="60" placeholder="Como aparece en la tarjeta">' +
      '<div class="fila" style="gap:12px;align-items:flex-start">' +
        '<div style="flex:1"><label for="mp-tipodoc">Documento</label><select id="mp-tipodoc"></select></div>' +
        '<div style="flex:2"><label for="mp-doc">Número (CPF)</label><input type="text" id="mp-doc" inputmode="numeric" maxlength="20" placeholder="Solo números"></div>' +
      '</div>' +
      '<select id="mp-emisor" class="oculto"></select><select id="mp-cuotas" class="oculto"></select>' +
      '<input type="text" id="mp-email" class="oculto">' +
      '<p class="pay-nota">Se cobra cada mes a tu tarjeta. Puedes cancelar cuando quieras.</p>' +
      '<button type="submit" id="btn-pagar-tarjeta" class="pay-boton">Pagar ' + precio + ' al mes</button>' +
    '</form>' +
    '<div id="panel-otro" class="pay-panel oculto">' +
      '<label for="px-cpf">Tu CPF</label>' +
      '<input type="text" id="px-cpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" autocomplete="off">' +
      '<p class="pay-nota" id="px-nota"></p>' +
      '<button type="button" id="btn-generar" class="pay-boton"></button>' +
    '</div>' +
    '<p class="pay-seguro"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg> Pago procesado por Mercado Pago. FLUJO nunca ve los datos de tu tarjeta.</p>' +
    '<p class="msg" id="msg-pago" aria-live="polite"></p>';
  cont.appendChild(c);
  $("mp-email").value = (usuarioActual && usuarioActual.email) || "";
  if (perfilActual && perfilActual.nombre) $("mp-nombre").value = perfilActual.nombre.toUpperCase();

  $("btn-volver-planes").addEventListener("click", function () { salirDePago(); cargarRegistros(); });

  function aviso(t, bien) { var m = $("msg-pago"); if (m) { m.textContent = t || ""; m.className = "msg" + (bien ? " bien" : ""); } }
  var metodoActual = "pix";
  var NOTAS = {
    pix: "Pagas una vez y activamos 1 mes de tu plan. No se renueva solo: cuando termine el mes te avisamos para pagar de nuevo.",
    boleto: "Pagas en tu banco, app o lotérica. El plan se activa cuando el banco confirma (1-2 días hábiles). No se renueva solo."
  };
  var TEXTOS_BOTON = { pix: "Generar código Pix", boleto: "Generar boleto" };
  function elegir(m) {
    metodoActual = m; aviso("");
    c.querySelectorAll(".metodo").forEach(function (b) {
      var on = b.getAttribute("data-m") === m; b.classList.toggle("sel", on); b.setAttribute("aria-checked", on ? "true" : "false"); b.setAttribute("tabindex", on ? "0" : "-1");
    });
    $("form-pago").classList.toggle("oculto", m !== "tarjeta");
    $("panel-otro").classList.toggle("oculto", m === "tarjeta");
    if (m !== "tarjeta") { $("px-nota").textContent = NOTAS[m]; $("btn-generar").textContent = TEXTOS_BOTON[m] + " · " + precio; }
  }
  var botonesMetodo = Array.prototype.slice.call(c.querySelectorAll(".metodo"));
  elegir("pix"); // estado inicial coherente con el método marcado
  function enfocarMetodo(i) { var b = botonesMetodo[(i + botonesMetodo.length) % botonesMetodo.length]; b.focus(); elegir(b.getAttribute("data-m")); }
  botonesMetodo.forEach(function (b, i) {
    b.setAttribute("tabindex", b.classList.contains("sel") ? "0" : "-1");
    b.addEventListener("click", function () { elegir(b.getAttribute("data-m")); });
    b.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown") { ev.preventDefault(); enfocarMetodo(i + 1); }
      else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") { ev.preventDefault(); enfocarMetodo(i - 1); }
    });
  });
  $("px-cpf").addEventListener("input", function (e) {
    var d = e.target.value.replace(/\D/g, "").slice(0, 11), s = d;
    if (d.length > 9) s = d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6, 9) + "-" + d.slice(9);
    else if (d.length > 6) s = d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6);
    else if (d.length > 3) s = d.slice(0, 3) + "." + d.slice(3);
    e.target.value = s;
  });
  var conCpf = (registrosCargados || []).filter(function (g) { return g.carne_cpf; })[0];
  if (conCpf) {
    $("px-cpf").value = conCpf.carne_cpf; $("px-cpf").dispatchEvent(new Event("input"));
    $("px-cpf").insertAdjacentHTML("afterend", '<p class="sub ayuda-campo">Rellenado con el CPF de tu carné. Cámbialo si paga otra persona.</p>');
  }
  $("btn-generar").addEventListener("click", async function () {
    var cpf = $("px-cpf").value.replace(/\D/g, "");
    if (cpf.length !== 11) return aviso("Escribe tu CPF completo (11 números).");
    var b = this; b.disabled = true; aviso(metodoActual === "pix" ? "Generando tu código Pix…" : "Generando tu boleto…", true);
    var res;
    try { res = await pedirPagoUnico(tipo, metodoActual, cpf); }
    catch (e) { b.disabled = false; return aviso("No pudimos conectar con el pago. Revisa tu internet e intenta de nuevo."); }
    b.disabled = false;
    if (!res.ok) return aviso(textoErrorPago(res.j));
    aviso("");
    mostrarCodigoPago(tipo, res.j);
  });

  var btn = $("btn-pagar-tarjeta");
  try {
    mpSdk = mpSdk || new MercadoPago(MP_PUBLIC_KEY, { locale: "es-AR" });
    formTarjeta = mpSdk.cardForm({
      amount: String(PRECIOS[tipo] / 100),
      iframe: true,
      form: {
        id: "form-pago",
        cardNumber: { id: "mp-numero", placeholder: "0000 0000 0000 0000" },
        expirationDate: { id: "mp-venc", placeholder: "MM/AA" },
        securityCode: { id: "mp-cvv", placeholder: "123" },
        cardholderName: { id: "mp-nombre" },
        issuer: { id: "mp-emisor" },
        installments: { id: "mp-cuotas" },
        identificationType: { id: "mp-tipodoc" },
        identificationNumber: { id: "mp-doc" },
        cardholderEmail: { id: "mp-email" }
      },
      callbacks: {
        onFormMounted: function (error) { if (error) aviso("No pudimos cargar el formulario de pago. Intenta de nuevo."); },
        onError: function (errores) {
          var lista = (Array.isArray(errores) ? errores : [errores]).map(function (e) { return e && e.message; }).filter(Boolean);
          if (lista.length) aviso(lista[0]);
        },
        onSubmit: async function (ev) {
          ev.preventDefault();
          aviso("");
          var d = formTarjeta.getCardFormData();
          if (!d || !d.token) return aviso("Revisa los datos de la tarjeta.");
          btn.disabled = true; aviso("Procesando el pago…", true);
          var res;
          try { res = await pedirSuscripcion(tipo, d.token); }
          catch (e) { btn.disabled = false; return aviso("No pudimos conectar con el pago. Revisa tu internet e intenta de nuevo."); }
          if (!res.ok) { btn.disabled = false; return aviso(textoErrorPago(res.j)); }
          salirDePago();
          esperandoPago = Date.now();
          esperaMostrada = true;
          cargarRegistros();
        }
      }
    });
  } catch (e) {
    aviso("No pudimos cargar el formulario de pago. Intenta de nuevo.");
  }
}

// Pantalla con el código Pix (QR + copia y cola) o el boleto; espera sola la confirmación del pago.
function mostrarCodigoPago(tipo, d) {
  var cont = $("cartel");
  try { if (formTarjeta) formTarjeta.unmount(); } catch (e) { /* ya desmontado */ }
  formTarjeta = null;
  cont.textContent = "";
  var esPix = d.metodo === "pix";
  var c = el("div", "pay");
  var codigo = esPix ? d.pix.copia_y_cola : (d.boleto.codigo || "");
  var h =
    '<div class="pay-top"><button type="button" class="sec" id="btn-volver-planes"><svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M19 12H5M11 6l-6 6 6 6\"/></svg> Volver</button><span class="pay-paso">' + (esPix ? "Pago con Pix" : "Pago con boleto") + '</span></div>' +
    '<div class="pay-resumen"><div><b>' + nombrePlan(tipo) + ' · 1 mes</b><span>' + (esPix ? "Paga y se activa en segundos" : "Se activa cuando el banco confirma") + '</span></div>' +
      '<div class="pay-precio"><b>' + reales(PRECIOS[tipo]) + '</b></div></div>';
  if (esPix) {
    h += (d.pix.qr_base64 ? '<div class="pix-qr"><img alt="Código QR para pagar con Pix" src="data:image/png;base64,' + d.pix.qr_base64.replace(/[^A-Za-z0-9+/=]/g, "") + '"></div>' : "") +
      '<ol class="pay-pasos"><li>Abre la app de tu banco y entra en <b>Pix</b>.</li><li>Escanea el QR o elige <b>Pix copia y cola</b>.</li><li>Confirma el pago. Aquí se activa solo.</li></ol>';
  } else {
    h += '<ol class="pay-pasos"><li>Abre el boleto y págalo en tu app del banco, caixa o lotérica.</li><li>Puede tardar 1-2 días hábiles en confirmarse.</li><li>Cuando el banco confirme, tu plan se activa solo.</li></ol>';
  }
  if (codigo) h += '<label>' + (esPix ? "Pix copia y cola" : "Código de barras") + '</label><div class="copiar-fila"><input type="text" id="px-codigo" readonly><button type="button" id="btn-copiar">Copiar</button></div>';
  if (!esPix && d.boleto.url) h += '<a class="btn pay-boton" id="btn-abrir-boleto" target="_blank" rel="noopener">Abrir boleto</a>';
  h += '<p class="msg" id="msg-pago-codigo" aria-live="polite"></p>' +
    '<div class="pay-espera" role="status" aria-live="polite"><span class="punto"></span><span id="px-estado">Pago pendiente: esperando la confirmación…</span></div>' +
    '<p class="pay-nota">Pendiente no significa pagado: tu plan se activa solo cuando Mercado Pago confirma el pago.</p>' +
    '<p class="pay-seguro"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg> Pago procesado por Mercado Pago. Este pago cubre 1 mes; te avisaremos cuando toque renovar.</p>';
  c.innerHTML = h;
  cont.appendChild(c);
  if (codigo) $("px-codigo").value = codigo;
  if (codigo) $("btn-copiar").addEventListener("click", function () { copiarTexto(codigo, this); });
  var ab = $("btn-abrir-boleto");
  if (ab && /^https:\/\//.test(d.boleto.url)) ab.href = d.boleto.url; else if (ab) ab.remove();
  $("btn-volver-planes").addEventListener("click", function () { salirDePago(); cargarRegistros(); });

  var previo = planCargado ? planCargado.vence_at : null;
  if (pollPago) clearInterval(pollPago);
  pollPago = setInterval(async function () {
    var r = await sb.from("rnm_planes").select("vence_at").maybeSingle();
    if (r.data && r.data.vence_at !== previo && new Date(r.data.vence_at) > new Date()) {
      salirDePago();
      cargarRegistros(); // muestra "Tu plan está activo"
    }
  }, 5000);

  if (esPix && d.vence) {
    var fin = new Date(d.vence).getTime();
    var estado = $("px-estado");
    var pintar = function () {
      var s = Math.max(0, Math.round((fin - Date.now()) / 1000));
      if (!s) { estado.textContent = "El código venció. Vuelve atrás y genera uno nuevo."; var esp = document.querySelector(".pay-espera"); if (esp) esp.classList.add("vencido"); if (relojPago) { clearInterval(relojPago); relojPago = null; } return; }
      estado.textContent = "Pago pendiente · el código vence en " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    };
    pintar();
    relojPago = setInterval(pintar, 1000);
  }
}

// Aviso insistente: la primera consulta ya se hizo y sin plan el estado no se actualiza.
function avisoPlan(regs) {
  var sinPlan = regs.filter(function (x) { return !x.cerrado && !x.cubierto && (!!x.ultimo_resultado || x.requiere_pago); });
  if (!sinPlan.length) return null;
  var d = el("div", "aviso-plan");
  d.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5M12 16.5v.01"/><circle cx="12" cy="12" r="9"/></svg>';
  var cuerpo = el("div", "");
  var p = el("p", "", "");
  p.innerHTML = "<b>Tu RNM no se actualizará.</b> Lo que ves es de la última consulta. Sin un plan activo el estado <b>no se vuelve a actualizar</b>: activa uno desde <b>R$ 4,99 al mes</b> y lo revisamos por ti.";
  cuerpo.appendChild(p);
  var b = el("button", "", "Ver planes desde R$ 4,99"); b.type = "button";
  b.addEventListener("click", function () { navegarA("planes"); });
  cuerpo.appendChild(b);
  d.appendChild(cuerpo);
  return d;
}

// Aviso fijo: todos los planes se revisan una vez por semana.
function notaSemanal() {
  var n = el("div", "nota-semanal");
  n.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
  var t = el("p", "", "");
  t.innerHTML = "<b>Revisión automática.</b> Con el plan quincenal revisamos cada RNM cada 15 días; con el semanal y el manual, cada 7 días, hasta que el documento esté listo. Con el plan manual, además, puedes pedir una verificación el día que quieras.";
  n.appendChild(t);
  return n;
}

function cartelPlanes(regs, plan) {
  if (pagandoPlan) return; // se está escribiendo la tarjeta: no tocar la pantalla
  var cont = $("cartel");
  cont.textContent = "";
  var abiertos = regs.filter(function (r) { return !r.cerrado; }).length;
  if (!regs.length || !abiertos) return; // sin RNM por vigilar no hay nada que ofrecer
  var activo = !!plan && new Date(plan.vence_at) > new Date();
  var logrado = activo && (!ultimoTipoPedido || plan.tipo === ultimoTipoPedido);
  if (esperandoPago && Date.now() - esperandoPago < 180000 && !logrado) {
    var espera = el("div", "pay pay-centro");
    espera.innerHTML = '<div class="pay-icono"><span class="punto"></span></div>';
    espera.appendChild(el("h2", "pay-titulo", "Confirmando tu pago…"));
    espera.appendChild(el("p", "sub", "Mercado Pago nos está avisando. Puede tardar un minuto; esta pantalla se actualiza sola."));
    var cerrarEspera = el("button", "sec", "Cerrar"); cerrarEspera.type = "button";
    cerrarEspera.addEventListener("click", cerrarModalPlanes);
    espera.appendChild(cerrarEspera);
    cont.appendChild(espera);
    return;
  }
  if (activo && !ampliando) {
    var ok = el("div", "pay pay-centro");
    ok.innerHTML = '<div class="pay-icono ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>';
    ok.appendChild(el("h2", "pay-titulo", nombrePlan(plan.tipo) + " activo"));
    ok.appendChild(el("p", "sub", "Cubre hasta 4 RNM (" + reales(plan.precio_centavos) + " al mes) y está pagado hasta el " + fechaCorta(plan.vence_at) + "."));
    var sup = planSuperior(plan.tipo);
    if (sup) {
      var aSup = el("button", "", "Pasar al " + PLANES[sup].etiqueta.toLowerCase() + " · " + reales(PRECIOS[sup])); aSup.type = "button";
      aSup.addEventListener("click", function () { ampliando = true; planElegido = sup; cartelPlanes(regs, plan); });
      ok.appendChild(aSup);
    }
    var cerrarOk = el("button", sup ? "sec" : "", "Entendido"); cerrarOk.type = "button";
    cerrarOk.addEventListener("click", cerrarModalPlanes);
    ok.appendChild(cerrarOk);
    cont.appendChild(ok);
    return;
  }
  if (!PLANES[planElegido]) planElegido = "semanal";
  if (activo && ampliando && !(ORDEN_PLAN[planElegido] > ORDEN_PLAN[plan.tipo])) planElegido = planSuperior(plan.tipo) || plan.tipo;
  var c = el("div", "pay");
  c.appendChild(el("span", "pay-paso", "Paso 1 de 2"));
  var primeraHecha = regs.some(function (r) { return !r.cerrado && !r.cubierto && !!r.ultimo_resultado; });
  c.appendChild(el("h2", "pay-titulo", activo ? "Pasa a un plan superior" : (primeraHecha ? "Activa un plan para seguir tus RNM" : "Elige tu plan")));
  c.appendChild(el("p", "sub", activo
    ? "Pagas el nuevo plan completo y reemplaza al actual durante 1 mes desde hoy."
    : "Cada RNM ya tuvo su primera verificación gratis. Con un plan, lo seguimos por ti."));
  var grid = el("div", "planes-op");
  ["quincenal", "semanal", "manual"].forEach(function (tipo) {
    var esActual = activo && plan.tipo === tipo;
    var inferior = activo && ORDEN_PLAN[tipo] < ORDEN_PLAN[plan.tipo];
    grid.appendChild(tarjetaPlan(tipo, { sel: tipo === planElegido && !esActual && !inferior, actual: esActual, off: esActual || inferior,
      onClick: function () { planElegido = tipo; cartelPlanes(regs, plan); } }));
  });
  c.appendChild(grid);
  if (activo) {
    var nota = el("p", "nota-ampliar");
    nota.innerHTML = "<b>Cómo funciona el cambio:</b> pagas el plan nuevo completo (" + reales(PRECIOS[planElegido]) + ") y reemplaza a tu plan actual. Dura 1 mes desde hoy; los días que te quedaban del plan anterior no se suman.";
    c.appendChild(nota);
  }
  var acc = el("div", "acciones");
  var pagar = el("button", "", (activo ? "Pasar a " : "Continuar · ") + PLANES[planElegido].etiqueta.toLowerCase() + " · " + reales(PRECIOS[planElegido]) + "/mes");
  pagar.type = "button";
  pagar.addEventListener("click", function () { mostrarPago(planElegido); });
  acc.appendChild(pagar);
  var ahoraNo = el("button", "sec", "Ahora no"); ahoraNo.type = "button";
  ahoraNo.addEventListener("click", cerrarModalPlanes);
  acc.appendChild(ahoraNo);
  c.appendChild(acc);
  var avisoPago = el("p", "msg", "");
  avisoPago.id = "msg-pago";
  c.appendChild(avisoPago);
  cont.appendChild(c);
}

/* ---------- Ventana emergente de planes ---------- */
// Se abre sola cuando un RNM ya tuvo su primera consulta (o es un RNM adicional) y la cuenta no tiene plan que lo cubra.
// Se muestra una sola vez por RNM; después queda el botón "Ver planes".
var planesVistos = (function () { try { return JSON.parse(localStorage.getItem("rnm_planes_vistos") || "[]"); } catch (e) { return []; } })();
var esperaMostrada = false;
function hoyClave() { return new Date().toISOString().slice(0, 10); }
function marcarVistos(ids) {
  ids.forEach(function (id) { var k = id + "|" + hoyClave(); if (planesVistos.indexOf(k) < 0) planesVistos.push(k); });
  try { localStorage.setItem("rnm_planes_vistos", JSON.stringify(planesVistos.slice(-50))); } catch (e) { /* sin almacenamiento */ }
}
var focoAntesModal = null;
function abrirModalPlanes() {
  if ($("modal-planes").classList.contains("oculto")) focoAntesModal = document.activeElement;
  $("modal-planes").classList.remove("oculto");
  document.body.style.overflow = "hidden";
  $("modal-planes").querySelector(".modal-caja").focus();
}
function cerrarModalPlanes() {
  ampliando = false;
  if (pagandoPlan) { salirDePago(); cargarRegistros(); }
  var estabaAbierto = !$("modal-planes").classList.contains("oculto");
  $("modal-planes").classList.add("oculto");
  document.body.style.overflow = "";
  if (estabaAbierto && focoAntesModal && document.contains(focoAntesModal)) { try { focoAntesModal.focus(); } catch (e) { /* sin foco */ } }
  if (estabaAbierto) { focoAntesModal = null; setTimeout(function () { revisarOpinionPendiente("registro"); }, 1200); }
}
$("modal-cerrar").addEventListener("click", cerrarModalPlanes);
$("modal-planes").addEventListener("click", function (e) { if (e.target === this && !pagandoPlan) cerrarModalPlanes(); });
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && !pagandoPlan) cerrarModalPlanes();
  if (e.key !== "Tab") return;
  var abierto = document.querySelector(".modal:not(.oculto) .modal-caja");
  if (!abierto) return;
  var f = Array.prototype.slice.call(abierto.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not(.oculto), select:not([disabled]):not(.oculto), [tabindex]:not([tabindex="-1"])')).filter(function (n) { return n.offsetParent !== null; });
  if (!f.length) return;
  var primero = f[0], ultimo = f[f.length - 1];
  if (e.shiftKey && (document.activeElement === primero || document.activeElement === abierto)) { e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
});

function actualizarPlanes(regs, plan) {
  var necesitan = regs.filter(function (x) { return !x.cerrado && !x.cubierto && (!!x.ultimo_resultado || x.requiere_pago); });
  var espera = !!esperandoPago && Date.now() - esperandoPago < 180000;
  var nuevos = necesitan.filter(function (x) { return planesVistos.indexOf(x.id + "|" + hoyClave()) < 0; });
  var cerrada = $("modal-planes").classList.contains("oculto");
  if (espera && !esperaMostrada) { esperaMostrada = true; abrirModalPlanes(); return; }
  if (nuevos.length && cerrada) { marcarVistos(nuevos.map(function (x) { return x.id; })); abrirModalPlanes(); }
}

var firmaRegistros = ""; // huella de lo último que se dibujó: el refresco automático solo redibuja si cambió algo
async function cargarRegistros(soloSiCambia) {
  actualizarAvisoRegistro();
  var q = await Promise.all([
    sb.from("rnm_registros")
      .select("id, rnm, estado_pago, requiere_pago, estado_pf, unidad_pf, cambio_direccion, ultimo_resultado, ultima_consulta_at, cerrado, created_at, validez, validez_verificada_at, carne_validacion, carne_foto_path, carne_foto_verso_path, carne_cpf, ultima_manual_at, fecha_nacimiento, correcciones")
      .order("created_at", { ascending: true }),
    sb.from("rnm_planes").select("cupos, tipo, precio_centavos, vence_at, cancelado_at").maybeSingle()
  ]);
  var r = q[0];
  if (r.error || !r.data) return;
  var plan = q[1].data || null;
  var activo = !!plan && new Date(plan.vence_at) > new Date();
  var firma = JSON.stringify([r.data, plan, activo]);
  if (soloSiCambia && firma === firmaRegistros) return;
  firmaRegistros = firma;
  // Los RNM abiertos se cubren por orden de registro hasta el número de cupos del plan; uno ya listo o entregado no ocupa cupo
  // (igual que en la base de datos).
  var puesto = 0;
  r.data.forEach(function (x) {
    if (!x.cerrado) puesto++;
    x.cubierto = activo && !x.cerrado && puesto <= plan.cupos;
    x.planVence = plan ? plan.vence_at : null;
    x.tuvoPlan = !!plan;
  });
  var planAntes = planCargado;
  registrosCargados = r.data;
  planCargado = plan;
  if (activo && ultimoTipoPedido && window.rnmTrack && (!planAntes || new Date(plan.vence_at) > new Date(planAntes.vence_at))) {
    var clavePago = "rnm_purchase_" + plan.vence_at;
    if (!localStorage.getItem(clavePago)) { try { localStorage.setItem(clavePago, "1"); } catch (e) { /* sin almacenamiento */ } rnmTrack("Purchase", { value: plan.precio_centavos / 100, currency: "BRL", content_name: plan.tipo }, "compra-" + plan.vence_at); }
  }
  var lleno = r.data.length >= 4;
  $("form-rnm").classList.toggle("oculto", lleno);
  mostrarCosteAplicable();
  actualizarDashboard(r.data, plan);
  cargarMensajes();
  renderizarMisRnm(r.data, plan);
  actualizarResumenPerfil();
  cartelPlanes(r.data, plan);
  actualizarPlanes(r.data, plan);

  if (seccionActual === "planes") renderizarPlanes(r.data, plan);
  if (seccionActual === "detalle-rnm" && detalleActual) construirDetalle(detalleActual);
  consumirIrAPago();
}

/* ---------- Planes y pagos (Pantalla 13 y 16) ---------- */
// Solo muestra el estado real del plan y los precios existentes; el cobro se hace siempre en la ventana de pago (tiene sus propios controles).
function renderizarPlanes(regs, plan) {
  var cont = $("planes-contenido");
  if (!cont) return;
  cont.textContent = "";
  var activo = !!plan && new Date(plan.vence_at) > new Date();
  var abiertos = regs.filter(function (x) { return !x.cerrado; }).length;
  var tipoActual = activo ? (PLANES[plan.tipo] ? plan.tipo : "semanal") : null;

  var estado = el("div", "tarjeta plan-estado");
  estado.appendChild(el("p", "hero-eyebrow", "Tu plan actual"));
  if (activo) {
    estado.appendChild(el("h3", "", nombrePlan(tipoActual) + (plan.cancelado_at ? " · cancelado" : " activo")));
    if (plan.cancelado_at) estado.appendChild(el("p", "sub", "No se renovará ni se volverá a cobrar. Sigues con todo activo hasta el " + fechaCorta(plan.vence_at) + "; después tus RNM dejan de revisarse " + frecuenciaPlan(tipoActual) + "."));
    var filas = el("div", "review-summary-card");
    [["Precio mensual", reales(plan.precio_centavos)],
     ["Pagado hasta", fechaCorta(plan.vence_at)],
     ["RNM incluidos", "hasta 4"],
     ["Revisión automática", tipoActual === "quincenal" ? "1 vez cada 15 días" : "1 vez por semana"],
     ["Verificar ahora", tipoActual === "manual" ? "Incluido (1 por día y por RNM)" : "Solo en el plan manual"],
     ["RNM en seguimiento", String(abiertos) + " de 4"]
    ].forEach(function (par) {
      var f = el("div", "review-row");
      f.appendChild(el("span", "", par[0] + ":"));
      f.appendChild(el("b", "", par[1]));
      filas.appendChild(f);
    });
    estado.appendChild(filas);
  } else {
    estado.appendChild(el("h3", "", plan ? "Tu plan venció" : "Todavía no tienes un plan"));
    estado.appendChild(el("p", "sub", plan
      ? "La vigilancia de tus RNM se detuvo el " + fechaCorta(plan.vence_at) + ". Puedes renovarlo cuando quieras."
      : "Cada RNM tiene su primera verificación gratis (hasta 4). Para seguir vigilándolos después necesitas un plan mensual."));
  }
  var acc = el("div", "acciones");
  var ver = el("button", "btn", activo ? (planSuperior(tipoActual) ? "Pasar al " + PLANES[planSuperior(tipoActual)].etiqueta.toLowerCase() : "Ver detalles del plan") : "Elegir un plan");
  ver.type = "button";
  if (!abiertos) {
    ver.disabled = true;
    estado.appendChild(el("p", "sub", "Cuando tengas un RNM en seguimiento podrás elegir un plan."));
  }
  ver.addEventListener("click", function () { ampliando = !!(activo && planSuperior(tipoActual)); planElegido = ampliando ? planSuperior(tipoActual) : planElegido; cartelPlanes(regs, plan); abrirModalPlanes(); });
  if (!(activo && plan.cancelado_at && tipoActual === "manual")) acc.appendChild(ver);
  if (activo && !plan.cancelado_at) {
    var canc = el("button", "btn sec btn-cancelar-plan", "Cancelar plan");
    canc.type = "button";
    canc.addEventListener("click", function () { cancelarPlan(canc); });
    acc.appendChild(canc);
  }
  estado.appendChild(acc);
  cont.appendChild(estado);
  cont.appendChild(notaSemanal());

  var precios = el("div", "tarjeta");
  precios.appendChild(el("h3", "", "Elige tu plan"));
  precios.appendChild(el("p", "sub", "Los tres incluyen hasta 4 RNM y la primera verificación gratis de cada uno."));
  var grid = el("div", "planes-op");
  ["quincenal", "semanal", "manual"].forEach(function (tipo) {
    var esActual = tipoActual === tipo;
    var inferior = !!tipoActual && ORDEN_PLAN[tipo] < ORDEN_PLAN[tipoActual];
    grid.appendChild(tarjetaPlan(tipo, { sel: !esActual && !inferior && planElegido === tipo, actual: esActual, off: esActual || inferior,
      onClick: function () {
        if (!abiertos) return navegarA("nueva-consulta");
        planElegido = tipo; ampliando = !!tipoActual && ORDEN_PLAN[tipo] > ORDEN_PLAN[tipoActual];
        cartelPlanes(regs, plan); abrirModalPlanes();
      } }));
  });
  precios.appendChild(grid);
  var como = el("div", "como-pagar");
  como.innerHTML =
    '<div><b>Tarjeta</b><span>Se renueva sola cada mes. Puedes cancelar cuando quieras.</span></div>' +
    '<div><b>Pix o boleto</b><span>Pagas un mes cada vez; cuando termine, te avisamos para pagar de nuevo.</span></div>';
  precios.appendChild(como);
  precios.appendChild(el("p", "sub", "¿Dudas sobre un cobro o necesitas un comprobante? Escríbenos " + VIA_CONTACTO + "."));
  cont.appendChild(precios);
}

/* ---------- Historial de Consultas (Pantalla 12) ---------- */
// Estado normalizado que guarda la base -> [clase de la insignia, texto]
var NORMALIZADO = {
  listo: ["ok", "Listo"], entregado: ["ok", "Entregado"], proceso: ["vigila", "En proceso"], pendencia: ["", "Falta información"],
  problema: ["danger", "Requiere atención"], no_encontrado: ["", "No encontrado"], desconocido: ["", "Novedad"]
};
var COLUMNAS_CONSULTA = "id, registro_id, resultado_texto, estado_normalizado, unidad_pf, cambio_direccion, created_at";

function fechaHora(iso) {
  return new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function bloqueError(titulo, texto, reintentar) {
  var b = el("div", "empty-state");
  b.appendChild(el("h3", "", titulo));
  b.appendChild(el("p", "", texto));
  if (reintentar) {
    var bt = el("button", "btn sec", "Reintentar"); bt.type = "button";
    bt.addEventListener("click", reintentar);
    b.appendChild(bt);
  }
  return b;
}

/* ---------- Historial de Consultas (Pantalla 12) ---------- */
var cargaHistorialId = 0; // si llegan dos cargas seguidas, solo cuenta la última (evita listas duplicadas)
async function cargarHistorialConsultas() {
  var cont = $("lista-historial-consultas");
  if (!cont) return;
  var miCarga = ++cargaHistorialId;
  cont.textContent = "";

  cont.setAttribute("aria-busy", "true");
  var loading = el("div", "cargando-lista");
  loading.innerHTML = '<span class="spinner-azul" aria-hidden="true"></span> Cargando historial de consultas…';
  cont.appendChild(loading);

  var r = await sb.from("rnm_consultas").select(COLUMNAS_CONSULTA).order("created_at", { ascending: false }).limit(200);
  if (miCarga !== cargaHistorialId) return; // llegó tarde: otra carga más nueva manda
  loading.remove();
  cont.removeAttribute("aria-busy");

  if (r.error) { // un fallo de carga no se presenta como "sin consultas"
    cont.appendChild(bloqueError("No pudimos cargar tu historial", "Revisa tu conexión e inténtalo de nuevo.", cargarHistorialConsultas));
    return;
  }
  if (!r.data.length) {
    var vacio = el("div", "empty-state");
    vacio.appendChild(el("h3", "", "Aún no tienes consultas en tu historial"));
    vacio.appendChild(el("p", "", "Cuando se revise alguno de tus documentos, el resultado de cada revisión aparecerá aquí."));
    cont.appendChild(vacio);
    return;
  }

  r.data.forEach(function (c) {
    var reg = registrosCargados.find(function (x) { return x.id === c.registro_id; });
    var ie = interpretarConsulta(c.resultado_texto);
    var n = c.resultado_texto ? [ie.badge, ie.corto] : (NORMALIZADO[c.estado_normalizado] || ["", "Novedad"]);

    var card = el("div", "history-card");
    var izq = el("div", "");
    izq.appendChild(el("span", "history-rnm", reg ? "RNM " + reg.rnm : "Documento"));
    izq.appendChild(el("div", "history-date", fechaHora(c.created_at)));
    if (c.resultado_texto) izq.appendChild(el("p", "history-resumen", ie.resumen));
    if (c.unidad_pf) izq.appendChild(el("p", "sub history-unidad", "Unidad: " + etiquetaUnidad(c.unidad_pf)));
    var cambH = bloqueCambios(c.cambio_direccion); if (cambH) izq.appendChild(cambH);
    card.appendChild(izq);

    var der = el("div", "");
    der.appendChild(el("span", "insignia" + (n[0] ? " " + n[0] : ""), n[1]));
    card.appendChild(der);
    if (reg) {
      card.style.cursor = "pointer";
      card.addEventListener("click", function () { abrirDetalleRnm(reg.id); });
    }
    cont.appendChild(card);
  });
}

/* ---------- Rastreador del RNM (como el seguimiento de un paquete) ---------- */
var SVG_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6 7-12a7 7 0 10-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>';
var SVG_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function titularRastreador(e) {
  var ciudad = (/unidad de ([^,]+)/.exec(e.ubicacion || "") || [])[1];
  switch (e.corto) {
    case "Listo": return { t: "Tu RNM está en " + (ciudad || "la unidad indicada"), s: "Listo para retirar" };
    case "En traslado": return { t: "Tu RNM está en camino", s: (e.ubicacion || "").replace(/^En camino /, "") };
    case "Entregado": return { t: "Tu RNM ya fue entregado", s: "Ya está contigo" };
    case "En trámite": return { t: "Tu RNM sigue en trámite", s: ciudad ? "En la unidad de " + ciudad : "La Policía Federal lo está procesando" };
    case "Sin consultar": return { t: "Aún no consultamos tu RNM", s: "Activa un plan para consultarlo" };
    case "Consultando": return { t: "Consultando la Policía Federal", s: "El resultado aparecerá en unos minutos" };
    default: return { t: e.t, s: e.resumen };
  }
}
/* ---------- Cambio de dirección animado (mini rastreador) ---------- */
function fechaNum(f) { var m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(f || ""); return m ? Number(m[3] + m[2] + m[1]) : 0; }
function cambioReciente(lc) { return lc.slice().sort(function (a, b) { return fechaNum(b.fecha) - fechaNum(a.fecha); })[0]; }
var SVG_CASA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/></svg>';
function cambioAnimado(l) {
  var est = l.estado;
  var idx = (est === "aprobada" || est === "desaprobada") ? 2 : ((est === "en trámite" || est === "cancelada") ? 1 : 0);
  var tono = est === "aprobada" ? "ok" : (est === "desaprobada" ? "mal" : (est === "cancelada" ? "gris" : "aviso"));
  var rot = ["Solicitado", "En análisis", est === "desaprobada" ? "Rechazado" : (est === "cancelada" ? "Cancelado" : "Aprobado")];
  var box = el("div", "cambio-tr " + tono);
  box.style.setProperty("--p", "0");
  var cab = el("div", "ctr-cab");
  var ic = el("span", "ctr-icono", ""); ic.innerHTML = SVG_CASA; cab.appendChild(ic);
  var tx = el("div", "ctr-texto");
  tx.appendChild(el("b", "", "Cambio de dirección"));
  var sub = (l.destino ? "Hacia " + l.destino : "En proceso") + (l.fecha ? " · " + l.fecha : "");
  tx.appendChild(el("span", "", sub));
  cab.appendChild(tx);
  cab.appendChild(insigniaCambio(est));
  box.appendChild(cab);
  var pista = el("div", "ctr-pista");
  pista.innerHTML = '<i class="ctr-linea"><i class="ctr-relleno"></i></i>';
  var ol = el("ol", "ctr-pasos");
  rot.forEach(function (n, i) {
    var li = el("li", i < idx ? "hecho" : (i === idx ? "actual" : ""));
    var pt = el("span", "ctr-punto", "");
    if (i < idx || (i === idx && est === "aprobada")) pt.innerHTML = SVG_OK;
    else if (i === idx && est === "desaprobada") pt.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
    li.appendChild(pt); li.appendChild(el("b", "", n));
    ol.appendChild(li);
  });
  pista.appendChild(ol); box.appendChild(pista);
  requestAnimationFrame(function () { requestAnimationFrame(function () { box.style.setProperty("--p", String(idx)); box.classList.add("anim"); }); });
  return box;
}
/* Validez del carné: aviso solo si venció o vence en 90 días */
function avisoValidez(x) {
  if (!x.validez) return null;
  var dias = Math.round((new Date(x.validez + "T00:00:00") - new Date()) / 864e5);
  if (dias > 90) return null;
  var p = el("p", "rt-validez " + (dias < 0 ? "mal" : "aviso"), "");
  p.appendChild(el("b", "", dias < 0 ? "Tu carné está vencido" : "Tu carné vence pronto"));
  var f = x.validez.split("-");
  p.appendChild(document.createTextNode(dias < 0 ? " desde el " + f[2] + "/" + f[1] + "/" + f[0] : " en " + dias + (dias === 1 ? " día" : " días") + " (" + f[2] + "/" + f[1] + "/" + f[0] + ")"));
  return p;
}
function rastreador(x, opciones) {
  opciones = opciones || {};
  var e = estadoPresentacion(x), tt = titularRastreador(e);
  var idx = { "En confección": 0, "En trámite": 0, "En traslado": 1, "Listo": 2, "Entregado": 3 }[e.corto];
  var c = el("div", "rastreador " + e.tono + (e.corto === "Listo" ? " listo" : "") + (opciones.compacto ? " compacto" : ""));
  var top = el("div", "rt-top");
  top.appendChild(el("span", "rt-rnm", "RNM " + x.rnm));
  top.appendChild(el("span", "rt-fecha", x.ultima_consulta_at ? "Revisado " + new Date(x.ultima_consulta_at).toLocaleDateString("es", { day: "numeric", month: "short" }).replace(".", "") : "Sin revisión aún"));
  c.appendChild(top);
  c.appendChild(el("h2", "rt-titular", tt.t));
  var sub = el("p", "rt-sub"); sub.innerHTML = (e.tono === "ok" ? SVG_OK : (e.tono === "mal" || e.corto === "Falta algo" || e.corto === "No encontrado" ? "" : SVG_PIN)); sub.appendChild(document.createTextNode(tt.s)); c.appendChild(sub);
  var lc = x.cambio_direccion ? lineasCambio(x.cambio_direccion) : [];
  if (lc.length) c.appendChild(cambioAnimado(cambioReciente(lc)));
  var av = avisoValidez(x); if (av) c.appendChild(av);
  if (idx !== undefined && !opciones.compacto) {
    var pista = el("div", "rt-pista");
    pista.style.setProperty("--idx", "0");
    pista.innerHTML = '<div class="rt-linea"><i class="rt-relleno"></i></div><span class="rt-marcador">' + SVG_PIN + '</span>';
    var ol = el("ol", "rt-estaciones");
    ["En trámite", "En traslado", "Listo para retirar", "Entregado"].forEach(function (n, i) {
      var li = el("li", i < idx ? "hecha" : (i === idx ? "actual" : ""));
      var pt = el("span", "rt-punto"); if (i < idx) pt.innerHTML = SVG_OK;
      li.appendChild(pt); li.appendChild(el("b", "", n));
      if (i === idx) li.setAttribute("aria-current", "step");
      ol.appendChild(li);
    });
    pista.appendChild(ol);
    c.appendChild(pista);
    requestAnimationFrame(function () { requestAnimationFrame(function () { pista.style.setProperty("--idx", String(idx)); }); });
  }
  if (opciones.cta) {
    var b = el("button", "rt-cta", e.corto === "Listo" ? "Cómo retirarlo" : "Ver detalle"); b.type = "button";
    b.addEventListener("click", function (ev) { ev.stopPropagation(); abrirDetalleRnm(x.id); });
    c.appendChild(b);
    c.classList.add("clic"); c.tabIndex = 0; c.setAttribute("role", "button");
    c.addEventListener("click", function () { abrirDetalleRnm(x.id); });
    c.addEventListener("keydown", function (ev) { if (ev.key === "Enter") abrirDetalleRnm(x.id); });
  }
  return c;
}
function planLinea(regs, plan) {
  var activo = !!plan && new Date(plan.vence_at) > new Date();
  var alerta = avisoPlan(regs);
  if (alerta) return alerta;
  if (activo) { var d = el("div", "plan-linea ok", ""); d.innerHTML = SVG_OK + "<span>Seguimiento " + (plan.tipo === "quincenal" ? "quincenal" : "semanal") + " activo · hasta " + fechaCorta(plan.vence_at) + "</span>"; return d; }
  return null;
}

/* ---------- Dashboard (Pantalla 5, diseño Figma) ---------- */
function enmascarar(r) { r = r || ""; return r.length > 2 ? r.charAt(0) + "••••••" + r.charAt(r.length - 1) : r; }
function estadoCorto(x) {
  return estadoPresentacion(x).corto;
}

function actualizarDashboard(regs, plan) {
  // 1. Saludo mínimo (+ botón para agregar otro RNM)
  var saludoCont = $("dashboard-saludo");
  if (saludoCont) {
    saludoCont.textContent = "";
    var nombre = (perfilActual && perfilActual.nombre) ? perfilActual.nombre.split(" ")[0] : "";
    var cab = el("div", "saludo-fig saludo-fila-min");
    cab.appendChild(el("h2", "", nombre ? "Hola, " + nombre : "Hola"));
    if (regs.length && regs.length < 4) {
      var mas = el("button", "btn-mas", ""); mas.type = "button"; mas.setAttribute("aria-label", "Agregar otro RNM");
      mas.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Agregar</span>';
      mas.addEventListener("click", function () { navegarA("nueva-consulta"); });
      cab.appendChild(mas);
    }
    saludoCont.appendChild(cab);
  }

  // 2. Contenido principal
  var heroCont = $("dashboard-hero-container");
  if (heroCont) {
    heroCont.textContent = "";
    if (!regs.length) {
      var bien = el("div", "bienvenida-card");
      bien.innerHTML =
        '<span class="chip-gratis">Primera consulta gratis</span>' +
        '<h3>Empecemos con tu primer RNM</h3>' +
        '<p>Escribe el número de tu documento y tu fecha de nacimiento. Nosotros revisamos la Policía Federal y te explicamos dónde está y qué hacer.</p>' +
        '<button type="button" class="btn-claro" id="btn-hero-empty-registrar">+ Agregar mi primer RNM</button>';
      heroCont.appendChild(bien);
      $("btn-hero-empty-registrar").addEventListener("click", function () { navegarA("nueva-consulta"); });

      var como = el("div", "como-linea");
      como.innerHTML =
        '<div><span class="num-paso">1</span><b>Registras tu RNM</b></div><i></i>' +
        '<div><span class="num-paso">2</span><b>Consultamos</b></div><i></i>' +
        '<div><span class="num-paso">3</span><b>Ves dónde está</b></div>';
      heroCont.appendChild(como);
    } else {
      var rango = function (x) { return esListoReal(x) ? 0 : (!x.cerrado || trasladoPendiente(x) ? 1 : 2); };
      var orden = regs.slice().sort(function (a, b) { return rango(a) - rango(b); });
      var pl = planLinea(regs, plan);
      if (pl) heroCont.appendChild(pl);
      if (regs.length > 1) {
        var nL = regs.filter(esListoReal).length;
        var nC = regs.filter(function (x) { return !x.cerrado || trasladoPendiente(x); }).length;
        var nE = regs.filter(function (x) { return x.estado_pf === "entregado"; }).length;
        var partes = [];
        if (nL) partes.push(nL + (nL === 1 ? " listo para retirar" : " listos para retirar"));
        if (nC) partes.push(nC + " en proceso");
        if (nE) partes.push(nE + (nE === 1 ? " entregado" : " entregados"));
        if (partes.length) heroCont.appendChild(el("p", "resumen-rnm", partes.join(" · ")));
      }
      // Tarjeta completa para cada RNM listo (lo más importante) y para el primero en proceso; el resto, en filas compactas.
      var completos = 0, compactos = [];
      orden.forEach(function (x, i) {
        var completo = esListoReal(x) || !!trasladoPendiente(x) || (i === 0) || (!x.cerrado && completos === 0);
        if (completo && completos < 3) { heroCont.appendChild(rastreador(x, { cta: true, compacto: completos > 0 })); completos++; }
        else compactos.push(x);
      });
      if (compactos.length) {
        heroCont.appendChild(el("h3", "titulo-otros", "Otros RNM"));
        compactos.forEach(function (x) { heroCont.appendChild(tarjeta(x)); });
      }
    }
  }

  // 3. El bloque "siguiente paso" ya no se usa (el hero y la tarjeta del plan lo reemplazan)
  var sigCont = $("dashboard-siguiente-paso");
  if (sigCont) sigCont.textContent = "";
  var otrosCont = $("dashboard-otros");
  if (otrosCont) otrosCont.textContent = "";
}

/* ---------- Mis RNM (Pantalla 6) ---------- */
function renderizarMisRnm(regs, plan) {
  var cTodos = $("count-todos"), cProc = $("count-proceso"), cListos = $("count-listos");
  var listos = regs.filter(esListoReal);
  var proceso = regs.filter(function (x) { return (!x.cerrado && x.estado_pf !== "listo") || trasladoPendiente(x); });

  if (cTodos) cTodos.textContent = String(regs.length);
  if (cProc) cProc.textContent = String(proceso.length);
  if (cListos) cListos.textContent = String(listos.length);

  var cont = $("lista-mis-rnm-clon");
  if (!cont) return;
  cont.textContent = "";

  var filtrados = regs;
  if (filtroMisRnm === "proceso") filtrados = proceso;
  else if (filtroMisRnm === "listos") filtrados = listos;

  if (!filtrados.length) {
    var vacio = el("div", "empty-state");
    vacio.innerHTML =
      '<div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></div>' +
      '<h3>No hay documentos en esta sección</h3>' +
      '<p>' + (filtroMisRnm === "todos" ? "Aún no tienes registros de RNM en tu cuenta." : "No se encontraron trámites con este criterio de filtro.") + '</p>';
    cont.appendChild(vacio);
    return;
  }

  filtrados.slice().reverse().forEach(function (x) {
    cont.appendChild(tarjeta(x));
  });
}

/* ---------- Verificar ahora (plan manual): 1 vez por día y por RNM ---------- */
var verifPendiente = {}; // id del RNM -> ultima_consulta_at que tenía cuando se pidió la verificación
function diaBrasil(fecha) { return new Date(fecha).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }
function bloqueVerificarAhora(x) {
  if (x.cerrado) return null;
  var plan = planCargado, activo = !!plan && new Date(plan.vence_at) > new Date();
  var caja = el("div", "tarjeta verif-ahora");
  var cab = el("div", "verif-cab");
  var ic = el("span", "verif-ico", ""); ic.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 11-2.3-5.7"/><path d="M20 4v5h-5"/></svg>';
  cab.appendChild(ic);
  var tx = el("div", "verif-texto"); tx.appendChild(el("b", "", "Verificar ahora"));
  var sub = el("span", "", ""); tx.appendChild(sub); cab.appendChild(tx); caja.appendChild(cab);
  var boton = el("button", "verif-btn", ""); boton.type = "button";
  if (activo && plan.tipo === "manual") {
    var yaHoy = !!x.ultima_manual_at && diaBrasil(x.ultima_manual_at) === diaBrasil(new Date());
    var enCurso = verifPendiente[x.id] !== undefined && (x.ultima_consulta_at || "") === verifPendiente[x.id];
    if (!enCurso && verifPendiente[x.id] !== undefined) delete verifPendiente[x.id];
    if (enCurso) { sub.textContent = "Verificando con la Policía Federal… tarda unos minutos. Puedes cerrar esta pantalla."; boton.textContent = "Verificando…"; boton.disabled = true; }
    else if (yaHoy) { sub.textContent = "Ya verificaste este RNM hoy. Mañana podrás hacerlo otra vez."; boton.textContent = "Ya verificado hoy"; boton.disabled = true; }
    else { sub.textContent = "Pide una verificación ahora mismo. Puedes hacerla 1 vez por día y por RNM."; boton.textContent = "Verificar ahora"; }
    boton.addEventListener("click", function () { verificarAhora(x, boton, sub); });
  } else {
    sub.textContent = "Con el plan manual (" + reales(PRECIOS.manual) + "/mes) verificas este RNM el día que quieras.";
    boton.textContent = "Ver plan manual"; boton.className = "verif-btn sec";
    boton.addEventListener("click", function () { planElegido = "manual"; ampliando = activo; cartelPlanes(registrosCargados, planCargado); abrirModalPlanes(); });
  }
  caja.appendChild(boton);
  return caja;
}
async function verificarAhora(x, boton, sub) {
  boton.disabled = true; sub.textContent = "Enviando tu pedido…";
  var r = await sb.rpc("rnm_verificar_ahora", { p_registro: x.id });
  if (r.error) {
    var m = r.error.message || "";
    if (m.indexOf("ya_verificado_hoy") >= 0) { sub.textContent = "Ya verificaste este RNM hoy. Mañana podrás hacerlo otra vez."; boton.textContent = "Ya verificado hoy"; return; }
    boton.disabled = false;
    sub.textContent = m.indexOf("plan_manual_requerido") >= 0 ? "Esta función es del plan manual."
      : (m.indexOf("rnm_cerrado") >= 0 ? "Este RNM ya está terminado." : "No pudimos pedir la verificación. Intenta de nuevo.");
    return;
  }
  var antes = x.ultima_consulta_at || "";
  verifPendiente[x.id] = antes;
  boton.textContent = "Verificando…";
  sub.textContent = "Verificando con la Policía Federal… tarda unos minutos. Puedes cerrar esta pantalla.";
  if (window.toast) toast("Verificación pedida. Te mostramos el resultado aquí.", "ok");
  for (var i = 0; i < 24; i++) {
    await new Promise(function (ok) { setTimeout(ok, 10000); });
    await cargarRegistros();
    var n = registrosCargados.find(function (g) { return g.id === x.id; });
    if (n && (n.ultima_consulta_at || "") !== antes) { delete verifPendiente[x.id]; if (window.toast) toast("Verificación lista", "ok"); cargarRegistros(); return; }
  }
}

/* ---------- Detalle de RNM e Historial (Pantallas 7 y 8) ---------- */
function abrirDetalleRnm(id) {
  construirDetalle(id);
  navegarA("detalle-rnm");
}

// Revisiones reales de un RNM (cada vez que el equipo guarda un resultado queda una fila)
async function cargarConsultasDe(id, box) {
  box.appendChild(el("p", "sub", "Cargando revisiones…"));
  var r = await sb.from("rnm_consultas").select(COLUMNAS_CONSULTA).eq("registro_id", id).order("created_at", { ascending: false }).limit(50);
  box.textContent = "";
  if (r.error) { box.appendChild(el("p", "sub", "No pudimos cargar las revisiones anteriores. Pulsa Actualizar para reintentar.")); return; }
  r.data.forEach(function (c) {
    var ie = interpretarConsulta(c.resultado_texto);
    var n = c.resultado_texto ? [ie.badge, ie.corto] : (NORMALIZADO[c.estado_normalizado] || ["", "Novedad"]);
    var item = el("div", "timeline-item");
    item.appendChild(el("div", "timeline-dot" + (n[0] === "ok" ? " ok" : "")));
    var cc = el("div", "timeline-content");
    cc.appendChild(el("div", "timeline-date", fechaHora(c.created_at)));
    cc.appendChild(el("h4", "timeline-title", "Revisión: " + n[1]));
    if (c.resultado_texto) cc.appendChild(el("p", "timeline-desc", ie.resumen));
    if (c.unidad_pf) cc.appendChild(el("p", "timeline-desc", "Unidad: " + etiquetaUnidad(c.unidad_pf)));
    var cambT = bloqueCambios(c.cambio_direccion); if (cambT) cc.appendChild(cambT);
    item.appendChild(cc);
    box.appendChild(item);
  });
}

function dondeRetirarCompacto(x) {
  var uf = ufDeUnidad(x.unidad_pf), ciudadU = ciudadDeUnidad(x.unidad_pf);
  var miCiudad = perfilActual && perfilActual.ciudad, miUF = perfilActual && perfilActual.estado;
  var lugar = ciudadU ? ciudadU + (uf ? "/" + uf : "") : (uf ? ESTADOS_BR[uf] : x.unidad_pf);
  var otra, misma = false, sabe = !!((ciudadU && miCiudad) || (uf && miUF));
  if (ciudadU && miCiudad) { misma = normalizar(ciudadU) === normalizar(miCiudad); otra = !misma; } else { otra = !!(uf && miUF && uf !== miUF); }
  var c = el("div", "donde-retirar " + (otra ? "otra" : (sabe ? "misma" : "")));
  c.innerHTML = '<span class="dr-ico">' + SVG_PIN + '</span>';
  var t = el("div", ""); t.appendChild(el("b", "", "Retira en " + lugar));
  t.appendChild(el("span", "", misma ? "Es tu ciudad" : (otra ? "No es tu ciudad" + (miCiudad ? " (" + miCiudad + ")" : "") : "Confirma que te queda cerca")));
  c.appendChild(t);
  if (otra || !sabe || x.cambio_direccion) {
    var msj = "Hola, mi RNM " + x.rnm + " está listo en " + x.unidad_pf + (ciudadU ? " (" + ciudadU + ")" : "") + " y quiero cambiar la dirección de entrega.";
    if (WHATSAPP) { var a = enlaceWhatsapp(x, msj); a.className = "dr-btn"; a.textContent = "Pedir cambio de dirección"; c.appendChild(a); }
    else { var m = el("a", "dr-btn", "Pedir cambio de dirección"); m.href = "mailto:" + CONTACTO_EMAIL + "?subject=" + encodeURIComponent("Cambio de dirección RNM " + x.rnm) + "&body=" + encodeURIComponent(msj); c.appendChild(m); }
  }
  return c;
}

function construirHistorialDetalle(x) {
  var tl = el("div", "timeline");
  if (x.cambio_direccion) {
    lineasCambio(x.cambio_direccion).forEach(function (l) {
      var item = el("div", "timeline-item");
      item.appendChild(el("div", "timeline-dot" + (l.estado === "aprobada" ? " ok" : (l.estado === "desaprobada" ? " mal" : ""))));
      var tCont = el("div", "timeline-content");
      if (l.fecha) tCont.appendChild(el("div", "timeline-date", l.fecha));
      var tt = el("h4", "timeline-title", "Cambio de dirección "); tt.appendChild(insigniaCambio(l.estado)); tCont.appendChild(tt);
      if (l.destino) tCont.appendChild(el("p", "timeline-desc", "Hacia " + l.destino));
      item.appendChild(tCont); tl.appendChild(item);
    });
  }
  var consultasBox = el("div", ""); tl.appendChild(consultasBox); cargarConsultasDe(x.id, consultasBox);
  if (x.created_at) {
    var itemAlta = el("div", "timeline-item"); itemAlta.appendChild(el("div", "timeline-dot"));
    var aCont = el("div", "timeline-content");
    aCont.appendChild(el("div", "timeline-date", new Date(x.created_at).toLocaleDateString("es")));
    aCont.appendChild(el("h4", "timeline-title", "RNM registrado"));
    itemAlta.appendChild(aCont); tl.appendChild(itemAlta);
  }
  return tl;
}

/* ---------- Atención al cliente: preguntas frecuentes → asistente virtual → persona ---------- */
var mensajesSinLeer = 0, pollChat = null, modoSoporte = "bot", pendientesChat = [], esperandoBot = false, localesChat = [], faqAbiertas = false;
var FAQ_RAPIDAS = [
  ["¿Cada cuánto se revisa mi RNM?", "Una vez por semana (cada 7 días) mientras tengas un plan activo. La primera verificación de cada RNM es gratis. La revisión no es en tiempo real: si el estado cambia entre una y otra, lo verás en la siguiente. La app se actualiza sola, no tienes que hacer nada."],
  ["Mi RNM dice «No encontrado»", "Casi siempre es que el RNM o la fecha están mal escritos. Abre ese RNM y toca «Corregir RNM o fecha» (hasta 3 veces, sin costo): se vuelve a consultar al instante. Recuerda que el RNM suele llevar letras, por ejemplo A123456B."],
  ["¿Cuánto cuesta y cómo pago?", "Hay dos planes: Semanal R$ 9,99 al mes (revisión cada 7 días) y Manual R$ 19,99 al mes (lo mismo, más el botón «Verificar ahora»). Cubren hasta 4 RNM. Entra en Planes, elige uno y paga con Pix, boleto o tarjeta."],
  ["¿Cómo cancelo mi plan?", "En Perfil toca «Cancelar plan» (o entra en Planes). No se vuelve a cobrar y tu plan sigue activo hasta la fecha ya pagada."],
  ["Mi documento está listo en otra ciudad", "En el detalle del RNM ves en qué unidad de la Policía Federal está. El cambio de unidad lo decide la Policía Federal; si necesitas orientación, escríbenos por aquí."]
];
function pintarAvisoMensajes() {
  var b = $("chat-badge"); if (b) { b.textContent = String(mensajesSinLeer); b.classList.toggle("oculto", !mensajesSinLeer); }
  var nav = document.querySelector('.bottom-nav-item[data-seccion="perfil"]'); if (nav) nav.classList.toggle("con-aviso", mensajesSinLeer > 0);
  var sp = $("btn-soporte"); if (sp) sp.classList.toggle("con-aviso", mensajesSinLeer > 0);
  var a = $("aviso-mensaje");
  if (a) {
    a.classList.toggle("oculto", !mensajesSinLeer);
    a.textContent = mensajesSinLeer ? (mensajesSinLeer === 1 ? "Tienes 1 mensaje del equipo. Tócalo para leerlo." : "Tienes " + mensajesSinLeer + " mensajes del equipo. Tócalos para leerlos.") : "";
  }
}
async function cargarMensajes() {
  if (!usuarioActual) return;
  var r = await sb.from("rnm_mensajes").select("id", { count: "exact", head: true }).eq("de", "equipo").is("leido_at", null);
  if (r.error) return;
  mensajesSinLeer = r.count || 0; pintarAvisoMensajes();
}
function burbujaChat(lista, clase, etiqueta, texto, hora) {
  var b = el("div", "chat-burbuja " + clase);
  b.appendChild(el("p", "", texto)); b.appendChild(el("small", "", (etiqueta ? etiqueta + " · " : "") + (hora ? fechaHora(hora) : "")));
  lista.appendChild(b); return b;
}
function pintarOpcionesChat(hayConversacion) {
  var box = $("chat-opciones"); if (!box) return;
  box.textContent = "";
  var modo = $("chat-modo");
  if (modoSoporte === "humano") {
    if (modo) modo.textContent = "Te atiende una persona del equipo · te responde aquí mismo";
    return;
  }
  if (modo) modo.textContent = "Asistente virtual · responde al instante";
  if (hayConversacion) {
    var t = el("button", "chip-faq", faqAbiertas ? "Ocultar preguntas frecuentes ▴" : "Preguntas frecuentes ▾"); t.type = "button";
    t.addEventListener("click", function () { faqAbiertas = !faqAbiertas; pintarOpcionesChat(true); });
    box.appendChild(t);
  }
  if (!hayConversacion || faqAbiertas) {
    FAQ_RAPIDAS.forEach(function (f) {
      var c = el("button", "chip-faq", f[0]); c.type = "button";
      c.addEventListener("click", function () {
        faqAbiertas = false;
        localesChat.push({ ts: Date.now(), clase: "yo", etiqueta: "", texto: f[0] });
        localesChat.push({ ts: Date.now() + 1, clase: "bot", etiqueta: "Asistente", texto: f[1] });
        pintarChat();
      });
      box.appendChild(c);
    });
  }
  var h = el("button", "chip-faq humano", "🙋 Hablar con una persona"); h.type = "button";
  h.addEventListener("click", pedirPersona);
  box.appendChild(h);
}
async function pintarChat() {
  var lista = $("chat-lista"); if (!lista) return;
  var q = await Promise.all([
    sb.from("rnm_mensajes").select("de, cuerpo, creado_at").order("creado_at", { ascending: true }).limit(100),
    sb.from("rnm_soporte").select("modo, actualizado_at").maybeSingle()
  ]);
  if (q[0].error) return;
  var s = q[1] && q[1].data;
  modoSoporte = (s && s.modo === "humano" && Date.now() - new Date(s.actualizado_at).getTime() < 12 * 3600 * 1000) ? "humano" : "bot";
  var abajo = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;
  lista.textContent = "";
  if (modoSoporte === "bot") burbujaChat(lista, "bot", "Asistente", "¡Hola! Soy el asistente de «¿Dónde está mi RNM?». Elige una pregunta frecuente o escríbeme la tuya. Si no puedo ayudarte, te paso con una persona del equipo.", null);
  else burbujaChat(lista, "bot", "", "Una persona del equipo te va a responder aquí mismo. Mientras tanto, puedes escribir tu problema con todos los detalles.", null);
  var todos = q[0].data.filter(function (m) { return String(m.cuerpo).indexOf("🙋") !== 0; }).map(function (m) {
    return { ts: new Date(m.creado_at).getTime(), clase: m.de === "equipo" ? "equipo" : (m.de === "bot" ? "bot" : "yo"), etiqueta: m.de === "equipo" ? "Equipo" : (m.de === "bot" ? "Asistente" : ""), texto: m.cuerpo, hora: m.creado_at };
  });
  if (modoSoporte === "bot") todos = todos.concat(localesChat);
  todos = todos.concat(pendientesChat).sort(function (a, b) { return a.ts - b.ts; });
  todos.forEach(function (m) { var b = burbujaChat(lista, m.clase, m.etiqueta, m.texto, m.hora); if (m.escribiendo) b.classList.add("escribiendo"); });
  pintarOpcionesChat(localesChat.length > 0 || pendientesChat.length > 0 || q[0].data.some(function (m) { return m.de === "bot" || (m.de === "cliente" && String(m.cuerpo).indexOf("🙋") !== 0); }));
  if (abajo || !lista.dataset.visto) { lista.scrollTop = lista.scrollHeight; lista.dataset.visto = "1"; }
}
async function abrirChat() {
  var m = $("modal-chat"); if (!m) return;
  msg("msg-chat", ""); $("chat-lista").dataset.visto = ""; localesChat = []; faqAbiertas = false;
  m.classList.remove("oculto"); document.body.style.overflow = "hidden";
  await pintarChat();
  await sb.rpc("rnm_mensajes_leer"); mensajesSinLeer = 0; pintarAvisoMensajes();
  if (pollChat) clearInterval(pollChat);
  pollChat = setInterval(function () { if (!document.hidden && !esperandoBot) { pintarChat(); sb.rpc("rnm_mensajes_leer"); } }, 15000);
}
function cerrarChat() {
  var m = $("modal-chat"); if (!m) return;
  m.classList.add("oculto"); document.body.style.overflow = ""; setTimeout(revisarOpinionPendiente, 900);
  if (pollChat) { clearInterval(pollChat); pollChat = null; }
}
async function pedirPersona() {
  var r = await sb.rpc("rnm_soporte_pedir_humano", { p_motivo: null });
  if (r.error) return msg("msg-chat", "No pudimos pasarte con una persona ahora. Intenta de nuevo en un momento.");
  modoSoporte = "humano"; msg("msg-chat", ""); if (window.toast) toast("Listo: una persona del equipo te responderá aquí", "ok");
  await pintarChat();
}
async function preguntarAlAsistente(texto) {
  var s = await sb.auth.getSession();
  var token = s.data.session && s.data.session.access_token;
  var r = await fetch(SUPABASE_URL + "/functions/v1/rnm-asistente", {
    method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + token },
    body: JSON.stringify({ texto: texto })
  });
  var j = await r.json().catch(function () { return {}; });
  return { ok: r.ok, status: r.status, j: j };
}
async function enviarChat() {
  var txt = $("chat-texto"), env = $("chat-enviar"); if (!txt || esperandoBot) return;
  var t = txt.value.trim(); if (!t) return;
  txt.value = ""; msg("msg-chat", ""); faqAbiertas = false;
  if (modoSoporte === "humano") {
    env.disabled = true;
    var r0 = await sb.rpc("rnm_mensaje_enviar", { p_cuerpo: t });
    env.disabled = false;
    if (r0.error) { txt.value = t; return msg("msg-chat", (r0.error.message || "").indexOf("demasiados") >= 0 ? "Enviaste muchos mensajes seguidos. Espera un rato y vuelve a intentar." : "No pudimos enviar tu mensaje. Intenta de nuevo."); }
    return pintarChat();
  }
  esperandoBot = true; env.disabled = true;
  pendientesChat = [{ ts: Date.now(), clase: "yo", etiqueta: "", texto: t }, { ts: Date.now() + 1, clase: "bot", etiqueta: "Asistente", texto: "Escribiendo…", escribiendo: true }];
  await pintarChat();
  var resp = null;
  try { resp = await preguntarAlAsistente(t); } catch (e) { resp = { ok: false, j: {} }; }
  pendientesChat = []; esperandoBot = false; env.disabled = false;
  if (!resp.ok) {
    if (resp.status === 429) msg("msg-chat", "Enviaste muchos mensajes seguidos. Espera un rato y vuelve a intentar.");
    else { txt.value = t; msg("msg-chat", "No pudimos responderte ahora. Intenta de nuevo o toca «Hablar con una persona»."); }
    return pintarChat();
  }
  await pintarChat();
}
(function () {
  var a = $("btn-chat-perfil"); if (a) a.addEventListener("click", abrirChat);
  var b = $("aviso-mensaje"); if (b) b.addEventListener("click", abrirChat);
  var sp = $("btn-soporte"); if (sp) sp.addEventListener("click", abrirChat);
  var c = $("chat-cerrar"); if (c) c.addEventListener("click", cerrarChat);
  var m = $("modal-chat"); if (m) m.addEventListener("click", function (e) { if (e.target === m) cerrarChat(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && m && !m.classList.contains("oculto")) cerrarChat(); });
  var env = $("chat-enviar"), txt = $("chat-texto");
  if (env) env.addEventListener("click", enviarChat);
  if (txt) txt.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarChat(); } });
})();

/* ---------- Opiniones y valoraciones ---------- */
var ETIQUETAS_ESTRELLAS = ["Muy mala", "Mala", "Regular", "Buena", "Excelente"];
var opinionActual = null, opinionEstrellas = 0, opinionPendienteMostrada = false;
function pintarEstrellas(n) {
  document.querySelectorAll("#op-estrellas .op-estrella").forEach(function (b, i) { b.classList.toggle("on", i < n); b.setAttribute("aria-checked", i === n - 1 ? "true" : "false"); });
  var e = $("op-etiqueta"); if (e) e.textContent = n ? ETIQUETAS_ESTRELLAS[n - 1] : "Toca las estrellas";
}
function abrirOpinion(tipo, registroId, rnmFin) {
  var m = $("modal-opinion"); if (!m) return;
  opinionActual = { tipo: tipo, registroId: registroId || null }; opinionEstrellas = 0;
  var tit = tipo === "rnm" ? "¿Qué tal te fue con el seguimiento de tu RNM" + (rnmFin ? " terminado en " + rnmFin : "") + "?" : (tipo === "atencion" ? "¿Te ayudó nuestra atención al cliente?" : (tipo === "registro" ? "¿Qué tal fue registrar tu RNM?" : "¿Cómo calificas la app?"));
  var sub = tipo === "rnm" ? "Tu opinión nos ayuda a mejorar y a que otras personas confíen." : (tipo === "atencion" ? "Cuéntanos cómo te atendimos." : (tipo === "registro" ? "Cuéntanos si fue fácil y claro. Así mejoramos la app para quien viene detrás." : "Valora tu experiencia con «¿Dónde está mi RNM?»."));
  $("op-titulo").textContent = tit; $("op-sub").textContent = sub;
  var box = $("op-estrellas");
  if (!box.children.length) {
    for (var i = 1; i <= 5; i++) (function (n) {
      var b = el("button", "op-estrella", "★"); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-label", n + (n === 1 ? " estrella" : " estrellas"));
      b.addEventListener("click", function () { opinionEstrellas = n; pintarEstrellas(n); msg("msg-opinion", ""); });
      box.appendChild(b);
    })(i);
  }
  pintarEstrellas(0);
  $("op-comentario").value = ""; $("op-publicar").checked = false; $("op-publicar-fila").classList.add("oculto"); msg("msg-opinion", "");
  $("op-formulario").classList.remove("oculto"); $("op-gracias").classList.add("oculto");
  m.classList.remove("oculto"); document.body.style.overflow = "hidden";
}
function cerrarOpinion() { var m = $("modal-opinion"); if (!m) return; m.classList.add("oculto"); document.body.style.overflow = ""; }
function posponerOpinion() {
  try { localStorage.setItem("rnm_opinion_snooze", String(Date.now() + 7 * 86400000)); } catch (e) { /* sin almacenamiento */ }
  cerrarOpinion();
}
function mostrarGraciasOpinion(estrellas) {
  $("op-formulario").classList.add("oculto"); $("op-gracias").classList.remove("oculto");
  var acc = $("op-gracias-acc"); acc.textContent = "";
  if (estrellas >= 4) {
    $("op-gracias-titulo").textContent = "¡Gracias! Nos alegra mucho 🙌";
    $("op-gracias-texto").textContent = "Si conoces a alguien que está esperando su RNM, compárteles la app: es gratis y les muestra en qué estado está.";
    var c = el("button", "btn", "Compartir por WhatsApp"); c.type = "button";
    c.addEventListener("click", function () { window.open("https://wa.me/?text=" + encodeURIComponent("Mira esta app gratis para ver en qué estado está tu RNM: " + location.origin), "_blank", "noopener"); });
    acc.appendChild(c);
  } else {
    $("op-gracias-titulo").textContent = "Gracias por contarnos";
    $("op-gracias-texto").textContent = "Vamos a revisarlo para mejorar. Si necesitas ayuda ahora mismo, escríbenos en Atención al cliente.";
    var h = el("button", "btn", "Atención al cliente"); h.type = "button";
    h.addEventListener("click", function () { cerrarOpinion(); abrirChat(); });
    acc.appendChild(h);
  }
  var ok = el("button", "btn sec", "Cerrar"); ok.type = "button"; ok.addEventListener("click", cerrarOpinion); acc.appendChild(ok);
}
async function enviarOpinion() {
  if (!opinionActual) return;
  if (!opinionEstrellas) return msg("msg-opinion", "Toca las estrellas para valorar.");
  var btn = $("op-enviar"); btn.disabled = true;
  var texto = $("op-comentario").value.trim();
  var r = await sb.rpc("rnm_opinion_enviar", { p_tipo: opinionActual.tipo, p_estrellas: opinionEstrellas, p_comentario: texto || null, p_publicar: !!texto && $("op-publicar").checked, p_registro: opinionActual.registroId });
  btn.disabled = false;
  if (r.error) {
    if ((r.error.message || "").indexOf("ya_opinaste") >= 0) { msg("msg-opinion", "Ya diste tu opinión sobre esto. ¡Gracias!"); return; }
    return msg("msg-opinion", "No pudimos guardar tu opinión. Intenta de nuevo.");
  }
  mostrarGraciasOpinion(opinionEstrellas);
}
async function revisarOpinionPendiente(soloTipo) {
  if (opinionPendienteMostrada || !usuarioActual) return;
  try { if (Number(localStorage.getItem("rnm_opinion_snooze") || 0) > Date.now()) return; } catch (e) { /* sin almacenamiento */ }
  if (document.querySelector(".modal:not(.oculto), .camara:not(.oculto)")) return; // no interrumpe un pago ni una conversación
  var r = await sb.rpc("rnm_opinion_pendiente");
  if (r.error || !r.data) return;
  if (soloTipo && r.data.tipo !== soloTipo) return;
  opinionPendienteMostrada = true;
  abrirOpinion(r.data.tipo, r.data.registro_id, r.data.rnm_fin);
}
async function cargarOpinionesPublicas() {
  var box = $("opiniones-publicas"); if (!box) return;
  var r = await sb.rpc("rnm_opiniones_publicas");
  if (r.error || !r.data) return;
  var res = r.data.resumen, lista = r.data.opiniones || [];
  if (!res && !lista.length) return;
  box.textContent = "";
  if (res) {
    var cab = el("p", "op-pub-resumen"); cab.appendChild(el("b", "op-pub-estrellas", "★ " + String(res.promedio).replace(".", ",")));
    cab.appendChild(document.createTextNode(" · " + res.total + " opiniones de clientes")); box.appendChild(cab);
  }
  lista.slice(0, 3).forEach(function (o) {
    var c = el("figure", "op-pub-caja");
    c.appendChild(el("div", "op-pub-estrellas", "★★★★★".slice(0, o.estrellas)));
    c.appendChild(el("blockquote", "", "«" + o.comentario + "»")); c.appendChild(el("figcaption", "", o.nombre));
    box.appendChild(c);
  });
  box.classList.remove("oculto");
}
(function () {
  var c = $("op-cerrar"); if (c) c.addEventListener("click", posponerOpinion);
  var d = $("op-despues"); if (d) d.addEventListener("click", posponerOpinion);
  var e = $("op-enviar"); if (e) e.addEventListener("click", enviarOpinion);
  var t = $("op-comentario"); if (t) t.addEventListener("input", function () { $("op-publicar-fila").classList.toggle("oculto", !t.value.trim()); });
  var p = $("btn-opinion-perfil"); if (p) p.addEventListener("click", function () { abrirOpinion("app"); });
  cargarOpinionesPublicas();
})();

function abrirCorregir(x) {
  var m = $("modal-corregir"), iRnm = $("cor-rnm"), iNac = $("cor-nac"), bG = $("cor-guardar"), bC = $("cor-cancelar");
  if (!m) return;
  var p = String(x.fecha_nacimiento || "").split("-");
  iRnm.value = x.rnm; iNac.value = p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "";
  msg("msg-corregir", "");
  m.classList.remove("oculto"); document.body.style.overflow = "hidden";
  setTimeout(function () { try { iRnm.focus(); } catch (e) { /* sin foco */ } }, 60);
  function cerrar() {
    m.classList.add("oculto"); document.body.style.overflow = "";
    bG.onclick = null; bC.onclick = null; iRnm.oninput = null; iNac.oninput = null; document.removeEventListener("keydown", tecla);
  }
  function tecla(e) { if (e.key === "Escape") cerrar(); }
  document.addEventListener("keydown", tecla);
  iRnm.oninput = function () { iRnm.value = iRnm.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); };
  iNac.oninput = function () {
    var d = iNac.value.replace(/[^0-9]/g, "").slice(0, 8), t = d;
    if (d.length > 4) t = d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4); else if (d.length > 2) t = d.slice(0, 2) + "/" + d.slice(2);
    iNac.value = t;
  };
  bC.onclick = cerrar;
  bG.onclick = async function () {
    var rnm = iRnm.value.toUpperCase().replace(/[^A-Z0-9]/g, ""), iso = fechaISO(iNac.value.trim());
    if (!rnm) return msg("msg-corregir", "Escribe tu número de RNM.");
    if (!/^[A-Z0-9]{6,12}$/.test(rnm)) return msg("msg-corregir", "Revisa tu RNM: deben ser entre 6 y 12 letras y números, sin espacios ni símbolos.");
    if (!iso) return msg("msg-corregir", "Esa fecha no es válida. Usa el formato dd/mm/aaaa, por ejemplo 14/03/1992.");
    if (rnm === x.rnm && iso === x.fecha_nacimiento) return msg("msg-corregir", "No cambiaste nada. Corrige el RNM o la fecha de nacimiento.");
    if (soloNumerosSinAviso(rnm)) return msg("msg-corregir", MSG_SOLO_NUMEROS);
    bG.disabled = true;
    var r = await sb.rpc("rnm_corregir_datos", { p_registro: x.id, p_rnm: rnm, p_nacimiento: iso });
    bG.disabled = false;
    if (r.error) {
      var t = r.error.message || "";
      return msg("msg-corregir",
        t.indexOf("rnm_duplicado") >= 0 ? "Ese RNM ya está registrado en otra cuenta. Si es tuyo, escríbenos " + VIA_CONTACTO + "." :
        t.indexOf("limite_correcciones") >= 0 ? "Ya corregiste tus datos 3 veces. Escríbenos " + VIA_CONTACTO + " y lo revisamos contigo." :
        t.indexOf("sin_cambios") >= 0 ? "No cambiaste nada. Corrige el RNM o la fecha de nacimiento." :
        "No pudimos guardar el cambio. Intenta de nuevo.");
    }
    cerrar();
    var idx = x.id;
    await mostrarConsultando(function () { return cargarRegistros(); });
    var nuevo = registrosCargados.find(function (r2) { return r2.id === idx; });
    if (nuevo) abrirDetalleRnm(nuevo.id); else navegarA("inicio");
  };
}

function construirDetalle(id) {
  var x = registrosCargados.find(function (r) { return r.id === id; });
  if (!x) { if (seccionActual === "detalle-rnm") navegarA("inicio"); return; }
  detalleActual = id;
  var cont = $("contenedor-detalle-rnm");
  if (!cont) return;
  cont.textContent = "";
  var e = estadoPresentacion(x);

  // 1. Lo importante: dónde está y en qué estado
  cont.appendChild(rastreador(x, {}));

  // 2. Qué hacer (máximo 3 pasos)
  var pasos = (e.pasos || []).slice(0, 3);
  if (pasos.length) {
    var cp = el("div", "tarjeta pasos-card");
    cp.appendChild(el("p", "hero-eyebrow", "Qué hacer ahora"));
    var ol = el("ol", "pasos-num"); pasos.forEach(function (p2) { ol.appendChild(el("li", "", p2)); });
    cp.appendChild(ol); cont.appendChild(cp);
  }

  if (x.estado_pf === "no_encontrado") {
    var cc = el("div", "tarjeta corregir-card");
    cc.appendChild(el("p", "hero-eyebrow", "¿Algún dato está mal?"));
    if ((x.correcciones || 0) >= 3) {
      cc.appendChild(el("p", "sub", "Ya usaste las 3 correcciones. Escríbenos " + VIA_CONTACTO + " y lo revisamos contigo."));
    } else {
      cc.appendChild(el("p", "sub", "Si te equivocaste al escribir tu RNM o tu fecha de nacimiento, corrígelos y volvemos a consultar, sin costo."));
      var bcor = el("button", "btn", "Corregir RNM o fecha"); bcor.type = "button";
      bcor.addEventListener("click", function () { abrirCorregir(x); });
      cc.appendChild(bcor);
    }
    cont.appendChild(cc);
  }
  var bvah = bloqueVerificarAhora(x); if (bvah) cont.appendChild(bvah);
  // 3. Dónde retirar (una línea) y plan (un enlace)
  if (e.traslado) { /* mientras se traslada no se indica dónde retirar */ }
  else if (x.unidad_pf && (x.estado_pf === "listo" || e.corto === "Listo")) cont.appendChild(dondeRetirarCompacto(x));
  else if (x.estado_pf === "listo" && WHATSAPP) cont.appendChild(avisoOtraCiudad(x));
  var alertaDetalle = (!x.cerrado && !x.cubierto && x.ultimo_resultado) ? avisoPlan([x]) : null;
  if (alertaDetalle) cont.appendChild(alertaDetalle);

  // 4. Todo lo demás, a un toque
  var mas = el("details", "mas-detalles");
  mas.appendChild(el("summary", "", "Más detalles"));
  var cuerpo = el("div", "md-cuerpo");
  var datos = el("div", "review-summary-card");
  var filas = [["Última revisión", x.ultima_consulta_at ? fechaHora(x.ultima_consulta_at) : "Aún sin revisión"], ["Seguimiento automático", x.cubierto ? "Activo hasta " + fechaCorta(x.planVence) : "No activo"]];
  if (x.unidad_pf) filas.push(["Unidad de la PF", etiquetaUnidad(x.unidad_pf)]);
  if (x.validez) { var vf = x.validez.split("-"); filas.push(["Validez del carné", vf[2] + "/" + vf[1] + "/" + vf[0] + (x.carne_validacion === "autentico" ? " ✓ verificada en la PF" : "")]); }
  if (x.carne_validacion === "no_valido") filas.push(["Carné", "La PF no lo reconoce: revisa tus datos o escríbenos"]);
  else if (x.carne_validacion === "no_coincide") filas.push(["Carné", "El QR no corresponde al RNM registrado: revisa tus datos o escríbenos"]);
  (e.detalles || []).forEach(function (d) { filas.push(d); });
  filas.forEach(function (d) { var f = el("div", "review-row"); f.appendChild(el("span", "", d[0] + ":")); f.appendChild(el("b", "", d[1])); datos.appendChild(f); });
  cuerpo.appendChild(datos);
  if (x.carne_foto_path || x.carne_foto_verso_path) {
    var bf = el("button", "sec btn-borrar-foto", "Borrar las fotos de mi carné"); bf.type = "button";
    bf.addEventListener("click", async function () {
      if (!window.confirm("¿Borrar las fotos de tu carné (frente y verso)? Esto no se puede deshacer.")) return;
      bf.disabled = true;
      await sb.storage.from("rnm-carnes").remove([x.carne_foto_path, x.carne_foto_verso_path].filter(Boolean));
      await sb.rpc("rnm_borrar_foto_carne", { p_registro: x.id });
      if (window.toast) toast("Fotos borradas", "ok");
      cargarRegistros();
    });
    cuerpo.appendChild(bf);
  }
  cuerpo.appendChild(el("h4", "titulo-sub", "Historial"));
  cuerpo.appendChild(construirHistorialDetalle(x));
  cuerpo.appendChild(pieOriginal(x));
  if (!x.cerrado) {
    var avisoBorrar = el("p", "msg", "");
    var borrar = el("button", "btn-quitar", "Quitar este RNM"); borrar.type = "button";
    borrar.addEventListener("click", async function () {
      var ok = await mostrarConfirmacion({ titulo: "¿Quitar RNM " + x.rnm + "?", desc: "Se eliminarán los datos de seguimiento de este documento de tu cuenta. Esta acción no se puede deshacer.", accionTexto: "Quitar documento", esPeligroso: true });
      if (!ok) return;
      var borrado = await sb.from("rnm_registros").delete().eq("id", x.id);
      if (borrado.error) { avisoBorrar.textContent = "No pudimos quitar este RNM. Intenta de nuevo."; return; }
      detalleActual = null; await cargarRegistros(); navegarA("inicio");
    });
    cuerpo.appendChild(borrar); cuerpo.appendChild(avisoBorrar);
  }
  mas.appendChild(cuerpo); cont.appendChild(mas);
}

/* El estado lo actualiza el equipo de FLUJO y la app se actualiza sola (ver «Actualización automática»): el cliente no tiene que pulsar nada. */
setInterval(function () { // mientras se confirma un cobro, revisa cada 8 segundos
  if (esperandoPago && Date.now() - esperandoPago < 180000 && usuarioActual) cargarRegistros();
}, 8000);
/* ---------- Actualización automática (sin tocar «Actualizar») ----------
   1) Tiempo real: la base avisa al instante cuando cambia uno de TUS RNM, tu plan o un mensaje del equipo.
   2) Al volver a la app (abrirla de nuevo, recuperar internet): se actualiza enseguida.
   3) Respaldo: cada 30 s mientras la pantalla está visible. */
var canalVivo = null, retrasoVivo = null, refrescando = false, ultimaActualizacion = Date.now();
function foto(regs) { var m = {}; (regs || []).forEach(function (r) { m[r.id] = [r.estado_pf, r.unidad_pf, r.cambio_direccion, r.cerrado].join("|"); }); return m; }
function aplicacionVisible() { return !!usuarioActual && !$("vista-app").classList.contains("oculto"); }
async function refrescarSilencioso() {
  if (!aplicacionVisible() || refrescando) return;
  refrescando = true;
  var antes = foto(registrosCargados);
  try { await cargarRegistros(true); cargarMensajes(); } catch (e) { /* sin conexión: se reintenta solo */ }
  refrescando = false; ultimaActualizacion = Date.now();
  // Aviso discreto si algún RNM cambió de estado mientras mirabas la pantalla.
  var despues = foto(registrosCargados), cambiados = registrosCargados.filter(function (r) { return antes[r.id] !== undefined && antes[r.id] !== despues[r.id]; });
  if (cambiados.length && window.toast) {
    var e1 = estadoPresentacion(cambiados[0]);
    toast("Novedad en tu RNM " + cambiados[0].rnm + ": " + (e1.corto || "estado actualizado"), "ok");
  }
}
function programarRefresco() { clearTimeout(retrasoVivo); retrasoVivo = setTimeout(refrescarSilencioso, 700); }
function detenerTiempoReal() {
  clearTimeout(retrasoVivo);
  if (canalVivo) { try { sb.removeChannel(canalVivo); } catch (e) { /* ya cerrado */ } canalVivo = null; }
}
function iniciarTiempoReal() {
  detenerTiempoReal();
  if (!usuarioActual || typeof sb.channel !== "function") return;
  var filtro = "user_id=eq." + usuarioActual.id;
  canalVivo = sb.channel("vivo-" + usuarioActual.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "rnm_registros", filter: filtro }, programarRefresco)
    .on("postgres_changes", { event: "*", schema: "public", table: "rnm_planes", filter: filtro }, programarRefresco)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "rnm_mensajes", filter: filtro }, function () { cargarMensajes(); })
    .subscribe(function (estado) {
      if (estado === "SUBSCRIBED") programarRefresco(); // recupera lo que pudo pasar mientras no estaba conectado
    });
}
document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && Date.now() - ultimaActualizacion > 10000) refrescarSilencioso(); });
window.addEventListener("focus", function () { if (Date.now() - ultimaActualizacion > 10000) refrescarSilencioso(); });
window.addEventListener("online", function () { refrescarSilencioso(); iniciarTiempoReal(); });
window.addEventListener("pageshow", function (e) { if (e.persisted) refrescarSilencioso(); });
setInterval(function () { if (document.visibilityState === "visible") refrescarSilencioso(); }, 30000);

function el(tag, cls, texto) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (texto) n.textContent = texto;
  return n;
}

function etapasConsulta(e) {
  var idx = { "En confección": 0, "En trámite": 0, "En traslado": 1, "Listo": 2, "Entregado": 3 }[e.corto];
  if (idx === undefined) return null; // problemas / no encontrado: sin barra de etapas
  var cont = el("ol", "etapas");
  cont.setAttribute("aria-label", "Etapa del documento");
  ["En trámite", "En traslado", "Listo", "Entregado"].forEach(function (n, i) {
    var li = el("li", i < idx ? "hecha" : (i === idx ? "actual" : "")); li.style.setProperty("--i", i);
    var pe = el("span", "punto-etapa", i < idx ? "" : String(i + 1)); if (i < idx) pe.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'; li.appendChild(pe);
    li.appendChild(el("span", "nombre-etapa", n));
    if (i === idx) li.setAttribute("aria-current", "step");
    cont.appendChild(li);
  });
  return cont;
}
function cajaResultado(x) {
  var e = estadoPresentacion(x);
  var caja = el("div", "res res-estado " + e.tono);
  caja.appendChild(el("h3", "", e.t));
  var et = etapasConsulta(e);
  if (et) caja.appendChild(et);
  if (e.ubicacion) {
    var ub = el("div", "donde-ahora");
    ub.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6 7-12a7 7 0 10-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>';
    var ubt = el("div", "");
    ubt.appendChild(el("small", "", "Dónde está tu RNM ahora"));
    ubt.appendChild(el("b", "", e.ubicacion));
    ub.appendChild(ubt);
    caja.appendChild(ub);
  }
  caja.appendChild(el("p", "resumen-estado", e.resumen));
  if (e.detalles && e.detalles.length) {
    var dl = el("div", "detalles-consulta");
    e.detalles.forEach(function (d) { var f = el("div", "detalle-fila"); f.appendChild(el("span", "", d[0])); f.appendChild(el("b", "", d[1])); dl.appendChild(f); });
    caja.appendChild(dl);
  }
  return caja;
}

// "Qué puedes hacer": pasos numerados en su propia tarjeta
function tarjetaPasos(x) {
  var e = estadoPresentacion(x);
  if (!e.pasos || !e.pasos.length) return null;
  var c = el("div", "tarjeta pasos-card");
  c.appendChild(el("p", "hero-eyebrow", "Qué puedes hacer"));
  var ol = el("ol", "pasos-num");
  e.pasos.forEach(function (p) { ol.appendChild(el("li", "", p)); });
  c.appendChild(ol);
  return c;
}

// Texto original de la PF (plegado) + aviso orientativo
function pieOriginal(x) {
  var pie = el("div", "pie-detalle");
  pie.appendChild(el("p", "aviso-orientativo", "Explicación orientativa de FLUJO. No es una decisión oficial ni una promesa de plazo."));
  if (x.ultimo_resultado) {
    var det = el("details", "texto-original");
    det.appendChild(el("summary", "", "Ver lo que dice la Policía Federal (texto original en portugués)"));
    det.appendChild(el("p", "", x.ultimo_resultado.trim()));
    pie.appendChild(det);
  }
  return pie;
}

function avisoOtraCiudad(x) {
  var aviso = el("div", "res");
  aviso.appendChild(el("h3", "", "¿La Polícia Federal que te toca está en otra ciudad?"));
  aviso.appendChild(el("p", "", "Si tu documento está en una unidad distinta a la ciudad donde vives, podemos ayudarte a cambiar la dirección de entrega."));
  var quien = (perfilActual && perfilActual.nombre) ? " Soy " + perfilActual.nombre + "." : "";
  var enlace = el("a", "btn-enlace", "Cambio de dirección por WhatsApp");
  enlace.href = "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent("Hola, mi RNM " + x.rnm + " está listo para retirar pero en otra ciudad y quiero cambiar la dirección." + quien);
  enlace.target = "_blank"; enlace.rel = "noopener";
  aviso.appendChild(enlace);
  return aviso;
}

/* ---------- Unidad de la Polícia Federal donde está el documento ---------- */
var ESTADOS_BR = { AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará",
  PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins" };

// La unidad llega como "DELEMIG/DREX/SR/PF/SC": las dos últimas letras son el estado.
function ufDeUnidad(unidad) {
  var m = /\/([A-Z]{2})\s*$/.exec(unidad || "");
  return m && ESTADOS_BR[m[1]] ? m[1] : null;
}

function enlaceWhatsapp(x, mensaje) {
  var quien = (perfilActual && perfilActual.nombre) ? " Soy " + perfilActual.nombre + "." : "";
  var enlace = el("a", "btn-enlace", "Cambio de dirección por WhatsApp");
  enlace.href = "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(mensaje + quien);
  enlace.target = "_blank"; enlace.rel = "noopener";
  return enlace;
}

// Ciudad de cada delegacia (Portaria 3997/2013-DG/DPF y actualizaciones). Las Superintendencias Regionales (SR) están en la capital.
var DELEGACIAS = { "AGA/TO": "Araguaína", "ANS/GO": "Anápolis", "AQA/SP": "Araraquara", "ARS/RJ": "Angra dos Reis", "ARU/SP": "Araçatuba", "ATM/PA": "Altamira", "BGE/RS": "Bagé", "BRA/BA": "Barreiras", "BRG/MT": "Barra do Garças", "BRU/SP": "Bauru", "CAC/PR": "Cascavel", "CAE/MT": "Cáceres", "CAS/SP": "Campinas", "CCM/SC": "Criciúma", "CGE/PB": "Campina Grande", "CHI/RS": "Chuí", "CIT/ES": "Cachoeiro de Itapemirim", "CRA/MS": "Corumbá", "CRU/PE": "Caruaru", "CSC/PR": "Cascavel", "CXA/MA": "Caxias", "CXS/RS": "Caxias do Sul", "CZO/SP": "Cruzeiro", "CZS/AC": "Cruzeiro do Sul", "DCQ/SC": "Dionísio Cerqueira", "DRS/MS": "Dourados", "DVS/MG": "Divinópolis", "EPA/AC": "Epitaciolândia", "FIG/PR": "Foz do Iguaçu", "GMI/RO": "Guajará-Mirim", "GOY/RJ": "Campos dos Goytacazes", "GRA/PR": "Guaíra", "GVS/MG": "Governador Valadares", "IJI/SC": "Itajaí", "ILS/BA": "Ilhéus", "ITZ/MA": "Imperatriz", "JFA/MG": "Juiz de Fora", "JGO/RS": "Jaguarão", "JLS/SP": "Jales", "JNE/CE": "Juazeiro do Norte", "JPN/RO": "Ji-Paraná", "JTI/GO": "Jataí", "JVE/SC": "Joinville", "JZO/BA": "Juazeiro", "LDA/PR": "Londrina", "LGE/SC": "Lages", "LIV/RS": "Santana do Livramento", "MBA/PA": "Marabá", "MCE/RJ": "Macaé", "MGA/PR": "Maringá", "MII/SP": "Marília", "MOC/MG": "Montes Claros", "MOS/RN": "Mossoró", "NIG/RJ": "Nova Iguaçu", "NRI/RJ": "Niterói", "NVI/MS": "Naviraí", "OPE/AP": "Oiapoque", "PAC/RR": "Pacaraima", "PAT/PB": "Patos", "PCA/SP": "Piracicaba", "PDE/SP": "Presidente Prudente", "PFO/RS": "Passo Fundo", "PGZ/PR": "Ponta Grossa", "PHB/PI": "Parnaíba", "PNG/PR": "Paranaguá", "PPA/MS": "Ponta Porã", "PSO/BA": "Porto Seguro", "PTS/RS": "Pelotas", "RDO/PA": "Redenção", "RGE/RS": "Rio Grande", "ROO/MT": "Rondonópolis", "RPO/SP": "Ribeirão Preto", "SAG/RS": "Santo Ângelo", "SBA/RS": "São Borja", "SCS/RS": "Santa Cruz do Sul", "SGO/PE": "Salgueiro", "SIC/MT": "Sinop", "SJE/SP": "São José do Rio Preto", "SJK/SP": "São José dos Campos", "SMA/RS": "Santa Maria", "SMT/ES": "São Mateus", "SNM/PA": "Santarém", "SOD/SP": "Sorocaba", "SSB/SP": "São Sebastião", "STS/SP": "Santos", "TBA/AM": "Tabatinga", "TLS/MS": "Três Lagoas", "UDI/MG": "Uberlândia", "UGA/RS": "Uruguaiana", "URA/MG": "Uberaba", "VAG/MG": "Varginha", "VDC/BA": "Vitória da Conquista", "VLA/RO": "Vilhena", "VRA/RJ": "Volta Redonda", "XAP/SC": "Chapecó" };
var CAPITALES = { AC: "Rio Branco", AL: "Maceió", AP: "Macapá", AM: "Manaus", BA: "Salvador", CE: "Fortaleza", DF: "Brasília",
  ES: "Vitória", GO: "Goiânia", MA: "São Luís", MT: "Cuiabá", MS: "Campo Grande", MG: "Belo Horizonte", PA: "Belém", PB: "João Pessoa",
  PR: "Curitiba", PE: "Recife", PI: "Teresina", RJ: "Rio de Janeiro", RN: "Natal", RS: "Porto Alegre", RO: "Porto Velho", RR: "Boa Vista",
  SC: "Florianópolis", SP: "São Paulo", SE: "Aracaju", TO: "Palmas" };

// "DELEMIG/DREX/SR/PF/SC" -> Florianópolis; "DPF/ITJ/SC" -> Itajaí. Si no se reconoce, devuelve null (se muestra solo el estado).
function ciudadDeUnidad(unidad) {
  var u = unidad || "";
  var d = /DPF\/([A-Z]{3})\/([A-Z]{2})\b/.exec(u);
  if (d && DELEGACIAS[d[1] + "/" + d[2]]) return DELEGACIAS[d[1] + "/" + d[2]];
  var s = /\bSR\/(?:D?PF)\/([A-Z]{2})\b/.exec(u);
  if (s && CAPITALES[s[1]]) return CAPITALES[s[1]];
  return null;
}

function normalizar(txt) {
  return (txt || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// "09/10/2026 · Ainda não foi iniciado… · → DPF/SOD/SP" -> [{ fecha, estado, destino: "Sorocaba/SP" }]
function estadoCambio(sit) {
  if (/ainda n[aã]o foi iniciado/i.test(sit)) return "aún no iniciada";
  if (/indeferid|negad|rejeitad/i.test(sit)) return "desaprobada";
  if (/cancelad/i.test(sit)) return "cancelada";
  if (/conclu[ií]d|deferid|aprovad|finalizad|atendid/i.test(sit)) return "aprobada";
  if (/an[aá]lise|andamento|agendad|aguard/i.test(sit)) return "en trámite";
  return sit || "en trámite";
}
function lineasCambio(txt) {
  return (txt || "").split(" | ").map(function (fila) {
    var p = fila.split(" · ");
    var dest = p.filter(function (x) { return x.indexOf("→ ") === 0; })[0];
    var codigo = dest ? dest.slice(2).trim() : "";
    var ciudad = codigo ? ciudadDeUnidad(codigo) : null;
    var uf = codigo ? ufDeUnidad(codigo) : null;
    var sit = p.filter(function (x, i) { return i > 0 && x.indexOf("→ ") !== 0; })[0] || "";
    return {
      fecha: p[0] || "",
      estado: estadoCambio(sit),
      codigo: codigo,
      destino: ciudad ? ciudad + (uf ? "/" + uf : "") : (uf ? ESTADOS_BR[uf] : codigo)
    };
  });
}

function filaDato(etiqueta, valor) {
  var f = el("div", "review-row");
  f.appendChild(el("span", "", etiqueta + ":"));
  f.appendChild(el("b", "", valor));
  return f;
}
function cajaUnidad(x) {
  var uf = ufDeUnidad(x.unidad_pf);
  var ciudadU = ciudadDeUnidad(x.unidad_pf);
  var miUF = perfilActual && perfilActual.estado;
  var miCiudad = perfilActual && perfilActual.ciudad;
  var otra, mismaCiudad = false;
  if (ciudadU && miCiudad) { mismaCiudad = normalizar(ciudadU) === normalizar(miCiudad); otra = !mismaCiudad; }
  else { otra = !!(uf && miUF && uf !== miUF); }
  var sabeDondeVive = !!((ciudadU && miCiudad) || (uf && miUF));
  var conocida = !!(ciudadU || uf);

  var card = el("div", "tarjeta ubicacion");
  card.appendChild(el("p", "hero-eyebrow", "Dónde retirar tu documento"));
  var datos = el("div", "review-summary-card");
  datos.appendChild(filaDato("Ciudad", ciudadU || "No identificada"));
  datos.appendChild(filaDato("Estado", uf ? ESTADOS_BR[uf] + " (" + uf + ")" : "No identificado"));
  datos.appendChild(filaDato("Unidad de la PF", x.unidad_pf || "—"));
  card.appendChild(datos);

  var av;
  if (!conocida) av = ["info", "No pudimos identificar la ciudad de esta unidad. Revisa el código de unidad indicado arriba o escríbenos."];
  else if (!sabeDondeVive) av = ["info", "Revisa que esta unidad te quede cerca. Si no, podemos orientarte sobre el cambio de dirección."];
  else if (mismaCiudad) av = ["ok", "Coincide con la ciudad donde vives (" + miCiudad + ")."];
  else if (ciudadU && miCiudad) av = ["warn", "Está en otra ciudad que la tuya (" + miCiudad + "). Puedes pedir orientación sobre el cambio de dirección de entrega."];
  else av = [otra ? "warn" : "ok", otra ? "Está en otro estado que el tuyo. Puedes pedir orientación sobre el cambio de dirección de entrega." : "Coincide con el estado donde vives."];
  card.appendChild(el("div", "aviso-ubic " + av[0], av[1]));

  var lineas = x.cambio_direccion ? lineasCambio(x.cambio_direccion) : [];
  if (lineas.length) {
    var tit = el("h4", "titulo-sub", lineas.length > 1 ? "Cambios de dirección registrados" : "Cambio de dirección registrado");
    card.appendChild(tit);
    var tl = el("div", "timeline");
    lineas.forEach(function (l) {
      var item = el("div", "timeline-item");
      item.appendChild(el("div", "timeline-dot" + (l.estado === "aprobada" ? " ok" : (l.estado === "desaprobada" ? " mal" : ""))));
      var c = el("div", "timeline-content");
      if (l.fecha) c.appendChild(el("div", "timeline-date", l.fecha));
      var th = el("h4", "timeline-title", (l.destino ? "Hacia " + l.destino : "Destino no indicado") + " ");
      th.appendChild(insigniaCambio(l.estado));
      c.appendChild(th);
      item.appendChild(c);
      tl.appendChild(item);
    });
    card.appendChild(tl);
    var haciaMiCiudad = miCiudad && lineas.some(function (l) { return l.destino && normalizar(l.destino.split("/")[0]) === normalizar(miCiudad); });
    if (haciaMiCiudad) card.appendChild(el("p", "sub", "Ya se pidió el cambio hacia tu ciudad: solo falta que la Polícia Federal lo atienda."));
  }

  if (otra || !sabeDondeVive || x.cambio_direccion) {
    var msj = "Hola, mi RNM " + x.rnm + " está listo en " + x.unidad_pf + (ciudadU ? " (" + ciudadU + ")" : "") + " y quiero cambiar la dirección de entrega.";
    if (WHATSAPP) card.appendChild(enlaceWhatsapp(x, msj));
    else {
      var correo = el("a", "btn-enlace", "Escribir a FLUJO para cambiar la dirección");
      correo.href = "mailto:" + CONTACTO_EMAIL + "?subject=" + encodeURIComponent("Cambio de dirección RNM " + x.rnm) + "&body=" + encodeURIComponent(msj);
      card.appendChild(correo);
    }
  }
  card.appendChild(el("p", "nota-legal", "FLUJO orienta; la entrega y el cambio de dirección los decide la Policía Federal."));
  return card;
}

function fechaCorta(iso) { return new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "numeric" }); }

// Etiqueta corta del estado de vigilancia de un RNM -> [texto, clase de la insignia]
function etiquetaRnm(x) {
  if (trasladoPendiente(x)) return ["En traslado", " vigila"];
  if (x.estado_pf === "entregado") return ["Entregado", " ok"];
  if (x.cerrado) return ["Listo", " ok"];
  if (x.cubierto) return ["Vigilando", " vigila"];
  if (x.ultimo_resultado) return x.tuvoPlan ? ["Sin cobertura", ""] : ["Activa un plan", ""];
  if (x.requiere_pago) return ["Pendiente de plan", ""];
  return ["Consultando", " vigila"];
}

// Fila compacta de un RNM; el detalle completo está en la pantalla de detalle.
function tarjeta(x) {
  var e = estadoPresentacion(x);
  var fila = el("div", "fila-rnm tono-" + e.tono);
  fila.tabIndex = 0;
  fila.setAttribute("role", "button");
  var icono = el("span", "fila-icono tono-" + e.tono);
  icono.innerHTML = e.tono === "ok"
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
    : (e.tono === "mal"
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5M12 16.5v.01"/><circle cx="12" cy="12" r="9"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>');
  fila.appendChild(icono);
  var izq = el("div", "fila-rnm-info");
  izq.appendChild(el("b", "", x.rnm));
  var resumen = e.t;
  if (x.unidad_pf) resumen += " · " + (ciudadDeUnidad(x.unidad_pf) || x.unidad_pf);
  if (x.ultima_consulta_at) resumen += " · revisado " + new Date(x.ultima_consulta_at).toLocaleDateString("es", { day: "2-digit", month: "2-digit" });
  izq.appendChild(el("span", "", resumen));
  fila.appendChild(izq);
  var et = etiquetaRnm(x);
  fila.appendChild(el("span", "insignia" + et[1], et[0]));
  fila.appendChild(el("span", "fila-rnm-flecha", "›"));
  var abrir = function () { abrirDetalleRnm(x.id); };
  fila.addEventListener("click", abrir);
  fila.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abrir(); } });
  return fila;
}

/* ---------- Intérprete de consultas: texto de la Policía Federal (portugués) -> información clara ---------- */
function lugarDeUnidad(codigo) {
  var c = ciudadDeUnidad(codigo), uf = ufDeUnidad(codigo);
  return c ? c + (uf ? "/" + uf : "") : (uf ? ESTADOS_BR[uf] : codigo);
}
function unidadesDeTexto(txt) {
  return (txt.match(/DELEMIG\/DREX\/SR\/(?:D?PF)\/[A-Z]{2}|DPF\/[A-Z]{3}\/[A-Z]{2}/g) || []);
}
function etiquetaUnidad(codigo) { return lugarDeUnidad(codigo) + " (" + codigo + ")"; }
var REGLAS_CONSULTA = [
  { re: /entregue|retirado em/i, tono: "ok", badge: "ok", corto: "Entregado", t: "Tu documento ya fue entregado",
    f: function () { return { resumen: "La Policía Federal indica que el carné ya fue entregado.", pasos: ["Si no lo tienes contigo, escríbenos " + VIA_CONTACTO + "."], detalles: [], ubic: "Ya está contigo (entregado)" }; } },
  { re: /transfer[eê]ncia/i, tono: "aviso", badge: "vigila", corto: "En traslado", t: "Tu documento está en traslado",
    f: function (txt) {
      var u = unidadesDeTexto(txt), det = [];
      if (u.length >= 2) { det.push(["Sale de", etiquetaUnidad(u[0])]); det.push(["Llega a", etiquetaUnidad(u[1])]); }
      var ruta = u.length >= 2 ? "Va de " + lugarDeUnidad(u[0]) + " hacia " + lugarDeUnidad(u[1]) + "." : "Se está moviendo entre unidades de la Policía Federal.";
      return { resumen: ruta + " Cuando llegue, aparecerá como listo para retirar.", pasos: ["No tienes que hacer nada por ahora.", "Si necesitas retirarlo en otra ciudad, escríbenos " + VIA_CONTACTO + "."], detalles: det,
        ubic: u.length >= 2 ? "En camino de " + lugarDeUnidad(u[0]) + " a " + lugarDeUnidad(u[1]) : "En camino entre unidades de la PF" };
    } },
  { re: /pronto para ser retirado|confeccionado/i, tono: "ok", badge: "ok", corto: "Listo", t: "¡Tu documento está listo para retirar!",
    f: function (txt) {
      var u = unidadesDeTexto(txt), det = [];
      return { resumen: "Tu documento fue confeccionado y ya puedes retirarlo" + (u.length ? " en la unidad de " + lugarDeUnidad(u[0]) : " en la unidad indicada") + ".",
        pasos: ["Llena el formulario de entrega de carteiras de la Policía Federal y agenda tu retirada en la unidad correcta.",
                "Algunas unidades no requieren agenda: si el sistema dice «no hay agenda para el servicio elegido», puedes ir directamente.",
                "Lleva tu protocolo y un documento con foto."], detalles: det,
        ubic: u.length ? "En la unidad de " + lugarDeUnidad(u[0]) + ", listo para retirar" : "En la unidad indicada por la PF, listo para retirar" };
    } },
  { re: /indeferid|negad|rejeitad|arquivad/i, tono: "mal", badge: "danger", corto: "Con problema", t: "Tu solicitud tiene un problema",
    f: function () { return { resumen: "La solicitud no fue aprobada o fue archivada.", pasos: ["Escríbenos " + VIA_CONTACTO + " para revisar tu caso."], detalles: [] }; } },
  { re: /pend[eê]ncia|exig[eê]ncia|complement|inconsist/i, tono: "aviso", badge: "", corto: "Falta algo", t: "Falta algo en tu trámite",
    f: function () { return { resumen: "La Policía Federal pide información o documentos adicionales.", pasos: ["Escríbenos " + VIA_CONTACTO + " y te ayudamos a responder a tiempo."], detalles: [] }; } },
  { re: /an[aá]lise|em andamento|processamento|aguard|confec[cç][aã]o|produ[cç][aã]o/i, tono: "aviso", badge: "vigila", corto: "En trámite", t: "Tu trámite sigue en proceso",
    f: function () { return { resumen: "Está en análisis o en fabricación.", pasos: ["No tienes que hacer nada por ahora.", "Con un plan activo lo revisamos cada 7 días."], detalles: [] }; } },
  { re: /n[aã]o (foi )?encontrad|nenhum|sin resultados/i, tono: "aviso", badge: "", corto: "No encontrado", t: "No encontramos tu trámite",
    f: function () { return { resumen: "La Policía Federal no encontró tu trámite con los datos registrados.", pasos: ["Revisa que tu RNM y tu fecha de nacimiento estén bien escritos.", "Si todo está bien, escríbenos " + VIA_CONTACTO + "."], detalles: [] }; } }
];
function insigniaCambio(estado) {
  var cls = estado === "aprobada" ? " ok" : (estado === "desaprobada" ? " danger" : (estado === "en trámite" ? " vigila" : ""));
  return el("span", "insignia insignia-cambio" + cls, estado.charAt(0).toUpperCase() + estado.slice(1));
}
function bloqueCambios(texto) {
  if (!texto) return null;
  var lineas = lineasCambio(texto);
  if (!lineas.length) return null;
  var cont = el("div", "cambios-consulta");
  lineas.forEach(function (l) {
    var p = el("p", "fila-cambio", "");
    p.appendChild(el("b", "", "Cambio de dirección"));
    p.appendChild(document.createTextNode((l.destino ? " hacia " + l.destino : "") + (l.fecha ? " · " + l.fecha : "") + " "));
    p.appendChild(insigniaCambio(l.estado));
    cont.appendChild(p);
  });
  return cont;
}
function interpretarConsulta(txt) {
  txt = txt || "";
  var regla = REGLAS_CONSULTA.find(function (x) { return x.re.test(txt); });
  if (!regla) return { tono: "aviso", badge: "", corto: "Novedad", t: "Hay una novedad en tu trámite", resumen: "La Policía Federal registró una novedad que no podemos explicar automáticamente. Mira el texto original más abajo.", pasos: ["Escríbenos " + VIA_CONTACTO + " y te la explicamos."], detalles: [], ubicacion: "", p: ["La Policía Federal registró una novedad que no podemos explicar automáticamente."], original: txt };
  var d = regla.f(txt);
  return { tono: regla.tono, badge: regla.badge, corto: regla.corto, t: regla.t, resumen: d.resumen, pasos: d.pasos, detalles: d.detalles || [], ubicacion: d.ubic || "", p: [d.resumen], original: txt };
}
// Estado que se muestra para un registro: si todavía no hay resultado, se dice tal cual (nunca "novedad").
/* Cambio de dirección aprobado hacia otra unidad: el documento sigue donde se hizo y la PF lo traslada.
   Cuando llega, la PF cambia su texto a "pronto para ser retirado na unidade [la nueva]" y deja de haber traslado pendiente. */
function trasladoPendiente(x) {
  if (!x || x.estado_pf !== "listo" || !x.unidad_pf || !x.cambio_direccion) return null;
  var ufDoc = ufDeUnidad(x.unidad_pf);
  var aprobados = lineasCambio(x.cambio_direccion).filter(function (l) { return l.estado === "aprobada" && ufDeUnidad(l.codigo); });
  if (!aprobados.length || !ufDoc) return null;
  var ult = cambioReciente(aprobados);
  if (ufDeUnidad(ult.codigo) === ufDoc) return null;
  return { actual: lugarDeUnidad(x.unidad_pf), destino: lugarDeUnidad(ult.codigo) };
}
function esListoReal(x) { return x.estado_pf === "listo" && !trasladoPendiente(x); }
function estadoPresentacion(x) {
  if (x.ultimo_resultado) {
    var e0 = explicar(x.ultimo_resultado);
    if (!e0.ubicacion && x.unidad_pf) e0.ubicacion = "En la unidad de " + lugarDeUnidad(x.unidad_pf);
    var tp = trasladoPendiente(x);
    if (tp && e0.corto === "Listo") {
      e0.tono = "aviso"; e0.badge = "vigila"; e0.corto = "En traslado"; e0.traslado = true;
      e0.t = "Tu cambio de dirección fue aprobado";
      e0.resumen = "Tu RNM sigue en " + tp.actual + " y será trasladado a " + tp.destino + ". Todavía no vayas a retirarlo.";
      e0.p = [e0.resumen];
      e0.pasos = ["No tienes que hacer nada por ahora.", "Cuando llegue a " + tp.destino + ", aquí aparecerá como listo para retirar.", "Si necesitas ayuda, escríbenos " + VIA_CONTACTO + "."];
      e0.detalles = [["Está ahora en", tp.actual], ["Va hacia", tp.destino]];
      e0.ubicacion = "En camino de " + tp.actual + " a " + tp.destino;
    }
    if (!e0.ubicacion) e0.ubicacion = "La PF todavía no indica en qué unidad está";
    return e0;
  }
  var plan = x.requiere_pago && !x.cubierto;
  if (plan) {
    // Todavía no se consultó en la PF: no decimos nada del documento (podría ni existir o tener un dato mal escrito).
    return { tono: "aviso", badge: "", corto: "Sin consultar", t: "Aún no consultamos este RNM",
      resumen: "Para consultarlo en la Policía Federal y seguirlo cada semana, activa un plan.",
      p: ["Para consultarlo en la Policía Federal y seguirlo cada semana, activa un plan."],
      pasos: ["Elige un plan para empezar el seguimiento semanal."], detalles: [], ubicacion: "Aún sin consultar" };
  }
  return { tono: "aviso", badge: "vigila", corto: "Consultando", t: "Estamos consultando la Policía Federal",
    resumen: "Tu primera consulta está en proceso. El resultado aparecerá aquí en unos minutos.",
    p: ["Tu primera consulta está en proceso. El resultado aparecerá aquí en unos minutos."],
    pasos: ["No tienes que hacer nada: vuelve en unos minutos."], detalles: [], ubicacion: "Consultando a la Policía Federal…" };
}
function explicar(txt) { return interpretarConsulta(txt); }

/* Conexión de navegación entre secciones */
document.querySelectorAll("[data-seccion]").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var sec = this.getAttribute("data-seccion");
    if (sec) navegarA(sec);
  });
});

var btnIrNueva = $("btn-ir-nueva-consulta");
if (btnIrNueva) {
  btnIrNueva.addEventListener("click", function () { navegarA("nueva-consulta"); });
}

var btnNuevaMisRnm = $("btn-nueva-consulta-mis-rnm");
if (btnNuevaMisRnm) {
  btnNuevaMisRnm.addEventListener("click", function () { navegarA("nueva-consulta"); });
}

var btnVolverAgregar = $("btn-volver-agregar");
if (btnVolverAgregar) btnVolverAgregar.addEventListener("click", function () { navegarA("inicio"); });

var btnVolverLista = $("btn-volver-inicio-lista");
if (btnVolverLista) btnVolverLista.addEventListener("click", function () { navegarA("inicio"); });

var btnVolverMisRnm = $("btn-volver-mis-rnm");
if (btnVolverMisRnm) {
  btnVolverMisRnm.addEventListener("click", function () { navegarA("inicio"); });
}

document.querySelectorAll("#mis-rnm-filtros button").forEach(function (btn) {
  btn.addEventListener("click", function () {
    document.querySelectorAll("#mis-rnm-filtros button").forEach(function (b) { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); });
    this.classList.add("active"); this.setAttribute("aria-pressed", "true");
    filtroMisRnm = this.getAttribute("data-filtro") || "todos";
    renderizarMisRnm(registrosCargados, planCargado);
  });
});

var btnActualizarHist = $("btn-actualizar-historial");
if (btnActualizarHist) {
  btnActualizarHist.addEventListener("click", function () {
    var b = this, t = b.textContent;
    b.disabled = true; b.textContent = "Actualizando…"; b.setAttribute("aria-busy", "true");
    cargarHistorialConsultas().then(function () {
      b.disabled = false; b.textContent = "Lista actualizada"; if (window.toast) toast("Historial actualizado", "ok"); b.removeAttribute("aria-busy");
      setTimeout(function () { b.textContent = t; }, 1800);
    });
  });
}

var btnEditarDirecto = $("btn-editar-perfil-directo");
if (btnEditarDirecto) {
  btnEditarDirecto.addEventListener("click", function () { abrirPerfil(true); });
}

(function () { // el botón de WhatsApp de Ayuda usa el número configurado; sin número no se muestra
  var w = document.getElementById("ayuda-whatsapp");
  if (!w) return;
  if (WHATSAPP) w.href = "https://wa.me/" + WHATSAPP; else w.classList.add("oculto");
})();

iniciar();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
