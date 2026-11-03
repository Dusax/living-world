import { Sim, describeAct } from './sim.js';
import { LLM, MODELS } from './llm.js';
import { draw, screenToTile, TS } from './render.js';
import { describeTraits } from './agent.js';
import { TPD, W, H } from './world.js';

const $ = (s) => document.querySelector(s);
const SAVE_KEY = 'living-world-save', LLM_KEY = 'living-world-llm', TICK_MS = 200;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};

const canvas = $('#c'), ctx = canvas.getContext('2d');
const llm = new LLM();
let sim, selected = null, tool = 'select', speed = 1, acc = 0, last = performance.now(), follow = false;
const view = { x: W / 2, y: H / 2, zoom: 1.5 };
let dpr = 1;

// ---------- mundo ----------
function bind(s) {
  sim = s; sim.llm = llm; sim.onLog = addLog; selected = null;
  $('#log').innerHTML = '';
  for (const e of sim.logs.slice(-80)) addLog(e);
  view.x = sim.world.start.x; view.y = sim.world.start.y;
  renderCard(true);
}
function newWorld(seed = Math.floor(Math.random() * 1e9)) { bind(new Sim(seed)); }
function load() {
  const raw = store.get(SAVE_KEY);
  if (!raw) return false;
  try { bind(Sim.fromJSON(JSON.parse(raw))); return true; } catch (e) { console.warn('save inválido', e); return false; }
}
function save() { return store.set(SAVE_KEY, JSON.stringify(sim.toJSON())); }

// ---------- log ----------
function addLog(e) {
  const el = document.createElement('div');
  el.className = e.kind;
  el.innerHTML = `<span class="t">d${e.day} ${String(e.hour).padStart(2, '0')}h</span>${esc(e.text)}`;
  const box = $('#log');
  box.prepend(el);
  while (box.children.length > 150) box.lastChild.remove();
}

// ---------- canvas / câmera ----------
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
}
new ResizeObserver(resize).observe(canvas);
const pointers = new Map();
let dragMoved = 0, pinch0 = 0;
const tileAt = (e) => { const r = canvas.getBoundingClientRect(); return screenToTile({ ...view, zoom: view.zoom * dpr }, canvas, (e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr); };

canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, e); dragMoved = 0; pinch0 = pinchDist(); });
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  pointers.set(e.pointerId, e);
  if (pointers.size === 2) { const d = pinchDist(); if (pinch0) zoomBy(d / pinch0); pinch0 = d; dragMoved = 99; return; }
  const dx = e.clientX - prev.clientX, dy = e.clientY - prev.clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  if (dragMoved > 6) { view.x -= dx / (TS * view.zoom); view.y -= dy / (TS * view.zoom); follow = false; }
});
canvas.addEventListener('pointerup', (e) => {
  pointers.delete(e.pointerId);
  if (dragMoved <= 6 && e.button === 0) onMapClick(tileAt(e));
});
canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); const t = tileAt(e); orderGoto(Math.floor(t.x), Math.floor(t.y)); });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
function pinchDist() { if (pointers.size < 2) return 0; const [a, b] = [...pointers.values()]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
function zoomBy(f) { view.zoom = Math.max(0.5, Math.min(4, view.zoom * f)); }

function onMapClick(t) {
  const tx = Math.floor(t.x), ty = Math.floor(t.y);
  if (tool === 'select') {
    let best = null, bd = 1.2;
    for (const a of sim.living()) { const d = Math.hypot(a.x + 0.5 - t.x, a.y + 0.5 - t.y); if (d < bd) { bd = d; best = a; } }
    select(best ? best.id : null);
  } else if (tool === 'goto') orderGoto(tx, ty);
  else if (tool === 'meteor') sim.trigger('meteoro', tx, ty);
  else sim.placeTool(tool, tx, ty);
}
function orderGoto(x, y) {
  const a = selectedAgent();
  if (!a) return;
  if (sim.order(a, { type: 'goto', gx: x, gy: y })) renderCard(true);
}

// ---------- seleção / cartão ----------
const selectedAgent = () => (selected ? sim.byId(selected) : null);
function select(id) { selected = id; follow = false; renderCard(true); renderPeople(); }
const barColor = (v, inv) => { const x = inv ? 100 - v : v; return x > 75 ? '#ff6b6b' : x > 45 ? '#ffc861' : '#5fd38d'; };
const bar = (label, v, bad = true) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.round(v)}%;background:${bad ? barColor(v) : barColor(v, true)}"></i></div><span>${Math.round(v)}</span></div>`;

let lastCardHtml = '';
function renderCard(force) {
  const a = selectedAgent(), body = $('#cardBody'), ctl = $('#cardCtl');
  if (!a) { body.className = 'muted'; body.textContent = 'Clique em alguém no mapa (ou na lista) para ver a mente dessa pessoa.'; ctl.hidden = true; lastCardHtml = ''; return; }
  ctl.hidden = !a.alive;
  const rel = Object.entries(a.rel).map(([id, v]) => [sim.byId(+id), v]).filter(([o]) => o).sort((p, q) => q[1] - p[1]);
  const relHtml = rel.slice(0, 6).map(([o, v]) => `<span title="${v}">${v > 60 ? '💛' : v < -40 ? '💢' : v > 0 ? '🙂' : '😐'} ${esc(o.name)} ${v > 0 ? '+' : ''}${Math.round(v)}</span>`).join('');
  const act = a.alive ? (a.pending ? 'pensando…' : a.sleeping ? 'dormindo' : a.act ? describeAct(sim, a.act) : 'decidindo…') : 'morto';
  const src = a.act?.source ? ` <span class="muted small">(${esc(a.act.source)})</span>` : '';
  const home = sim.world.structures.find((s) => s.id === a.home);
  const html = `
    <h3 style="margin:2px 0">${esc(a.name)} ${a.alive ? '' : '† '}<span class="muted small">${esc(describeTraits(a))}</span></h3>
    ${bar('Vida', a.hp, false)}${bar('Fome', a.hunger)}${bar('Cansaço', a.fatigue)}${bar('Solidão', a.loneliness)}
    <div class="small">🍖 ${a.inv.food} · 🪵 ${a.inv.wood} · 🪨 ${a.inv.stone} · ${home ? '🏠 tem casa' : '⛺ sem casa'}</div>
    <div class="small" style="margin-top:4px"><b>Agora:</b> ${esc(act)}${src}</div>
    <div class="thought">${a.thought ? '“' + esc(a.thought) + '”' : ''}</div>
    <div class="tags">${relHtml || '<span class="muted">sem laços ainda</span>'}</div>
    <div class="small muted" style="margin-top:6px">Diário</div>
    <div class="mem">${a.mem.slice(-12).reverse().map((m) => `<div>d${m.day}: ${esc(m.text)}</div>`).join('')}</div>`;
  if (force || html !== lastCardHtml) { body.className = ''; body.innerHTML = html; lastCardHtml = html; }
}

function renderPeople() {
  const list = sim.living();
  $('#people').innerHTML = list.map((a) => {
    const act = a.pending ? 'pensando…' : a.sleeping ? 'dormindo' : a.act ? describeAct(sim, a.act) : '—';
    return `<button class="person${a.id === selected ? ' sel' : ''}" data-id="${a.id}"><span class="dot" style="background:hsl(${a.hue} 70% 58%)"></span>${esc(a.name)}<small>${esc(act)}</small></button>`;
  }).join('') || '<div class="muted">Ninguém restou.</div>';
}
$('#people').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) { select(+b.dataset.id); follow = true; } });

function renderTown() {
  const s = sim.stock, pop = sim.living().length;
  $('#town').innerHTML = `<div class="small">👥 <b>${pop}</b> vivos · 🏠 <b>${sim.houses().length}</b> casas · † ${sim.stats.died} · 👶 ${sim.stats.born - 6 > 0 ? sim.stats.born - 6 : 0}</div>
    <div class="small">Armazém: 🍖 <b>${s.food}</b> · 🪵 <b>${s.wood}</b> · 🪨 <b>${s.stone}</b></div>`;
}

function renderClock() {
  const w = sim.weather.type;
  const icon = w === 'chuva' ? '🌧' : w === 'seca' ? '🏜' : sim.hour() >= 19 || sim.hour() < 6 ? '🌙' : '☀';
  $('#clock').textContent = `Dia ${sim.day()} · ${String(Math.floor(sim.hour())).padStart(2, '0')}:${String(Math.floor((sim.hour() % 1) * 60)).padStart(2, '0')} · ${sim.seasonName()} · ${icon} ${w}${sim.decreeText && sim.tick < sim.decreeUntil ? ' · ✦ decreto ativo' : ''}`;
}

function renderLLM() {
  const s = llm.stats;
  $('#llmStats').textContent = `Chamadas: ${s.calls}/${llm.maxCalls} · erros: ${s.errors} · tokens: ${s.inTok} in / ${s.outTok} out${llm.lastError ? ' · ' + llm.lastError.slice(0, 140) : ''}`;
  $('#llmOn').checked = llm.enabled;
}
llm.onChange = renderLLM;

// ---------- controles ----------
function setSpeed(n) {
  speed = n;
  $('#btnPause').textContent = n === 0 ? '▶' : '⏸';
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', n !== 0 && +b.dataset.speed === n));
}
let lastSpeed = 1;
$('#btnPause').onclick = () => { if (speed) { lastSpeed = speed; setSpeed(0); } else setSpeed(lastSpeed); };
document.querySelectorAll('[data-speed]').forEach((b) => (b.onclick = () => setSpeed(+b.dataset.speed)));
window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $('#btnPause').click(); } });

$('#decreeBtn').onclick = () => { const v = $('#decreeIn').value.trim(); if (v) { sim.decree(v); $('#decreeIn').value = ''; } };
$('#decreeIn').onkeydown = (e) => { if (e.key === 'Enter') $('#decreeBtn').click(); };
$('#whisperBtn').onclick = () => { const a = selectedAgent(), v = $('#whisperIn').value.trim(); if (a && v) { sim.whisperTo(a, v); $('#whisperIn').value = ''; renderCard(true); } };
$('#whisperIn').onkeydown = (e) => { if (e.key === 'Enter') $('#whisperBtn').click(); };
$('#orderBtn').onclick = () => {
  const a = selectedAgent(); if (!a) return;
  const [type, kind] = $('#orderSel').value.split(':');
  if (!sim.order(a, { type, kind })) sim.log('info', `${a.name} não consegue fazer isso agora.`, a.id);
  renderCard(true);
};
$('#followBtn').onclick = () => { follow = !follow; };
$('#blessBtn').onclick = () => { const a = selectedAgent(); if (a) sim.bless(a); };
$('#smiteBtn').onclick = () => { const a = selectedAgent(); if (a) sim.smite(a); };
document.querySelectorAll('[data-event]').forEach((b) => (b.onclick = () => sim.trigger(b.dataset.event)));
document.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => {
  tool = b.dataset.tool;
  document.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b));
  canvas.classList.toggle('tool', tool !== 'select');
  const hints = { select: '', goto: 'Clique no mapa: o habitante selecionado vai até lá (ou botão direito).', tree: 'Clique para plantar uma árvore.', bush: 'Clique para criar um arbusto de frutas.', stone: 'Clique para criar uma pedra.', house: 'Clique para criar uma casa pronta.', meteor: 'Clique para derrubar um meteoro.' };
  $('#toolhint').hidden = !hints[tool]; $('#toolhint').textContent = hints[tool];
}));

// IA
$('#llmModel').innerHTML = MODELS.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
try { const cfg = JSON.parse(store.get(LLM_KEY) || '{}'); llm.key = cfg.key || ''; llm.model = cfg.model || llm.model; llm.enabled = !!cfg.enabled && !!llm.key; } catch { /* ignore */ }
$('#llmKey').value = llm.key; $('#llmModel').value = llm.model;
const saveLLM = () => store.set(LLM_KEY, JSON.stringify({ key: llm.key, model: llm.model, enabled: llm.enabled }));
$('#llmKey').onchange = (e) => { llm.key = e.target.value.trim(); saveLLM(); };
$('#llmModel').onchange = (e) => { llm.model = e.target.value; saveLLM(); };
$('#llmOn').onchange = (e) => {
  llm.key = $('#llmKey').value.trim();
  llm.enabled = e.target.checked && !!llm.key;
  if (e.target.checked && !llm.key) llm.lastError = 'Cole sua chave da Anthropic primeiro.';
  saveLLM(); renderLLM();
};

// Crônica
$('#narrate').onclick = async () => {
  const evs = sim.logs.filter((l) => l.t > sim.tick - TPD && l.kind !== 'info').map((l) => `[${String(l.hour).padStart(2, '0')}h] ${l.text}`);
  const box = $('#narr'); box.hidden = false;
  if (!evs.length) { box.textContent = 'Foi um dia tranquilo, sem nada digno de nota.'; return; }
  if (llm.enabled && llm.key) {
    box.textContent = 'O cronista afia a pena…';
    try { box.textContent = await llm.narrate(sim, evs); } catch (e) { llm.fail(e); box.textContent = 'O cronista falhou: ' + e.message; }
  } else box.textContent = `Crônica do dia ${sim.day()}:\n` + evs.slice(-12).join('\n');
};

// Salvar / exportar
$('#saveBtn').onclick = () => { $('#saveBtn').textContent = save() ? '✅ Salvo' : '❌ Falhou'; setTimeout(() => ($('#saveBtn').textContent = '💾 Salvar'), 1500); };
$('#loadBtn').onclick = () => { if (!load()) alert('Nenhum jogo salvo.'); };
$('#newBtn').onclick = () => { if (confirm('Criar um novo mundo? O mundo atual será perdido (a menos que você tenha salvo).')) newWorld(); };
$('#exportBtn').onclick = () => {
  const text = sim.logs.map((l) => `[dia ${l.day} ${String(l.hour).padStart(2, '0')}h] ${l.text}`).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.download = `cronica-dia-${sim.day()}.txt`; a.click(); URL.revokeObjectURL(a.href);
};

// ---------- loop ----------
function frame(now) {
  const dt = Math.min(250, now - last); last = now;
  if (speed > 0) {
    acc += dt * speed;
    let n = 0;
    while (acc >= TICK_MS && n < 40) { sim.step(); acc -= TICK_MS; n++; }
    if (n === 40) acc = 0;
  }
  const a = selectedAgent();
  if (follow && a) { const f = (a.px + (a.x - a.px) * Math.min(1, acc / TICK_MS)); view.x += (f + 0.5 - view.x) * 0.1; view.y += ((a.py + (a.y - a.py) * Math.min(1, acc / TICK_MS)) + 0.5 - view.y) * 0.1; }
  draw(ctx, canvas, sim, { ...view, zoom: view.zoom * dpr }, { selected, frac: speed > 0 ? Math.min(1, acc / TICK_MS) : 1 });
  requestAnimationFrame(frame);
}

setInterval(() => { renderClock(); renderTown(); renderPeople(); renderCard(false); renderLLM(); }, 500);
setInterval(() => { if (sim) save(); }, 30000);
window.addEventListener('beforeunload', () => { if (sim) save(); });

if (!load()) newWorld();
resize();
view.zoom = Math.max(0.8, Math.min(2.2, canvas.clientWidth / (40 * TS)));
setSpeed(1);
renderClock(); renderTown(); renderPeople(); renderLLM();
requestAnimationFrame(frame);
window.__world = { get sim() { return sim; }, llm };
