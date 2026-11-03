// Renderização em pixel art (canvas 2D). view = {x, y, zoom}: x,y = centro em tiles; zoom = escala dos 16 px nativos.
import { T, K, W, H } from './world.js';
import { drawScene } from './scenes.js';

export const TS = 16;
export const FONT = "'Pixelify Sans', 'Silkscreen', monospace";
const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

export function screenToTile(view, canvas, sx, sy) {
  const S = TS * view.zoom;
  return { x: (sx - canvas.width / 2) / S + view.x, y: (sy - canvas.height / 2) / S + view.y };
}

export function darkness(hr) {
  return hr >= 7 && hr < 18 ? 0 : hr >= 18 && hr < 22 ? ((hr - 18) / 4) * 0.62 : hr >= 22 || hr < 4 ? 0.62 : hr >= 4 && hr < 7 ? 0.62 * (1 - (hr - 4) / 3) : 0;
}

export function draw(ctx, canvas, sim, view, ui) {
  const sp = ui.sprites, w = sim.world, cw = canvas.width, ch = canvas.height;
  const S = TS * view.zoom, z = view.zoom, now = performance.now() / 1000, frac = ui.frac ?? 1;
  ctx.imageSmoothingEnabled = false;
  const sc = ui.scene;
  if (sc) { drawScene(ctx, sc, cw, ch, ui.sceneT || 0); return overlay(ctx, cw, ch, sim, ui); }

  const ox = Math.round(cw / 2 - view.x * S), oy = Math.round(ch / 2 - view.y * S);
  const X = (tx) => Math.floor(ox + tx * S), Y = (ty) => Math.floor(oy + ty * S);
  const season = sim.season(), tiles = sp.tiles[season], trees = sp.trees[season];
  ctx.fillStyle = '#1b3320'; ctx.fillRect(0, 0, cw, ch);
  const x0 = Math.max(0, Math.floor(-ox / S) - 1), y0 = Math.max(0, Math.floor(-oy / S) - 1);
  const x1 = Math.min(W - 1, Math.ceil((cw - ox) / S)), y1 = Math.min(H - 1, Math.ceil((ch - oy) / S));
  const blit = (img, tx, ty) => ctx.drawImage(img, X(tx), Y(ty), X(tx + 1) - X(tx), Y(ty + 1) - Y(ty));
  const wf = Math.floor(now * 2) % 2;

  // 1) chão
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x, t = w.tile[i], h = hash(x, y);
    let img;
    if (t === T.GRASS || t === T.FIELD) img = tiles.grass[(w.shade[i] + (h % 11 === 0 ? 1 : 0)) & 3];
    else if (t === T.FOREST) img = tiles.dark;
    else if (t === T.PATH) img = tiles.path[h & 1];
    else if (t === T.COBBLE) img = tiles.cobble;
    else if (t === T.ROCK) img = tiles.rock[h & 1];
    else img = tiles.water[(wf + (x + y)) & 1];
    blit(img, x, y);
  }
  // 2) campos de plantação
  for (const f of w.structures) {
    if (f.type !== 'field') continue;
    for (let yy = f.y; yy < f.y + f.h; yy++) for (let xx = f.x; xx < f.x + f.w; xx++) blit(tiles.field[f.stage || 0], xx, yy);
  }
  // picos da montanha
  for (let px = 14; px < W - 8; px += 11) {
    const py = H - 30 + ((px * 7) % 5);
    if (py > y1 + 3 || py < y0 - 4) continue;
    ctx.drawImage(sp.misc.peak, X(px), Y(py) - 36 * z, 48 * z, 36 * z);
  }

  // 3) objetos ordenados por linha
  const rows = new Map();
  const push = (row, fn) => { if (!rows.has(row)) rows.set(row, []); rows.get(row).push(fn); };
  const night = darkness(sim.hour());
  const lights = [];
  const drawBottom = (img, tx, ty, wTiles, hTiles, imgH) => ctx.drawImage(img, X(tx), Y(ty + hTiles) - imgH * z, img.width * z, img.height * z);
  for (const st of w.structures) {
    if (st.type === 'field') continue;
    const bot = st.y + st.h - 1;
    if (bot < y0 - 3 || st.y > y1 + 1 || st.x > x1 + 1 || st.x + st.w < x0 - 1) continue;
    push(bot, () => {
      const m = sp.misc;
      switch (st.type) {
        case 'campfire': { blit(m.campfire, st.x, st.y); const f = m.flame[Math.floor(now * 8) % 2]; ctx.drawImage(f, X(st.x) + 3 * z, Y(st.y) - 2 * z, 10 * z, 12 * z); lights.push([st.x + 0.5, st.y + 0.5, 5.5]); break; }
        case 'storehouse': ctx.drawImage(m.storehouse, X(st.x), Y(st.y), 32 * z, 16 * z); break;
        case 'tent': blit(m.tent[st.variant % 3], st.x, st.y); break;
        case 'cabin': drawBottom(m.cabin[st.variant % 5], st.x, st.y, 2, 2, 40);
          if (night > 0.2) { ctx.fillStyle = '#ffd770'; [[5, 25], [23, 25]].forEach(([wx, wy]) => ctx.fillRect(X(st.x) + wx * z, Y(st.y + 2) - (40 - wy) * z, 5 * z, 5 * z)); lights.push([st.x + 1, st.y + 1.6, 2]); } break;
        case 'well': drawBottom(m.well, st.x, st.y, 1, 1, 24); break;
        case 'barn': drawBottom(m.barn, st.x, st.y, 3, 2, 40); break;
        case 'forge': drawBottom(m.forge, st.x, st.y, 2, 2, 40); lights.push([st.x + 1, st.y + 1.5, 3]); break;
        case 'market': drawBottom(m.market, st.x, st.y, 2, 1, 28); break;
        case 'tower': drawBottom(m.tower, st.x, st.y, 1, 2, 40); ctx.drawImage(m.flame[Math.floor(now * 8) % 2], X(st.x) + 3 * z, Y(st.y) - 12 * z, 10 * z, 12 * z); lights.push([st.x + 0.5, st.y, 3]); break;
        case 'wall': blit(m.wall, st.x, st.y); break;
        case 'library': drawBottom(m.library, st.x, st.y, 3, 2, 40); if (night > 0.2) lights.push([st.x + 1.5, st.y + 1.5, 2.5]); break;
        case 'castle': drawBottom(m.castle, st.x, st.y, 7, 4, 80); lights.push([st.x + 3.5, st.y + 2, 5]); break;
      }
    });
  }
  for (const d of w.decor) {
    const m = sp.misc, bot = d.y + d.h - 1;
    if (bot < y0 - 3 || d.y > y1 + 1) continue;
    push(bot, () => {
      if (d.type === 'skeleton') ctx.drawImage(m.skeleton, X(d.x), Y(d.y + d.h) - 48 * z, 96 * z, 48 * z);
      else if (d.type === 'obelisk') ctx.drawImage(m.obelisk, X(d.x), Y(d.y + d.h) - 48 * z, 32 * z, 48 * z);
      else if (d.type === 'waterfall') ctx.drawImage(m.waterfall[Math.floor(now * 4) % 3], X(d.x), Y(d.y + d.h) - 48 * z, 64 * z, 48 * z);
      else if (d.type === 'pegadas') ctx.drawImage(m.pegadas, X(d.x), Y(d.y), 32 * z, 32 * z);
    });
  }
  for (const g of sim.graves) push(g.y, () => ctx.drawImage(sp.misc.grave, X(g.x) + 3 * z, Y(g.y) + 2 * z, 10 * z, 12 * z));
  for (const an of sim.animals) {
    const ax = an.px + (an.x - an.px) * frac, ay = an.py + (an.y - an.py) * frac;
    push(Math.round(ay), () => { const img = sp.misc[an.kind]; ctx.drawImage(img, X(ax) + (16 - img.width) / 2 * z, Y(ay + 1) - img.height * z - 1 * z, img.width * z, img.height * z); });
  }
  const sel = ui.selected, hl = ui.highlight;
  const dark = night;
  for (const a of sim.living()) {
    const ax = a.px + (a.x - a.px) * frac, ay = a.py + (a.y - a.py) * frac;
    push(Math.round(ay), () => {
      const moving = a.px !== a.x || a.py !== a.y;
      const img = sp.person(a, moving ? (Math.floor(now * 7) & 1) : 0, a.role === 'rei' ? 1 : 0);
      const cx = X(ax) + 3 * z, by = Y(ay + 1) - 16 * z - 1 * z;
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(X(ax) + 3 * z, Y(ay + 1) - 3 * z, 10 * z, 2 * z);
      if (a.sleeping) { ctx.globalAlpha = 0.75; ctx.save(); ctx.translate(cx + 5 * z, by + 12 * z); ctx.rotate(Math.PI / 2); ctx.drawImage(img, -5 * z, -8 * z, 10 * z, 16 * z); ctx.restore(); ctx.globalAlpha = 1; textPx(ctx, 'z', X(ax) + 11 * z, by + 2 * z, Math.max(10, 6 * z), '#cfe3ff'); }
      else ctx.drawImage(img, cx, by, 10 * z, 16 * z);
      const torch = dark > 0.25 && (a.role === 'guarda' || (a.act && (a.act.type === 'expedition' || a.act.type === 'patrol')));
      if (torch) { ctx.drawImage(sp.misc.flame[Math.floor(now * 8 + a.id) % 2], cx + 8 * z, by + 2 * z, 7 * z, 8 * z); lights.push([ax + 0.9, ay + 0.2, 2.4]); }
      if (a.hp < 100 && !a.sleeping) { ctx.fillStyle = '#400'; ctx.fillRect(cx, by - 4 * z, 10 * z, 2 * z); ctx.fillStyle = '#e44'; ctx.fillRect(cx, by - 4 * z, 10 * z * Math.max(0, a.hp) / 100, 2 * z); }
      if (a.pending) textPx(ctx, '…', cx + 2 * z, by - 2 * z, Math.max(12, 8 * z), '#fff');
      if (sel === a.id || hl === a.id || z >= 2.6) label(ctx, a.name, X(ax) + 8 * z, by - (a.hp < 100 ? 6 : 2) * z, Math.max(11, 5.2 * z), sel === a.id || hl === a.id);
    });
  }
  const last = Math.min(H - 1, y1 + 3);
  for (let y = y0; y <= last; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x, k = w.rk[i];
      if (!k || (k !== K.FOOD && !w.ra[i])) continue;
      const t = w.tile[i], h = hash(x, y);
      if (t === T.FOREST && k === K.WOOD && w.ra[i] > 0) {
        const v = h % 10, img = v < 6 ? trees.pine[v & 1] : trees.round[v < 9 ? v % 3 : 2];
        ctx.drawImage(img, X(x), Y(y + 1) - img.height * z, 16 * z, img.height * z);
      } else if (k === K.FOOD) { const im = w.ra[i] > 0 ? sp.misc.berries : sp.misc.bush; ctx.drawImage(im, X(x), Y(y + 1) - 12 * z, 16 * z, 12 * z); }
      else if (k === K.STONE) ctx.drawImage(sp.misc.stone, X(x), Y(y + 1) - 12 * z, 16 * z, 12 * z);
      else if (k === K.WOOD && w.ra[i] > 0) ctx.drawImage(trees.round[h % 3], X(x), Y(y + 1) - 24 * z, 16 * z, 24 * z);
    }
    const list = rows.get(y);
    if (list) for (const fn of list) fn();
  }

  // 4) luz e clima
  if (dark > 0.02) {
    ctx.fillStyle = `rgba(8,12,44,${dark})`; ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, dark * 1.5);
    for (const [lx, ly, lr] of lights) ctx.drawImage(sp.light, X(lx) - lr * S, Y(ly) - lr * S, lr * S * 2, lr * S * 2);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  } else { ctx.fillStyle = 'rgba(14,34,16,.10)'; ctx.fillRect(0, 0, cw, ch); }
  if (sim.weather.type === 'chuva') {
    ctx.strokeStyle = 'rgba(170,200,255,.5)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 140; i++) { const rx = (Math.sin(i * 91.7) * 0.5 + 0.5) * cw, ry = (i * 53.3 + now * 700) % ch; ctx.moveTo(rx, ry); ctx.lineTo(rx - 6, ry + 18); }
    ctx.stroke(); ctx.fillStyle = 'rgba(30,50,90,.2)'; ctx.fillRect(0, 0, cw, ch);
  } else if (sim.weather.type === 'seca') { ctx.fillStyle = 'rgba(200,140,40,.18)'; ctx.fillRect(0, 0, cw, ch); }
  if (season === 3) { ctx.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 70; i++) { const sx = ((i * 97 + now * 30 * (1 + i % 3)) % cw), sy = ((i * 61 + now * 60) % ch); ctx.fillRect(sx, sy, 3, 3); } }
  if (sim.meteor && sim.tick - sim.meteor.t < 25) { const k2 = 1 - (sim.tick - sim.meteor.t) / 25; ctx.fillStyle = `rgba(255,140,40,${0.5 * k2})`; ctx.beginPath(); ctx.arc(X(sim.meteor.x + 0.5), Y(sim.meteor.y + 0.5), S * 2.6, 0, 6.3); ctx.fill(); }
  drawBubbles(ctx, sim, view, canvas, frac);
  overlay(ctx, cw, ch, sim, ui);
}

// HUD, introdução e legendas (desenhados no canvas para entrar na gravação).
function overlay(ctx, cw, ch, sim, ui) {
  if (ui.hud !== false) {
    const txt = `${sim.living().length} seguidores · dia ${sim.day()} · ${sim.tierName()}`;
    ctx.font = `20px ${FONT}`; const tw = ctx.measureText(txt).width;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(cw / 2 - tw / 2 - 12, 18, tw + 24, 34);
    textPx(ctx, txt, cw / 2, 43, 20, '#f2e6b8', 'center');
  }
  if (ui.intro > 0) {
    const a = Math.min(1, ui.intro * 2);
    ctx.globalAlpha = a; ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, cw, ch);
    textPx(ctx, 'ESSA PÁGINA TEM', cw / 2, ch * 0.13, 34, '#9aa38c', 'center');
    textPx(ctx, String(sim.living().length), cw / 2, ch * 0.13 + 100, 110, '#f7e19c', 'center');
    textPx(ctx, 'SEGUIDORES', cw / 2, ch * 0.13 + 150, 34, '#9aa38c', 'center');
    ctx.globalAlpha = 1;
  }
  if (ui.poll) {
    const p = ui.poll; ctx.fillStyle = 'rgba(20,16,40,.82)'; ctx.fillRect(40, ch * 0.2, cw - 80, 70 + p.options.length * 56);
    ctx.strokeStyle = '#f7e19c'; ctx.lineWidth = 3; ctx.strokeRect(40, ch * 0.2, cw - 80, 70 + p.options.length * 56);
    textPx(ctx, 'VOTAÇÃO NOS STORIES', cw / 2, ch * 0.2 + 28, 20, '#9aa38c', 'center');
    textPx(ctx, p.q.toUpperCase(), cw / 2, ch * 0.2 + 60, 24, '#f7e19c', 'center');
    const tot = Math.max(1, p.options.reduce((s, o) => s + o.votes, 0));
    p.options.forEach((o, i) => { const y = ch * 0.2 + 84 + i * 56; ctx.fillStyle = '#2a2548'; ctx.fillRect(64, y, cw - 128, 40); ctx.fillStyle = '#6b4aa8'; ctx.fillRect(64, y, (cw - 128) * (o.votes / tot), 40); textPx(ctx, `${o.label.toUpperCase()}  ${o.votes}`, 80, y + 28, 22, '#fff', 'left'); });
  }
  const cur = ui.caption;
  if (cur) {
    const words = cur.chunk.toUpperCase().split(' ');
    const longest = words.reduce((b, x, i) => (x.length > words[b].length ? i : b), 0);
    ctx.font = `40px ${FONT}`;
    const gap = 16, widths = words.map((x) => ctx.measureText(x).width), total = widths.reduce((s, v) => s + v, 0) + gap * (words.length - 1);
    let x = cw / 2 - total / 2; const y = ch * 0.735;
    words.forEach((wd, i) => { textPx(ctx, wd, x, y, 40, i === longest ? '#f7e19c' : '#f4f4ee', 'left', 9); x += widths[i] + gap; });
  }
}

export function textPx(ctx, text, x, y, size, color, align = 'left', stroke = 5) {
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = align; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(10,10,14,.9)'; ctx.lineWidth = stroke; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function label(ctx, name, cx, y, size, strong) {
  ctx.font = `${size}px ${FONT}`; const w = ctx.measureText(name.toUpperCase()).width + 10;
  if (strong) { ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(cx - w / 2, y - size - 2, w, size + 8); ctx.strokeStyle = '#f7e19c'; ctx.lineWidth = 2; ctx.strokeRect(cx - w / 2, y - size - 2, w, size + 8); }
  textPx(ctx, name.toUpperCase(), cx, y, size, strong ? '#f7e19c' : '#fff', 'center', 4);
}

// Balões de fala (pixel art), desenhados depois do overlay de luz para ficarem legíveis.
export function drawBubbles(ctx, sim, view, canvas, frac) {
  const S = TS * view.zoom, ox = Math.round(canvas.width / 2 - view.x * S), oy = Math.round(canvas.height / 2 - view.y * S);
  for (const a of sim.living()) {
    if (sim.tick > a.sayUntil || !a.say) continue;
    const ax = a.px + (a.x - a.px) * frac, ay = a.py + (a.y - a.py) * frac;
    const cx = ox + (ax + 0.5) * S, cy = oy + ay * S - 20 * view.zoom;
    if (cx < -100 || cx > canvas.width + 100 || cy < -50 || cy > canvas.height + 50) continue;
    const fs = Math.max(13, 5.5 * view.zoom), lines = wrap(ctx, a.say, fs, 24).slice(0, 3);
    ctx.font = `${fs}px ${FONT}`; const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14, bh = lines.length * fs * 1.15 + 10;
    ctx.fillStyle = '#fbf6e6'; ctx.fillRect(cx - bw / 2, cy - bh, bw, bh); ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 3; ctx.strokeRect(cx - bw / 2, cy - bh, bw, bh);
    ctx.fillStyle = '#fbf6e6'; ctx.fillRect(cx - 4, cy, 8, 6); ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'center';
    lines.forEach((l, i) => ctx.fillText(l, cx, cy - bh + 6 + fs * 0.95 + i * fs * 1.15));
  }
}
function wrap(ctx, text, fs, max) { const words = text.split(' '), out = []; let cur = ''; for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) out.push(cur); return out; }
