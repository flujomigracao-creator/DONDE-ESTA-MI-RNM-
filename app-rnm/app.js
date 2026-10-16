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
    var q = new URLSearchParams(location.search), cupos = Number(q.get("plan")), metodo = q.get("pago");
    if (cupos >= 1 && cupos <= 4) {
      localStorage.setItem("rnm_ir_pago", JSON.stringify({ cupos: cupos, metodo: metodo === "boleto" ? "boleto" : "pix", t: Date.now() }));
      history.replaceState(null, "", location.pathname + location.hash);
    }
  } catch (e) { /* sin almacenamiento: simplemente no se abre el pago solo */ }
})();
function consumirIrAPago() {
  var d;
  try { d = JSON.parse(localStorage.getItem("rnm_ir_pago") || "null"); localStorage.removeItem("rnm_ir_pago"); } catch (e) { return; }
  if (!d || Date.now() - d.t > 7 * 24 * 3600 * 1000 || !d.cupos) return;
  navegarA("planes");
  setTimeout(function () {
    mostrarPago(d.cupos);
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
  if (p) p.textContent = activo ? "Plan de " + planCargado.cupos + " RNM" : "Sin plan";
  if (ps) ps.textContent = activo ? "Activo hasta " + fechaCorta(planCargado.vence_at) : "Ver planes";
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
    return vista("login");
  }
  if (!cambio) return;
  var r = await sb.from("rnm_perfiles").select("*").eq("user_id", session.user.id).maybeSingle();
  perfilActual = r.data || null;
  actualizarInfoUsuario(session.user, perfilActual);
  if (!perfilActual) { abrirPerfil(false); }
  else { vista("app"); navegarA(seccionInicial()); cargarRegistros(); }
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
  var esc = $("escaner"); if (esc) esc.classList.toggle("oculto", n !== 1);
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
function validarSubPaso(n) {
  var ME = function (id, t) { marcarCampoEn("#form-rnm", id, t, "msg-form"); return false; };
  limpiarErroresEn("#form-rnm");
  if (n === 1) {
    var rnm = $("rnm").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!rnm) return ME("rnm", "Escribe tu número de RNM.");
    if (!/^[A-Z0-9]{6,12}$/.test(rnm)) return ME("rnm", "Revisa tu RNM: deben ser entre 6 y 12 letras y números, sin espacios ni símbolos.");
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
/* ---------- Escáner del carné RNM: frente (lee RNM y nacimiento) y verso (QR → validez oficial) ---------- */
var carneEscaneado = { foto: null, qr: null, validezISO: null };
function reducirImagen(archivo, maxLado) {
  return new Promise(function (ok, fallo) {
    var url = URL.createObjectURL(archivo), img = new Image();
    img.onload = function () {
      var k = Math.min(1, maxLado / Math.max(img.width, img.height)), cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob(function (b) { if (b) ok({ blob: b, canvas: cv }); else fallo(new Error("sin_imagen")); }, "image/jpeg", 0.82);
    };
    img.onerror = function () { URL.revokeObjectURL(url); fallo(new Error("sin_imagen")); };
    img.src = url;
  });
}
function blobABase64(blob) {
  return new Promise(function (ok, fallo) { var fr = new FileReader(); fr.onload = function () { ok(String(fr.result).split(",")[1]); }; fr.onerror = fallo; fr.readAsDataURL(blob); });
}
async function llamarFuncion(nombre, cuerpo) {
  var ses = (await sb.auth.getSession()).data.session;
  var res = await fetch(SUPABASE_URL + "/functions/v1/" + nombre, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + (ses ? ses.access_token : "") },
    body: JSON.stringify(cuerpo)
  });
  var j = await res.json().catch(function () { return {}; });
  if (!res.ok) { var er = new Error(j.error || "error"); er.codigo = j.error; throw er; }
  return j;
}
function cargarJsQR() {
  return new Promise(function (ok, fallo) {
    if (window.jsQR) return ok(window.jsQR);
    var sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
    sc.onload = function () { ok(window.jsQR); }; sc.onerror = fallo;
    document.head.appendChild(sc);
  });
}
async function leerQR(canvas) {
  if ("BarcodeDetector" in window) {
    try { var r = await new BarcodeDetector({ formats: ["qr_code"] }).detect(canvas); if (r.length) return r[0].rawValue; } catch (e) { /* se prueba con jsQR */ }
  }
  var jq = await cargarJsQR();
  var d = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  var q = jq(d.data, d.width, d.height);
  return q ? q.data : null;
}
function dmyAISO(t) {
  var p = String(t || "").split("/"); if (p.length !== 3) return null;
  var d = Number(p[0]), m = Number(p[1]), a = Number(p[2]), f = new Date(a, m - 1, d);
  if (f.getFullYear() !== a || f.getMonth() !== m - 1 || f.getDate() !== d) return null;
  return a + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}
function estadoEscaner(t, tipo) { var p = $("escaner-estado"); if (p) { p.textContent = t || ""; p.className = "sub escaner-estado" + (tipo ? " " + tipo : ""); } }
function textoErrorEscaner(e) {
  var c = e && e.codigo;
  if (c === "lectura_no_configurada") return "El escáner no está disponible por ahora. Escribe tus datos a mano.";
  if (c === "qr_no_oficial") return "Ese QR no es de una página oficial. Revisa que sea el del verso de tu carné.";
  if (c === "pagina_no_disponible") return "La página oficial no respondió ahora. Guardamos el QR; puedes continuar.";
  return "No pudimos leer la foto. Intenta con más luz y sin reflejos, o escribe los datos a mano.";
}
function ponerCampo(id, valor) { var i = $(id); i.value = valor; i.dispatchEvent(new Event("input", { bubbles: true })); }
function fijarValidez(texto, origen) {
  var iso = dmyAISO(texto); if (!iso) return false;
  carneEscaneado.validezISO = iso;
  var vence = new Date(iso) < new Date();
  estadoEscaner("Validez " + (origen === "qr" ? "según la página oficial" : "leída del carné") + ": " + texto + (vence ? " (¡vencida!)" : "") , vence ? "mal" : "ok");
  return true;
}
$("btn-escanear-frente").addEventListener("click", function () { $("file-frente").click(); });
$("btn-escanear-qr").addEventListener("click", function () { $("file-qr").click(); });
$("file-frente").addEventListener("change", async function () {
  var f = this.files && this.files[0]; this.value = ""; if (!f) return;
  estadoEscaner("Leyendo tu carné…", "carga");
  try {
    var im = await reducirImagen(f, 1600);
    var d = await llamarFuncion("rnm-leer-carne", { imagen: await blobABase64(im.blob), mime: "image/jpeg" });
    if (!d.es_carne) return estadoEscaner("No parece un carné RNM. Intenta de nuevo con buena luz, o escribe los datos a mano.", "mal");
    var leidos = [];
    if (d.rnm) { ponerCampo("rnm", d.rnm); leidos.push("RNM"); }
    if (d.fecha_nacimiento) { ponerCampo("nac", d.fecha_nacimiento); leidos.push("fecha de nacimiento"); }
    if (d.validez && !carneEscaneado.validezISO) fijarValidez(d.validez, "frente");
    if (!leidos.length) return estadoEscaner("No pudimos leer los datos. Intenta con más luz, o escríbelos a mano.", "mal");
    carneEscaneado.foto = im.blob;
    if (!carneEscaneado.validezISO) estadoEscaner("Leímos tu " + leidos.join(" y ") + ". Revisa que estén bien. Falta el verso (QR) para confirmar la validez.", "ok");
    if (window.toast) toast("Carné leído. Revisa los datos.", "ok");
  } catch (e) { estadoEscaner(textoErrorEscaner(e), "mal"); }
});
$("file-qr").addEventListener("change", async function () {
  var f = this.files && this.files[0]; this.value = ""; if (!f) return;
  estadoEscaner("Buscando el QR…", "carga");
  try {
    var im = await reducirImagen(f, 1400);
    var url = await leerQR(im.canvas);
    if (!url) return estadoEscaner("No encontré el QR. Acércalo, sin reflejos y con el QR centrado, e intenta de nuevo.", "mal");
    carneEscaneado.qr = url;
    estadoEscaner("QR leído. Consultando la página oficial…", "carga");
    var v = await llamarFuncion("rnm-validar-carne", { url: url });
    if (v.rnm_en_pagina && !$("rnm").value) ponerCampo("rnm", v.rnm_en_pagina);
    if (v.validez && fijarValidez(v.validez, "qr")) { carneEscaneado.verificada = true; if (window.toast) toast("Validez confirmada en la página oficial", "ok"); }
    else estadoEscaner("Guardamos el QR, pero no pudimos leer la validez ahora. Puedes continuar.", "ok");
  } catch (e) { estadoEscaner(textoErrorEscaner(e), e && e.codigo === "pagina_no_disponible" ? "ok" : "mal"); }
});
function reiniciarEscaner() { carneEscaneado = { foto: null, qr: null, validezISO: null }; estadoEscaner(""); }

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
  if (!nacTxt) return ME("nac", "Escribe tu fecha de nacimiento (dd/mm/aaaa).");
  if (!iso) return ME("nac", "Esa fecha no es válida. Usa el formato dd/mm/aaaa, por ejemplo 14/03/1992, y que no sea una fecha futura.");
  if (!$("consiento").checked) return ME("consiento", "Marca la autorización para poder continuar.");

  consultaPendiente = { rnm: rnm, iso: iso, nacTexto: nacTxt };

  var confRnm = $("conf-rnm-val"); if (confRnm) confRnm.textContent = rnm;
  var confNac = $("conf-nac-val"); if (confNac) confNac.textContent = nacTxt;
  var confVal = $("conf-validez-val"), confValF = $("conf-validez-fila");
  if (confValF) {
    confValF.classList.toggle("oculto", !carneEscaneado.validezISO);
    if (confVal && carneEscaneado.validezISO) { var pv = carneEscaneado.validezISO.split("-"); confVal.textContent = pv[2] + "/" + pv[1] + "/" + pv[0]; }
  }

  var confCosto = $("conf-costo-val");
  if (confCosto) {
    if (gratisDisponible) {
      confCosto.textContent = "Primera consulta gratuita incluida";
      confCosto.style.color = "var(--success)";
    } else if (planCargado && new Date(planCargado.vence_at) > new Date() && registrosCargados.length + 1 <= planCargado.cupos) {
      confCosto.textContent = "Cubierto por tu plan mensual activo";
      confCosto.style.color = "var(--brand)";
    } else {
      confCosto.textContent = "Documento adicional (requiere plan)";
      confCosto.style.color = "var(--warning)";
    }
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

    var rutaFoto = null;
    if (carneEscaneado.foto) {
      var ruta = usuarioActual.id + "/" + Date.now() + ".jpg";
      var sub = await sb.storage.from("rnm-carnes").upload(ruta, carneEscaneado.foto, { contentType: "image/jpeg" });
      if (!sub.error) rutaFoto = ruta;
    }
    var r = await sb.from("rnm_registros").insert({
      user_id: usuarioActual.id,
      rnm: consultaPendiente.rnm,
      fecha_nacimiento: consultaPendiente.iso,
      validez: carneEscaneado.validezISO || null,
      carne_qr_url: carneEscaneado.qr || null,
      carne_foto_path: rutaFoto
    });
    if (r.error && rutaFoto) { sb.storage.from("rnm-carnes").remove([rutaFoto]); }

    btn.disabled = false;

    if (r.error) {
      if ((r.error.message || "").indexOf("limite_4_rnm") >= 0) {
        return msg("msg-confirmar", "Has alcanzado el límite máximo de 4 RNM por cuenta.");
      }
      return msg("msg-confirmar", r.error.code === "23505"
        ? "Ese RNM ya está registrado en una cuenta. Si es tuyo y no lo ves en tu lista, contáctanos a " + CONTACTO_EMAIL + "."
        : "No pudimos procesar el registro. Intenta de nuevo.");
    }

    $("form-rnm").reset(); reiniciarEscaner();
    await mostrarConsultando(function () { return cargarRegistros(); });
    irAPasoConsulta(1);
    var nuevo = registrosCargados.find(function (x) { return x.rnm === consultaPendiente.rnm; });
    if (nuevo) abrirDetalleRnm(nuevo.id); else navegarA("inicio");
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
  var cual = lleno ? "tope-4" : (gratisDisponible ? "reg-gratis" : (activo && registrosCargados.length + 1 <= planCargado.cupos ? "reg-cubierto" : "reg-adicional"));
  ["reg-gratis", "reg-cubierto", "reg-adicional", "tope-4"].forEach(function (id) { var n = $(id); if (n) n.classList.toggle("oculto", id !== cual); });
}
async function actualizarAvisoRegistro() {
  var g = await sb.rpc("rnm_gratis_disponible");
  if (g.error || typeof g.data !== "boolean") return;
  gratisDisponible = g.data;
  mostrarCosteAplicable();
}

var PRECIOS = { 1: 499, 2: 899, 3: 1299, 4: 1599 }; // centavos al mes por cuenta, según cuántos RNM cubre el plan
function reales(c) { return "R$ " + (c / 100).toFixed(2).replace(".", ","); }
function ahorro(n) { return n * PRECIOS[1] - PRECIOS[n]; } // lo que se ahorra frente a pagar R$ 4,99 por cada RNM por separado
function porcentajeAhorro(n) { return Math.round(ahorro(n) * 100 / (n * PRECIOS[1])); }
var planElegido = 1;
var ampliando = false; // el cliente con plan activo quiere pasar a uno más grande aunque el suyo ya cubra todos sus RNM

var esperandoPago = 0; // hora en que la persona volvió de Mercado Pago; mientras tanto se confirma el cobro

// Pide al servidor que cree la suscripción con el código de la tarjeta (los datos de la tarjeta nunca pasan por FLUJO).
async function pedirSuscripcion(cupos, tarjetaToken) {
  var s = await sb.auth.getSession();
  var token = s.data.session && s.data.session.access_token;
  var r = await fetch(SUPABASE_URL + "/functions/v1/mp-crear-suscripcion", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + token },
    body: JSON.stringify({ cupos: cupos, card_token_id: tarjetaToken })
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
async function pedirPagoUnico(cupos, metodo, cpf) {
  var s = await sb.auth.getSession();
  var token = s.data.session && s.data.session.access_token;
  var r = await fetch(SUPABASE_URL + "/functions/v1/mp-crear-pago", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + token },
    body: JSON.stringify({ cupos: cupos, metodo: metodo, cpf: cpf })
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

function mostrarPago(cupos) {
  var cont = $("cartel");
  if (!window.MercadoPago) { // el script de Mercado Pago no cargó (sin internet o bloqueado)
    var av = $("msg-pago"); if (av) av.textContent = "No pudimos cargar el pago seguro. Revisa tu internet e intenta de nuevo.";
    return;
  }
  salirDePago();
  pagandoPlan = cupos;
  cont.textContent = "";
  var precio = reales(PRECIOS[cupos]);
  var c = el("div", "pay");
  c.innerHTML =
    '<div class="pay-top"><button type="button" class="sec" id="btn-volver-planes"><svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M19 12H5M11 6l-6 6 6 6\"/></svg> Cambiar plan</button><span class="pay-paso">Paso 2 de 2</span></div>' +
    '<h2 class="pay-titulo">Finaliza tu suscripción</h2>' +
    '<div class="pay-resumen"><div><b>Plan de ' + cupos + ' RNM</b><span>Vigilamos hasta ' + cupos + (cupos === 1 ? " documento" : " documentos") + ': revisión semanal</span></div>' +
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
  $("btn-generar").addEventListener("click", async function () {
    var cpf = $("px-cpf").value.replace(/\D/g, "");
    if (cpf.length !== 11) return aviso("Escribe tu CPF completo (11 números).");
    var b = this; b.disabled = true; aviso(metodoActual === "pix" ? "Generando tu código Pix…" : "Generando tu boleto…", true);
    var res;
    try { res = await pedirPagoUnico(cupos, metodoActual, cpf); }
    catch (e) { b.disabled = false; return aviso("No pudimos conectar con el pago. Revisa tu internet e intenta de nuevo."); }
    b.disabled = false;
    if (!res.ok) return aviso(textoErrorPago(res.j));
    aviso("");
    mostrarCodigoPago(cupos, res.j);
  });

  var btn = $("btn-pagar-tarjeta");
  try {
    mpSdk = mpSdk || new MercadoPago(MP_PUBLIC_KEY, { locale: "es-AR" });
    formTarjeta = mpSdk.cardForm({
      amount: String(PRECIOS[cupos] / 100),
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
          try { res = await pedirSuscripcion(cupos, d.token); }
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
function mostrarCodigoPago(cupos, d) {
  var cont = $("cartel");
  try { if (formTarjeta) formTarjeta.unmount(); } catch (e) { /* ya desmontado */ }
  formTarjeta = null;
  cont.textContent = "";
  var esPix = d.metodo === "pix";
  var c = el("div", "pay");
  var codigo = esPix ? d.pix.copia_y_cola : (d.boleto.codigo || "");
  var h =
    '<div class="pay-top"><button type="button" class="sec" id="btn-volver-planes"><svg class=\"ic\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M19 12H5M11 6l-6 6 6 6\"/></svg> Volver</button><span class="pay-paso">' + (esPix ? "Pago con Pix" : "Pago con boleto") + '</span></div>' +
    '<div class="pay-resumen"><div><b>Plan de ' + cupos + ' RNM · 1 mes</b><span>' + (esPix ? "Paga y se activa en segundos" : "Se activa cuando el banco confirma") + '</span></div>' +
      '<div class="pay-precio"><b>' + reales(PRECIOS[cupos]) + '</b></div></div>';
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
  var sinPlan = regs.filter(function (x) { return !x.cerrado && !x.cubierto && !!x.ultimo_resultado; });
  if (!sinPlan.length) return null;
  var d = el("div", "aviso-plan");
  d.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5M12 16.5v.01"/><circle cx="12" cy="12" r="9"/></svg>';
  var cuerpo = el("div", "");
  var p = el("p", "", "");
  p.innerHTML = "<b>Tu primera consulta ya está lista.</b> Para saber dónde está tu RNM, activa un plan: así el estado se actualiza <b>cada semana</b>. Sin plan, lo que ves no se vuelve a actualizar.";
  cuerpo.appendChild(p);
  var b = el("button", "", "Activar un plan"); b.type = "button";
  b.addEventListener("click", abrirModalPlanes);
  cuerpo.appendChild(b);
  d.appendChild(cuerpo);
  return d;
}

// Aviso fijo: todos los planes se revisan una vez por semana.
function notaSemanal() {
  var n = el("div", "nota-semanal");
  n.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
  var t = el("p", "", "");
  t.innerHTML = "<b>Revisión semanal.</b> Con un plan revisamos cada RNM una vez por semana (cada 7 días) hasta que el documento esté listo. No es en tiempo real.";
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
  var necesita = Math.min(abiertos, 4);
  if (esperandoPago && Date.now() - esperandoPago < 180000 && !(activo && plan.cupos >= necesita)) {
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
  if (activo && plan.cupos >= necesita && !ampliando) {
    var ok = el("div", "pay pay-centro");
    ok.innerHTML = '<div class="pay-icono ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>';
    ok.appendChild(el("h2", "pay-titulo", "Tu plan está activo"));
    ok.appendChild(el("p", "sub", "Cubre hasta " + plan.cupos + " RNM (" + reales(plan.precio_centavos) + " al mes) y está pagado hasta el " + fechaCorta(plan.vence_at) + "."));
    if (plan.cupos < 4) {
      var masGrande = el("button", "", "Ampliar mi plan"); masGrande.type = "button";
      masGrande.addEventListener("click", function () { ampliando = true; planElegido = plan.cupos + 1; cartelPlanes(regs, plan); });
      ok.appendChild(masGrande);
    }
    var cerrarOk = el("button", plan.cupos < 4 ? "sec" : "", "Entendido"); cerrarOk.type = "button";
    cerrarOk.addEventListener("click", cerrarModalPlanes);
    ok.appendChild(cerrarOk);
    cont.appendChild(ok);
    return;
  }
  if (planElegido < necesita) planElegido = necesita;
  if (activo && ampliando && planElegido <= plan.cupos) planElegido = Math.min(4, plan.cupos + 1);
  var c = el("div", "pay");
  c.appendChild(el("span", "pay-paso", "Paso 1 de 2"));
  var primeraHecha = regs.some(function (r) { return !r.cerrado && !r.cubierto && !!r.ultimo_resultado; });
  c.appendChild(el("h2", "pay-titulo", activo ? (plan.cupos >= necesita ? "Amplía tu plan" : "Tu plan cubre " + plan.cupos + " de tus " + abiertos + " RNM") : (primeraHecha ? "Activa un plan para seguir tu RNM" : "Elige tu plan")));
  c.appendChild(el("p", "sub", activo
    ? (plan.cupos >= necesita ? "Elige un plan más grande para cubrir más RNM." : "Amplía tu plan para cubrir los demás.")
    : (primeraHecha
      ? "Con un plan revisamos tu RNM cada 7 días. Sin plan, el estado ya no se actualiza."
      : "Elige cuántos RNM cubrir. Revisión cada 7 días.")));
  var ben = el("ul", "pay-beneficios");
  ["Revisión automática cada 7 días", "Ves dónde está tu RNM y qué hacer", "Pago seguro con Mercado Pago"].forEach(function (t) {
    var li = el("li", "", ""); li.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'; li.appendChild(document.createTextNode(t)); ben.appendChild(li);
  });
  c.appendChild(ben);
  var grid = el("div", "planes");
  [1, 2, 3, 4].forEach(function (n) {
    var b = el("button", "plan" + (n === planElegido ? " sel" : ""));
    b.type = "button";
    b.appendChild(el("b", "", n + (n === 1 ? " RNM" : " RNM")));
    b.appendChild(el("span", "precio", reales(PRECIOS[n]) + " /mes"));
    b.appendChild(el("small", "", reales(Math.round(PRECIOS[n] / n)) + " por RNM"));
    var esActual = activo && plan.cupos === n;
    if (n < necesita || (activo && ampliando && n <= plan.cupos)) {
      b.disabled = true; b.classList.add("no-cubre");
      b.setAttribute("aria-label", "Plan de " + n + " RNM: no alcanza para tus " + necesita + " RNM");
      b.appendChild(el("small", "aviso-chico", esActual ? "Tu plan actual" : (n < necesita ? "No alcanza para tus " + necesita + " RNM" : "Ya tienes uno mayor")));
    } else {
      b.appendChild(el("small", n > 1 ? "ahorro" : "", n > 1 ? "Ahorras " + porcentajeAhorro(n) + "%" : "\u00a0"));
      if (n === 4) b.classList.add("mejor-precio");
      else if (n === necesita && abiertos > 0 && !activo) b.classList.add("recomendado");
      b.addEventListener("click", function () { planElegido = n; cartelPlanes(regs, plan); });
    }
    grid.appendChild(b);
  });
  c.appendChild(grid);
  if (activo) {
    var nota = el("p", "nota-ampliar");
    nota.innerHTML = "<b>Cómo funciona ampliar:</b> pagas el plan nuevo completo (" + reales(PRECIOS[planElegido]) + ") y reemplaza a tu plan actual de " + plan.cupos + (plan.cupos === 1 ? " RNM" : " RNM") + ". Pasa a cubrir " + planElegido + " RNM durante 1 mes desde hoy; los días que te quedaban del plan anterior no se suman.";
    c.appendChild(nota);
  }
  var acc = el("div", "acciones");
  var pagar = el("button", "", (activo ? "Ampliar a " : "Continuar · ") + planElegido + " RNM · " + reales(PRECIOS[planElegido]) + "/mes");
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
  if (estabaAbierto) focoAntesModal = null;
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

async function cargarRegistros() {
  actualizarAvisoRegistro();
  var q = await Promise.all([
    sb.from("rnm_registros")
      .select("id, rnm, estado_pago, requiere_pago, estado_pf, unidad_pf, cambio_direccion, ultimo_resultado, ultima_consulta_at, cerrado, created_at, validez, carne_foto_path")
      .order("created_at", { ascending: true }),
    sb.from("rnm_planes").select("cupos, precio_centavos, vence_at").maybeSingle()
  ]);
  var r = q[0];
  if (r.error || !r.data) return;
  var plan = q[1].data || null;
  var activo = !!plan && new Date(plan.vence_at) > new Date();
  // Los RNM abiertos se cubren por orden de registro hasta el número de cupos del plan; uno ya listo o entregado no ocupa cupo
  // (igual que en la base de datos).
  var puesto = 0;
  r.data.forEach(function (x) {
    if (!x.cerrado) puesto++;
    x.cubierto = activo && !x.cerrado && puesto <= plan.cupos;
    x.planVence = plan ? plan.vence_at : null;
    x.tuvoPlan = !!plan;
  });
  registrosCargados = r.data;
  planCargado = plan;
  var lleno = r.data.length >= 4;
  $("form-rnm").classList.toggle("oculto", lleno);
  mostrarCosteAplicable();
  actualizarDashboard(r.data, plan);
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
  var necesitan = regs.filter(function (x) { return !x.cerrado && !x.cubierto && (!!x.ultimo_resultado || x.requiere_pago); }).length;

  var estado = el("div", "tarjeta");
  estado.appendChild(el("p", "hero-eyebrow", "Tu plan actual"));
  if (activo) {
    estado.appendChild(el("h3", "", "Plan activo · cubre hasta " + plan.cupos + " RNM"));
    var filas = el("div", "review-summary-card");
    [["Precio mensual", reales(plan.precio_centavos)],
     ["Pagado hasta", fechaCorta(plan.vence_at)],
     ["RNM incluidos", String(plan.cupos)],
     ["Frecuencia de revisión", "1 vez por semana"],
     ["RNM en seguimiento", abiertos + " de " + plan.cupos + (abiertos > plan.cupos ? " (" + (abiertos - plan.cupos) + " sin cobertura)" : "")]
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
      : "Tu primera consulta es gratis. Para seguir vigilando tus RNM después de la primera revisión necesitas un plan mensual."));
  }
  var acc = el("div", "acciones");
  var ver = el("button", "btn", activo ? (plan.cupos < 4 || necesitan ? "Ampliar mi plan" : "Ver detalles del plan") : "Elegir un plan");
  ver.type = "button";
  if (!abiertos) {
    ver.disabled = true;
    estado.appendChild(el("p", "sub", "Cuando tengas un RNM en seguimiento podrás elegir un plan."));
  }
  ver.addEventListener("click", function () { ampliando = activo && plan.cupos < 4; if (ampliando) planElegido = Math.max(planElegido, plan.cupos + 1); cartelPlanes(regs, plan); abrirModalPlanes(); });
  acc.appendChild(ver);
  estado.appendChild(acc);
  cont.appendChild(estado);
  cont.appendChild(notaSemanal());

  var precios = el("div", "tarjeta");
  precios.appendChild(el("h3", "", "Compara los planes"));
  precios.appendChild(el("p", "sub", "Todos incluyen revisión semanal (cada 7 días) hasta que tu documento esté listo."));
  var grid = el("div", "plan-grid");
  [1, 2, 3, 4].forEach(function (n) {
    var esActual = activo && plan.cupos === n;
    var esVencido = !activo && !!plan && plan.cupos === n;
    var card = el("button", "plan-card" + (esActual ? " actual" : "") + (n === 4 ? " destacado" : ""));
    card.type = "button";
    card.setAttribute("aria-label", "Plan de " + n + (n === 1 ? " RNM" : " RNM") + ", " + reales(PRECIOS[n]) + " al mes");
    if (esActual) card.appendChild(el("span", "plan-sello", "Tu plan"));
    else if (esVencido) card.appendChild(el("span", "plan-sello vencido", "Vencido"));
    else if (n === 4) card.appendChild(el("span", "plan-sello", "Mejor precio"));
    card.appendChild(el("b", "plan-n", n + " RNM"));
    card.appendChild(el("span", "plan-precio", reales(PRECIOS[n])));
    card.appendChild(el("small", "", "por mes"));
    card.appendChild(el("small", "plan-por", reales(Math.round(PRECIOS[n] / n)) + " por RNM"));
    if (n > 1 && ahorro(n) > 0) card.appendChild(el("small", "plan-ahorro", "Ahorras " + porcentajeAhorro(n) + "%"));
    card.addEventListener("click", function () {
      if (!abiertos) return navegarA("nueva-consulta");
      planElegido = n; ampliando = activo && n > plan.cupos; cartelPlanes(regs, plan); abrirModalPlanes();
    });
    grid.appendChild(card);
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
  var sinCubrir = regs.some(function (x) { return !x.cerrado && !x.cubierto && (!!x.ultimo_resultado || x.requiere_pago); });
  if (sinCubrir) {
    var b = el("button", "plan-linea aviso", ""); b.type = "button";
    b.innerHTML = '<span>Activa un plan para que se actualice cada semana</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    b.addEventListener("click", function () { navegarA("planes"); });
    return b;
  }
  if (activo) { var d = el("div", "plan-linea ok", ""); d.innerHTML = SVG_OK + "<span>Seguimiento semanal activo · hasta " + fechaCorta(plan.vence_at) + "</span>"; return d; }
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

  // 3. Dónde retirar (una línea) y plan (un enlace)
  if (e.traslado) { /* mientras se traslada no se indica dónde retirar */ }
  else if (x.unidad_pf && (x.estado_pf === "listo" || e.corto === "Listo")) cont.appendChild(dondeRetirarCompacto(x));
  else if (x.estado_pf === "listo" && WHATSAPP) cont.appendChild(avisoOtraCiudad(x));
  if (!x.cerrado && !x.cubierto && x.ultimo_resultado) {
    var pl = el("button", "enlace-plan", "Activar seguimiento semanal"); pl.type = "button";
    pl.addEventListener("click", function () { navegarA("planes"); });
    cont.appendChild(pl);
  }

  // 4. Todo lo demás, a un toque
  var mas = el("details", "mas-detalles");
  mas.appendChild(el("summary", "", "Más detalles"));
  var cuerpo = el("div", "md-cuerpo");
  var datos = el("div", "review-summary-card");
  var filas = [["Última revisión", x.ultima_consulta_at ? fechaHora(x.ultima_consulta_at) : "Aún sin revisión"], ["Seguimiento semanal", x.cubierto ? "Activo hasta " + fechaCorta(x.planVence) : "No activo"]];
  if (x.unidad_pf) filas.push(["Unidad de la PF", etiquetaUnidad(x.unidad_pf)]);
  if (x.validez) { var vf = x.validez.split("-"); filas.push(["Validez del carné", vf[2] + "/" + vf[1] + "/" + vf[0]]); }
  (e.detalles || []).forEach(function (d) { filas.push(d); });
  filas.forEach(function (d) { var f = el("div", "review-row"); f.appendChild(el("span", "", d[0] + ":")); f.appendChild(el("b", "", d[1])); datos.appendChild(f); });
  cuerpo.appendChild(datos);
  if (x.carne_foto_path) {
    var bf = el("button", "sec btn-borrar-foto", "Borrar la foto de mi carné"); bf.type = "button";
    bf.addEventListener("click", async function () {
      if (!window.confirm("¿Borrar la foto de tu carné? Esto no se puede deshacer.")) return;
      bf.disabled = true;
      await sb.storage.from("rnm-carnes").remove([x.carne_foto_path]);
      await sb.rpc("rnm_borrar_foto_carne", { p_registro: x.id });
      if (window.toast) toast("Foto borrada", "ok");
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

/* El estado lo actualiza el equipo de FLUJO: la app se refresca sola cada minuto mientras está visible. */
$("btn-actualizar").addEventListener("click", function () {
  var b = this; b.disabled = true;
  cargarRegistros().then(function () { setTimeout(function () { b.disabled = false; }, 800); if (window.toast) toast("Pantalla actualizada", "ok"); });
});
setInterval(function () { // mientras se confirma un cobro, revisa cada 8 segundos
  if (esperandoPago && Date.now() - esperandoPago < 180000 && usuarioActual) cargarRegistros();
}, 8000);
setInterval(function () {
  if (document.visibilityState === "visible" && usuarioActual && !$("vista-app").classList.contains("oculto")) cargarRegistros();
}, 60000);

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
