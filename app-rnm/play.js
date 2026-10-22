/* Web → Google Play. INTERRUPTOR: pon "publicada: true" el día que la app esté publicada en Google Play.
   Mientras sea false no se ve nada (el enlace llevaría a una ficha que aún no existe). Los enlaces son los elementos [data-play]. */
(function () {
  var CFG = { publicada: false, id: "br.com.flujomigracao.rnm" };
  window.RNM_PLAY = { publicada: CFG.publicada, id: CFG.id, url: "https://play.google.com/store/apps/details?id=" + CFG.id + "&hl=es" };

  var css = document.createElement("style");
  css.textContent = ".play-enlace{display:inline-flex;align-items:center;gap:10px;min-height:48px;padding:0 18px;border-radius:12px;background:#0b0b0f;color:#fff!important;text-decoration:none!important;font:600 .9rem/1.1 system-ui,sans-serif;border:1px solid rgba(255,255,255,.25)}.play-enlace[hidden]{display:none}.play-enlace svg{width:22px;height:22px;color:#34d17a}.play-enlace b{font-size:1.02rem}";
  document.head.appendChild(css);

  var forzar = false; try { forzar = localStorage.getItem("rnm_play_test") === "1"; } catch (e) { /* sin almacenamiento */ }
  if (!(CFG.publicada || forzar)) return;
  if (!/Android/i.test(navigator.userAgent || "")) return;                    // en iPhone o computadora no se ofrece
  var dentroDeLaApp = (document.referrer || "").indexOf("android-app://") === 0 || (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
  if (dentroDeLaApp) return;                                                   // ya está usando la app
  function mostrar() { Array.prototype.forEach.call(document.querySelectorAll("[data-play]"), function (a) { a.hidden = false; }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mostrar); else mostrar();
})();
