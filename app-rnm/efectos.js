/* Efectos y microinteracciones de la app (solo presentación; respeta prefers-reduced-motion).
   Se carga después de app.js y funciona aunque falle: nada de la lógica depende de este archivo. */
(function () {
  "use strict";
  var reducir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $$ = function (sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); };

  /* ---------- Iconos (SVG) ---------- */
  var ICONOS = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/></svg>'
  };
  window.ICONOS_FLUJO = ICONOS;

  /* ---------- Avisos emergentes (toast) ---------- */
  var zona = null;
  window.toast = function (texto, tipo) {
    if (!zona) {
      zona = document.createElement("div");
      zona.className = "toast-zona";
      zona.setAttribute("role", "status");
      zona.setAttribute("aria-live", "polite");
      document.body.appendChild(zona);
    }
    var t = document.createElement("div");
    t.className = "toast-flujo " + (tipo || "info");
    t.innerHTML = (ICONOS[tipo] || ICONOS.info) + "<span></span>";
    t.lastChild.textContent = texto;
    zona.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("in"); });
    setTimeout(function () { t.classList.remove("in"); setTimeout(function () { t.remove(); }, 300); }, 3200);
  };

  /* ---------- Vibración suave en móviles (opcional) ---------- */
  var vibrar = function (ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) { /* sin soporte */ } };

  /* ---------- Onda al tocar botones ---------- */
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest && e.target.closest("button, .btn, .btn-enlace, .fila-aj, .nav-item, .bottom-nav-item, .fila-rnm");
    if (!b || b.disabled) return;
    if (b.closest(".bottom-nav-item, .app-bottom-nav")) vibrar(6);
    if (reducir) return;
    var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 1.6;
    var o = document.createElement("span");
    o.className = "onda";
    o.style.cssText = "width:" + d + "px;height:" + d + "px;left:" + (e.clientX - r.left - d / 2) + "px;top:" + (e.clientY - r.top - d / 2) + "px";
    if (getComputedStyle(b).position === "static") b.style.position = "relative";
    b.style.overflow = b.style.overflow || "hidden";
    b.appendChild(o);
    setTimeout(function () { o.remove(); }, 650);
  }, { passive: true });

  /* ---------- Sombra de la cabecera al desplazarse ---------- */
  var cab = document.querySelector(".app-header");
  if (cab) window.addEventListener("scroll", function () { cab.classList.toggle("con-sombra", window.scrollY > 4); }, { passive: true });

  /* ---------- Aparición escalonada de tarjetas ---------- */
  var SEL_REV = ".tarjeta, .fila-rnm, .history-card, .fila-aj, .plan-card, .lista-ajustes, .como-funciona, .bienvenida-card, .hero-fig, .perfil-head, .perfil-stats .stat, .aviso-plan";
  var io = ("IntersectionObserver" in window && !reducir) ? new IntersectionObserver(function (en) {
    en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("rev-in"); io.unobserve(x.target); } });
  }, { threshold: 0.08 }) : null;
  function registrar(raiz) {
    if (!io) return;
    $$(SEL_REV, raiz).forEach(function (n, i) {
      if (n.dataset.rev) return;
      n.dataset.rev = "1";
      n.classList.add("rev");
      n.style.setProperty("--rev-d", Math.min(i, 8) * 45 + "ms");
      io.observe(n);
    });
  }
  var contenido = document.querySelector(".app-content");
  if (contenido && io) {
    registrar(contenido);
    new MutationObserver(function (m) { m.forEach(function (x) { x.addedNodes.forEach(function (n) { if (n.nodeType === 1) { if (n.matches && n.matches(SEL_REV)) registrar(n.parentNode); registrar(n); } }); }); }).observe(contenido, { childList: true, subtree: true });
  }

  setInterval(function () { $$(".rev:not(.rev-in)").forEach(function (n) { var r = n.getBoundingClientRect(); if (r.top < window.innerHeight + 200 && r.bottom > -200) n.classList.add("rev-in"); }); }, 1200);

  /* ---------- Contador animado ---------- */
  window.contarHasta = function (el, destino) {
    if (!el) return;
    destino = Number(destino) || 0;
    if (reducir || destino <= 0) { el.textContent = String(destino); return; }
    var ini = performance.now(), dur = 700;
    function paso(t) {
      var p = Math.min(1, (t - ini) / dur), v = Math.round(destino * (1 - Math.pow(1 - p, 3)));
      el.textContent = String(v);
      if (p < 1) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
  };

  /* ---------- Esqueleto de carga mientras llegan los datos ---------- */
  function esqueleto() {
    return '<div class="esqueleto"><div class="esq-linea corta"></div><div class="esq-titulo"></div><div class="esq-linea"></div>' +
      '<div class="esq-card"></div><div class="esq-card chica"></div></div>';
  }
  window.mostrarEsqueleto = function (idContenedor) {
    var c = document.getElementById(idContenedor);
    if (c && !c.children.length) c.innerHTML = esqueleto();
  };
  if (typeof window.cargarRegistros === "function") {
    var original = window.cargarRegistros, primera = true;
    window.cargarRegistros = function () {
      if (primera) {
        primera = false; window.mostrarEsqueleto("dashboard-hero-container");
        setTimeout(function () {
          var c = document.getElementById("dashboard-hero-container");
          if (c && c.querySelector(".esqueleto")) { c.innerHTML = "<div class=\"tarjeta\"><h3>No pudimos cargar tus datos</h3><p>Revisa tu conexión e inténtalo de nuevo.</p><button type=\"button\" class=\"btn\" onclick=\"location.reload()\">Reintentar</button></div>"; }
        }, 9000);
      }
      return original.apply(this, arguments);
    };
  }

  /* ---------- Copiar con aviso ---------- */
  if (typeof window.copiarTexto === "function") {
    var copiar = window.copiarTexto;
    window.copiarTexto = function (t, b) { copiar(t, b); window.toast("Código copiado", "ok"); vibrar(10); };
  }

  /* ---------- Teclado abierto: se esconde la barra inferior y el campo queda a la vista ---------- */
  var esCampo = function (e) { return e && /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName) && !/^(checkbox|radio|button|submit|file|hidden)$/.test(e.type || ""); };
  document.addEventListener("focusin", function (e) {
    if (!esCampo(e.target)) return;
    document.body.classList.add("escribiendo");
    setTimeout(function () { try { e.target.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (x) { /* sin scroll */ } }, 300);
  });
  document.addEventListener("focusout", function () {
    setTimeout(function () { if (!esCampo(document.activeElement)) document.body.classList.remove("escribiendo"); }, 120);
  });

  /* ---------- Barra inferior: el indicador se desliza a la pestaña activa ---------- */
  var barra = document.querySelector(".app-bottom-nav");
  function moverIndicador() {
    if (!barra) return;
    var items = $$(".bottom-nav-item", barra), i = items.findIndex(function (b) { return b.classList.contains("active"); });
    barra.style.setProperty("--nav-i", String(Math.max(0, i)));
  }
  if (barra) {
    moverIndicador();
    new MutationObserver(moverIndicador).observe(barra, { attributes: true, subtree: true, attributeFilter: ["class"] });
  }

  /* ---------- Transición al cambiar de sección + título de la cabecera ---------- */
  $$(".seccion-app").forEach(function (s) {
    var oculta = s.classList.contains("oculto");
    new MutationObserver(function () {
      var ahora = s.classList.contains("oculto");
      if (oculta && !ahora && !reducir) { s.classList.remove("p-entra"); void s.offsetWidth; s.classList.add("p-entra"); }
      oculta = ahora;
    }).observe(s, { attributes: true, attributeFilter: ["class"] });
  });
  var titulo = document.getElementById("app-header-titulo");
  if (titulo && !reducir) {
    var previo = titulo.textContent;
    new MutationObserver(function () {
      if (titulo.textContent === previo) return;
      previo = titulo.textContent;
      titulo.classList.add("cambia"); requestAnimationFrame(function () { requestAnimationFrame(function () { titulo.classList.remove("cambia"); }); });
    }).observe(titulo, { childList: true, characterData: true, subtree: true });
  }

  /* ---------- Confeti la primera vez que se ve un RNM listo para retirar ---------- */
  var COLORES = ["#18A058", "#F5C518", "#2E6BF0", "#FFFFFF", "#8FB3FF"];
  window.lanzarConfeti = function () {
    if (reducir) return;
    var c = document.createElement("div"); c.className = "p-confeti"; c.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 70; i++) {
      var p = document.createElement("i");
      p.style.left = Math.random() * 100 + "vw";
      p.style.background = COLORES[i % COLORES.length];
      p.style.setProperty("--dx", (Math.random() * 160 - 80) + "px");
      p.style.setProperty("--rot", (Math.random() * 900 + 180) + "deg");
      p.style.setProperty("--dur", (1.4 + Math.random() * 1.2) + "s");
      p.style.setProperty("--ret", (Math.random() * 0.35) + "s");
      if (i % 3 === 0) { p.style.width = "6px"; p.style.height = "6px"; p.style.borderRadius = "50%"; }
      c.appendChild(p);
    }
    document.body.appendChild(c);
    vibrar([12, 40, 18]);
    setTimeout(function () { c.remove(); }, 3200);
  };
  function celebrarListos() {
    $$(".rastreador.listo:not(.compacto)").forEach(function (t) {
      var r = (t.querySelector(".rt-rnm") || {}).textContent || "";
      var clave = "rnm_celebrado_" + r.replace(/\W/g, "");
      var visto = false; try { visto = localStorage.getItem(clave) === "1"; } catch (e) { visto = true; }
      if (!r || visto || t.getBoundingClientRect().top > window.innerHeight) return;
      try { localStorage.setItem(clave, "1"); } catch (e) { /* sin almacenamiento */ }
      setTimeout(window.lanzarConfeti, 450);
    });
  }
  var programarCelebracion = function () { clearTimeout(celebrarListos.t); celebrarListos.t = setTimeout(celebrarListos, 300); };
  if (contenido) new MutationObserver(programarCelebracion).observe(contenido, { childList: true, subtree: true });
  programarCelebracion(); // por si la tarjeta ya se pintó antes de cargar este archivo
  window.addEventListener("hashchange", programarCelebracion);
})();
