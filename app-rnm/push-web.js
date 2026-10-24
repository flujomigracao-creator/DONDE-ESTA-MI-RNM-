// Avisos push en el celular (Web Push, sin Firebase). Funciona en Chrome/Android y en la app Android (TWA).
(function () {
  var VAPID_PUBLIC = "BPCJxYGpWCR1SEABdEFYSWhPxU03Oa6S4Y_n3FrFLEm7nOKcndR45DH74xZuBY7ptdRZpfs3dOKd0XkHfi471mA";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || typeof sb === "undefined") return;
  function aBytes(b64) {
    var p = "=".repeat((4 - b64.length % 4) % 4), s = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(s, function (c) { return c.charCodeAt(0); });
  }
  function guardar(sub) {
    var j = sub.toJSON();
    return sb.rpc("rnm_push_registrar", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_agente: navigator.userAgent.slice(0, 200) });
  }
  function suscribir() {
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription().then(function (s) {
        return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(VAPID_PUBLIC) });
      });
    }).then(guardar).catch(function (e) { console.warn("push", e); });
  }
  function banner() {
    if (document.getElementById("push-banner")) return;
    var b = document.createElement("div");
    b.id = "push-banner";
    b.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;background:#0A2A5E;color:#fff;border-radius:14px;padding:12px 14px;display:flex;gap:10px;align-items:center;font:14px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)";
    b.innerHTML = '<span style="flex:1">Activa los avisos para saber al instante cuando tu RNM avance.</span>' +
      '<button id="push-si" style="border:0;border-radius:10px;padding:8px 12px;background:#fff;color:#0A2A5E;font-weight:600">Activar</button>' +
      '<button id="push-no" aria-label="Cerrar" style="border:0;background:none;color:#fff;font-size:18px">×</button>';
    document.body.appendChild(b);
    document.getElementById("push-no").onclick = function () { b.remove(); try { localStorage.setItem("rnm_push_no", String(Date.now())); } catch (_) {} };
    document.getElementById("push-si").onclick = function () {
      b.remove();
      Notification.requestPermission().then(function (p) { if (p === "granted") suscribir(); });
    };
  }
  function apagado() { try { return localStorage.getItem("rnm_push_off") === "1"; } catch (_) { return false; } }
  function revisar(session) {
    if (!session || Notification.permission === "denied" || apagado()) return; // si la persona los apagó desde Perfil, no se vuelven a pedir
    if (Notification.permission === "granted") return suscribir();
    var t = 0; try { t = +localStorage.getItem("rnm_push_no") || 0; } catch (_) {}
    if (Date.now() - t <= 3 * 24 * 3600 * 1000) return;
    if (instalada()) {
      // App instalada: se pide el permiso directamente (diálogo del sistema), como cualquier app.
      setTimeout(function () {
        Notification.requestPermission().then(function (p) {
          if (p === "granted") suscribir();
          else if (p === "default") { try { localStorage.setItem("rnm_push_no", String(Date.now())); } catch (_) {} banner(); }
        }).catch(function () { banner(); });
      }, 2500);
    } else setTimeout(banner, 4000);
  }
  function instalada() {
    return (window.matchMedia && (matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches)) ||
      (document.referrer || "").indexOf("android-app://") === 0;
  }
  // Interruptor de Perfil: estado, activar y desactivar los avisos en este celular.
  window.rnmPush = {
    estado: function () {
      if (Notification.permission === "denied") return Promise.resolve({ activo: false, bloqueado: true });
      return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); })
        .then(function (s) { return { activo: Notification.permission === "granted" && !!s && !apagado(), bloqueado: false }; })
        .catch(function () { return { activo: false, bloqueado: false }; });
    },
    activar: function () {
      try { localStorage.removeItem("rnm_push_off"); } catch (_) {}
      return Notification.requestPermission().then(function (p) { return p === "granted" ? suscribir().then(function () { return true; }) : false; }).catch(function () { return false; });
    },
    desactivar: function () {
      try { localStorage.setItem("rnm_push_off", "1"); } catch (_) {}
      return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); })
        .then(function (s) { return s ? s.unsubscribe() : true; }).then(function () { return true; }).catch(function () { return false; });
    }
  };
  sb.auth.onAuthStateChange(function (ev, s) { if (ev === "SIGNED_IN") revisar(s); });
  sb.auth.getSession().then(function (r) { revisar(r.data && r.data.session); });
})();
