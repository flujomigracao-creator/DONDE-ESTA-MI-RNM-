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

function vista(nombre) { // "login" | "perfil" | "app"
  document.body.setAttribute("data-vista", nombre);
  if (nombre === "app") ir(pantalla || "inicio");
  else renderBar();
  ["login", "perfil", "app"].forEach(function (v) {
    $("vista-" + v).classList.toggle("oculto", v !== nombre);
  });
}

async function mostrar(session) {
  var cambio = (session && session.user && session.user.id) !== (usuarioActual && usuarioActual.id);
  usuarioActual = session ? session.user : null;
  if (!session) { perfilActual = null; datos = { regs: [], plan: null, cargado: false }; histCache = null; pantalla = "inicio"; return vista("login"); }
  if (!cambio) return;
  var r = await sb.from("rnm_perfiles").select("*").eq("user_id", session.user.id).maybeSingle();
  perfilActual = r.data || null;
  saludo();
  if (!perfilActual) { abrirPerfil(false); }
  else { vista("app"); cargarRegistros(); }
}

/* ---------- Onboarding / perfil ---------- */
function abrirPerfil(editando) {
  editandoPerfil = !!editando;
  var p = perfilActual;
  var meta = (usuarioActual && usuarioActual.user_metadata) || {};
  $("p-nombre").value = p ? p.nombre : (meta.full_name || meta.name || "");
  $("p-tel").value = p ? p.telefono : "";
  $("p-dir").value = p ? p.direccion : "";
  $("p-ciudad").value = p ? p.ciudad : "";
  $("p-uf").value = p && p.estado ? p.estado : "";
  $("p-cep").value = p && p.cep ? p.cep.slice(0, 5) + "-" + p.cep.slice(5) : "";
  $("p-consiento").checked = !!p;
  $("btn-perfil-cancelar").classList.toggle("oculto", true);
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
  renderBar();
  $("btn-perfil").textContent = n < 3 ? "Siguiente" : "Guardar y continuar";
  $("btn-perfil-atras").classList.add("oculto");
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
  saludo();
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

var registroPendiente = null;
$("form-rnm").addEventListener("submit", function (e) {
  e.preventDefault();
  msg("msg-form", "");
  var rnm = $("rnm").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  var iso = fechaISO($("nac").value.trim());
  if (!/^[A-Z0-9]{6,12}$/.test(rnm)) return msg("msg-form", "Revisa tu número de RNM.");
  if (!iso) return msg("msg-form", "La fecha debe ser válida, con formato dd/mm/aaaa.");
  if (!$("consiento").checked) return msg("msg-form", "Autoriza el uso de estos datos para continuar.");
  registroPendiente = { rnm: rnm, iso: iso, nac: $("nac").value.trim() };
  $("revision").innerHTML = '<small>Número de RNM</small><b>' + esc(rnm) + '</b><small>Fecha de nacimiento</small><b>' + esc(registroPendiente.nac) + '</b><hr><small>Autorización</small><b>Consulta ante la Policía Federal, solo para informarte</b>';
  msg("msg-revision", "");
  $("agregar-paso1").classList.add("oculto");
  $("agregar-paso2").classList.remove("oculto");
  window.scrollTo(0, 0);
});
$("btn-corregir").addEventListener("click", function () {
  $("agregar-paso2").classList.add("oculto");
  $("agregar-paso1").classList.remove("oculto");
});
$("btn-registrar").addEventListener("click", async function () {
  if (!registroPendiente) return;
  var btn = this; btn.disabled = true;
  var r = await sb.from("rnm_registros").insert({ user_id: usuarioActual.id, rnm: registroPendiente.rnm, fecha_nacimiento: registroPendiente.iso });
  btn.disabled = false;
  if (r.error) {
    if ((r.error.message || "").indexOf("limite_4_rnm") >= 0) return msg("msg-revision", "Llegaste al máximo de 4 RNM por cuenta.");
    return msg("msg-revision", r.error.code === "23505" ? "Ese RNM ya está registrado en una cuenta. Si es tuyo y no lo ves en tu lista, escríbenos a flujoescalaempresas@gmail.com y lo resolvemos." : "No pudimos guardarlo. Intenta de nuevo.");
  }
  registroPendiente = null;
  $("form-rnm").reset();
  toast("RNM registrado");
  await cargarRegistros();
  ir("inicio");
});

/* ---------- Lista de RNM ---------- */
var gratisDisponible = true;
async function actualizarAvisoRegistro() {
  var g = await sb.rpc("rnm_gratis_disponible");
  if (g.error || typeof g.data !== "boolean") return;
  gratisDisponible = g.data;
  $("reg-gratis").classList.toggle("oculto", !gratisDisponible);
  $("reg-adicional").textContent = gratisDisponible
    ? "El primer RNM recibe su primera consulta gratis. Los adicionales requieren un plan mensual desde R$ 4,99."
    : "Este RNM requiere un plan mensual desde R$ 4,99 para ser consultado.";
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
    tarjeta_invalida: "No pudimos leer la tarjeta. Revisa los datos e intenta de nuevo."
  };
  if (textos[j.error]) return textos[j.error];
  if (j.motivo === "mismo_usuario") return "Esta cuenta no puede pagar su propio plan. Entra con otro correo.";
  if (j.motivo === "tarjeta_rechazada") return "La tarjeta no fue aceptada. Revisa los datos o prueba con otra.";
  return "No pudimos procesar el pago. Revisa la tarjeta o prueba con otra." + (j.mp_status ? " (código " + j.mp_status + ")" : "");
}

/* ---------- Pantalla de pago dentro de la app ---------- */
var pagandoPlan = 0; // plan que se está pagando; mientras sea > 0 el cuadro no se redibuja (si no, se borraría la tarjeta)
var mpSdk = null, formTarjeta = null;

function salirDePago() {
  pagandoPlan = 0;
  try { if (formTarjeta) formTarjeta.unmount(); } catch (e) { /* ya desmontado */ }
  formTarjeta = null;
}

function mostrarPago(cupos) {
  var cont = $("cartel");
  if (!window.MercadoPago) { // el script de Mercado Pago no cargó (sin internet o bloqueado)
    var av = $("msg-pago"); if (av) av.textContent = "No pudimos cargar el pago seguro. Revisa tu internet e intenta de nuevo.";
    return;
  }
  salirDePago();
  pagandoPlan = cupos;
  cont.textContent = "";
  var c = el("div", "tarjeta");
  c.appendChild(el("h2", "", "Pago seguro"));
  c.appendChild(el("p", "sub", cupos + " RNM · " + reales(PRECIOS[cupos]) + "/mes. Cancelas cuando quieras."));
  var f = document.createElement("form");
  f.id = "form-pago"; f.setAttribute("novalidate", "novalidate");
  f.innerHTML =
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
    '<div class="acciones"><button type="submit" id="btn-pagar-tarjeta">Pagar ' + reales(PRECIOS[cupos]) + '/mes</button>' +
    '<button type="button" class="sec" id="btn-volver-planes">Volver</button></div>' +
    '<p class="sub" style="margin-top:10px">🔒 Pago seguro con Mercado Pago.</p>' +
    '<p class="msg" id="msg-pago" aria-live="polite"></p>';
  c.appendChild(f);
  cont.appendChild(c);
  $("mp-email").value = (usuarioActual && usuarioActual.email) || "";
  if (perfilActual && perfilActual.nombre) $("mp-nombre").value = perfilActual.nombre.toUpperCase();

  $("btn-volver-planes").addEventListener("click", function () { salirDePago(); cargarRegistros(); });

  var btn = $("btn-pagar-tarjeta");
  function aviso(t, bien) { var m = $("msg-pago"); if (m) { m.textContent = t || ""; m.className = "msg" + (bien ? " bien" : ""); } }

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

function cartelPlanes(regs, plan) {
  if (pagandoPlan) return; // se está escribiendo la tarjeta: no tocar la pantalla
  var cont = $("cartel");
  cont.textContent = "";
  var abiertos = regs.filter(function (r) { return !r.cerrado; }).length;
  if (!regs.length || !abiertos) return; // sin RNM por vigilar no hay nada que ofrecer
  var activo = !!plan && new Date(plan.vence_at) > new Date();
  var necesita = Math.min(abiertos, 4);
  if (esperandoPago && Date.now() - esperandoPago < 180000 && !(activo && plan.cupos >= necesita)) {
    var espera = el("div", "tarjeta");
    espera.appendChild(el("h2", "", "Confirmando tu pago…"));
    espera.appendChild(el("p", "sub", "Puede tardar un minuto."));
    var cerrarEspera = el("button", "sec", "Cerrar"); cerrarEspera.type = "button";
    cerrarEspera.addEventListener("click", cerrarModalPlanes);
    espera.appendChild(cerrarEspera);
    cont.appendChild(espera);
    return;
  }
  if (activo && plan.cupos >= necesita) {
    var ok = el("div", "tarjeta");
    ok.appendChild(el("h2", "", "Tu plan está activo"));
    ok.appendChild(el("p", "sub", plan.cupos + " RNM · pagado hasta el " + fechaCorta(plan.vence_at) + "."));
    var cerrarOk = el("button", "", "Entendido"); cerrarOk.type = "button";
    cerrarOk.addEventListener("click", cerrarModalPlanes);
    ok.appendChild(cerrarOk);
    cont.appendChild(ok);
    return;
  }
  if (planElegido < necesita) planElegido = necesita;
  var c = el("div", "tarjeta");
  c.appendChild(el("h2", "", activo ? "Tu plan cubre " + plan.cupos + " de tus " + abiertos + " RNM" : "Elige tu plan para seguir vigilando"));
  c.appendChild(el("p", "sub", activo
    ? "Amplía tu plan para cubrir los demás."
    : "Elige cuántos RNM cubrir. Cancelas cuando quieras."));
  var grid = el("div", "planes");
  [1, 2, 3, 4].forEach(function (n) {
    var b = el("button", "plan" + (n === planElegido ? " sel" : ""));
    b.type = "button";
    b.appendChild(el("b", "", n + (n === 1 ? " RNM" : " RNM")));
    b.appendChild(el("span", "precio", reales(PRECIOS[n]) + " /mes"));
    if (n > 1) b.appendChild(el("small", "ahorro", "Ahorras " + porcentajeAhorro(n) + "%"));
    if (n === 4) b.appendChild(el("small", "mejor", "Mejor precio"));
    b.addEventListener("click", function () { planElegido = n; cartelPlanes(regs, plan); });
    grid.appendChild(b);
  });
  c.appendChild(grid);
  var acc = el("div", "acciones");
  var pagar = el("button", "", (activo ? "Ampliar a " : "Suscribirme · ") + planElegido + " RNM · " + reales(PRECIOS[planElegido]) + "/mes");
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
function marcarVistos(ids) {
  ids.forEach(function (id) { if (planesVistos.indexOf(id) < 0) planesVistos.push(id); });
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
document.addEventListener("keydown", function (e) { if (e.key === "Escape") { cerrarModalPlanes(); } });
$("btn-planes").addEventListener("click", abrirModalPlanes);

function actualizarPlanes(regs, plan) {
  var necesitan = regs.filter(function (x) { return !x.cerrado && !x.cubierto && (!!x.ultimo_resultado || x.requiere_pago); });
  var espera = !!esperandoPago && Date.now() - esperandoPago < 180000;
  $("btn-planes").classList.toggle("oculto", !(necesitan.length || espera));
  var nuevos = necesitan.filter(function (x) { return planesVistos.indexOf(x.id) < 0; });
  var cerrada = $("modal-planes").classList.contains("oculto");
  if (espera && !esperaMostrada) { esperaMostrada = true; abrirModalPlanes(); return; }
  if (nuevos.length && cerrada) { marcarVistos(nuevos.map(function (x) { return x.id; })); abrirModalPlanes(); }
}

async function cargarRegistros() {
  actualizarAvisoRegistro();
  var q = await Promise.all([
    sb.from("rnm_registros")
      .select("id, rnm, estado_pago, requiere_pago, estado_pf, unidad_pf, cambio_direccion, ultimo_resultado, ultima_consulta_at, proxima_consulta_at, cerrado, created_at")
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
  datos = { regs: r.data, plan: plan, cargado: true };
  histCache = null;
  cartelPlanes(r.data, plan);
  actualizarPlanes(r.data, plan);
  renderTodo();
}

/* El estado lo actualiza el equipo de FLUJO: la app se refresca sola cada minuto mientras está visible. */
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

function avisoOtraCiudad(x) {
  var aviso = el("div", "res");
  aviso.appendChild(el("h3", "", "¿Tu documento está en otra ciudad?"));
  aviso.appendChild(el("p", "", "Podemos cambiar la dirección de entrega."));
  var quien = (perfilActual && perfilActual.nombre) ? " Soy " + perfilActual.nombre + "." : "";
  var enlace = el("a", "btn", "Cambio de dirección por WhatsApp");
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
  var enlace = el("a", "btn", "Cambio de dirección por WhatsApp");
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
  var caja = el("div", "res " + (otra ? "" : "ok"));
  caja.appendChild(el("h3", "", "Tu documento está en la Polícia Federal de " + donde));
  if (ciudadU && miCiudad) {
    caja.appendChild(el("p", "", mismaCiudad
      ? "Coincide con tu ciudad."
      : "No es tu ciudad (" + miCiudad + "). Podemos cambiar la dirección de entrega."));
  } else if (uf && miUF) {
    caja.appendChild(el("p", "", otra
      ? "No es tu estado. Podemos cambiar la dirección de entrega."
      : "Coincide con tu estado."));
  } else {
    caja.appendChild(el("p", "", "¿No es tu ciudad? Escríbenos " + VIA_CONTACTO + "."));
  }
  if (x.cambio_direccion) {
    var lineas = lineasCambio(x.cambio_direccion);
    caja.appendChild(el("p", "", lineas.length > 1
      ? "Cambios de dirección solicitados:"
      : "Cambio de dirección solicitado:"));
    lineas.forEach(function (l) {
      caja.appendChild(el("p", "sub", (l.fecha ? l.fecha + " · " : "") + (l.destino ? "para retirar en " + l.destino + " · " : "") + l.estado));
    });
    var haciaMiCiudad = miCiudad && lineas.some(function (l) { return l.destino && normalizar(l.destino.split("/")[0]) === normalizar(miCiudad); });
    if (haciaMiCiudad) caja.appendChild(el("p", "", "Pedido hacia tu ciudad: falta que la PF lo atienda."));
  }
  if (WHATSAPP && (otra || !sabeDondeVive || x.cambio_direccion)) {
    caja.appendChild(enlaceWhatsapp(x, "Hola, mi RNM " + x.rnm + " está listo en " + x.unidad_pf + (ciudadU ? " (" + ciudadU + ")" : "") + " y quiero cambiar la dirección de entrega."));
  } else if (!WHATSAPP && (otra || !sabeDondeVive || x.cambio_direccion)) {
    var correo = el("a", "btn", "Escribir a FLUJO para cambiar la dirección");
    correo.href = "mailto:" + CONTACTO_EMAIL + "?subject=" + encodeURIComponent("Cambio de dirección RNM " + x.rnm) + "&body=" + encodeURIComponent("Hola, mi RNM " + x.rnm + " está listo en " + x.unidad_pf + " y quiero cambiar la dirección de entrega.");
    caja.appendChild(correo);
  }
  return caja;
}

function fechaCorta(iso) { return new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "numeric" }); }

/* ---------- Guía de estados (explicaciones generales) ---------- */
var ESTADOS = [
  { re: /pronto para ser retirado|confeccionado/i, tono: "ok", t: "¡Tu documento está listo!",
    p: ["Agenda la entrega en la Policía Federal y lleva tu protocolo y un documento con foto."] },
  { re: /entregue|retirado em/i, tono: "ok", t: "Tu documento ya fue entregado",
    p: ["Si no lo tienes, contáctanos cuanto antes."] },
  { re: /indeferid|negad|rejeitad|arquivad/i, tono: "mal", t: "Tu solicitud tiene un problema",
    p: ["No fue aprobada o fue archivada. Escríbenos " + VIA_CONTACTO + "."] },
  { re: /pend[eê]ncia|exig[eê]ncia|complement|inconsist/i, tono: "aviso", t: "Falta algo en tu trámite",
    p: ["La PF pide documentos. Escríbenos " + VIA_CONTACTO + "."] },
  { re: /an[aá]lise|em andamento|processamento|aguard|confec[cç][aã]o|produ[cç][aã]o/i, tono: "aviso", t: "Tu trámite sigue en proceso",
    p: ["No tienes que hacer nada; seguimos vigilando."] },
  { re: /n[aã]o (foi )?encontrad|nenhum|sin resultados/i, tono: "aviso", t: "No encontramos tu trámite",
    p: ["Revisaremos que tu RNM y fecha sean correctos."] }
];
function explicar(txt) {
  var e = ESTADOS.find(function (x) { return x.re.test(txt); });
  return e || { tono: "aviso", t: "Hay una novedad en tu trámite", p: ["Escríbenos " + VIA_CONTACTO + "."] };
}

/* ---------- Pantallas (diseño Figma): navegación, barra superior y pestañas ---------- */
var datos = { regs: [], plan: null, cargado: false };
var pantalla = "inicio", volverA = "inicio", rnmActualId = null, histFiltro = "todos", histCache = null, editandoPerfil = false;
var RAIZ = { inicio: 1, historial: 1, planes: 1, perfil: 1 };

var ICO = {
  logo: '<svg class="i" viewBox="0 0 24 24"><circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="16" r="2.5"/><path d="M10.5 8H19M5 16h8.5"/></svg>',
  atras: '<svg class="i" viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  ayuda: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.500M12 17h.01"/></svg>',
  der: '<svg class="i" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  doc: '<svg class="i" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"/><path d="M14 3v5h5M12 12v6M9 15h6"/></svg>',
  docReloj: '<svg class="i" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h4M14 3l5 5v3"/><circle cx="17" cy="17" r="4"/><path d="M17 15v2l1 1"/></svg>',
  ok: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>',
  reloj: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  alerta: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/></svg>',
  info: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  mas: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  refrescar: '<svg class="i" viewBox="0 0 24 24"><path d="M20 11a8 8 0 00-14-4M4 4v4h4M4 13a8 8 0 0014 4M20 20v-4h-4"/></svg>',
  chat: '<svg class="i" viewBox="0 0 24 24"><path d="M21 12a8 8 0 01-11.700 7L4 20l1-4.500A8 8 0 1121 12z"/></svg>',
  editar: '<svg class="i" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/></svg>',
  salir: '<svg class="i" viewBox="0 0 24 24"><path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4M15 8l4 4-4 4M19 12H9"/></svg>',
  copias: '<svg class="i" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/></svg>',
  tarjeta: '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/></svg>',
  boleto: '<svg class="i" viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/></svg>'
};

function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function masc(r) { r = r || ""; return r.length > 2 ? r.charAt(0) + "••••••" + r.charAt(r.length - 1) : r; }
function fFecha(iso) { return iso ? new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "") : ""; }
function fFechaHora(iso) {
  if (!iso) return "";
  return fFecha(iso) + " · " + new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function fDiaMes(iso) { return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" }).replace(".", ""); }
function nombre1() { return perfilActual && perfilActual.nombre ? perfilActual.nombre.split(" ")[0] : ""; }
function planActivo() { return !!datos.plan && new Date(datos.plan.vence_at) > new Date(); }
function toast(t) {
  var d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d);
  setTimeout(function () { d.remove(); }, 2600);
}
function soporteUrl(mensaje) {
  return WHATSAPP ? "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(mensaje)
                  : "mailto:" + CONTACTO_EMAIL + "?subject=" + encodeURIComponent("Ayuda RNM") + "&body=" + encodeURIComponent(mensaje);
}

/* Estado de un RNM: etiqueta corta, tono y texto, a partir de lo que devolvió la Policía Federal */
function estadoDe(x) {
  var t = x.ultimo_resultado || "";
  if (!t) return { k: "gris", etq: "Revisión en curso", ico: "reloj", resumen: "Estamos preparando tu primera consulta.", p: ["Registro recibido. Aún sin resultado."] };
  var e = explicar(t), etq, k, resumen;
  if (/entregue|retirado em/i.test(t)) { etq = "Entregado"; k = "ok"; resumen = "Tu documento ya fue entregado."; }
  else if (x.cerrado || /pronto para ser retirado|confeccionado/i.test(t)) { etq = "Listo"; k = "ok"; resumen = "Tu documento ya figura como listo en la última consulta."; }
  else if (/n[aã]o (foi )?encontrad|nenhum|sin resultados/i.test(t)) { etq = "No encontrado"; k = "aviso"; resumen = "No encontramos tu trámite. Revisa los datos."; }
  else if (e.tono === "mal") { etq = "Con problema"; k = "mal"; resumen = "Hay algo que revisar en tu trámite."; }
  else if (/pend[eê]ncia|exig[eê]ncia|complement|inconsist/i.test(t)) { etq = "Falta algo"; k = "aviso"; resumen = "La Policía Federal pide información adicional."; }
  else { etq = "En trámite"; k = "azul"; resumen = "El documento aún no figura como listo en la última consulta."; }
  return { k: k, etq: etq, ico: k === "ok" ? "ok" : (k === "mal" || k === "aviso") ? "alerta" : "reloj", resumen: resumen, p: e.p };
}
function chipClase(k) { return k === "azul" ? "" : " " + k; }
function etiquetaTipo(x, i) { return i === 0 ? "Tu primer RNM" : "RNM adicional"; }

/* ---------- Barra superior ---------- */
var TITULOS = { inicio: "¿Dónde está mi RNM?", historial: "Historial", planes: "Planes y pagos", perfil: "Mi cuenta", rnms: "Mis RNM", detalle: "Detalle de RNM", agregar: "Agregar RNM" };
function renderBar() {
  var v = document.body.getAttribute("data-vista"), izq, titulo, accion = "";
  if (v === "login") { izq = '<div class="logo">' + ICO.logo + '</div>'; titulo = "FLUJO · Cerca de ti"; }
  else if (v === "perfil") {
    titulo = "Completa tu perfil";
    izq = (editandoPerfil || pasoActual > 1) ? '<button class="atras" data-acc="perfil-atras" aria-label="Volver">' + ICO.atras + '</button>' : '<div class="logo">' + ICO.logo + '</div>';
  } else {
    titulo = TITULOS[pantalla] || "";
    izq = RAIZ[pantalla] ? '<div class="logo">' + ICO.logo + '</div>' : '<button class="atras" data-acc="atras" aria-label="Volver">' + ICO.atras + '</button>';
  }
  $("appbar").innerHTML = izq + '<h1>' + esc(titulo) + '</h1><a class="ayuda" href="' + esc(soporteUrl("Hola, necesito ayuda con la app ¿Dónde está mi RNM?")) + '" target="_blank" rel="noopener" aria-label="Ayuda">' + ICO.ayuda + '</a>';
}

function ir(nombre, opts) {
  opts = opts || {};
  if (!RAIZ[nombre] && RAIZ[pantalla]) volverA = pantalla;
  pantalla = nombre;
  if (opts.rnm) rnmActualId = opts.rnm;
  ["inicio", "rnms", "detalle", "agregar", "historial", "planes", "perfil"].forEach(function (p) { $("t-" + p).classList.toggle("oculto", p !== nombre); });
  var tab = RAIZ[nombre] ? nombre : (volverA && RAIZ[volverA] ? volverA : "inicio");
  document.querySelectorAll(".nav button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === tab); });
  renderPantalla(nombre);
  renderBar();
  window.scrollTo(0, 0);
}
function renderPantalla(n) {
  if (n === "inicio") renderInicio();
  else if (n === "rnms") renderRnms();
  else if (n === "detalle") renderDetalle();
  else if (n === "agregar") prepararAgregar();
  else if (n === "historial") renderHistorial();
  else if (n === "planes") renderPlanes();
  else if (n === "perfil") renderPerfil();
}
function renderTodo() { if (document.body.getAttribute("data-vista") === "app") renderPantalla(pantalla); renderBar(); }
function saludo() { renderTodo(); }

/* ---------- Inicio ---------- */
function filaRnm(x, i) {
  var e = estadoDe(x);
  return '<button class="item" data-acc="detalle" data-id="' + esc(x.id) + '"><div class="nombre">RNM ' + esc(masc(x.rnm)) + ICO.der + '</div>' +
    '<span class="chip' + chipClase(e.k) + '">' + esc(e.etq) + '</span>' +
    '<div class="meta">' + esc(etiquetaTipo(x, i)) + (x.ultima_consulta_at ? ' · ' + esc(fFechaHora(x.ultima_consulta_at)) : ' · Aún sin resultado') + '</div></button>';
}
function renderInicio() {
  var regs = datos.regs, n = nombre1();
  var h = '<p class="eyebrow">Tu seguimiento</p><h1 class="t">Hola' + (n ? ', ' + esc(n) : '') + '</h1>';
  if (!regs.length) {
    h += '<p class="sub">Tu perfil está listo. Ahora podemos empezar con tu documento.</p>' +
      '<div class="tarjeta vacio"><div class="ico">' + ICO.doc + '</div><h2>Todavía no tienes RNM</h2>' +
      '<p>Añade el número de tu documento y tu fecha de nacimiento para solicitar la primera consulta.</p>' +
      '<button class="btn" data-acc="agregar">' + ICO.mas + 'Agregar mi primer RNM</button></div>' +
      '<div class="tarjeta"><p class="eyebrow" style="margin:0 0 8px">Tu primera consulta es gratis</p><p style="color:var(--txt)">Para el primer RNM de tu cuenta. Los RNM adicionales requieren un plan mensual desde R$ 4,99.</p><p class="nota">Máximo 4 RNM por cuenta.</p></div>' +
      '<p class="nota">La primera revisión puede tardar. El seguimiento con plan se realiza cada 7 días, no en tiempo real.</p>' +
      '<p class="nota">Servicio independiente desarrollado por FLUJO. No es un canal oficial de la PF.</p>';
  } else {
    var p = regs[0], e = estadoDe(p);
    h += '<p class="sub" style="margin-bottom:0">Aquí está lo último sobre tu documento.</p>' +
      '<div class="hero"><div class="rn"><span>RNM ' + esc(masc(p.rnm)) + '</span>' + ICO.docReloj + '</div><h2>' + esc(e.etq) + '</h2><p>' + esc(e.resumen) + '</p>' +
      (p.ultima_consulta_at ? '<small>Consultado el ' + esc(fFechaHora(p.ultima_consulta_at)) + '</small>' : '<small>Aún sin resultado</small>') +
      '<button class="btn blanco" data-acc="detalle" data-id="' + esc(p.id) + '">Ver detalle de mi RNM</button></div>';
    var proxima = regs.filter(function (x) { return !x.cerrado && x.cubierto && x.proxima_consulta_at; }).map(function (x) { return x.proxima_consulta_at; }).sort()[0];
    if (planActivo()) {
      h += '<div class="tarjeta"><span class="chip">Plan activo</span><h3 style="margin-top:14px">' + (proxima ? 'Próxima revisión: ' + esc(fDiaMes(proxima)) : 'Plan activo hasta el ' + esc(fFecha(datos.plan.vence_at))) + '</h3>' +
        '<p>Mientras el plan esté activo, revisamos cada 7 días hasta que el documento esté listo.</p></div>';
    } else {
      h += '<div class="tarjeta"><span class="chip gris">Sin plan activo</span><h3 style="margin-top:14px">Tu primera consulta es gratis</h3><p>Para seguir revisando cada 7 días, elige un plan.</p>' +
        '<button class="btn sec" data-acc="tab" data-tab="planes" style="margin-top:12px">Ver planes</button></div>';
    }
    if (regs.length > 1) {
      h += '<div class="titulo-sec"><h2>Otros RNM</h2><button data-acc="rnms">Ver todos</button></div>';
      regs.slice(1, 3).forEach(function (x, i) { h += filaRnm(x, i + 1); });
    }
    if (regs.length < 4) h += '<button class="btn sec" data-acc="agregar">' + ICO.mas + 'Agregar RNM</button>';
    h += '<button class="btn sec" id="btn-refrescar" data-acc="refrescar">' + ICO.refrescar + 'Actualizar pantalla</button>' +
      '<p class="nota">Actualiza lo que ves; no inicia una nueva consulta ante la PF. El seguimiento no es en tiempo real.</p>' +
      '<p class="nota">Servicio independiente desarrollado por FLUJO. No es un canal oficial de la PF.</p>';
  }
  $("t-inicio").innerHTML = h;
}

/* ---------- Mis RNM ---------- */
function renderRnms() {
  var regs = datos.regs;
  var h = '<h1 class="t">Tus documentos, juntos</h1><p class="sub">Elige un RNM para ver su detalle y el próximo paso.</p>' +
    '<div class="fila"><b style="font-size:.9rem">' + regs.length + ' RNM registrado' + (regs.length === 1 ? '' : 's') + '</b><span class="nota" style="margin:0">Máximo 4</span></div>';
  regs.forEach(function (x, i) { h += filaRnm(x, i); });
  h += regs.length < 4 ? '<button class="btn sec" data-acc="agregar">' + ICO.mas + 'Agregar RNM</button>'
    : '<div class="aviso">' + ICO.info + '<div>Tu cuenta ya tiene 4 RNM. Al intentar agregar otro, verás la orientación sobre este límite.</div></div>';
  $("t-rnms").innerHTML = h;
}

/* ---------- Detalle de un RNM ---------- */
function renderDetalle() {
  var c = $("t-detalle"), i = -1;
  datos.regs.forEach(function (x, k) { if (x.id === rnmActualId) i = k; });
  if (i < 0) { c.innerHTML = ""; return; }
  var x = datos.regs[i], e = estadoDe(x);
  var h = '<p class="eyebrow">' + esc(etiquetaTipo(x, i)).toUpperCase() + '</p><h1 class="t">RNM ' + esc(masc(x.rnm)) + '</h1>' +
    '<div class="estado ' + e.k + '"><div class="ico">' + ICO[e.ico] + '</div><h2>' + esc(e.etq === "Listo" ? "Documento listo" : e.etq) + '</h2>' +
    e.p.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join("") + '</div>';
  if (x.ultima_consulta_at) h += '<div class="ult">Última consulta<b>' + esc(fFechaHora(x.ultima_consulta_at)) + '</b></div>';
  h += '<div id="det-extra"></div>';
  if (!x.cerrado && x.cubierto) h += '<div class="aviso">' + ICO.info + '<div>Seguimiento semanal activo hasta el ' + esc(fFecha(x.planVence)) + '.</div></div>';
  else if (!x.cerrado && (x.ultimo_resultado || x.requiere_pago)) h += '<div class="aviso">' + ICO.info + '<div>Para seguir revisándolo cada 7 días, elige un plan.</div></div><button class="btn" data-acc="tab" data-tab="planes">Ver planes</button>';
  h += '<button class="btn sec" data-acc="historial-de" data-id="' + esc(x.id) + '">Ver historial</button>';
  if (!x.cerrado) h += '<div style="text-align:center;margin-top:14px"><button class="btn-texto peligro" data-acc="quitar" data-id="' + esc(x.id) + '">Quitar este RNM</button></div>';
  h += '<p class="nota">El seguimiento semanal de este RNM llega hasta que el documento está listo. FLUJO no decide sobre tu trámite.</p>';
  c.innerHTML = h;
  if (x.estado_pf === "listo") {
    var cont = $("det-extra"), caja = null;
    if (x.unidad_pf) caja = cajaUnidad(x); else if (WHATSAPP) caja = avisoOtraCiudad(x);
    if (caja) cont.appendChild(caja);
  }
}

/* ---------- Historial ---------- */
async function cargarHistorial() {
  var q = await sb.from("rnm_consultas").select("id, registro_id, resultado_texto, created_at").order("created_at", { ascending: false }).limit(100);
  var filas = (!q.error && q.data) ? q.data.map(function (c) { return { id: c.id, reg: c.registro_id, texto: c.resultado_texto, fecha: c.created_at }; }) : [];
  if (!filas.length) { // sin historial guardado visible: se muestra la última consulta de cada RNM
    filas = datos.regs.filter(function (x) { return x.ultima_consulta_at; }).map(function (x) { return { id: x.id, reg: x.id, texto: x.ultimo_resultado, fecha: x.ultima_consulta_at }; })
      .sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
  }
  histCache = filas;
}
function renderHistorial() {
  var c = $("t-historial");
  if (!histCache) { c.innerHTML = '<h1 class="t">Lo que hemos consultado</h1><p class="sub">Cargando…</p>'; cargarHistorial().then(function () { if (pantalla === "historial") renderHistorial(); }); return; }
  var regs = datos.regs;
  var h = '<h1 class="t">Lo que hemos consultado</h1><p class="sub">Resultados por fecha, del más reciente al más antiguo.</p><div class="chips"><button class="' + (histFiltro === "todos" ? "on" : "") + '" data-acc="filtro" data-id="todos">Todos mis RNM</button>';
  regs.forEach(function (x) { h += '<button class="' + (histFiltro === x.id ? "on" : "") + '" data-acc="filtro" data-id="' + esc(x.id) + '">' + esc(masc(x.rnm)) + '</button>'; });
  h += '</div>';
  var filas = histCache.filter(function (f) { return histFiltro === "todos" || f.reg === histFiltro; });
  if (!filas.length) h += '<div class="aviso">' + ICO.info + '<div>Aún no hay consultas para mostrar.</div></div>';
  var grupo = "";
  filas.forEach(function (f) {
    var reg = regs.filter(function (x) { return x.id === f.reg; })[0];
    if (!reg) return;
    var g = new Date(f.fecha).toLocaleDateString("es", { month: "long", year: "numeric" });
    if (g !== grupo) { if (grupo) h += '</div>'; grupo = g; h += '<h2 class="grupo">' + esc(g.charAt(0).toUpperCase() + g.slice(1)) + '</h2><div class="tabla">'; }
    var e = estadoDe({ ultimo_resultado: f.texto, cerrado: false });
    h += '<button data-acc="detalle" data-id="' + esc(reg.id) + '"><div class="f1"><span>' + esc(fFechaHora(f.fecha)) + '</span>' + ICO.der + '</div>' +
      '<div class="f2"><span>RNM ' + esc(masc(reg.rnm)) + '</span><span class="chip' + chipClase(e.k) + '">' + esc(e.etq) + '</span></div></button>';
  });
  if (grupo) h += '</div>';
  h += '<button class="btn sec" data-acc="actualizar-hist">' + ICO.refrescar + 'Actualizar historial</button><p class="nota">Actualiza la lista visible, no ejecuta una nueva consulta ante la PF.</p>';
  c.innerHTML = h;
}

/* ---------- Planes ---------- */
function renderPlanes() {
  var regs = datos.regs, abiertos = regs.filter(function (r) { return !r.cerrado; }).length, activo = planActivo(), p = datos.plan;
  var h = '<h1 class="t">Sigue tu RNM, semana a semana</h1>';
  h += activo ? '<p class="sub">Tu plan está activo. Revisamos cada 7 días hasta que el documento esté listo.</p>'
              : '<p class="sub">No tienes un plan activo. Tu primera consulta del primer RNM es gratuita.</p>';
  var accion = abiertos ? 'planes-abrir' : 'agregar';
  if (activo) {
    h += '<div class="plan-card"><div class="eb">Plan activo</div><div class="desde">Cubre hasta ' + p.cupos + ' RNM</div><div class="precio-g">' + esc(reales(p.precio_centavos)) + '</div>' +
      '<div style="color:#d3def6">por mes · pagado hasta el ' + esc(fFecha(p.vence_at)) + '</div><p></p>' +
      (abiertos ? '<button class="btn blanco" data-acc="planes-abrir">Cambiar o ampliar plan</button>' : '') + '</div>';
  } else {
    h += '<div class="plan-card"><div class="eb">Seguimiento mensual</div><div class="desde">Desde</div><div class="precio-g">R$ 4,99</div><div style="color:#d3def6">por mes</div>' +
      '<p>Revisión cada 7 días mientras el plan esté activo, hasta que el documento esté listo.</p>' +
      '<button class="btn blanco" data-acc="' + accion + '">' + (abiertos ? 'Elegir forma de pago' : 'Primero registra un RNM') + '</button></div>';
  }
  h += '<h2 style="margin-top:26px">Antes de activar</h2><div class="tarjeta antes" style="margin-top:12px">' +
    '<div>' + ICO.copias + '<p style="margin:0"><b>RNM adicionales</b><span>Requieren un plan mensual. Máximo 4 RNM por cuenta.</span></p></div>' +
    '<div>' + ICO.tarjeta + '<p style="margin:0"><b>Tarjeta</b><span>Renovación mensual automática.</span></p></div>' +
    '<div>' + ICO.boleto + '<p style="margin:0"><b>Pix o boleto</b><span>Pagan un mes cada vez; el plan se activa al confirmarse el pago.</span></p></div></div>' +
    '<div class="aviso">' + ICO.info + '<div>El servicio no es en tiempo real ni garantiza plazos o decisiones de la Policía Federal.</div></div>';
  $("t-planes").innerHTML = h;
}

/* ---------- Perfil / cuenta ---------- */
function renderPerfil() {
  var p = perfilActual || {}, email = (usuarioActual && usuarioActual.email) || "";
  var ini = (p.nombre || email || "?").split(/\s+/).slice(0, 2).map(function (s) { return s.charAt(0); }).join("").toUpperCase();
  var cep = p.cep ? p.cep.slice(0, 5) + "-" + p.cep.slice(5) : "";
  var h = '<div class="avatar-fila"><div class="avatar">' + esc(ini) + '</div><div><b>' + esc(p.nombre || "Mi cuenta") + '</b><span class="nota" style="margin:0">' + esc(email) + '</span></div></div>' +
    '<div class="fila" style="margin-top:22px"><h2 style="margin:0">Tus datos</h2><button class="btn-texto" data-acc="editar-datos">Editar</button></div>' +
    '<div class="tarjeta dato" style="margin-top:12px"><small>Nombre completo</small><b>' + esc(p.nombre) + '</b><small>Email de Google</small><b>' + esc(email) + '</b>' +
    '<small>Teléfono / WhatsApp</small><b>' + esc(p.telefono ? "+" + p.telefono : "") + '</b><hr><small>Dirección' + (cep ? ' · CEP ' + esc(cep) : '') + '</small><b>' + esc(p.direccion) + '</b>' +
    '<small>Ciudad / UF</small><b>' + esc(p.ciudad) + (p.estado ? ' / ' + esc(p.estado) : '') + '</b></div>' +
    '<button class="btn sec" data-acc="editar-datos">' + ICO.editar + 'Editar mis datos</button>' +
    '<p class="nota">Editar vuelve a los mismos 3 pasos de tu perfil: nombre, teléfono y dirección.</p>' +
    '<div class="tarjeta"><span class="chip">Acceso con Google</span><p style="margin:12px 0">Tu contraseña se gestiona en Google. FLUJO no permite cambiarla desde aquí.</p>' +
    '<button class="fila-op" data-acc="salir">Cerrar sesión' + ICO.salir + '</button></div>' +
    '<div class="tarjeta"><h3>Tu cuenta y tus datos</h3><p>Puedes solicitar la eliminación al soporte. No se realiza automáticamente desde esta pantalla.</p>' +
    '<a class="fila-op peligro" style="text-decoration:none;margin-top:12px" href="' + esc(soporteUrl("Hola, quiero solicitar la eliminación de mi cuenta y mis datos en ¿Dónde está mi RNM?")) + '" target="_blank" rel="noopener">Solicitar eliminación por soporte' + ICO.chat + '</a></div>' +
    '<a class="btn sec" href="' + esc(soporteUrl("Hola, necesito ayuda con la app ¿Dónde está mi RNM?")) + '" target="_blank" rel="noopener">Ayuda y soporte</a>' +
    '<p class="nota" style="text-align:center"><a href="privacidad.html" style="color:var(--azul)">Privacidad</a> · <a href="terminos.html" style="color:var(--azul)">Términos</a></p>';
  $("t-perfil").innerHTML = h;
}

/* ---------- Agregar RNM (2 pasos: datos y revisión) ---------- */
function prepararAgregar() {
  var lleno = datos.regs.length >= 4;
  $("agregar-paso1").classList.toggle("oculto", lleno);
  $("agregar-paso2").classList.add("oculto");
  $("tope-4").classList.toggle("oculto", !lleno);
  msg("msg-form", ""); msg("msg-revision", "");
}

/* ---------- Acciones (clics en cualquier pantalla) ---------- */
var ACC = {
  atras: function () { ir(volverA || "inicio"); },
  tab: function (b) { ir(b.getAttribute("data-tab")); },
  agregar: function () { ir("agregar"); },
  rnms: function () { ir("rnms"); },
  detalle: function (b) { ir("detalle", { rnm: b.getAttribute("data-id") }); },
  refrescar: function (b) { b.disabled = true; cargarRegistros().then(function () { toast("Pantalla actualizada"); }); },
  filtro: function (b) { histFiltro = b.getAttribute("data-id"); renderHistorial(); },
  "historial-de": function (b) { histFiltro = b.getAttribute("data-id"); ir("historial"); },
  "actualizar-hist": function () { histCache = null; renderHistorial(); },
  "planes-abrir": function () { abrirModalPlanes(); },
  "editar-datos": function () { abrirPerfil(true); },
  salir: function () { sb.auth.signOut(); },
  "perfil-atras": function () { if (pasoActual > 1) irAPaso(pasoActual - 1); else if (editandoPerfil) vista("app"); },
  quitar: async function (b) {
    if (!confirm("¿Quitar este RNM? Se borrarán sus datos.")) return;
    await sb.from("rnm_registros").delete().eq("id", b.getAttribute("data-id"));
    toast("RNM quitado"); ir("inicio"); cargarRegistros();
  }
};
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-acc]");
  if (b && ACC[b.getAttribute("data-acc")]) ACC[b.getAttribute("data-acc")](b);
  var t = e.target.closest(".nav button");
  if (t) ir(t.getAttribute("data-tab"));
});


iniciar();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
