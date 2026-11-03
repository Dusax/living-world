// Mundo: floresta densa com uma clareira, trilhas até marcos do mapa e recursos. Sem DOM.
import { mulberry32 } from './rng.js';

export const W = 64, H = 88;
export const T = { WATER: 0, GRASS: 1, FOREST: 2, ROCK: 3, PATH: 4, FIELD: 5, COBBLE: 6 };
export const K = { NONE: 0, WOOD: 1, FOOD: 2, STONE: 3 };
export const KIND_NAME = { wood: K.WOOD, food: K.FOOD, stone: K.STONE };
export const TPD = 120;
export const SEASONS = ['Primavera', 'Verão', 'Outono', 'Inverno'];
export const SEASON_DAYS = 8;

// block:false => dá para andar por cima (campos). cap = moradores que cabem. work = ticks para construir.
export const DEFS = {
  campfire:   { w: 1, h: 1 },
  storehouse: { w: 2, h: 1 },
  tent:       { w: 1, h: 1, cap: 1, cost: { wood: 4 }, work: 4 },
  cabin:      { w: 2, h: 2, cap: 3, cost: { wood: 10 }, work: 8 },
  field:      { w: 3, h: 3, block: false, cost: { wood: 2 }, work: 4 },
  well:       { w: 1, h: 1, cost: { wood: 2, stone: 4 }, work: 6 },
  barn:       { w: 3, h: 2, cost: { wood: 16 }, work: 12 },
  forge:      { w: 2, h: 2, cost: { wood: 6, stone: 10 }, work: 14 },
  market:     { w: 2, h: 1, cost: { wood: 8 }, work: 8 },
  tower:      { w: 1, h: 2, cost: { wood: 10, stone: 6 }, work: 12 },
  wall:       { w: 1, h: 1, cost: { wood: 10 }, work: 10 },   // custo/trabalho por trecho de 10 estacas
  library:    { w: 3, h: 2, cost: { wood: 14, stone: 6 }, work: 16 },
  castle:     { w: 7, h: 4, cost: { wood: 30, stone: 40 }, work: 40 },
};

export function createWorld() {
  const n = W * H;
  return {
    w: W, h: H,
    tile: new Uint8Array(n), shade: new Uint8Array(n),
    rk: new Uint8Array(n), ra: new Uint8Array(n), rm: new Uint8Array(n),
    trail: new Uint16Array(n), occ: new Uint8Array(n), keep: new Uint8Array(n),
    structures: [], decor: [], landmarks: [], trails: [], nextStructId: 1,
  };
}

export const inBounds = (w, x, y) => x >= 0 && y >= 0 && x < w.w && y < w.h;
export const isWalkTile = (t) => t === T.GRASS || t === T.PATH || t === T.FIELD || t === T.COBBLE;
export function isWalkable(w, x, y) {
  if (!inBounds(w, x, y)) return false;
  const i = y * w.w + x;
  return isWalkTile(w.tile[i]) && !w.occ[i];
}

function makeNoise(rng) {
  const g = new Float32Array(64 * 64);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const val = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const at = (a, b) => g[((b & 63) << 6) | (a & 63)];
    return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
  };
  return (x, y) => { let s = 0, a = 0.5, f = 1, n = 0; for (let o = 0; o < 4; o++) { s += val(x * f, y * f) * a; n += a; a /= 2; f *= 2; } return s / n; };
}

function disk(w, cx, cy, rx, ry, tile, rng, jitter = 0.25) {
  for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
    if (!inBounds(w, x, y)) continue;
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (d <= 1 + (rng() - 0.5) * jitter) { const i = y * W + x; w.tile[i] = tile; w.rk[i] = 0; w.ra[i] = 0; }
  }
}

// Trilha sinuosa e 4-conexa de (x0,y0) a (x1,y1), desviando de água, rocha e decorações.
function carveTrail(w, rng, x0, y0, x1, y1) {
  const pts = [];
  let x = x0, y = y0;
  const blocked = (nx, ny) => !inBounds(w, nx, ny) || w.tile[ny * W + nx] === T.WATER || w.tile[ny * W + nx] === T.ROCK || w.occ[ny * W + nx];
  for (let guard = 0; guard < 1500 && (x !== x1 || y !== y1); guard++) {
    const ax = Math.abs(x1 - x), ay = Math.abs(y1 - y);
    let horiz = ax > ay ? rng() < 0.8 : ay > ax ? rng() < 0.2 : rng() < 0.5;
    if (ax === 0) horiz = false; if (ay === 0) horiz = true;
    if (rng() < 0.1) horiz = !horiz;                       // curva
    let dx = 0, dy = 0;
    if (horiz) dx = Math.sign(x1 - x) || (rng() < 0.5 ? 1 : -1); else dy = Math.sign(y1 - y) || (rng() < 0.5 ? 1 : -1);
    if (blocked(x + dx, y + dy)) { // tenta o outro eixo, nos dois sentidos
      const opts = horiz ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
      const ok = opts.find(([ox, oy]) => !blocked(x + ox, y + oy));
      if (!ok) break; [dx, dy] = ok;
    }
    x += dx; y += dy;
    const i = y * W + x;
    w.tile[i] = T.PATH; w.rk[i] = 0; w.ra[i] = 0; w.keep[i] = 1;
    pts.push([x, y]);
  }
  return pts;
}

export function generateWorld(rng) {
  const w = createWorld();
  const n1 = makeNoise(rng), n2 = makeNoise(rng);
  const cx = Math.floor(W / 2), cy = Math.floor(H * 0.42);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    w.tile[i] = n1(x * 0.11, y * 0.11) > 0.33 ? T.FOREST : T.GRASS;
    w.shade[i] = Math.min(3, Math.floor(n2(x * 0.09 + 5, y * 0.09 + 5) * 4.5));
  }
  // montanha ao sul, lagoa e açude, clareiras dos marcos
  disk(w, W / 2, H - 5, 25, 14, T.ROCK, rng, 0.5);
  disk(w, W * 0.18, H * 0.58, 4, 3, T.ROCK, rng, 0.5);          // afloramento perto
  disk(w, W * 0.73, H * 0.14, 8, 4.5, T.GRASS, rng); disk(w, W * 0.73, H * 0.14, 6, 3, T.WATER, rng);
  disk(w, W * 0.8, H * 0.37, 4.5, 3.2, T.GRASS, rng); disk(w, W * 0.8, H * 0.37, 3, 2, T.WATER, rng);
  disk(w, W * 0.3, H * 0.77, 6, 3.5, T.GRASS, rng);  disk(w, W * 0.3, H * 0.77, 4.5, 2.3, T.WATER, rng);
  disk(w, W * 0.12, H * 0.42, 7, 4, T.GRASS, rng);                // esqueleto
  disk(w, W * 0.16, H * 0.08, 5, 4, T.GRASS, rng);                // ruínas
  disk(w, W * 0.5, H - 18, 5, 3, T.GRASS, rng);                   // sopé da cachoeira
  disk(w, cx, cy, 7.5, 6.2, T.GRASS, rng, 0.5);                   // a clareira inicial
  // decorações bloqueantes
  const decor = (type, x, y, dw, dh) => { w.decor.push({ type, x, y, w: dw, h: dh }); for (let yy = y; yy < y + dh; yy++) for (let xx = x; xx < x + dw; xx++) if (inBounds(w, xx, yy)) w.occ[yy * W + xx] = 1; };
  decor('skeleton', Math.floor(W * 0.12) - 3, Math.floor(H * 0.42) - 1, 6, 3);
  decor('obelisk', Math.floor(W * 0.16) - 1, Math.floor(H * 0.08) - 2, 2, 3);
  decor('waterfall', Math.floor(W / 2) - 2, H - 16, 4, 3);
  // marcos (pontos de expedição) + trilhas
  const marks = [
    { id: 'lagoa', name: 'a lagoa', x: Math.floor(W * 0.73) - 7, y: Math.floor(H * 0.14) + 2 },
    { id: 'acude', name: 'o açude', x: Math.floor(W * 0.8) - 4, y: Math.floor(H * 0.37) },
    { id: 'esqueleto', name: 'o esqueleto gigante', x: Math.floor(W * 0.12) + 4, y: Math.floor(H * 0.42) + 3 },
    { id: 'ruinas', name: 'as ruínas da torre', x: Math.floor(W * 0.16) + 2, y: Math.floor(H * 0.08) + 1 },
    { id: 'cachoeira', name: 'a cachoeira da montanha', x: Math.floor(W / 2) + 3, y: H - 18 },
  ];
  for (const m of marks) {
    const mi = m.y * W + m.x; w.tile[mi] = T.PATH; w.rk[mi] = 0; w.ra[mi] = 0; w.keep[mi] = 1;
    const trail = carveTrail(w, rng, cx, cy, m.x, m.y);
    w.trails.push({ id: m.id, tiles: trail });
    m.found = false; w.landmarks.push(m);
  }
  // recursos
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = w.tile[i];
    const set = (k, mx, amt) => { w.rk[i] = k; w.rm[i] = mx; w.ra[i] = amt; };
    if (w.occ[i]) continue;
    if (t === T.FOREST) set(K.WOOD, 5, 3 + Math.floor(rng() * 3));
    else if (t === T.GRASS && rng() < 0.05) set(K.FOOD, 4, 2 + Math.floor(rng() * 3));
    else if (t === T.ROCK) {
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (inBounds(w, nx, ny) && w.tile[ny * W + nx] !== T.ROCK) edge = true; }
      if (edge && rng() < 0.8) set(K.STONE, 12, 12);
    }
  }
  placeStart(w, cx, cy, rng);
  return w;
}

function placeStart(w, cx, cy, rng) {
  let berries = 0;
  for (let y = cy - 10; y <= cy + 10; y++) for (let x = cx - 10; x <= cx + 10; x++) {
    if (!inBounds(w, x, y)) continue;
    const i = y * W + x;
    if (w.rk[i] === K.FOOD) berries++;
  }
  for (let tries = 0; berries < 10 && tries < 400; tries++) {
    const x = cx + Math.floor((rng() - 0.5) * 18), y = cy + Math.floor((rng() - 0.5) * 16), i = y * W + x;
    if (inBounds(w, x, y) && w.tile[i] === T.GRASS && !w.rk[i] && !w.occ[i] && Math.hypot(x - cx, y - cy) > 3) { w.rk[i] = K.FOOD; w.rm[i] = 4; w.ra[i] = 4; berries++; }
  }
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 3; x <= cx + 3; x++) { const i = y * W + x; w.tile[i] = T.GRASS; w.rk[i] = 0; w.ra[i] = 0; }
  addStructure(w, 'campfire', cx, cy);
  addStructure(w, 'storehouse', cx - 3, cy - 1);
  addStructure(w, 'tent', cx + 3, cy + 2, { variant: 0 });
  addStructure(w, 'tent', cx - 3, cy + 3, { variant: 1 });
  w.start = { x: cx, y: cy };
}

export function footprint(st) { const out = []; for (let y = st.y; y < st.y + st.h; y++) for (let x = st.x; x < st.x + st.w; x++) out.push([x, y]); return out; }

export function addStructure(w, type, x, y, extra = {}) {
  const d = DEFS[type];
  const st = { id: w.nextStructId++, type, x, y, w: d.w, h: d.h, variant: extra.variant ?? (w.nextStructId % 5), ...extra };
  w.structures.push(st);
  for (const [fx, fy] of footprint(st)) {
    if (!inBounds(w, fx, fy)) continue;
    const i = fy * W + fx;
    if (d.block !== false) w.occ[i] = 1;
    if (type === 'field') w.tile[i] = T.FIELD;
    w.rk[i] = 0; w.ra[i] = 0; w.rm[i] = 0;
  }
  return st;
}
export function removeStructure(w, st) {
  w.structures = w.structures.filter((s) => s !== st);
  for (const [fx, fy] of footprint(st)) { if (inBounds(w, fx, fy)) { w.occ[fy * W + fx] = 0; if (st.type === 'field') w.tile[fy * W + fx] = T.GRASS; } }
}

export function newWorld(seed) {
  const rng = mulberry32(seed);
  return { world: generateWorld(rng), rng };
}

export function asciiMap(w) {
  const ch = ['~', ',', 'T', '^', '.', '#', ':'];
  let out = '';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const st = w.structures.find((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
      out += st ? st.type[0].toUpperCase() : w.occ[y * W + x] ? '%' : ch[w.tile[y * W + x]];
    }
    out += '\n';
  }
  return out;
}
