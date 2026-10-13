// Corre dentro de la consulta de la Polícia Federal (SISMIGRA – Andamento de processos).
// Llena RNM + fecha de nacimiento. El operador marca la verificación de Cloudflare y pulsa
// "Pesquisar"; esta extensión lee el resultado, lo guarda y pasa al siguiente.

const FECHA_ID = 'formulario-pesquisar:txtNomeDataNascDadosPessoaisInputDate';
const RNM_NAME = 'formulario-pesquisar:j_id39';

const msg = (m) => new Promise((resolve, reject) =>
  chrome.runtime.sendMessage(m, (r) => (r?.ok ? resolve(r.data) : reject(new Error(r?.error || 'Sin respuesta')))));

let caso = null;
let guardado = false;
let modoAuto = false;

// ---------- Barra de estado ----------
const barra = document.createElement('div');
barra.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 14px;font:600 14px system-ui,sans-serif;background:#0b5fff;color:#fff;display:flex;gap:12px;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,.3)';
const texto = document.createElement('span');
texto.style.flex = '1';
const btn = document.createElement('button');
btn.style.cssText = 'display:none;font:600 13px system-ui,sans-serif;padding:6px 12px;border:0;border-radius:6px;cursor:pointer';
barra.append(texto, btn);
document.documentElement.appendChild(barra);
document.body.style.marginTop = '46px';

function estado(t, color) {
  texto.textContent = t;
  barra.style.background = color || '#0b5fff';
}

// ---------- Llenar ----------
function poner(el, valor) {
  el.focus();
  el.value = valor;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

function llenar() {
  const fecha = document.getElementById(FECHA_ID);
  const rnm = document.querySelector(`[name="${RNM_NAME}"]`);
  if (!fecha || !rnm) return false;
  poner(rnm, caso.rnm);
  poner(fecha, caso.nacimiento);
  return true;
}

// ---------- Leer el resultado ----------
// Estructura real de la PF (verificada): tabla "formulario-pesquisar:dataTableRequerimentos" con celdas
// Data | Situação | RNM | Tipo | Nº requerimento | Unidade (id ...:siglaUnidade) | Nome | Nascimento, y debajo la tabla
// "formulario-pesquisar:dataTableRequerimentosAlteracaoResidencia" (cambios de dirección; vacía si no hay).
const limpio = (s) => (s || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

function filasDe(id) {
  const c = document.getElementById(id);
  return c ? [...c.querySelectorAll("tbody tr")].filter((f) => f.querySelector(".rich-table-cell") && limpio(f.innerText)) : [];
}

// La PF lista en la misma tabla el trámite principal y las solicitudes de cambio de dirección ("Solicitar Alteração de Endereço").
const ES_CAMBIO = /altera[cç][aã]o de endere[cç]o/i;

function datosFila(f) {
  const c = [...f.querySelectorAll(".rich-table-cell")];
  return {
    data: limpio(c[0]?.innerText),
    situacion: limpio(c[1]?.innerText).replace(/\s+/g, " "),
    tipo: limpio(f.querySelector("[id$=\":tipoSolicitacaoId\"]")?.innerText),
    numero: limpio(f.querySelector("[id$=\":numeroRequerimento\"]")?.innerText),
    unidad: limpio(f.querySelector("[id$=\":siglaUnidade\"]")?.innerText),
  };
}

// Solo fecha, estado y unidad de destino: nunca el nombre ni el RNM.
function resumenCambio(d) {
  const sit = d.situacion.length > 120 ? d.situacion.slice(0, 117) + "…" : d.situacion;
  return [d.data, sit, d.unidad ? "→ " + d.unidad : ""].filter(Boolean).join(" · ");
}

function leerResultado() {
  const principales = filasDe("formulario-pesquisar:dataTableRequerimentos").map(datosFila);
  if (principales.length) {
    // El trámite principal es la primera fila que no sea un cambio de dirección.
    const t = principales.filter((d) => !ES_CAMBIO.test(d.tipo))[0] || principales[0];
    // Si el documento está listo, la unidad de retiro es la que nombra el texto (puede ser distinta a la columna "Unidade").
    const enTexto = /unidade de atendimento\s+([A-Z0-9]+(?:\/[A-Z0-9]+)*)/.exec(t.situacion);
    const unidad = (enTexto && enTexto[1]) || t.unidad || null;
    const cambios = principales.filter((d) => ES_CAMBIO.test(d.tipo))
      .concat(filasDe("formulario-pesquisar:dataTableRequerimentosAlteracaoResidencia").map(datosFila));
    const vistos = new Set(), resumen = [];
    cambios.forEach((d) => { const k = d.numero + "|" + d.data; if (vistos.has(k)) return; vistos.add(k); resumen.push(resumenCambio(d)); });
    return { texto: t.situacion, unidad, cambio: resumen.join(" | ") || null };
  }
  const t = limpio([...document.querySelectorAll(".rich-messages, .rich-message, .mensagem_erro")].map((n) => n.innerText).join("\n"));
  if (/n[aã]o (foi )?encontrad|nenhum|inexistente|no se encontr/i.test(t)) return { texto: t, unidad: null, cambio: null };
  return null;
}

// Respaldo manual: todo el panel "Resultado da pesquisa".
function resultadoPanel() {
  const cab = [...document.querySelectorAll("*")].find((n) => n.children.length === 0 && /^Resultado da pesquisa/i.test(n.textContent.trim()));
  const panel = cab?.closest(".rich-panel, fieldset, table");
  const texto = limpio(panel?.innerText.replace(/^Resultado da pesquisa/i, ""));
  return texto ? { texto, unidad: null, cambio: null } : null;
}

async function guardar(res) {
  if (guardado || !res?.texto) return;
  guardado = true;
  estado("Guardando resultado…");
  try {
    const r = await msg({ type: "guardar", id: caso.id, texto: res.texto, unidad: res.unidad, cambio: res.cambio });
    const etiqueta = { listo: "¡Documento LISTO!", entregado: "Documento entregado", proceso: "En proceso", pendencia: "Con pendencia",
      problema: "Problema en la solicitud", no_encontrado: "No encontrado", desconocido: "Resultado guardado" }[r.estado] || r.estado;
    const extra = (res.unidad ? " · " + res.unidad : "") + (res.cambio ? " · con cambio de dirección" : "");
    estado("✓ " + caso.rnm + ": " + etiqueta + extra + ". Pasando al siguiente…", r.estado === "problema" || r.estado === "pendencia" ? "#d93025" : "#0f9d58");
    await new Promise((res2) => setTimeout(res2, modoAuto ? 8000 + Math.random() * 12000 : 2500));
    const sig = await msg({ type: "siguiente", excluir: caso.id });
    if (!sig.hayMas) {
      estado("✓ Listo. No quedan más RNM por consultar ahora.", "#0f9d58");
      if (modoAuto) { await new Promise((res2) => setTimeout(res2, 3000)); msg({ type: "cerrarAuto" }).catch(() => {}); }
    }
  } catch (e) {
    guardado = false;
    estado("No se pudo guardar: " + e.message, "#d93025");
  }
}

function vigilar() {
  let espera = null;
  const revisar = () => {
    if (guardado || espera || !leerResultado()) return;
    // pequeña pausa: la tabla de cambios de dirección llega junto con el resultado
    espera = setTimeout(() => { espera = null; guardar(leerResultado()); }, 900);
  };
  new MutationObserver(revisar).observe(document.body, { childList: true, subtree: true, characterData: true });
  btn.textContent = "Guardar lo que veo";
  btn.style.display = "";
  btn.onclick = () => {
    const r = leerResultado() || resultadoPanel();
    if (!r) return estado("Aún no hay resultado visible. Pulsa Pesquisar.", "#e8a200");
    guardar(r);
  };
}

// ---------- Modo automático total ----------
// Si el operador lo activó: espera a que Cloudflare valide SOLO (nunca marca ni resuelve la verificación),
// pulsa "Pesquisar", y el resto sigue como siempre (leer, guardar, pasar al siguiente).
// Si Cloudflare no valida solo, o la PF no responde, se detiene y avisa a una persona.
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function botonPesquisar() {
  const raiz = document.getElementById('formulario-pesquisar') || document;
  return [...raiz.querySelectorAll('input[type=submit],input[type=button],button,a')]
    .find((b) => /^\s*pesquisar\s*$/i.test(b.value || b.textContent || ''));
}
function avisar(texto) { msg({ type: 'avisar', titulo: 'FLUJO · Consulta RNM', texto }).catch(() => {}); }

async function autoPesquisar() {
  estado(`FLUJO · automático · RNM ${caso.rnm} — esperando a que Cloudflare verifique…`);
  const t0 = Date.now();
  let token = '';
  while (Date.now() - t0 < 45000) {
    token = document.querySelector('[name="cf-turnstile-response"]')?.value || '';
    if (token) break;
    await dormir(500);
  }
  if (!token) {
    estado('FLUJO: Cloudflare no verificó solo. Marca la casilla y pulsa Pesquisar (el modo automático se detuvo en este RNM).', '#d93025');
    return avisar(`Cloudflare pide verificación manual para el RNM ${caso.rnm}. Marca la casilla en la ventana de la PF.`);
  }
  await dormir(1500 + Math.random() * 2000);
  const b = botonPesquisar();
  if (!b) {
    estado('FLUJO: no encontré el botón Pesquisar (¿la PF cambió la página?). Pulsa Pesquisar a mano.', '#d93025');
    return avisar('No encontré el botón Pesquisar en la PF. Revisa la ventana.');
  }
  estado(`FLUJO · automático · RNM ${caso.rnm} — Cloudflare verificó solo. Consultando…`, '#0f9d58');
  b.click();
  await dormir(40000);
  if (!guardado) {
    estado('FLUJO: la PF no devolvió resultado a tiempo. Revisa la ventana y pulsa Pesquisar o "Guardar lo que veo".', '#d93025');
    avisar(`La PF no respondió para el RNM ${caso.rnm}. Revisa la ventana.`);
  }
}

// ---------- Prueba de Cloudflare (solo observa; NO marca ni resuelve nada) ----------
// Mide cuánto tarda en aparecer el token de Cloudflare Turnstile y si hubo un clic de la persona en el widget.
// Sirve para saber, con datos reales, cuántas veces la verificación pasa sola en el Chrome del operador.
function medirCloudflare() {
  const t0 = Date.now();
  let hizoClic = false, hecho = false;
  window.addEventListener('blur', () => { if (document.activeElement && document.activeElement.tagName === 'IFRAME') hizoClic = true; });
  const iv = setInterval(() => {
    const token = document.querySelector('[name="cf-turnstile-response"]')?.value;
    const seg = Math.round((Date.now() - t0) / 100) / 10;
    if (token && !hecho) {
      hecho = true; clearInterval(iv);
      const solo = !hizoClic;
      msg({ type: 'cfLog', seg, solo }).catch(() => {});
      if (!guardado) estado(`FLUJO · ${caso.rnm} — Cloudflare ${solo ? 'pasó solo en ' + seg + ' s' : 'verificado con tu clic'}. Pulsa Pesquisar.`, '#0f9d58');
    } else if (!hecho && Date.now() - t0 > 180000) {
      hecho = true; clearInterval(iv);
      msg({ type: 'cfLog', seg: null, solo: false, timeout: true }).catch(() => {});
    }
  }, 500);
}

// ---------- Inicio ----------
(async () => {
  const hash = new URLSearchParams(location.hash.replace(/^#/, '')).get('flujo');
  try {
    if (!(await msg({ type: 'session' }))) return estado('FLUJO: entra con tu cuenta en la extensión (ícono arriba a la derecha).', '#e8a200');
    caso = await msg({ type: 'caso', id: hash });
  } catch (e) {
    return estado(`FLUJO: ${e.message}`, '#d93025');
  }
  if (!caso) return estado('FLUJO: no hay un RNM asignado. Abre la extensión y pulsa "Empezar a consultar".', '#6b7280');
  if (!caso.consultable) return estado(`FLUJO: el RNM ${caso.rnm} no está en cola (ya está listo o su cuenta no tiene un plan activo que lo cubra).`, '#6b7280');
  if (!llenar()) return estado('FLUJO: no encontré los campos de la consulta (¿la PF cambió la página?).', '#d93025');
  estado(`FLUJO · ${caso.primera ? '1.ª consulta (gratis) · ' : ''}RNM ${caso.rnm} · ${caso.nacimiento} — Marca "Verifique que es un ser humano" y pulsa Pesquisar.`);
  vigilar();
  medirCloudflare();
  modoAuto = (await chrome.storage.local.get('autoTotal')).autoTotal === true;
  if (modoAuto) autoPesquisar();
})();
