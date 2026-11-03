import { Sim, describeAct, buildingName, TIERS } from './sim.js';
import { LLM, PRESETS, newProvider } from './llm.js';
import { draw, screenToTile, TS } from './render.js';
import { Sprites } from './sprites.js';
import { Narrator } from './narrator.js';
import { describeTraits, ROLE_LABEL, CLASSES, RACES, ABILITIES, ABILITY_LABEL, XP_TABLE, MAX_LEVEL, mod, alignment } from './agent.js';
import { TPD, W, H, DEFS } from './world.js';

const $ = (s) => document.querySelector(s);
const SAVE_KEY = 'living-world-save-v2', LLM_KEY = 'living-world-llm', TICK_MS = 200, CW = 720, CH = 1280;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } } };

const canvas = $('#c'), ctx = canvas.getContext('2d');
canvas.width = CW; canvas.height = CH;
const sprites = new Sprites(), narrator = new Narrator(), llm = new LLM();
let sim, selected = null, tool = 'select', speed = 1, acc = 0, last = performance.now(), follow = false;
let introT = 0, autoCam = true, manualUntil = 0, showPoll = true, worldName = 'Alvorada';
const view = { x: 32, y: 36, zoom: 2.4 }, camGoal = { x: 32, y: 36, zoom: 2.4 };

// ---------- mundo ----------
function bind(s) {
  sim = s; sim.llm = llm; sim.onLog = addLog; sim.onBeat = (t, o) => narrator.push(t, o);
  narrator.clear(); selected = null; follow = false;
  $('#log').innerHTML = '';
  for (const e of sim.logs.slice(-80)) addLog(e);
  view.x = camGoal.x = sim.center.x; view.y = camGoal.y = sim.center.y; view.zoom = camGoal.zoom = 2.6;
  $('#worldName').value = sim.name; worldName = sim.name;
  renderCard(true); renderPoll();
}
function newWorld(seed = Math.floor(Math.random() * 1e9)) {
  bind(new Sim(seed, { name: $('#worldName').value.trim() || 'Alvorada' }));
  introT = 4;
  narrator.push(`Esse é o mundo de ${sim.name}.`, { prio: 3, at: [sim.center.x, sim.center.y] });
  narrator.push('Uma clareira, uma fogueira e dois moradores.', { prio: 3 });
  narrator.push('O resto, eles vão decidir sozinhos.', { prio: 3 });
}
function load() {
  const raw = store.get(SAVE_KEY);
  if (!raw) return false;
  try { bind(Sim.fromJSON(JSON.parse(raw))); return true; } catch (e) { console.warn('save inválido', e); return false; }
}
const save = () => store.set(SAVE_KEY, JSON.stringify(sim.toJSON()));

function addLog(e) {
  const el = document.createElement('div'); el.className = e.kind;
  el.innerHTML = `<span class="t">d${e.day} ${String(e.hour).padStart(2, '0')}h</span>${esc(e.text)}`;
  const box = $('#log'); box.prepend(el); while (box.children.length > 150) box.lastChild.remove();
}

// ---------- mapa: entrada ----------
const pointers = new Map();
let dragMoved = 0, pinch0 = 0;
const scale = () => canvas.width / canvas.getBoundingClientRect().width;
const tileAt = (e) => { const r = canvas.getBoundingClientRect(), k = scale(); return screenToTile(view, canvas, (e.clientX - r.left) * k, (e.clientY - r.top) * k); };
const pinchDist = () => { if (pointers.size < 2) return 0; const [a, b] = [...pointers.values()]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); };
const zoomBy = (f) => { camGoal.zoom = Math.max(0.55, Math.min(5, camGoal.zoom * f)); view.zoom = camGoal.zoom; manualUntil = performance.now() + 8000; };
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, e); dragMoved = 0; pinch0 = pinchDist(); });
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId); if (!prev) return;
  pointers.set(e.pointerId, e);
  if (pointers.size === 2) { const d = pinchDist(); if (pinch0) zoomBy(d / pinch0); pinch0 = d; dragMoved = 99; return; }
  const k = scale(), dx = (e.clientX - prev.clientX) * k, dy = (e.clientY - prev.clientY) * k;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  if (dragMoved > 8) { view.x -= dx / (TS * view.zoom); view.y -= dy / (TS * view.zoom); camGoal.x = view.x; camGoal.y = view.y; follow = false; manualUntil = performance.now() + 8000; }
});
canvas.addEventListener('pointerup', (e) => { pointers.delete(e.pointerId); if (dragMoved <= 8 && e.button === 0) onMapClick(tileAt(e)); });
canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); const t = tileAt(e); orderGoto(Math.floor(t.x), Math.floor(t.y)); });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });

function onMapClick(t) {
  const tx = Math.floor(t.x), ty = Math.floor(t.y);
  if (tool === 'select') {
    let best = null, bd = 1.3;
    for (const a of sim.living()) { const d = Math.hypot(a.x + 0.5 - t.x, a.y + 0.2 - t.y); if (d < bd) { bd = d; best = a; } }
    select(best ? best.id : null);
  } else if (tool === 'goto') orderGoto(tx, ty);
  else if (tool === 'meteor') sim.trigger('meteoro', tx, ty);
  else sim.placeTool(tool, tx, ty);
}
function orderGoto(x, y) { const a = selectedAgent(); if (a && sim.order(a, { type: 'goto', gx: x, gy: y })) renderCard(true); }

// ---------- painel: habitante ----------
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
  const cls = CLASSES[a.cls], nextXp = a.lvl >= MAX_LEVEL ? XP_TABLE[MAX_LEVEL] : XP_TABLE[a.lvl + 1], prevXp = XP_TABLE[a.lvl];
  const xpPct = a.lvl >= MAX_LEVEL ? 100 : Math.round(((a.xp - prevXp) / Math.max(1, nextXp - prevXp)) * 100);
  const html = `
    <h3 style="margin:2px 0">${esc(a.name)} ${a.alive ? '' : '† '}${a.role === 'rei' ? '👑 ' : ''}<span class="muted small">${esc(RACES[a.race].label)} ${esc(cls.label)} · nível ${a.lvl}</span></h3>
    <div class="small muted">${esc(ROLE_LABEL[a.role] || 'morador')} · ${esc(alignment(a))} · ${esc(describeTraits(a))}</div>
    <div class="small muted" style="margin:2px 0">${esc(cls.desc)}</div>
    ${bar('XP', xpPct, false)}
    <div class="sheet">${ABILITIES.map((k) => `<div>${ABILITY_LABEL[k]}<b>${a.stats[k]}</b>${mod(a.stats[k]) >= 0 ? '+' : ''}${mod(a.stats[k])}</div>`).join('')}</div>
    ${bar('Vida', (a.hp / a.maxHp) * 100, false)}${bar('Fome', a.hunger)}${bar('Cansaço', a.fatigue)}${bar('Solidão', a.loneliness)}
    <div class="small">PV ${Math.round(a.hp)}/${a.maxHp} · 🍖 ${a.inv.food} · 🪵 ${a.inv.wood} · 🪨 ${a.inv.stone} · ${home ? '🏠 tem casa' : '⛺ sem casa'}</div>
    <div class="small" style="margin-top:4px"><b>Agora:</b> ${esc(act)}${src}</div>
    <div class="thought">${a.thought ? '“' + esc(a.thought) + '”' : ''}</div>
    <div class="tags">${relHtml || '<span class="muted">sem laços ainda</span>'}</div>
    <div class="small muted" style="margin-top:6px">Diário</div>
    <div class="mem">${a.mem.slice(-12).reverse().map((m) => `<div>d${m.day}: ${esc(m.text)}</div>`).join('')}</div>`;
  if (force || html !== lastCardHtml) { body.className = ''; body.innerHTML = html; lastCardHtml = html; }
}
function renderPeople() {
  $('#people').innerHTML = sim.living().map((a) => {
    const act = a.pending ? 'pensando…' : a.sleeping ? 'dormindo' : a.act ? describeAct(sim, a.act) : '—';
    return `<button class="person${a.id === selected ? ' sel' : ''}" data-id="${a.id}"><span class="dot" style="background:hsl(${a.hue} 55% 48%)"></span>${esc(a.name)}${a.role === 'rei' ? ' 👑' : ''}<small>${esc(CLASSES[a.cls].label)} ${a.lvl} · ${esc(ROLE_LABEL[a.role] || '')} · ${esc(act)}</small></button>`;
  }).join('') || '<div class="muted">Ninguém restou.</div>';
}
$('#people').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) { select(+b.dataset.id); follow = true; } });

function renderTown() {
  const s = sim.stock, pop = sim.living().length, st = {};
  for (const x of sim.world.structures) st[x.type] = (st[x.type] || 0) + 1;
  const p = sim.nextProject();
  $('#town').innerHTML = `<div class="small">🏘 <b>${esc(sim.name)}</b> · ${TIERS[sim.tier()]} · 👥 <b>${pop}</b> moradores · † ${sim.stats.died}${sim.king ? ' · 👑 ' + esc(sim.byId(sim.king)?.name || '') : ''}</div>
    <div class="small">Armazém: 🍖 <b>${s.food}</b> · 🪵 <b>${s.wood}</b> · 🪨 <b>${s.stone}</b> · 🔨 <b>${s.tools}</b></div>
    <div class="small muted">🏠 ${st.cabin || 0} cabanas · 🌾 ${st.field || 0} campos · ${st.tower || 0} torres · ${st.wall || 0} estacas${st.castle ? ' · 🏰' : ''}</div>
    <div class="small muted">Próxima obra: ${p ? esc(buildingName(p.type)) : sim.needSpace ? 'abrindo espaço na floresta…' : 'juntando material…'}</div>`;
}
function renderClock() {
  const w = sim.weather.type, icon = w === 'chuva' ? '🌧' : w === 'seca' ? '🏜' : sim.hour() >= 19 || sim.hour() < 6 ? '🌙' : '☀';
  $('#clock').textContent = `Dia ${sim.day()} · ${String(Math.floor(sim.hour())).padStart(2, '0')}:${String(Math.floor((sim.hour() % 1) * 60)).padStart(2, '0')} · ${sim.seasonName()} · ${icon} ${w}${sim.decreeText && sim.tick < sim.decreeUntil ? ' · ✦ decreto' : ''}`;
}

// ---------- votação ----------
function renderPoll() {
  const box = $('#pollBox'), p = sim.poll;
  if (!p) { box.innerHTML = '<div class="muted small">Nenhuma votação aberta.</div>'; return; }
  box.innerHTML = `<div><b>${esc(p.q)}</b></div>` + p.options.map((o, i) => `<div class="row"><span style="flex:1">${esc(o.label)}</span><b id="v${i}">${o.votes}</b><button data-vote="${i}:1">+1</button><button data-vote="${i}:5">+5</button><button data-win="${i}">Vence</button></div>`).join('')
    + '<div class="row"><button id="pollEnd">Encerrar (mais votos)</button><button id="pollRand">Sortear</button></div>';
}
$('#pollBox').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.vote) { const [i, n] = b.dataset.vote.split(':').map(Number); sim.vote(i, n); $('#v' + i).textContent = sim.poll.options[i].votes; }
  else if (b.dataset.win) { sim.resolvePoll(+b.dataset.win); renderPoll(); }
  else if (b.id === 'pollEnd') { sim.resolvePoll(); renderPoll(); }
  else if (b.id === 'pollRand') { sim.resolvePoll(Math.floor(Math.random() * sim.poll.options.length)); renderPoll(); }
});
document.querySelectorAll('[data-poll]').forEach((b) => (b.onclick = () => { if (!sim.createPoll(b.dataset.poll)) sim.log('info', 'Não há opções suficientes para essa votação.'); renderPoll(); }));

// ---------- controles ----------
function setSpeed(n) { speed = n; $('#btnPause').textContent = n === 0 ? '▶' : '⏸'; document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', n !== 0 && +b.dataset.speed === n)); }
let lastSpeed = 1;
$('#btnPause').onclick = () => { if (speed) { lastSpeed = speed; setSpeed(0); } else setSpeed(lastSpeed); };
document.querySelectorAll('[data-speed]').forEach((b) => (b.onclick = () => setSpeed(+b.dataset.speed)));
window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $('#btnPause').click(); } });

const nameList = () => $('#nameList').value.split(/[\n,;]+/).map((s) => s.trim().replace(/^@/, '')).filter(Boolean);
$('#addOne').onclick = () => { const v = $('#oneName').value.trim().replace(/^@/, ''); sim.addFollowers(v ? [v] : []); $('#oneName').value = ''; };
$('#oneName').onkeydown = (e) => { if (e.key === 'Enter') $('#addOne').click(); };
$('#addCaravan').onclick = () => { const n = nameList(); if (n.length) { sim.addFollowers(n.slice(0, 60)); $('#nameList').value = ''; } };
document.querySelectorAll('[data-rand]').forEach((b) => (b.onclick = () => sim.addFollowers(Array(+b.dataset.rand).fill(null))));

$('#decreeBtn').onclick = () => { const v = $('#decreeIn').value.trim(); if (v) { sim.decree(v); $('#decreeIn').value = ''; } };
$('#decreeIn').onkeydown = (e) => { if (e.key === 'Enter') $('#decreeBtn').click(); };
$('#whisperBtn').onclick = () => { const a = selectedAgent(), v = $('#whisperIn').value.trim(); if (a && v) { sim.whisperTo(a, v); $('#whisperIn').value = ''; renderCard(true); } };
$('#whisperIn').onkeydown = (e) => { if (e.key === 'Enter') $('#whisperBtn').click(); };
$('#orderBtn').onclick = () => { const a = selectedAgent(); if (!a) return; const [type, kind] = $('#orderSel').value.split(':'); if (!sim.order(a, { type, kind })) sim.log('info', `${a.name} não consegue fazer isso agora.`, a.id); renderCard(true); };
$('#followBtn').onclick = () => { follow = !follow; };
$('#blessBtn').onclick = () => { const a = selectedAgent(); if (a) sim.bless(a); };
$('#smiteBtn').onclick = () => { const a = selectedAgent(); if (a) sim.smite(a); };
document.querySelectorAll('[data-event]').forEach((b) => (b.onclick = () => sim.trigger(b.dataset.event)));
document.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => {
  tool = b.dataset.tool;
  document.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b));
  const hints = { select: '', goto: 'Clique no mapa: o habitante selecionado vai até lá (ou botão direito).', tree: 'Clique para plantar uma árvore.', bush: 'Clique para criar um arbusto de frutas.', stone: 'Clique para criar uma pedra.', house: 'Clique para criar uma cabana pronta.', meteor: 'Clique para derrubar um meteoro.' };
  $('#toolhint').hidden = !hints[tool]; $('#toolhint').textContent = hints[tool];
}));

// narrador / câmera / gravação
$('#worldName').onchange = (e) => { sim.name = e.target.value.trim() || 'Alvorada'; };
$('#autoNarr').onchange = (e) => { narrator.enabled = e.target.checked; if (!narrator.enabled) narrator.clear(); };
$('#autoCam').onchange = (e) => { autoCam = e.target.checked; };
$('#showPoll').onchange = (e) => { showPoll = e.target.checked; };
$('#introBtn').onclick = () => { introT = 4; narrator.push(`Esse é o mundo de ${sim.name}.`, { prio: 3 }); narrator.push(`Esse é o mundo de ${sim.name}.`, { prio: 3 }); };
$('#scriptBtn').onclick = async () => {
  const evs = sim.logs.filter((l) => l.t > sim.tick - TPD * 2 && l.kind !== 'info' && l.kind !== 'talk').map((l) => `[dia ${l.day}, ${String(l.hour).padStart(2, '0')}h] ${l.text}`);
  const box = $('#narr'); box.hidden = false;
  if (!evs.length) { box.textContent = 'Nada digno de nota nos últimos dias.'; return; }
  let lines;
  if (llm.enabled && llm.pick()) {
    box.textContent = 'O cronista afia a pena…';
    try { const txt = await llm.narrate(sim, evs); box.textContent = txt; lines = txt.split(/(?<=[.!?])\s+/).filter(Boolean); } catch (e) { llm.fail(e); box.textContent = 'O cronista falhou: ' + e.message; return; }
  } else { lines = evs.slice(-8).map((x) => x.replace(/^\[[^\]]+\]\s*/, '')); box.textContent = lines.join('\n'); }
  for (const l of lines.slice(0, 14)) narrator.push(l, { prio: 2 });
};

let recorder = null, chunks = [];
$('#recBtn').onclick = () => {
  if (recorder) { recorder.stop(); return; }
  if (!canvas.captureStream || !window.MediaRecorder) { sim.log('info', 'Este navegador não suporta gravação do canvas.'); return; }
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
  recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: mime, videoBitsPerSecond: 6e6 });
  chunks = []; recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType })); a.download = `${sim.name.toLowerCase()}-dia${sim.day()}.${recorder.mimeType.includes('mp4') ? 'mp4' : 'webm'}`; a.click(); recorder = null; $('#recBtn').textContent = '⏺ Gravar clipe'; $('#recBtn').classList.remove('danger'); };
  recorder.start(); $('#recBtn').textContent = '⏹ Parar e baixar'; $('#recBtn').classList.add('danger');
};

// Mentes (IA): vários provedores, cada um com limites próprios
const MINDS_KEY = 'living-world-minds';
try { llm.load(JSON.parse(store.get(MINDS_KEY) || 'null')); } catch { /* ignore */ }
const saveMinds = () => store.set(MINDS_KEY, JSON.stringify(llm.toJSON()));
$('#mindPreset').innerHTML = Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('');
function renderMinds() {
  $('#minds').innerHTML = llm.providers.map((p, i) => `<div class="mind" data-i="${i}">
    <div class="row"><label class="small"><input type="checkbox" data-f="enabled" ${p.enabled ? 'checked' : ''}> <b>${esc(p.label)}</b></label><span style="flex:1"></span><button data-del="${i}" title="Remover">✕</button></div>
    <div class="row"><input data-f="baseUrl" value="${esc(p.baseUrl)}" placeholder="URL da mente"></div>
    <div class="row"><input data-f="key" type="password" value="${esc(p.key)}" placeholder="${p.keyOptional ? 'chave (opcional)' : 'chave de API'}" autocomplete="off"></div>
    <div class="row"><input data-f="model" value="${esc(p.model)}" placeholder="modelo"></div>
    <div class="row small"><span>por minuto</span><input data-f="rpm" type="number" min="1" value="${p.rpm}"><span>por dia</span><input data-f="rpd" type="number" min="1" value="${p.rpd}"></div>
    <div class="st" id="mst${i}"></div></div>`).join('') || '<div class="muted small">Nenhuma mente adicionada. Escolha uma abaixo (ex.: Gemini ou Groq, ambos com plano grátis).</div>';
}
$('#minds').addEventListener('change', (e) => {
  const box = e.target.closest('[data-i]'), f = e.target.dataset.f; if (!box || !f) return;
  const p = llm.providers[+box.dataset.i]; p[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Math.max(1, +e.target.value || 1) : e.target.value.trim(); saveMinds();
});
$('#minds').addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (b) { llm.providers.splice(+b.dataset.del, 1); saveMinds(); renderMinds(); } });
$('#mindAdd').onclick = () => { llm.providers.push(newProvider($('#mindPreset').value)); saveMinds(); renderMinds(); };
$('#llmOn').onchange = (e) => { llm.enabled = e.target.checked; saveMinds(); renderLLM(); };
$('#llmShare').oninput = (e) => { llm.share = +e.target.value; $('#llmShareV').textContent = llm.share + '%'; saveMinds(); };
$('#llmOn').checked = llm.enabled; $('#llmShare').value = llm.share; $('#llmShareV').textContent = llm.share + '%';
function renderLLM() {
  const s = llm.stats, now = Date.now();
  llm.providers.forEach((p, i) => { const el = $('#mst' + i); if (!el) return; const r = llm.state(p); const wait = Math.ceil((r.cool - now) / 1000); el.textContent = `${r.stats.calls} chamadas · ${r.dayCount}/${p.rpd} hoje · ${r.stamps.filter((t) => now - t < 60000).length}/${p.rpm} no minuto · ${r.stats.errors} erros${wait > 0 ? ` · em espera ${wait}s` : ''}${r.lastError ? ' · ' + r.lastError : ''}`; });
  $('#llmStats').textContent = `Total: ${s.calls} chamadas · ${s.inTok} tokens de entrada / ${s.outTok} de saída${llm.enabled && !llm.providers.some((p) => llm.usable(p)) ? ' · nenhuma mente disponível agora (usando instinto)' : ''}`;
  $('#llmOn').checked = llm.enabled;
}
llm.onChange = renderLLM;
renderMinds();

$('#saveBtn').onclick = () => { $('#saveBtn').textContent = save() ? '✅ Salvo' : '❌ Falhou'; setTimeout(() => ($('#saveBtn').textContent = '💾 Salvar'), 1500); };
$('#loadBtn').onclick = () => { if (!load()) sim.log('info', 'Nenhum jogo salvo ainda.'); };
let newArmed = 0;
$('#newBtn').onclick = () => {   // confirmação na própria tela (confirm() não existe em páginas publicadas)
  if (performance.now() < newArmed) { newArmed = 0; $('#newBtn').textContent = '🌍 Novo mundo'; newWorld(); return; }
  newArmed = performance.now() + 4000; $('#newBtn').textContent = 'Clique de novo: perde o mundo atual';
  setTimeout(() => { if (performance.now() >= newArmed) $('#newBtn').textContent = '🌍 Novo mundo'; }, 4100);
};
$('#exportBtn').onclick = () => {
  const text = sim.logs.map((l) => `[dia ${l.day} ${String(l.hour).padStart(2, '0')}h] ${l.text}`).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); a.download = `cronica-dia-${sim.day()}.txt`; a.click(); URL.revokeObjectURL(a.href);
};

// ---------- câmera automática ("diretor") ----------
function director(dt) {
  const cur = narrator.current(), now = performance.now();
  if (follow && selectedAgent()) { const a = selectedAgent(); camGoal.x = a.x + 0.5; camGoal.y = a.y; camGoal.zoom = Math.max(camGoal.zoom, 2.6); }
  else if (autoCam && now > manualUntil) {
    if (cur && cur.at) { camGoal.x = cur.at[0]; camGoal.y = cur.at[1]; camGoal.zoom = 2.7; }
    else if (cur && cur.agent && sim.byId(cur.agent)) { const a = sim.byId(cur.agent); camGoal.x = a.x + 0.5; camGoal.y = a.y; camGoal.zoom = 3; }
    else {
      const st = sim.world.structures.filter((s) => s.type !== 'wall'); let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (const s of st) { minx = Math.min(minx, s.x); maxx = Math.max(maxx, s.x + s.w); miny = Math.min(miny, s.y); maxy = Math.max(maxy, s.y + s.h); }
      camGoal.x = (minx + maxx) / 2; camGoal.y = (miny + maxy) / 2 - 1;
      camGoal.zoom = Math.max(0.8, Math.min(2.6, Math.min(CW / (TS * (maxx - minx + 8)), CH / (TS * (maxy - miny + 10)))));
    }
  }
  const k = 1 - Math.pow(0.04, dt);
  view.x += (camGoal.x - view.x) * k; view.y += (camGoal.y - view.y) * k; view.zoom += (camGoal.zoom - view.zoom) * k;
}

// ---------- loop ----------
function frame(nowMs) {
  const dt = Math.min(0.25, (nowMs - last) / 1000); last = nowMs;
  if (speed > 0) { acc += dt * 1000 * speed; let n = 0; while (acc >= TICK_MS && n < 40) { sim.step(); acc -= TICK_MS; n++; } if (n === 40) acc = 0; }
  narrator.update(dt); director(dt);
  if (introT > 0) introT -= dt;
  const cur = narrator.current();
  draw(ctx, canvas, sim, view, {
    sprites, selected, frac: speed > 0 ? Math.min(1, acc / TICK_MS) : 1, intro: Math.max(0, introT),
    scene: cur?.scene || null, sceneT: cur?.t || 0, caption: cur, highlight: cur?.agent || null, poll: showPoll ? sim.poll : null,
  });
  requestAnimationFrame(frame);
}

setInterval(() => { renderClock(); renderTown(); renderPeople(); renderCard(false); renderLLM(); }, 500);
setInterval(() => { if (sim) save(); }, 30000);
window.addEventListener('beforeunload', () => { if (sim) save(); });

if (!load()) newWorld();
setSpeed(1); renderClock(); renderTown(); renderPeople(); renderLLM(); renderPoll();
(document.fonts && document.fonts.load ? document.fonts.load("20px 'Pixelify Sans'") : Promise.resolve()).catch(() => {}).finally(() => requestAnimationFrame(frame));
window.__world = { get sim() { return sim; }, llm, narrator, view, camGoal };
