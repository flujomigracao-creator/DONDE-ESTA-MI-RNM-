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

function actualizarInfoUsuario(user, perfil) {
  var email = (user && user.email) || "";
  var meta = (user && user.user_metadata) || {};
  var nombre = (perfil && perfil.nombre) || meta.full_name || meta.name || email.split("@")[0] || "Usuario";
  var inicial = (nombre.charAt(0) || "U").toUpperCase();

  var av = $("user-avatar-letter"); if (av) av.textContent = inicial;
  var q = $("quien"); if (q) q.textContent = email;
  var nd = $("perfil-nombre-display"); if (nd) nd.textContent = nombre;
  var ed = $("perfil-email-display"); if (ed) ed.textContent = email;
  var pt = $("perfil-tel-display"); if (pt) pt.textContent = (perfil && perfil.telefono) || "—";
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
  $("perfil-paso").textContent = "Paso " + n + " de 3";
  $("btn-perfil-atras").classList.toggle("oculto", n === 1);
  $("btn-perfil").textContent = n < 3 ? "Siguiente" : "Guardar y continuar";
  msg("msg-perfil", "");
  var foco = { 1: "p-nombre", 2: "p-tel", 3: "p-cep" }[n];
  setTimeout(function () { $(foco).focus(); }, 0);
}

function errorPaso(n) {
  if (n === 1) {
    if ($("p-nombre").value.trim().length < 3) return "Escribe tu nombre completo.";
  } else if (n === 2) {
    if (!/^\d{10,15}$/.test($("p-tel").value.replace(/\D/g, ""))) return "Revisa tu teléfono: incluye el código de ciudad (y el de país si es de otro país).";
  } else {
    var uf = $("p-uf").value.trim().toUpperCase(), cep = $("p-cep").value.replace(/\D/g, "");
    if (cep && !/^\d{8}$/.test(cep)) return "El CEP tiene 8 números.";
    if ($("p-dir").value.trim().length < 5) return "Escribe tu dirección actual.";
    if ($("p-ciudad").value.trim().length < 2) return "Escribe tu ciudad.";
    if (uf && !/^[A-Z]{2}$/.test(uf)) return "El estado son 2 letras, por ejemplo SP.";
    if (!$("p-consiento").checked) return "Debes aceptar la autorización para continuar.";
  }
  return "";
}
$("btn-perfil-atras").addEventListener("click", function () { irAPaso(pasoActual - 1); });
/* Autocompletar con el CEP (ViaCEP, servicio público de Brasil: solo recibe el CEP) */
var ultimoCep = "";
$("p-cep").addEventListener("input", async function (e) {
  var d = e.target.value.replace(/\D/g, "").slice(0, 8);
  e.target.value = d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
  var estado = $("cep-estado");
  if (d.length < 8) { ultimoCep = ""; estado.textContent = "Escribe tu CEP y completamos calle, ciudad y estado."; return; }
  if (d === ultimoCep) return;
  ultimoCep = d;
  estado.textContent = "Buscando…";
  try {
    var r = await fetch("https://viacep.com.br/ws/" + d + "/json/");
    var j = await r.json();
    if (d !== ultimoCep) return; // el usuario ya cambió el CEP
    if (!r.ok || j.erro) { estado.textContent = "No encontramos ese CEP. Completa tu dirección a mano."; return; }
    var calle = [j.logradouro, j.bairro].filter(Boolean).join(", ");
    if (calle) $("p-dir").value = calle + (j.logradouro ? ", " : "");
    if (j.localidade) $("p-ciudad").value = j.localidade;
    if (j.uf) $("p-uf").value = j.uf;
    estado.textContent = "Listo. Agrega el número de tu casa o apartamento.";
    var dir = $("p-dir"); dir.focus(); dir.setSelectionRange(dir.value.length, dir.value.length);
  } catch (_) {
    estado.textContent = "No pudimos buscar el CEP. Completa tu dirección a mano.";
  }
});

$("btn-perfil-cancelar").addEventListener("click", function () { vista("app"); });

$("form-perfil").addEventListener("submit", async function (e) {
  e.preventDefault();
  msg("msg-perfil", "");
  var err = errorPaso(pasoActual);
  if (err) return msg("msg-perfil", err);
  if (pasoActual < 3) return irAPaso(pasoActual + 1);
  for (var n = 1; n < 3; n++) { // por si algo quedó mal en un paso anterior
    var e2 = errorPaso(n);
    if (e2) { irAPaso(n); return msg("msg-perfil", e2); }
  }
  var nombre = $("p-nombre").value.trim().replace(/\s+/g, " ");
  var tel = $("p-tel").value.replace(/\D/g, "");
  var dir = $("p-dir").value.trim();
  var ciudad = $("p-ciudad").value.trim();
  var uf = $("p-uf").value.trim().toUpperCase();
  var cep = $("p-cep").value.replace(/\D/g, "");
  var datos = { nombre: nombre, telefono: tel, direccion: dir, ciudad: ciudad, estado: uf || null, cep: cep || null };
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
  msg("msg-login", "");
  var r = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.origin + location.pathname }
  });
  if (r.error) msg("msg-login", "No pudimos iniciar sesión. Intenta de nuevo.");
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

$("form-rnm").addEventListener("submit", function (e) {
  e.preventDefault();
  msg("msg-form", "");
  var rnm = $("rnm").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  var nacTxt = $("nac").value.trim();
  var iso = fechaISO(nacTxt);

  if (!/^[A-Z0-9]{6,12}$/.test(rnm)) return msg("msg-form", "Revisa tu número de RNM (debe tener entre 6 y 12 caracteres).");
  if (!iso) return msg("msg-form", "La fecha debe ser válida, con formato dd/mm/aaaa.");
  if (!$("consiento").checked) return msg("msg-form", "Debes autorizar el resguardo y consulta de tus datos para continuar.");

  consultaPendiente = { rnm: rnm, iso: iso, nacTexto: nacTxt };

  var confRnm = $("conf-rnm-val"); if (confRnm) confRnm.textContent = rnm;
  var confNac = $("conf-nac-val"); if (confNac) confNac.textContent = nacTxt;

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

    $("form-rnm").reset();
    await cargarRegistros();
    irAPasoConsulta(1);
    var nuevo = registrosCargados.find(function (x) { return x.rnm === consultaPendiente.rnm; });
    if (nuevo) abrirDetalleRnm(nuevo.id); else navegarA("inicio");
  });
}

/* ---------- Lista de RNM ---------- */
var gratisDisponible = true;
async function actualizarAvisoRegistro() {
  var g = await sb.rpc("rnm_gratis_disponible");
  if (g.error || typeof g.data !== "boolean") return;
  gratisDisponible = g.data;
  $("reg-gratis").classList.toggle("oculto", !gratisDisponible);
  $("reg-adicional").classList.toggle("oculto", gratisDisponible);
}

var PRECIOS = { 1: 499, 2: 899, 3: 1299, 4: 1599 }; // centavos al mes por cuenta, según cuántos RNM cubre el plan
function reales(c) { return "R$ " + (c / 100).toFixed(2).replace(".", ","); }
function ahorro(n) { return n * PRECIOS[1] - PRECIOS[n]; } // lo que se ahorra frente a pagar R$ 4,99 por cada RNM por separado
function porcentajeAhorro(n) { return Math.round(ahorro(n) * 100 / (n * PRECIOS[1])); }
var planElegido = 1;

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
  var listo = function () { var t = boton.textContent; boton.textContent = "¡Copiado!"; setTimeout(function () { boton.textContent = t; }, 1800); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(listo, function () { /* sin permiso */ });
  else { var tmp = document.createElement("textarea"); tmp.value = texto; document.body.appendChild(tmp); tmp.select(); try { document.execCommand("copy"); listo(); } catch (e) { /* sin copiar */ } tmp.remove(); }
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
    '<div class="pay-top"><button type="button" class="sec" id="btn-volver-planes">← Cambiar plan</button><span class="pay-paso">Paso 2 de 2</span></div>' +
    '<h2 class="pay-titulo">Finaliza tu suscripción</h2>' +
    '<div class="pay-resumen"><div><b>Plan de ' + cupos + ' RNM</b><span>Vigilamos hasta ' + cupos + (cupos === 1 ? " documento" : " documentos") + ': revisión semanal</span></div>' +
      '<div class="pay-precio"><b>' + precio + '</b><span>por mes</span></div></div>' +
    '<p class="pay-sub">Elige cómo quieres pagar</p>' +
    '<div class="metodos" role="radiogroup" aria-label="Forma de pago">' +
      '<button type="button" class="metodo sel" data-m="tarjeta" role="radio" aria-checked="true">' + ICONOS_PAGO.tarjeta + '<b>Tarjeta</b><small>Se renueva solo</small></button>' +
      '<button type="button" class="metodo" data-m="pix" role="radio" aria-checked="false">' + ICONOS_PAGO.pix + '<b>Pix</b><small>Al instante</small></button>' +
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
    '<p class="pay-seguro">🔒 Pago procesado por Mercado Pago. FLUJO nunca ve los datos de tu tarjeta.</p>' +
    '<p class="msg" id="msg-pago" aria-live="polite"></p>';
  cont.appendChild(c);
  $("mp-email").value = (usuarioActual && usuarioActual.email) || "";
  if (perfilActual && perfilActual.nombre) $("mp-nombre").value = perfilActual.nombre.toUpperCase();

  $("btn-volver-planes").addEventListener("click", function () { salirDePago(); cargarRegistros(); });

  function aviso(t, bien) { var m = $("msg-pago"); if (m) { m.textContent = t || ""; m.className = "msg" + (bien ? " bien" : ""); } }
  var metodoActual = "tarjeta";
  var NOTAS = {
    pix: "Pagas una vez y activamos 1 mes de tu plan. No se renueva solo: cuando termine el mes te avisamos para pagar de nuevo.",
    boleto: "Pagas en tu banco, app o lotérica. El plan se activa cuando el banco confirma (1-2 días hábiles). No se renueva solo."
  };
  var TEXTOS_BOTON = { pix: "Generar código Pix", boleto: "Generar boleto" };
  function elegir(m) {
    metodoActual = m; aviso("");
    c.querySelectorAll(".metodo").forEach(function (b) {
      var on = b.getAttribute("data-m") === m; b.classList.toggle("sel", on); b.setAttribute("aria-checked", on ? "true" : "false");
    });
    $("form-pago").classList.toggle("oculto", m !== "tarjeta");
    $("panel-otro").classList.toggle("oculto", m === "tarjeta");
    if (m !== "tarjeta") { $("px-nota").textContent = NOTAS[m]; $("btn-generar").textContent = TEXTOS_BOTON[m]; }
  }
  c.querySelectorAll(".metodo").forEach(function (b) { b.addEventListener("click", function () { elegir(b.getAttribute("data-m")); }); });
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
    '<div class="pay-top"><button type="button" class="sec" id="btn-volver-planes">← Volver</button><span class="pay-paso">' + (esPix ? "Pago con Pix" : "Pago con boleto") + '</span></div>' +
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
  h += '<div class="pay-espera" aria-live="polite"><span class="punto"></span><span id="px-estado">Esperando tu pago…</span></div>' +
    '<p class="pay-seguro">🔒 Pago procesado por Mercado Pago. Este pago cubre 1 mes; te avisaremos cuando toque renovar.</p>';
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
      if (!s) { estado.textContent = "El código venció. Vuelve atrás y genera uno nuevo."; if (relojPago) { clearInterval(relojPago); relojPago = null; } return; }
      estado.textContent = "Esperando tu pago… el código vence en " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
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
  if (activo && plan.cupos >= necesita) {
    var ok = el("div", "pay pay-centro");
    ok.innerHTML = '<div class="pay-icono ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>';
    ok.appendChild(el("h2", "pay-titulo", "Tu plan está activo"));
    ok.appendChild(el("p", "sub", "Cubre hasta " + plan.cupos + " RNM (" + reales(plan.precio_centavos) + " al mes) y está pagado hasta el " + fechaCorta(plan.vence_at) + "."));
    var cerrarOk = el("button", "", "Entendido"); cerrarOk.type = "button";
    cerrarOk.addEventListener("click", cerrarModalPlanes);
    ok.appendChild(cerrarOk);
    cont.appendChild(ok);
    return;
  }
  if (planElegido < necesita) planElegido = necesita;
  var c = el("div", "pay");
  c.appendChild(el("span", "pay-paso", "Paso 1 de 2"));
  var primeraHecha = regs.some(function (r) { return !r.cerrado && !r.cubierto && !!r.ultimo_resultado; });
  c.appendChild(el("h2", "pay-titulo", activo ? "Tu plan cubre " + plan.cupos + " de tus " + abiertos + " RNM" : (primeraHecha ? "Activa un plan para seguir tu RNM" : "Elige tu plan")));
  c.appendChild(el("p", "sub", activo
    ? "Amplía tu plan para cubrir los demás."
    : (primeraHecha
      ? "Con un plan revisamos tu RNM cada 7 días. Sin plan, el estado ya no se actualiza."
      : "Elige cuántos RNM cubrir. Revisión cada 7 días.")));
  var grid = el("div", "planes");
  [1, 2, 3, 4].forEach(function (n) {
    var b = el("button", "plan" + (n === planElegido ? " sel" : ""));
    b.type = "button";
    b.appendChild(el("b", "", n + (n === 1 ? " RNM" : " RNM")));
    b.appendChild(el("span", "precio", reales(PRECIOS[n]) + " /mes"));
    b.appendChild(el("small", "", reales(Math.round(PRECIOS[n] / n)) + " por RNM"));
    b.appendChild(el("small", n > 1 ? "ahorro" : "", n > 1 ? "Ahorras " + porcentajeAhorro(n) + "%" : " "));
    if (n === 4) b.classList.add("mejor-precio");
    b.addEventListener("click", function () { planElegido = n; cartelPlanes(regs, plan); });
    grid.appendChild(b);
  });
  c.appendChild(grid);
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
function abrirModalPlanes() {
  $("modal-planes").classList.remove("oculto");
  document.body.style.overflow = "hidden";
  $("modal-planes").querySelector(".modal-caja").focus();
}
function cerrarModalPlanes() {
  if (pagandoPlan) { salirDePago(); cargarRegistros(); }
  $("modal-planes").classList.add("oculto");
  document.body.style.overflow = "";
}
$("modal-cerrar").addEventListener("click", cerrarModalPlanes);
$("modal-planes").addEventListener("click", function (e) { if (e.target === this) cerrarModalPlanes(); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape") cerrarModalPlanes(); });

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
      .select("id, rnm, estado_pago, requiere_pago, estado_pf, unidad_pf, cambio_direccion, ultimo_resultado, ultima_consulta_at, cerrado, created_at")
      .order("created_at", { ascending: true }),
    sb.from("rnm_planes").select("cupos, precio_centavos, vence_at").maybeSingle()
  ]);
  var r = q[0];
  if (r.error || !r.data) return;
  var plan = q[1].data || null;
  var activo = !!plan && new Date(plan.vence_at) > new Date();
  // Los RNM se cubren por orden de registro hasta el número de cupos del plan (igual que en la base de datos).
  r.data.forEach(function (x, i) {
    x.cubierto = activo && i + 1 <= plan.cupos;
    x.planVence = plan ? plan.vence_at : null;
    x.tuvoPlan = !!plan;
  });
  registrosCargados = r.data;
  planCargado = plan;
  var lleno = r.data.length >= 4;
  $("form-rnm").classList.toggle("oculto", lleno);
  $("tope-4").classList.toggle("oculto", !lleno);
  actualizarDashboard(r.data, plan);
  renderizarMisRnm(r.data, plan);
  cartelPlanes(r.data, plan);
  actualizarPlanes(r.data, plan);

  if (seccionActual === "planes") renderizarPlanes(r.data, plan);
  if (seccionActual === "detalle-rnm" && detalleActual) construirDetalle(detalleActual);
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
  var ver = el("button", "btn", activo && !necesitan ? "Ver detalles del plan" : (activo ? "Ampliar mi plan" : "Elegir un plan"));
  ver.type = "button";
  if (!abiertos) {
    ver.disabled = true;
    estado.appendChild(el("p", "sub", "Cuando tengas un RNM en seguimiento podrás elegir un plan."));
  }
  ver.addEventListener("click", abrirModalPlanes);
  acc.appendChild(ver);
  estado.appendChild(acc);
  cont.appendChild(estado);
  cont.appendChild(notaSemanal());

  var precios = el("div", "tarjeta");
  precios.appendChild(el("h3", "", "Planes mensuales"));
  precios.appendChild(el("p", "sub", "Paga con tarjeta (se renueva solo), Pix o boleto (un mes por pago). El precio baja por RNM cuando cubres más documentos."));
  var tabla = el("div", "review-summary-card");
  [1, 2, 3, 4].forEach(function (n) {
    var f = el("div", "review-row");
    f.appendChild(el("span", "", n + (n === 1 ? " RNM" : " RNM") + (n > 1 ? " · ahorras " + porcentajeAhorro(n) + "%" : "")));
    f.appendChild(el("b", "", reales(PRECIOS[n]) + " al mes"));
    tabla.appendChild(f);
  });
  precios.appendChild(tabla);
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
async function cargarHistorialConsultas() {
  var cont = $("lista-historial-consultas");
  if (!cont) return;
  cont.textContent = "";

  var loading = el("p", "sub", "Cargando historial de consultas…");
  cont.appendChild(loading);

  var r = await sb.from("rnm_consultas").select(COLUMNAS_CONSULTA).order("created_at", { ascending: false }).limit(200);
  loading.remove();

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
    var n = NORMALIZADO[c.estado_normalizado] || ["", "Novedad"];

    var card = el("div", "history-card");
    var izq = el("div", "");
    izq.appendChild(el("span", "history-rnm", reg ? "RNM " + reg.rnm : "Documento"));
    izq.appendChild(el("div", "history-date", fechaHora(c.created_at)));
    if (c.resultado_texto) {
      var pRes = el("p", "", c.resultado_texto.length > 140 ? c.resultado_texto.slice(0, 140) + "…" : c.resultado_texto);
      pRes.style.fontSize = "0.88rem";
      pRes.style.margin = "6px 0 0";
      pRes.style.color = "#344054";
      izq.appendChild(pRes);
    }
    if (c.unidad_pf) {
      var pUni = el("p", "sub", "Unidad: " + c.unidad_pf);
      pUni.style.margin = "4px 0 0";
      izq.appendChild(pUni);
    }
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

/* ---------- Dashboard (Pantalla 5, diseño Figma) ---------- */
function enmascarar(r) { r = r || ""; return r.length > 2 ? r.charAt(0) + "••••••" + r.charAt(r.length - 1) : r; }
var ESTADO_CORTO = {
  "¡Tu documento está listo!": "Listo", "Tu documento ya fue entregado": "Entregado", "Tu solicitud tiene un problema": "Con problema",
  "Falta algo en tu trámite": "Falta algo", "Tu trámite sigue en proceso": "En trámite", "No encontramos tu trámite": "No encontrado"
};
function estadoCorto(x) {
  if (!x.ultimo_resultado) return x.requiere_pago && !x.cubierto ? "Espera un plan" : "Revisión en curso";
  var e = explicar(x.ultimo_resultado);
  return ESTADO_CORTO[e.t] || e.t;
}

function actualizarDashboard(regs, plan) {
  // 1. Saludo
  var saludoCont = $("dashboard-saludo");
  if (saludoCont) {
    saludoCont.textContent = "";
    var nombre = (perfilActual && perfilActual.nombre) ? perfilActual.nombre.split(" ")[0] : "";
    var cab = el("div", "saludo-fig");
    cab.appendChild(el("p", "eyebrow-fig", "Tu seguimiento"));
    cab.appendChild(el("h2", "", nombre ? "Hola, " + nombre : "Hola"));
    cab.appendChild(el("p", "", regs.length ? "Aquí está lo último sobre tu documento." : "Tu perfil está listo. Ahora podemos empezar con tu documento."));
    saludoCont.appendChild(cab);
  }

  // 2. Contenido principal
  var heroCont = $("dashboard-hero-container");
  if (heroCont) {
    heroCont.textContent = "";
    if (!regs.length) {
      var emp = el("div", "empty-state");
      emp.innerHTML =
        '<div class="empty-state-icon">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM14 3v5h5M12 12v6M9 15h6"/></svg>' +
        '</div>' +
        '<h3>Todavía no tienes RNM</h3>' +
        '<p>Añade el número de tu documento y tu fecha de nacimiento para solicitar la primera consulta.</p>' +
        '<button type="button" class="btn" id="btn-hero-empty-registrar">+ Agregar mi primer RNM</button>';
      heroCont.appendChild(emp);
      $("btn-hero-empty-registrar").addEventListener("click", function () { navegarA("nueva-consulta"); });
      var gratis = el("div", "tarjeta");
      gratis.appendChild(el("p", "eyebrow-fig", "Tu primera consulta es gratis"));
      gratis.appendChild(el("p", "", "Para el primer RNM de tu cuenta. Los RNM adicionales requieren un plan mensual desde R$ 4,99."));
      gratis.appendChild(el("p", "nota-fig", "Máximo 4 RNM por cuenta."));
      heroCont.appendChild(gratis);
    } else {
      var p = regs.find(function (x) { return x.estado_pf === "listo"; }) || regs.find(function (x) { return !x.cerrado; }) || regs[0];
      var e = estadoPresentacion(p);

      var hero = el("div", "hero-fig");
      var top = el("div", "hero-fig-top");
      top.appendChild(el("span", "", "RNM " + p.rnm));
      var ico = el("span", "");
      ico.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h4M14 3l5 5v3"/><circle cx="17" cy="17" r="4"/><path d="M17 15v2l1 1"/></svg>';
      top.appendChild(ico);
      hero.appendChild(top);
      hero.appendChild(el("h3", "", estadoCorto(p)));
      hero.appendChild(el("p", "", e.p[0] || e.t));
      hero.appendChild(el("small", "", p.ultima_consulta_at ? "Consultado el " + fechaHora(p.ultima_consulta_at) : "Aún sin resultado"));
      var bv = el("button", "", "Ver detalle de mi RNM"); bv.type = "button";
      bv.addEventListener("click", function () { abrirDetalleRnm(p.id); });
      hero.appendChild(bv);
      heroCont.appendChild(hero);

      // Plan: aviso insistente si ya hubo primera consulta sin plan; si no, estado del plan
      var av = avisoPlan(regs);
      if (av) heroCont.appendChild(av);
      else {
        var activo = !!plan && new Date(plan.vence_at) > new Date();
        var cp = el("div", "tarjeta plan-fig");
        cp.appendChild(el("span", "insignia" + (activo ? "" : " "), activo ? "Plan activo" : "Sin plan activo"));
        cp.appendChild(el("h3", "", activo ? "Activo hasta el " + fechaCorta(plan.vence_at) : "Tu primera consulta es gratis"));
        cp.appendChild(el("p", "", activo
          ? "Mientras el plan esté activo, revisamos cada 7 días hasta que el documento esté listo."
          : "Para seguir revisando cada 7 días, elige un plan."));
        if (!activo) {
          var bp = el("button", "sec btn-ancho", "Ver planes"); bp.type = "button"; bp.style.marginTop = "12px";
          bp.addEventListener("click", function () { navegarA("planes"); });
          cp.appendChild(bp);
        }
        heroCont.appendChild(cp);
      }

      var otros = regs.filter(function (x) { return x !== p; });
      if (otros.length) {
        var ts = el("div", "titulo-sec");
        ts.appendChild(el("h3", "", "Otros RNM"));
        heroCont.appendChild(ts);
        otros.forEach(function (x) { heroCont.appendChild(tarjeta(x)); });
      }
      if (regs.length < 4) {
        var ba = el("button", "sec btn-ancho", "+ Agregar RNM"); ba.type = "button";
        ba.addEventListener("click", function () { navegarA("nueva-consulta"); });
        heroCont.appendChild(ba);
      }
      heroCont.appendChild(el("p", "nota-fig", "Actualiza lo que ves; no inicia una nueva consulta ante la PF. El seguimiento no es en tiempo real."));
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
  var listos = regs.filter(function (x) { return x.estado_pf === "listo"; });
  var proceso = regs.filter(function (x) { return !x.cerrado && x.estado_pf !== "listo"; });

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
    var n = NORMALIZADO[c.estado_normalizado] || ["", "Novedad"];
    var item = el("div", "timeline-item");
    item.appendChild(el("div", "timeline-dot" + (n[0] === "ok" ? " ok" : "")));
    var cc = el("div", "timeline-content");
    cc.appendChild(el("div", "timeline-date", fechaHora(c.created_at)));
    cc.appendChild(el("h4", "timeline-title", "Revisión: " + n[1]));
    if (c.resultado_texto) cc.appendChild(el("p", "timeline-desc", c.resultado_texto.slice(0, 110)));
    item.appendChild(cc);
    box.appendChild(item);
  });
}

function construirDetalle(id) {
  var x = registrosCargados.find(function (r) { return r.id === id; });
  if (!x) { if (seccionActual === "detalle-rnm") navegarA("inicio"); return; }
  detalleActual = id;

  var cont = $("contenedor-detalle-rnm");
  if (!cont) return;
  cont.textContent = "";

  // 1. Tarjeta principal de cabecera del RNM
  var cardCab = el("div", "tarjeta");
  var fila = el("div", "fila");
  var titBox = el("div", "");
  titBox.appendChild(el("h2", "", "RNM " + x.rnm));
  fila.appendChild(titBox);

  var consultado = !!x.ultimo_resultado;
  var etiqueta = x.cerrado ? "Listo" : (x.cubierto ? "Vigilando hasta " + fechaCorta(x.planVence) : (consultado ? "Consulta lista" : (x.requiere_pago ? "Pendiente de plan" : "Consultando")));
  var clase = x.cerrado ? " ok" : (x.cubierto ? " vigila" : "");
  fila.appendChild(el("span", "insignia" + clase, etiqueta));
  cardCab.appendChild(fila);

  if (consultado) cardCab.appendChild(cajaResultado(x));
  else cardCab.appendChild(el("p", "sub", "Estamos verificando la información disponible ante la Policía Federal."));
  cont.appendChild(cardCab);
  if (!x.cerrado && !x.cubierto && consultado) cont.appendChild(avisoPlan([x]));

  // 2. Información policial y delegacia
  if (x.unidad_pf) {
    cont.appendChild(cajaUnidad(x));
  } else if (x.estado_pf === "listo" && WHATSAPP) {
    cont.appendChild(avisoOtraCiudad(x));
  }

  // 3. Línea de tiempo vertical (RnmTimeline con datos reales)
  var cardTime = el("details", "tarjeta historial");
  cardTime.appendChild(el("summary", "", "Historial del trámite"));

  var tl = el("div", "timeline");
  var hayEventos = false;

  if (x.cambio_direccion) {
    var lineas = lineasCambio(x.cambio_direccion);
    lineas.forEach(function (l) {
      hayEventos = true;
      var item = el("div", "timeline-item");
      item.appendChild(el("div", "timeline-dot" + (l.estado === "concluida" ? " ok" : "")));
      var tCont = el("div", "timeline-content");
      if (l.fecha) tCont.appendChild(el("div", "timeline-date", l.fecha));
      tCont.appendChild(el("h4", "timeline-title", "Cambio de dirección: " + l.estado));
      if (l.destino) tCont.appendChild(el("p", "timeline-desc", "Hacia " + l.destino));
      item.appendChild(tCont);
      tl.appendChild(item);
    });
  }

  var consultasBox = el("div", "");
  tl.appendChild(consultasBox);
  cargarConsultasDe(x.id, consultasBox);

  if (x.created_at) {
    hayEventos = true;
    var itemAlta = el("div", "timeline-item");
    itemAlta.appendChild(el("div", "timeline-dot"));
    var aCont = el("div", "timeline-content");
    aCont.appendChild(el("div", "timeline-date", new Date(x.created_at).toLocaleDateString("es")));
    aCont.appendChild(el("h4", "timeline-title", "RNM registrado"));
    itemAlta.appendChild(aCont);
    tl.appendChild(itemAlta);
  }

  if (!hayEventos) {
    tl.appendChild(el("p", "sub", "No hay eventos históricos previos para este documento."));
  }

  cardTime.appendChild(tl);
  cont.appendChild(cardTime);

  // 4. Acciones del detalle (Eliminar / Quitar RNM con ConfirmDialog)
  if (!x.cerrado) {
    var cardAcc = el("div", "");
    var q = el("div", "acciones");
    var avisoBorrar = el("p", "msg", "");
    var borrar = el("button", "btn danger", "Quitar este RNM");
    borrar.type = "button";
    borrar.addEventListener("click", async function () {
      var ok = await mostrarConfirmacion({
        titulo: "¿Quitar RNM " + x.rnm + "?",
        desc: "Se eliminarán los datos de seguimiento de este documento de tu cuenta. Esta acción no se puede deshacer.",
        accionTexto: "Quitar documento",
        esPeligroso: true
      });
      if (!ok) return;
      var borrado = await sb.from("rnm_registros").delete().eq("id", x.id);
      if (borrado.error) { avisoBorrar.textContent = "No pudimos quitar este RNM. Intenta de nuevo."; return; }
      detalleActual = null;
      await cargarRegistros();
      navegarA("inicio");
    });
    q.appendChild(borrar);
    cardAcc.appendChild(q);
    cardAcc.appendChild(avisoBorrar);
    cont.appendChild(cardAcc);
  }

}

/* El estado lo actualiza el equipo de FLUJO: la app se refresca sola cada minuto mientras está visible. */
$("btn-actualizar").addEventListener("click", function () {
  var b = this; b.disabled = true;
  cargarRegistros().then(function () { setTimeout(function () { b.disabled = false; }, 800); });
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

function cajaResultado(x) {
  var e = explicar(x.ultimo_resultado);
  var caja = el("div", "res " + e.tono);
  caja.appendChild(el("h3", "", e.t));
  e.p.forEach(function (p) { caja.appendChild(el("p", "", p)); });
  if (x.ultima_consulta_at) {
    caja.appendChild(el("p", "sub", "Última revisión: " + new Date(x.ultima_consulta_at).toLocaleDateString("es")));
  }
  return caja;
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
  if (/indeferid|negad|rejeitad|cancelad/i.test(sit)) return "rechazada o cancelada";
  if (/conclu[ií]d|deferid|finalizad|atendid/i.test(sit)) return "concluida";
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
      destino: ciudad ? ciudad + (uf ? "/" + uf : "") : (uf ? ESTADOS_BR[uf] : codigo)
    };
  });
}

function cajaUnidad(x) {
  var uf = ufDeUnidad(x.unidad_pf);
  var ciudadU = ciudadDeUnidad(x.unidad_pf);
  var donde = ciudadU ? ciudadU + (uf ? "/" + uf : "") : (uf ? ESTADOS_BR[uf] : x.unidad_pf);
  var miUF = perfilActual && perfilActual.estado;
  var miCiudad = perfilActual && perfilActual.ciudad;
  var otra, mismaCiudad = false;
  if (ciudadU && miCiudad) { mismaCiudad = normalizar(ciudadU) === normalizar(miCiudad); otra = !mismaCiudad; }
  else { otra = !!(uf && miUF && uf !== miUF); }
  var sabeDondeVive = !!((ciudadU && miCiudad) || (uf && miUF));

  var nota = "";
  if (ciudadU && miCiudad) nota = mismaCiudad ? "es tu ciudad" : "tu ciudad es " + miCiudad;
  else if (uf && miUF) nota = otra ? "es otro estado que el tuyo" : "es tu estado";

  var caja = el("div", "res " + (otra ? "" : "ok"));
  caja.appendChild(el("h3", "", "Retiro: Polícia Federal de " + donde));
  caja.appendChild(el("p", "sub", x.unidad_pf + (nota ? " · " + nota : "")));

  var lineas = x.cambio_direccion ? lineasCambio(x.cambio_direccion) : [];
  lineas.forEach(function (l) {
    caja.appendChild(el("p", "", "Cambio de dirección" + (l.destino ? " hacia " + l.destino : "") + ": " + l.estado + (l.fecha ? " (" + l.fecha + ")" : "")));
  });
  var haciaMiCiudad = miCiudad && lineas.some(function (l) { return l.destino && normalizar(l.destino.split("/")[0]) === normalizar(miCiudad); });
  if (haciaMiCiudad) caja.appendChild(el("p", "sub", "Ya pediste el cambio hacia tu ciudad: solo falta que la Polícia Federal lo atienda."));

  if (WHATSAPP && (otra || !sabeDondeVive || x.cambio_direccion)) {
    caja.appendChild(enlaceWhatsapp(x, "Hola, mi RNM " + x.rnm + " está listo en " + x.unidad_pf + (ciudadU ? " (" + ciudadU + ")" : "") + " y quiero cambiar la dirección de entrega."));
  } else if (!WHATSAPP && (otra || !sabeDondeVive || x.cambio_direccion)) {
    var correo = el("a", "btn-enlace", "Escribir a FLUJO para cambiar la dirección");
    correo.style.background = "var(--azul)"; correo.style.color = "#fff";
    correo.href = "mailto:" + CONTACTO_EMAIL + "?subject=" + encodeURIComponent("Cambio de dirección RNM " + x.rnm) + "&body=" + encodeURIComponent("Hola, mi RNM " + x.rnm + " está listo en " + x.unidad_pf + " y quiero cambiar la dirección de entrega.");
    caja.appendChild(correo);
  }
  return caja;
}

function fechaCorta(iso) { return new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "numeric" }); }

// Etiqueta corta del estado de vigilancia de un RNM -> [texto, clase de la insignia]
function etiquetaRnm(x) {
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

/* ---------- Guía de estados (explicaciones generales) ---------- */
var ESTADOS = [
  { re: /pronto para ser retirado|confeccionado/i, tono: "ok", t: "¡Tu documento está listo!",
    p: ["Retíralo en la unidad indicada con tu protocolo y un documento con foto."] },
  { re: /entregue|retirado em/i, tono: "ok", t: "Tu documento ya fue entregado",
    p: ["Figura como entregado. Si no lo tienes, escríbenos " + VIA_CONTACTO + "."] },
  { re: /indeferid|negad|rejeitad|arquivad/i, tono: "mal", t: "Tu solicitud tiene un problema",
    p: ["No fue aprobada o fue archivada. Escríbenos " + VIA_CONTACTO + " para revisar tu caso."] },
  { re: /pend[eê]ncia|exig[eê]ncia|complement|inconsist/i, tono: "aviso", t: "Falta algo en tu trámite",
    p: ["La Polícia Federal pide información o documentos. Escríbenos " + VIA_CONTACTO + " y te ayudamos."] },
  { re: /an[aá]lise|em andamento|processamento|aguard|confec[cç][aã]o|produ[cç][aã]o/i, tono: "aviso", t: "Tu trámite sigue en proceso",
    p: ["Está en análisis o fabricación. Lo revisamos cada semana; no tienes que hacer nada por ahora."] },
  { re: /n[aã]o (foi )?encontrad|nenhum|sin resultados/i, tono: "aviso", t: "No encontramos tu trámite",
    p: ["Revisaremos tu RNM y fecha de nacimiento; si algo no coincide, te escribiremos."] }
];
// Estado que se muestra para un registro: si todavía no hay resultado, se dice tal cual (nunca "novedad").
function estadoPresentacion(x) {
  if (x.ultimo_resultado) return explicar(x.ultimo_resultado);
  if (x.requiere_pago && !x.cubierto) return { tono: "aviso", t: "Este RNM espera un plan", p: ["Se consulta cuando actives un plan mensual que lo cubra."] };
  return { tono: "aviso", t: "Estamos haciendo tu primera consulta", p: ["Es gratis. Verás aquí el resultado en cuanto lo tengamos."] };
}
function explicar(txt) {
  txt = txt || "";
  var e = ESTADOS.find(function (x) { return x.re.test(txt); });
  return e || { tono: "aviso", t: "Hay una novedad en tu trámite", p: ["Escríbenos " + VIA_CONTACTO + " y te la explicamos."] };
}

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

var btnVolverMisRnm = $("btn-volver-mis-rnm");
if (btnVolverMisRnm) {
  btnVolverMisRnm.addEventListener("click", function () { navegarA("inicio"); });
}

document.querySelectorAll("#mis-rnm-filtros button").forEach(function (btn) {
  btn.addEventListener("click", function () {
    document.querySelectorAll("#mis-rnm-filtros button").forEach(function (b) { b.classList.remove("active"); });
    this.classList.add("active");
    filtroMisRnm = this.getAttribute("data-filtro") || "todos";
    renderizarMisRnm(registrosCargados, planCargado);
  });
});

var btnActualizarHist = $("btn-actualizar-historial");
if (btnActualizarHist) {
  btnActualizarHist.addEventListener("click", function () {
    cargarHistorialConsultas();
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
