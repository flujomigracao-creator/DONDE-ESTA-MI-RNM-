/* Medición de anuncios (píxel de Meta) con consentimiento. Sin aceptar, NO se carga nada de Meta.
   Eventos: PageView, CompleteRegistration (primer RNM registrado), InitiateCheckout (abre el pago), Purchase (plan pagado). */
(function () {
  "use strict";
  var PIXEL_ID = "1799560864530535";
  var CLAVE = "rnm_consent_pixel";
  var cargado = false;

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

  /* Los eventos solo salen si hay consentimiento. */
  window.rnmTrack = function (evento, datos, id) {
    if (leer() !== "si") return;
    cargarPixel();
    try { window.fbq("track", evento, datos || {}, id ? { eventID: id } : undefined); } catch (e) { /* sin píxel */ }
  };

  function aviso() {
    if (leer()) return;
    var d = document.createElement("div");
    d.className = "consent-pixel"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Medición de anuncios");
    d.innerHTML = '<p>Medimos si nuestros anuncios funcionan (por ejemplo, si te registras) con el píxel de Meta. Solo se activa si aceptas. <a href="privacidad.html">Más información</a></p>' +
      '<div class="consent-pixel-acc"><button type="button" class="btn sec" id="cp-no">No, gracias</button><button type="button" class="btn" id="cp-si">Aceptar</button></div>';
    document.body.appendChild(d);
    function cerrar(v) { guardar(v); d.remove(); if (v === "si") { cargarPixel(); } }
    d.querySelector("#cp-si").addEventListener("click", function () { cerrar("si"); });
    d.querySelector("#cp-no").addEventListener("click", function () { cerrar("no"); });
  }

  if (leer() === "si") cargarPixel();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", aviso); else aviso();
})();
