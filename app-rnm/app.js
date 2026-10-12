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
  ["login", "perfil", "app"].forEach(function (v) {
    $("vista-" + v).classList.toggle("oculto", v !== nombre);
  });
}

async function mostrar(session) {
  var cambio = (session && session.user && session.user.id) !== (usuarioActual && usuarioActual.id);
  usuarioActual = session ? session.user : null;
  if (!session) { perfilActual = null; return vista("login"); }
  if (!cambio) return;
  $("quien").textContent = session.user.email || "";
  var r = await sb.from("rnm_perfiles").select("*").eq("user_id", session.user.id).maybeSingle();
  perfilActual = r.data || null;
  if (!perfilActual) { abrirPerfil(false); }
  else { vista("app"); cargarRegistros(); }
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

$("btn-datos").addEventListener("click", function () { abrirPerfil(true); });
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
$("btn-salir").addEventListener("click", function () { sb.auth.signOut(); });

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

$("form-rnm").addEventListener("submit", async function (e) {
  e.preventDefault();
  msg("msg-form", "");
  var rnm = $("rnm").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  var iso = fechaISO($("nac").value.trim());
  if (!/^[A-Z0-9]{6,12}$/.test(rnm)) return msg("msg-form", "Revisa tu número de RNM.");
  if (!iso) return msg("msg-form", "La fecha debe ser válida, con formato dd/mm/aaaa.");
  if (!$("consiento").checked) return msg("msg-form", "Debes aceptar la autorización para continuar.");
  var btn = $("btn-registrar"); btn.disabled = true;
  var r = await sb.from("rnm_registros").insert({ user_id: usuarioActual.id, rnm: rnm, fecha_nacimiento: iso });
  btn.disabled = false;
  if (r.error) {
    if ((r.error.message || "").indexOf("limite_4_rnm") >= 0) return msg("msg-form", "Llegaste al máximo de 4 RNM por cuenta.");
    return msg("msg-form", r.error.code === "23505" ? "Ese RNM ya está registrado en una cuenta. Si es tuyo y no lo ves en tu lista, escríbenos a flujoescalaempresas@gmail.com y lo resolvemos." : "No pudimos guardarlo. Intenta de nuevo.");
  }
  $("form-rnm").reset();
  msg("msg-form", gratisDisponible
    ? "Listo. Haremos tu primera consulta gratis y verás aquí el resultado."
    : "Listo. Este RNM es adicional: elige un plan abajo para que lo consultemos.", true);
  cargarRegistros();
});

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
  c.appendChild(el("p", "sub", "Plan de " + cupos + " RNM · " + reales(PRECIOS[cupos]) + " al mes. Se cobra cada mes a tu tarjeta y puedes cancelar cuando quieras."));
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
    '<div class="acciones"><button type="submit" id="btn-pagar-tarjeta">Pagar ' + reales(PRECIOS[cupos]) + ' al mes</button>' +
    '<button type="button" class="sec" id="btn-volver-planes">Volver</button></div>' +
    '<p class="sub" style="margin-top:10px">🔒 Pago procesado por Mercado Pago. Tus datos de tarjeta no pasan por FLUJO.</p>' +
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
    espera.appendChild(el("p", "sub", "Mercado Pago nos está avisando. Puede tardar un minuto; esta pantalla se actualiza sola."));
    var cerrarEspera = el("button", "sec", "Cerrar"); cerrarEspera.type = "button";
    cerrarEspera.addEventListener("click", cerrarModalPlanes);
    espera.appendChild(cerrarEspera);
    cont.appendChild(espera);
    return;
  }
  if (activo && plan.cupos >= necesita) {
    var ok = el("div", "tarjeta");
    ok.appendChild(el("h2", "", "Tu plan está activo"));
    ok.appendChild(el("p", "sub", "Cubre hasta " + plan.cupos + " RNM (" + reales(plan.precio_centavos) + " al mes) y está pagado hasta el " + fechaCorta(plan.vence_at) + "."));
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
    ? "Amplía tu plan para que también vigilemos los demás."
    : "Tu primera consulta es gratis. Para seguir vigilando, elige cuántos RNM quieres cubrir. Pago mensual; puedes cancelar cuando quieras."));
  var grid = el("div", "planes");
  [1, 2, 3, 4].forEach(function (n) {
    var b = el("button", "plan" + (n === planElegido ? " sel" : ""));
    b.type = "button";
    b.appendChild(el("b", "", n + (n === 1 ? " RNM" : " RNM")));
    b.appendChild(el("span", "precio", reales(PRECIOS[n]) + " /mes"));
    b.appendChild(el("small", "", reales(Math.round(PRECIOS[n] / n)) + " por RNM"));
    if (n > 1) {
      b.appendChild(el("small", "ahorro", "Ahorras " + porcentajeAhorro(n) + "%"));
      b.appendChild(el("small", "", n + " por separado: " + reales(n * PRECIOS[1]) + " · ahorras " + reales(ahorro(n))));
    }
    if (n === 4) b.appendChild(el("small", "mejor", "Mejor precio por RNM"));
    b.addEventListener("click", function () { planElegido = n; cartelPlanes(regs, plan); });
    grid.appendChild(b);
  });
  c.appendChild(grid);
  c.appendChild(el("p", "sub", "El ahorro se calcula frente a pagar R$ 4,99 por cada RNM por separado."));
  var acc = el("div", "acciones");
  var pagar = el("button", "", (activo ? "Ampliar a " : "Suscribirme: ") + planElegido + " RNM por " + reales(PRECIOS[planElegido]) + " al mes");
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
document.addEventListener("keydown", function (e) { if (e.key === "Escape") cerrarModalPlanes(); });
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
  var lleno = r.data.length >= 4;
  $("form-rnm").classList.toggle("oculto", lleno);
  $("tope-4").classList.toggle("oculto", !lleno);
  cartelPlanes(r.data, plan);
  actualizarPlanes(r.data, plan);
  var cont = $("lista");
  cont.textContent = "";
  r.data.slice().reverse().forEach(function (x) { cont.appendChild(tarjeta(x)); });
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
  var caja = el("div", "res " + (otra ? "" : "ok"));
  caja.appendChild(el("h3", "", "Tu documento está en la Polícia Federal de " + donde));
  caja.appendChild(el("p", "", "Unidad: " + x.unidad_pf));
  if (ciudadU && miCiudad) {
    caja.appendChild(el("p", "", mismaCiudad
      ? "Coincide con la ciudad donde vives (" + miCiudad + ")."
      : "Tu ciudad registrada es " + miCiudad + ". Si esta unidad no te queda cerca, podemos ayudarte con el cambio de dirección."));
  } else if (uf && miUF) {
    caja.appendChild(el("p", "", otra
      ? "Es distinta al estado donde vives (" + ESTADOS_BR[miUF] + "). Si no puedes ir hasta allá, podemos ayudarte con el cambio de dirección."
      : "Coincide con el estado donde vives (" + ESTADOS_BR[miUF] + ")."));
  } else {
    caja.appendChild(el("p", "", "Revisa que esté en tu ciudad. Si no, escríbenos " + VIA_CONTACTO + " y te ayudamos con el cambio de dirección."));
  }
  if (x.cambio_direccion) {
    var lineas = lineasCambio(x.cambio_direccion);
    caja.appendChild(el("p", "", lineas.length > 1
      ? "La Polícia Federal registra " + lineas.length + " solicitudes de cambio de dirección en tu trámite:"
      : "La Polícia Federal registra una solicitud de cambio de dirección en tu trámite:"));
    lineas.forEach(function (l) {
      caja.appendChild(el("p", "sub", (l.fecha ? l.fecha + " · " : "") + (l.destino ? "para retirar en " + l.destino + " · " : "") + l.estado));
    });
    var haciaMiCiudad = miCiudad && lineas.some(function (l) { return l.destino && normalizar(l.destino.split("/")[0]) === normalizar(miCiudad); });
    if (haciaMiCiudad) caja.appendChild(el("p", "", "Pediste el cambio hacia tu ciudad (" + miCiudad + "): solo falta que la Polícia Federal lo atienda."));
  } else {
    caja.appendChild(el("p", "sub", "No hay solicitudes de cambio de dirección en tu trámite."));
  }
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

function tarjeta(x) {
  var t = el("div", "tarjeta");
  var fila = el("div", "fila");
  fila.appendChild(el("span", "rnm", x.rnm));
  var consultado = !!x.ultimo_resultado;
  var etiqueta, clase = "";
  if (x.cerrado) { etiqueta = "Listo"; clase = " ok"; }
  else if (x.cubierto) { etiqueta = "Vigilando hasta " + fechaCorta(x.planVence); clase = " vigila"; }
  else if (consultado) { etiqueta = x.tuvoPlan ? "Sin cobertura" : "Primera consulta lista"; clase = x.tuvoPlan ? "" : " vigila"; }
  else if (x.requiere_pago) { etiqueta = "Pendiente de plan"; }
  else { etiqueta = "Consultando (gratis)"; }
  fila.appendChild(el("span", "insignia" + clase, etiqueta));
  t.appendChild(fila);

  if (consultado) t.appendChild(cajaResultado(x));
  else if (x.cubierto) t.appendChild(el("p", "sub", "Plan activo. En breve haremos la revisión y verás aquí el resultado."));
  else if (x.requiere_pago) t.appendChild(el("p", "sub", "Este RNM se consulta cuando actives un plan que lo cubra (mira el cuadro de planes más arriba)."));
  else t.appendChild(el("p", "sub", "Estamos haciendo tu primera consulta, es gratis. Verás aquí el resultado."));

  if (x.estado_pf === "listo") {
    if (x.unidad_pf) t.appendChild(cajaUnidad(x));
    else if (WHATSAPP) t.appendChild(avisoOtraCiudad(x));
  }

  if (!x.cerrado && !x.cubierto && consultado) t.appendChild(el("p", "sub", "Para seguir vigilándolo, elige un plan en el cuadro de arriba."));
  if (!x.cerrado && x.cubierto) t.appendChild(el("p", "sub", "Plan activo hasta el " + fechaCorta(x.planVence) + ". Revisamos tu RNM periódicamente y esta pantalla se actualiza sola."));

  if (!x.cerrado) { // puede quitarlo (por ejemplo si se equivocó de número)
    var q = el("div", "acciones");
    var borrar = el("button", "sec", "Quitar este RNM");
    borrar.type = "button";
    borrar.addEventListener("click", async function () {
      if (!confirm("¿Quitar este RNM? Se borrarán sus datos.")) return;
      await sb.from("rnm_registros").delete().eq("id", x.id);
      cargarRegistros();
    });
    q.appendChild(borrar);
    t.appendChild(q);
  }
  return t;
}

/* ---------- Guía de estados (explicaciones generales) ---------- */
var ESTADOS = [
  { re: /pronto para ser retirado|confeccionado/i, tono: "ok", t: "¡Tu documento está listo!",
    p: ["Ya puedes retirar tu carné (CRNM) en la unidad de la Policía Federal.",
        "Agenda la entrega en el sitio de la Policía Federal (sección “Entrega de CRNM”) y lleva tu protocolo y un documento con foto."] },
  { re: /entregue|retirado em/i, tono: "ok", t: "Tu documento ya fue entregado",
    p: ["El sistema indica que el carné ya fue entregado. Si no lo tienes, contáctanos cuanto antes."] },
  { re: /indeferid|negad|rejeitad|arquivad/i, tono: "mal", t: "Tu solicitud tiene un problema",
    p: ["El sistema indica que no fue aprobada o fue archivada.", "Escríbenos " + VIA_CONTACTO + " para revisar tu caso."] },
  { re: /pend[eê]ncia|exig[eê]ncia|complement|inconsist/i, tono: "aviso", t: "Falta algo en tu trámite",
    p: ["La Policía Federal pide información o documentos adicionales.", "Escríbenos " + VIA_CONTACTO + " y te ayudamos a responder a tiempo."] },
  { re: /an[aá]lise|em andamento|processamento|aguard|confec[cç][aã]o|produ[cç][aã]o/i, tono: "aviso", t: "Tu trámite sigue en proceso",
    p: ["Tu solicitud está siendo analizada o el carné está en fabricación.", "No tienes que hacer nada por ahora; seguimos vigilando."] },
  { re: /n[aã]o (foi )?encontrad|nenhum|sin resultados/i, tono: "aviso", t: "No encontramos tu trámite",
    p: ["Revisaremos que tu RNM y tu fecha estén correctos.", "Si algo no coincide con tu documento, te escribiremos."] }
];
function explicar(txt) {
  var e = ESTADOS.find(function (x) { return x.re.test(txt); });
  return e || { tono: "aviso", t: "Hay una novedad en tu trámite", p: ["Escríbenos " + VIA_CONTACTO + " y te la explicamos."] };
}

iniciar();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
