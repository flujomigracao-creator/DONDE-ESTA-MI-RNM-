var CACHE = "rnm-v170";
var ARCHIVOS = ["./", "index.html", "offline.html", "app.js", "push-web.js", "meta-pixel.js", "play.js", "manifest.json", "icon.svg", "icon-192.png", "premium.css", "figma.css", "movil.css", "logo-rnm-grande.png", "logo-rnm.png", "efectos.js"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS); }));
  self.skipWaiting();
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  // Sin conexión, una página (con o sin ?parámetros) muestra la pantalla "Sin conexión": la app necesita red para sus datos.
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(function () { return caches.match("offline.html"); }));
    return;
  }
  e.respondWith(
    fetch(e.request).catch(function () { return caches.match(e.request, { ignoreSearch: true }); })
  );
});

// ---- Notificaciones push (Web Push / VAPID) ----
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: "Mi RNM", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Mi RNM", {
    body: d.body || "Tienes una novedad en tu trámite.",
    icon: "icon-192.png", badge: "icon-192.png", tag: d.tag || "rnm-aviso", data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) if ("focus" in cs[i]) return cs[i].focus();
    return self.clients.openWindow(url);
  }));
});
