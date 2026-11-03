// Renderização em canvas 2D. Câmera: view = {x, y, zoom} (x,y = centro em tiles).
import { T, K, W, H, TPD } from './world.js';

export const TS = 16;
const PAL = {
  deep: '#1d3a5f', shallow: '#2f6f93', sand: '#dcc88f',
  grass: ['#6aa84f', '#5e9c46', '#69a850', '#5a9843'],
  grassSeason: ['#7bc062', '#6aa84f', '#b08a3a', '#c9d9de'],
  forest: ['#4b8a3b', '#3f7d37', '#457f3a'], forestWinter: '#9fb8bf',
  rock: '#8b8d94',
};
const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

export function screenToTile(view, canvas, sx, sy) {
  const z = TS * view.zoom;
  return { x: (sx - canvas.width / 2) / z + view.x, y: (sy - canvas.height / 2) / z + view.y };
}

export function draw(ctx, canvas, sim, view, ui) {
  const z = TS * view.zoom, cw = canvas.width, ch = canvas.height, w = sim.world;
  const ox = cw / 2 - view.x * z, oy = ch / 2 - view.y * z;
  const sea = ctx.createLinearGradient(0, 0, 0, ch);
  sea.addColorStop(0, '#142c49'); sea.addColorStop(1, '#10263f');
  ctx.fillStyle = sea; ctx.fillRect(0, 0, cw, ch);
  const x0 = Math.max(0, Math.floor(-ox / z)), y0 = Math.max(0, Math.floor(-oy / z));
  const x1 = Math.min(W - 1, Math.ceil((cw - ox) / z)), y1 = Math.min(H - 1, Math.ceil((ch - oy) / z));
  const season = sim.season(), now = performance.now() / 1000;
  const frac = ui.frac ?? 1;

  // terreno
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x, t = w.tile[i], h = hash(x, y);
    let c;
    if (t === T.DEEP) c = PAL.deep;
    else if (t === T.SHALLOW) c = PAL.shallow;
    else if (t === T.SAND) c = season === 3 ? '#e6e0c8' : PAL.sand;
    else if (t === T.ROCK) c = PAL.rock;
    else if (t === T.FOREST) c = season === 3 ? PAL.forestWinter : PAL.forest[h % 3];
    else c = season === 0 && h % 7 === 0 ? '#86c46b' : season === 2 && h % 5 === 0 ? '#c79a3d' : PAL.grassSeason[season] && h % 4 !== 0 ? PAL.grassSeason[season] : PAL.grass[h % 4];
    ctx.fillStyle = c;
    ctx.fillRect(Math.floor(ox + x * z), Math.floor(oy + y * z), Math.ceil(z) + 0.5, Math.ceil(z) + 0.5);
    if (t === T.SHALLOW && (h + Math.floor(now * 1.5)) % 11 === 0) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(ox + x * z + z * 0.2, oy + y * z + z * 0.5, z * 0.5, Math.max(1, z * 0.08)); }
  }

  // recursos
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x, k = w.rk[i];
    if (!k) continue;
    const full = w.ra[i] / w.rm[i], cx = ox + (x + 0.5) * z, cy = oy + (y + 0.5) * z, t = w.tile[i];
    if (k === K.WOOD) {
      if (w.ra[i] === 0) { ctx.fillStyle = '#6b4a2b'; ctx.fillRect(cx - z * 0.12, cy, z * 0.24, z * 0.2); continue; }
      ctx.fillStyle = '#5b3d22'; ctx.fillRect(cx - z * 0.07, cy + z * 0.05, z * 0.14, z * 0.3);
      ctx.fillStyle = season === 3 ? '#e8f0f2' : season === 2 ? '#b9742b' : '#2f6b2b';
      ctx.beginPath(); ctx.arc(cx, cy - z * 0.05, z * (0.2 + 0.18 * full), 0, 6.3); ctx.fill();
    } else if (k === K.FOOD && t === T.SAND) {
      if (w.ra[i] === 0) continue;
      ctx.fillStyle = '#f4f7fb'; ctx.beginPath(); ctx.ellipse(cx, cy, z * 0.22, z * 0.1, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#9ec9e6'; ctx.fillRect(cx + z * 0.18, cy - z * 0.05, z * 0.1, z * 0.1);
    } else if (k === K.FOOD) {
      ctx.fillStyle = '#3a7a35'; ctx.beginPath(); ctx.arc(cx, cy, z * 0.26, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#d6335b';
      for (let b = 0; b < w.ra[i]; b++) { ctx.beginPath(); ctx.arc(cx + Math.cos(b * 2) * z * 0.14, cy + Math.sin(b * 2) * z * 0.14, z * 0.06, 0, 6.3); ctx.fill(); }
    } else if (k === K.STONE) {
      ctx.fillStyle = t === T.ROCK ? '#b8bac2' : '#9a9ca4';
      ctx.beginPath(); ctx.moveTo(cx - z * 0.25, cy + z * 0.2); ctx.lineTo(cx - z * 0.1, cy - z * (0.1 + 0.2 * full)); ctx.lineTo(cx + z * 0.12, cy - z * 0.05); ctx.lineTo(cx + z * 0.28, cy + z * 0.2); ctx.closePath(); ctx.fill();
    }
  }

  // estruturas
  for (const s of w.structures) {
    const x = ox + s.x * z, y = oy + s.y * z;
    if (s.type === 'house') {
      ctx.fillStyle = '#b98a58'; ctx.fillRect(x + z * 0.12, y + z * 0.4, z * 0.76, z * 0.5);
      ctx.fillStyle = '#a23c34'; ctx.beginPath(); ctx.moveTo(x, y + z * 0.45); ctx.lineTo(x + z * 0.5, y + z * 0.08); ctx.lineTo(x + z, y + z * 0.45); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4a321d'; ctx.fillRect(x + z * 0.42, y + z * 0.62, z * 0.18, z * 0.28);
    } else if (s.type === 'storehouse') {
      ctx.fillStyle = '#8a6a3f'; ctx.fillRect(x + z * 0.05, y + z * 0.25, z * 0.9, z * 0.65);
      ctx.fillStyle = '#5e4527'; ctx.fillRect(x, y + z * 0.15, z, z * 0.18);
      ctx.fillStyle = '#d9b673'; ctx.fillRect(x + z * 0.3, y + z * 0.5, z * 0.4, z * 0.4);
    } else if (s.type === 'fire') {
      ctx.fillStyle = '#4a3b2a'; ctx.fillRect(x + z * 0.2, y + z * 0.7, z * 0.6, z * 0.15);
      ctx.fillStyle = '#ff8a1f'; const f = 0.3 + 0.08 * Math.sin(now * 9 + s.x);
      ctx.beginPath(); ctx.moveTo(x + z * 0.3, y + z * 0.75); ctx.quadraticCurveTo(x + z * 0.5, y + z * (0.75 - f * 2), x + z * 0.7, y + z * 0.75); ctx.fill();
    }
  }
  for (const g of sim.graves) {
    ctx.fillStyle = '#c9cbd2'; const x = ox + g.x * z, y = oy + g.y * z;
    ctx.fillRect(x + z * 0.38, y + z * 0.3, z * 0.24, z * 0.5); ctx.fillRect(x + z * 0.28, y + z * 0.4, z * 0.44, z * 0.12);
  }
  if (sim.meteor && sim.tick - sim.meteor.t < 30) {
    ctx.fillStyle = `rgba(255,140,40,${0.6 * (1 - (sim.tick - sim.meteor.t) / 30)})`;
    ctx.beginPath(); ctx.arc(ox + (sim.meteor.x + 0.5) * z, oy + (sim.meteor.y + 0.5) * z, z * 2.6, 0, 6.3); ctx.fill();
  }

  // agentes
  const agents = sim.living().slice().sort((a, b) => a.y - b.y);
  for (const a of agents) {
    const ax = a.px + (a.x - a.px) * frac, ay = a.py + (a.y - a.py) * frac;
    const cx = ox + (ax + 0.5) * z, cy = oy + (ay + 0.5) * z, r = z * 0.32;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.9, r * 0.9, r * 0.35, 0, 0, 6.3); ctx.fill();
    if (ui.selected === a.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, 6.3); ctx.stroke(); }
    ctx.fillStyle = `hsl(${a.hue} 70% ${a.sleeping ? 38 : 58}%)`;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.3); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#111'; ctx.fillRect(cx - r * 0.45, cy - r * 0.2, r * 0.25, r * 0.25); ctx.fillRect(cx + r * 0.2, cy - r * 0.2, r * 0.25, r * 0.25);
    if (a.hp < 100) { ctx.fillStyle = '#400'; ctx.fillRect(cx - r, cy - r - 6, r * 2, 3); ctx.fillStyle = '#e44'; ctx.fillRect(cx - r, cy - r - 6, r * 2 * Math.max(0, a.hp) / 100, 3); }
    if (view.zoom >= 0.9) { ctx.font = `${Math.max(10, z * 0.55)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3; ctx.strokeText(a.name, cx, cy + r + z * 0.55); ctx.fillText(a.name, cx, cy + r + z * 0.55); }
    if (a.sleeping) { ctx.font = `bold ${z * 0.5}px system-ui`; ctx.fillStyle = '#cfe3ff'; ctx.fillText('z', cx + r, cy - r); }
    else if (a.pending) { ctx.font = `${z * 0.5}px system-ui`; ctx.fillStyle = '#fff'; ctx.fillText('…', cx, cy - r - 8); }
  }
  // balões de fala
  for (const a of agents) {
    if (sim.tick > a.sayUntil || !a.say) continue;
    const ax = a.px + (a.x - a.px) * frac, ay = a.py + (a.y - a.py) * frac;
    bubble(ctx, ox + (ax + 0.5) * z, oy + (ay + 0.5) * z - z * 0.6, a.say, Math.max(11, z * 0.62));
  }

  // dia/noite
  const hr = sim.hour();
  const dark = hr >= 7 && hr < 18 ? 0 : hr >= 18 && hr < 22 ? (hr - 18) / 4 * 0.55 : hr >= 22 || hr < 4 ? 0.55 : hr >= 4 && hr < 7 ? 0.55 * (1 - (hr - 4) / 3) : 0;
  if (dark > 0) {
    ctx.fillStyle = `rgba(8,14,48,${dark})`; ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'lighter';
    for (const s of w.structures) {
      if (s.type !== 'fire' && s.type !== 'house') continue;
      const gx = ox + (s.x + 0.5) * z, gy = oy + (s.y + 0.6) * z, gr = z * (s.type === 'fire' ? 4.5 : 1.6);
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      g.addColorStop(0, `rgba(255,170,70,${dark * (s.type === 'fire' ? 0.55 : 0.3)})`); g.addColorStop(1, 'rgba(255,170,70,0)');
      ctx.fillStyle = g; ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (sim.weather.type === 'chuva') {
    ctx.strokeStyle = 'rgba(170,200,255,.45)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < 160; i++) { const rx = (Math.sin(i * 91.7 + now * 0.3) * 0.5 + 0.5) * cw, ry = ((i * 53.3 + now * 520) % ch); ctx.moveTo(rx, ry); ctx.lineTo(rx - 4, ry + 12); }
    ctx.stroke(); ctx.fillStyle = 'rgba(30,50,90,.18)'; ctx.fillRect(0, 0, cw, ch);
  } else if (sim.weather.type === 'seca') { ctx.fillStyle = 'rgba(200,140,40,.16)'; ctx.fillRect(0, 0, cw, ch); }
}

function bubble(ctx, x, y, text, fs) {
  ctx.font = `${fs}px system-ui,sans-serif`;
  const words = text.split(' '), lines = []; let cur = '';
  for (const wd of words) { if ((cur + ' ' + wd).length > 26 && cur) { lines.push(cur); cur = wd; } else cur = cur ? cur + ' ' + wd : wd; }
  lines.push(cur);
  const shown = lines.slice(0, 4), lh = fs * 1.2, bw = Math.max(...shown.map((l) => ctx.measureText(l).width)) + 14, bh = shown.length * lh + 10;
  ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1;
  const bx = x - bw / 2, by = y - bh - 8;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 5, by + bh); ctx.lineTo(x, by + bh + 7); ctx.lineTo(x + 5, by + bh); ctx.fill();
  ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'center';
  shown.forEach((l, i) => ctx.fillText(l, x, by + 6 + fs * 0.95 + i * lh));
}
