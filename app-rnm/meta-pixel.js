/* Medición de anuncios (píxel de Meta) con consentimiento. Sin aceptar, NO se carga nada de Meta.
   Eventos: PageView, CompleteRegistration (primer RNM registrado), InitiateCheckout (abre el pago), Purchase (plan pagado).
   Con consentimiento también se envía la "coincidencia avanzada": correo, teléfono, nombre, ciudad, estado, CEP, país e id interno,
   SIEMPRE encriptados (SHA-256) en el navegador. Nunca se envía el RNM, el estado del trámite, la dirección completa ni el CPF. */
(function () {
  "use strict";
  /* Píxel PROPIO de la app (mirnm.com.br). El conjunto 1799560864530535 queda solo para el WhatsApp de trámites. */
  var PIXEL_ID = "1603342470739530";
  var CLAVE = "rnm_consent_pixel";
  var cargado = false;
  var identidad = null;   // { user, perfil } de la última sesión conocida
  var contexto = {};      // datos no sensibles que se suman a cada evento (ciudad, estado)

  function leer() { try { return localStorage.getItem(CLAVE); } catch (e) { return null; } }
  function guardar(v) { try { localStorage.setItem(CLAVE, v); } catch (e) { /* sin almacenamiento */ } }

  function cargarPixel() {
    if (cargado) return; cargado = true;
    /* Código estándar del píxel de Meta */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", PIXEL_ID);
    window.fbq("track", "PageView");
  }

  /* SHA-256 en hexadecimal (formato que pide Meta). */
  function sha256(t) {
    if (!(window.crypto && crypto.subtle && window.TextEncoder)) return Promise.resolve(null);
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    }).catch(function () { return null; });
  }
  function sinAcentos(t) { return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function soloLetras(t) { return sinAcentos(t).toLowerCase().replace(/[^a-z]/g, ""); }

  /* Coincidencia avanzada: se llama al iniciar sesión y al guardar el perfil. */
  window.rnmIdentificar = function (user, perfil) {
    identidad = { user: user || null, perfil: perfil || null };
    if (leer() !== "si" || !user) return;
    cargarPixel();
    var p = perfil || {};
    var tel = String(p.telefono || "").replace(/\D/g, "");
    var partes = sinAcentos(p.nombre || "").toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/).filter(Boolean);
    var cep = String(p.cep || "").replace(/\D/g, "");
    var campos = {
      em: user.email ? String(user.email).trim().toLowerCase() : "",
      ph: tel.length >= 10 ? (tel.length <= 11 ? "55" + tel : tel) : "",
      fn: partes[0] || "",
      ln: partes.length > 1 ? partes[partes.length - 1] : "",
      ct: soloLetras(p.ciudad),
      st: soloLetras(p.estado).slice(0, 2),
      zp: cep.length === 8 ? cep : "",
      country: "br",
      external_id: String(user.id || "")
    };
    var claves = Object.keys(campos).filter(function (k) { return campos[k]; });
    Promise.all(claves.map(function (k) { return sha256(campos[k]); })).then(function (hs) {
      var ud = {};
      claves.forEach(function (k, i) { if (hs[i]) ud[k] = hs[i]; });
      try { window.fbq("init", PIXEL_ID, ud); } catch (e) { /* sin píxel */ }
    });
    setTimeout(function () { if (typeof window.rnmMetaConsent === "function") { try { window.rnmMetaConsent({ fbp: cookie("_fbp"), fbc: cookie("_fbc") }); } catch (e) { /* sin servidor */ } } }, 2500);
    contexto = {};
    if (p.ciudad) contexto.ciudad = String(p.ciudad).slice(0, 80);
    if (p.estado) contexto.estado = String(p.estado).slice(0, 2).toUpperCase();
  };

  function cookie(n) { var m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)")); return m ? decodeURIComponent(m[1]) : ""; }

  /* Los eventos solo salen si hay consentimiento. Además del píxel se envían por el servidor (misma id: Meta los cuenta una vez). */
  window.rnmTrack = function (evento, datos, id) {
    if (leer() !== "si") return;
    cargarPixel();
    var d = {}; var k;
    for (k in contexto) d[k] = contexto[k];
    for (k in (datos || {})) d[k] = datos[k];
    try { window.fbq("track", evento, d, id ? { eventID: id } : undefined); } catch (e) { /* sin píxel */ }
    if (typeof window.rnmMetaServidor === "function") {
      try { window.rnmMetaServidor({ evento: evento, event_id: id || "", valor: d.value, moneda: d.currency, nombre_contenido: d.content_name,
        fbp: cookie("_fbp"), fbc: cookie("_fbc"), url: location.href }); } catch (e) { /* sin servidor */ }
    }
  };

  function aviso() {
    if (leer()) return;
    var d = document.createElement("div");
    d.className = "consent-pixel"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Medición de anuncios");
    d.innerHTML = '<p>Medimos si nuestros anuncios funcionan (por ejemplo, si te registras) con el píxel de Meta y, para que Meta muestre nuestros anuncios a personas parecidas a ti, le enviamos tus datos de contacto y ciudad <b>encriptados</b>. Nunca enviamos tu RNM ni el estado de tu trámite. Solo se activa si aceptas. <a href="privacidad.html">Más información</a></p>' +
      '<div class="consent-pixel-acc"><button type="button" class="btn sec" id="cp-no">No, gracias</button><button type="button" class="btn" id="cp-si">Aceptar</button></div>';
    document.body.appendChild(d);
    function cerrar(v) { guardar(v); d.remove(); if (v === "si") { cargarPixel(); if (identidad) window.rnmIdentificar(identidad.user, identidad.perfil); } }
    d.querySelector("#cp-si").addEventListener("click", function () { cerrar("si"); });
    d.querySelector("#cp-no").addEventListener("click", function () { cerrar("no"); });
  }

  if (leer() === "si") cargarPixel();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", aviso); else aviso();
})();
