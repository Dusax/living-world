// Terreno, recursos e estruturas. Sem DOM: roda no Node para testes.
import { mulberry32 } from './rng.js';

export const W = 64, H = 44;
export const T = { DEEP: 0, SHALLOW: 1, SAND: 2, GRASS: 3, FOREST: 4, ROCK: 5 };
export const K = { NONE: 0, WOOD: 1, FOOD: 2, STONE: 3 };
export const KIND_NAME = { wood: K.WOOD, food: K.FOOD, stone: K.STONE };
export const TPD = 120;            // ticks por dia
export const SEASONS = ['Primavera', 'Verão', 'Outono', 'Inverno'];
export const SEASON_DAYS = 8;

export function createWorld() {
  const n = W * H;
  return {
    w: W, h: H,
    tile: new Uint8Array(n),
    rk: new Uint8Array(n), ra: new Uint8Array(n), rm: new Uint8Array(n),
    occ: new Uint8Array(n),
    structures: [], nextStructId: 1,
  };
}

export const idx = (w, x, y) => y * w.w + x;
export const inBounds = (w, x, y) => x >= 0 && y >= 0 && x < w.w && y < w.h;
export function isWalkable(w, x, y) {
  if (!inBounds(w, x, y)) return false;
  const i = y * w.w + x;
  return w.tile[i] >= T.SAND && !w.occ[i];
}

function makeNoise(rng) {
  const g = new Float32Array(64 * 64);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const val = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const at = (a, b) => g[((b & 63) << 6) | (a & 63)];
    const top = at(xi, yi) * (1 - u) + at(xi + 1, yi) * u;
    const bot = at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u;
    return top * (1 - v) + bot * v;
  };
  return (x, y) => {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < 4; o++) { s += val(x * f, y * f) * amp; norm += amp; amp /= 2; f *= 2; }
    return s / norm;
  };
}

export function generateWorld(rng) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const w = createWorld();
    const hN = makeNoise(rng), mN = makeNoise(rng);
    let land = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
      const mask = Math.max(0, 1 - (dx * dx + dy * dy) * 0.95);
      const h = hN(x * 0.09, y * 0.09) * 0.55 + mask * 0.62;
      const m = mN(x * 0.12 + 40, y * 0.12 + 40);
      let t;
      if (h < 0.3) t = T.DEEP;
      else if (h < 0.4) t = T.SHALLOW;
      else if (h < 0.46) t = T.SAND;
      else if (h > 0.93) t = T.ROCK;
      else t = m > 0.52 ? T.FOREST : T.GRASS;
      w.tile[y * W + x] = t;
      if (t >= T.SAND) land++;
    }
    if (land < 700) continue;
    seedResources(w, rng);
    placeStart(w);
    return w;
  }
  throw new Error('não consegui gerar um mundo');
}

function nearWater(w, x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!inBounds(w, x + dx, y + dy)) continue;
    if (w.tile[(y + dy) * w.w + x + dx] <= T.SHALLOW) return true;
  }
  return false;
}

function seedResources(w, rng) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = w.tile[i];
    const set = (k, max, amt) => { w.rk[i] = k; w.rm[i] = max; w.ra[i] = amt; };
    if (t === T.FOREST) set(K.WOOD, 6, 3 + Math.floor(rng() * 4));
    else if (t === T.GRASS) {
      const r = rng();
      if (r < 0.07) set(K.FOOD, 4, 2 + Math.floor(rng() * 3));
      else if (r < 0.085) set(K.WOOD, 6, 4);
      else if (r < 0.095) set(K.STONE, 5, 5);
    } else if (t === T.SAND) {
      if (nearWater(w, x, y) && rng() < 0.14) set(K.FOOD, 3, 3);
    } else if (t === T.ROCK) {
      if (rng() < 0.55) set(K.STONE, 8, 8);
    }
  }
}

export function findStartSite(w) {
  let best = null, bd = 1e9;
  for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
    if (w.tile[y * W + x] !== T.GRASS) continue;
    const d = (x - W / 2) ** 2 + (y - H / 2) ** 2;
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best;
}

function placeStart(w) {
  const s = findStartSite(w);
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const x = s.x + dx, y = s.y + dy;
    if (!inBounds(w, x, y)) continue;
    const i = y * W + x;
    if (w.tile[i] <= T.SHALLOW) w.tile[i] = T.SAND;
    if (w.tile[i] === T.FOREST || w.tile[i] === T.ROCK) w.tile[i] = T.GRASS;
    w.rk[i] = 0; w.ra[i] = 0; w.rm[i] = 0;
  }
  addStructure(w, 'storehouse', s.x, s.y);
  addStructure(w, 'fire', s.x + 1, s.y + 1);
  w.start = s;
}

export function addStructure(w, type, x, y, extra = {}) {
  const st = { id: w.nextStructId++, type, x, y, ...extra };
  w.structures.push(st);
  w.occ[y * w.w + x] = 1;
  const i = y * w.w + x;
  w.rk[i] = 0; w.ra[i] = 0; w.rm[i] = 0;
  return st;
}
export function removeStructure(w, st) {
  w.structures = w.structures.filter((s) => s !== st);
  w.occ[st.y * w.w + st.x] = 0;
}

export function newWorld(seed) {
  const rng = mulberry32(seed);
  return { world: generateWorld(rng), rng };
}

export function asciiMap(w) {
  const ch = ['~', '-', '.', ',', 'T', '^'];
  let out = '';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const st = w.structures.find((s) => s.x === x && s.y === y);
      out += st ? (st.type === 'house' ? 'H' : st.type === 'fire' ? 'F' : 'S') : ch[w.tile[y * W + x]];
    }
    out += '\n';
  }
  return out;
}
