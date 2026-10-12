const $ = (id) => document.getElementById(id);
const msg = (m) => new Promise((resolve, reject) =>
  chrome.runtime.sendMessage(m, (r) => (r?.ok ? resolve(r.data) : reject(new Error(r?.error || 'Sin respuesta')))));
const ver = (cual) => { $('vista-login').classList.toggle('oculto', cual !== 'login'); $('vista-app').classList.toggle('oculto', cual !== 'app'); };

async function cargar() {
  const s = await msg({ type: 'session' }).catch(() => null);
  if (!s) return ver('login');
  ver('app');
  $('quien').textContent = s.email;
  const { automatico = true } = await chrome.storage.local.get('automatico');
  $('auto').checked = automatico;
  try {
    const p = await msg({ type: 'pendientes' });
    $('n-pend').textContent = p.length;
    $('empezar').disabled = !p.length;
    const por = await msg({ type: 'porPagar' });
    $('n-pagar').textContent = por.length;
    const cont = $('lista-pagar');
    cont.textContent = '';
    const reales = (c) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',');
    const PRECIOS = { 1: 499, 2: 899, 3: 1299, 4: 1599 };
    por.forEach((r) => {
      const d = document.createElement('div'); d.className = 'item'; d.style.flexDirection = 'column'; d.style.alignItems = 'stretch';
      const t = document.createElement('div');
      const a = document.createElement('b'); a.textContent = r.nombre || '(sin nombre)';
      const b = document.createElement('div'); b.className = 'peq';
      b.textContent = [r.telefono, r.n + (r.n === 1 ? ' RNM' : ' RNM') + ': ' + (r.rnms || []).join(', '),
        r.plan_actual ? 'plan actual: ' + r.plan_actual + ' RNM' : (r.vence_at ? 'plan vencido' : 'sin plan')].filter(Boolean).join(' · ');
      t.append(a, b);
      const fila = document.createElement('div'); fila.style.cssText = 'display:flex;gap:6px;margin-top:6px;align-items:center';
      const sel = document.createElement('select');
      [1, 2, 3, 4].forEach((n) => { const o = document.createElement('option'); o.value = n; o.textContent = n + (n === 1 ? ' RNM · ' : ' RNM · ') + reales(PRECIOS[n]); if (n === r.sugerido) o.selected = true; sel.append(o); });
      const bt = document.createElement('button'); bt.textContent = 'Pagó 1 mes';
      bt.onclick = async () => { bt.disabled = true; try { await msg({ type: 'activarPlan', user: r.user_id, cupos: +sel.value }); cargar(); } catch (e) { $('msg-app').textContent = e.message; bt.disabled = false; } };
      fila.append(sel, bt);
      d.append(t, fila); cont.append(d);
    });
  } catch (e) {
    $('msg-app').textContent = e.message === 'no_autorizado' ? 'Tu cuenta no pertenece al equipo de FLUJO.' : e.message;
  }
}

$('entrar').onclick = async () => {
  $('msg-login').textContent = '';
  try { await msg({ type: 'login', email: $('email').value.trim(), password: $('pass').value }); $('pass').value = ''; cargar(); }
  catch (e) { $('msg-login').textContent = e.message; }
};
$('salir').onclick = async () => { await msg({ type: 'logout' }); cargar(); };
$('auto').onchange = (e) => msg({ type: 'automatico', valor: e.target.checked });
$('empezar').onclick = async () => {
  try { const r = await msg({ type: 'empezar' }); if (!r.hayMas) $('msg-app').textContent = 'No hay RNM por consultar ahora.'; else window.close(); }
  catch (e) { $('msg-app').textContent = e.message; }
};
cargar();
