// Sprites em pixel art gerados por código (sem imagens externas). Tudo em "pixels nativos" (16 px = 1 tile).
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; };
const R = (x, c, px, py, w, h) => { x.fillStyle = c; x.fillRect(px, py, w, h); };
const rnd = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

const SEASON = [
  { grass: ['#4a7d3f', '#44763b', '#4f8445', '#3f6f37'], speck: ['#5c9650', '#365e30'], leaf: ['#2f6b3a', '#3f8a3a', '#7fa83a'], pine: '#245a3a', pine2: '#2f7048', dirt: '#8b6b45' },
  { grass: ['#4f8a3f', '#488238', '#559447', '#437a34'], speck: ['#66a856', '#3a6b2e'], leaf: ['#3f8a3a', '#52a040', '#b0b83a'], pine: '#226a36', pine2: '#2f8244', dirt: '#8f6e46' },
  { grass: ['#6a7c3a', '#627434', '#728542', '#5b6e30'], speck: ['#8a8f3c', '#4e5a28'], leaf: ['#c68a2c', '#b5552a', '#d6b13a'], pine: '#2a5a34', pine2: '#356a3d', dirt: '#85643f' },
  { grass: ['#cfdde3', '#c4d4db', '#d8e5ea', '#bccdd5'], speck: ['#eef5f8', '#a9bcc6'], leaf: ['#dfe9ec', '#cddbe0', '#e8f0f2'], pine: '#a9c0c6', pine2: '#c7d8dc', dirt: '#b9a58a' },
];

export class Sprites {
  constructor() {
    this.tiles = SEASON.map((p, s) => this.makeTiles(p, s));
    this.trees = SEASON.map((p) => this.makeTrees(p));
    this.misc = this.makeMisc();
    this.cache = new Map();
    this.light = this.makeLight();
  }

  makeTiles(p, s) {
    const grass = p.grass.map((base, vi) => { const [c, x] = cv(16, 16); R(x, base, 0, 0, 16, 16); const r = rnd(vi * 31 + s); for (let i = 0; i < 14; i++) R(x, p.speck[i % 2], Math.floor(r() * 16), Math.floor(r() * 16), 1, 1); return c; });
    const dark = (() => { const [c, x] = cv(16, 16); R(x, s === 3 ? '#9fb2ba' : '#2f5a2c', 0, 0, 16, 16); const r = rnd(77 + s); for (let i = 0; i < 10; i++) R(x, s === 3 ? '#bccdd5' : '#264c25', Math.floor(r() * 16), Math.floor(r() * 16), 2, 1); return c; })();
    const path = [0, 1].map((vi) => { const [c, x] = cv(16, 16); R(x, p.dirt, 0, 0, 16, 16); const r = rnd(5 + vi); for (let i = 0; i < 18; i++) R(x, i % 3 ? '#7a5c3a' : '#a08258', Math.floor(r() * 16), Math.floor(r() * 16), 1 + (i % 2), 1); return c; });
    const cobble = (() => { const [c, x] = cv(16, 16); R(x, '#767679', 0, 0, 16, 16); for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const off = j % 2 ? 2 : 0; R(x, (i + j) % 2 ? '#8e8e92' : '#9a9a9e', i * 4 + off, j * 4, 3, 3); } return c; })();
    const rock = [0, 1].map((vi) => { const [c, x] = cv(16, 16); R(x, '#5f6068', 0, 0, 16, 16); const r = rnd(9 + vi); for (let i = 0; i < 7; i++) { const bx = Math.floor(r() * 12), by = Math.floor(r() * 12); R(x, '#72747d', bx, by, 4, 3); R(x, '#4a4b52', bx, by + 3, 4, 1); } return c; });
    const water = [0, 1].map((f) => { const [c, x] = cv(16, 16); R(x, '#2c6a9e', 0, 0, 16, 16); const r = rnd(3); for (let i = 0; i < 6; i++) { R(x, '#3b82b8', Math.floor(r() * 12), Math.floor(r() * 14), 4, 1); } R(x, '#8cc4e8', (f * 6 + 3) % 12, 5 + f * 5, 3, 1); R(x, '#8cc4e8', (f * 5 + 9) % 12, 11 - f * 4, 2, 1); return c; });
    const field = [0, 1, 2, 3].map((st) => {
      const [c, x] = cv(16, 16); R(x, st === 0 ? '#6b4a2e' : '#5e4128', 0, 0, 16, 16);
      for (let j = 0; j < 4; j++) R(x, '#4c331f', 0, j * 4 + 3, 16, 1);
      const col = ['', '#7fbf4a', '#4f9f3f', '#e0b83a'][st];
      if (st) for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const hgt = st === 1 ? 2 : st === 2 ? 4 : 5; R(x, col, i * 4 + 1, j * 4 + 3 - hgt + 1, 2, hgt); if (st === 3) R(x, '#f2d466', i * 4 + 1, j * 4 + 3 - hgt, 2, 1); }
      return c;
    });
    return { grass, dark, path, cobble, rock, water, field };
  }

  makeTrees(p) {
    const pine = [p.pine, p.pine2].map((c0, vi) => { const [c, x] = cv(16, 28); R(x, '#4a3020', 7, 22, 2, 6); R(x, '#33200f', 8, 22, 1, 6);
      const L = [[6, 0, 4], [4, 5, 8], [2, 10, 12], [1, 16, 14]]; L.forEach(([ox, y, w], i) => { for (let k = 0; k < 6; k++) { const ww = Math.min(w, 2 + k * 3 - (3 - i)); R(x, c0, 8 - Math.ceil(w / 2), y + k, Math.min(w, 2 + k * 2), 1); } });
      for (let y = 0; y < 22; y += 3) R(x, vi ? p.pine : p.pine2, 9 + (y % 2), y + 2, 2, 1); return c; });
    const round = p.leaf.map((lc, vi) => { const [c, x] = cv(16, 24); R(x, '#4a3020', 7, 16, 2, 8); const r = rnd(40 + vi);
      for (let y = 0; y < 18; y++) { const dy = (y - 8) / 9; const hw = Math.floor(8 * Math.sqrt(Math.max(0, 1 - dy * dy))); if (hw > 0) R(x, lc, 8 - hw, y, hw * 2, 1); }
      for (let i = 0; i < 18; i++) R(x, 'rgba(255,255,255,.14)', 4 + Math.floor(r() * 7), 2 + Math.floor(r() * 8), 2, 1);
      for (let i = 0; i < 14; i++) R(x, 'rgba(0,0,0,.18)', 4 + Math.floor(r() * 8), 9 + Math.floor(r() * 8), 2, 1); return c; });
    return { pine, round };
  }

  makeMisc() {
    const m = {};
    { const [c, x] = cv(16, 12); R(x, '#33692e', 2, 3, 12, 8); R(x, '#3f8038', 3, 2, 10, 6); m.bush = c; const [c2, x2] = cv(16, 12); R(x2, '#33692e', 2, 3, 12, 8); R(x2, '#3f8038', 3, 2, 10, 6); [[4, 4], [8, 3], [10, 6], [6, 7]].forEach(([a, b]) => R(x2, '#d6335b', a, b, 2, 2)); m.berries = c2; }
    { const [c, x] = cv(16, 12); R(x, '#8d8f98', 2, 5, 7, 6); R(x, '#a9abb4', 3, 4, 5, 3); R(x, '#767880', 8, 7, 6, 4); R(x, '#a9abb4', 9, 6, 4, 2); m.stone = c; }
    { const [c, x] = cv(12, 8); R(x, '#f2f2f2', 1, 1, 9, 6); R(x, '#fff', 2, 0, 6, 2); R(x, '#4a4a50', 9, 2, 3, 3); R(x, '#4a4a50', 2, 7, 1, 1); R(x, '#4a4a50', 7, 7, 1, 1); m.sheep = c; }
    { const [c, x] = cv(8, 8); R(x, '#f4efe0', 1, 2, 5, 4); R(x, '#fff', 4, 1, 3, 3); R(x, '#d34', 6, 0, 1, 1); R(x, '#e8a030', 7, 3, 1, 1); R(x, '#c89a20', 2, 6, 1, 2); R(x, '#c89a20', 4, 6, 1, 2); m.chicken = c; }
    { const [c, x] = cv(16, 16); R(x, '#8b6b45', 0, 0, 16, 16); m.dirt = c; }
    { const [c, x] = cv(10, 12); R(x, '#c9cbd2', 4, 2, 2, 8); R(x, '#c9cbd2', 2, 4, 6, 2); R(x, '#8d8f98', 3, 10, 4, 2); m.grave = c; }
    // flames (2 frames)
    m.flame = [0, 1].map((f) => { const [c, x] = cv(10, 12); R(x, '#d9531e', 2, 4 + f, 6, 7 - f); R(x, '#ff8a1f', 3, 2 + f, 4, 8 - f); R(x, '#ffd24a', 4, 5 + f, 2, 5 - f); if (f) R(x, '#ffd24a', 4, 1, 2, 2); return c; });
    { const [c, x] = cv(16, 16); R(x, '#4a3322', 1, 12, 14, 3); R(x, '#5c4129', 2, 10, 12, 3); R(x, '#8a8c93', 0, 9, 3, 3); R(x, '#8a8c93', 13, 9, 3, 3); m.campfire = c; }
    { const [c, x] = cv(32, 16); R(x, '#6b4a2b', 1, 7, 12, 8); R(x, '#8a6038', 2, 6, 10, 3); R(x, '#a97a46', 14, 6, 8, 9); R(x, '#8a6038', 15, 5, 6, 3); R(x, '#a97a46', 23, 9, 8, 6); R(x, '#5a3f22', 14, 10, 8, 1); R(x, '#c89a58', 3, 3, 8, 4); R(x, '#5a3f22', 3, 4, 8, 1); m.storehouse = c; }
    m.tent = ['#b94a3a', '#3f6fa8', '#c8892e'].map((col) => { const [c, x] = cv(16, 16); for (let y = 0; y < 12; y++) R(x, col, 8 - 1 - Math.floor(y * 0.55), 3 + y, 2 + Math.floor(y * 1.1), 1); R(x, '#2a1c10', 7, 9, 2, 6); R(x, 'rgba(255,255,255,.18)', 8, 3, 1, 12); R(x, '#4a3020', 7, 1, 1, 3); return c; });
    { const [c, x] = cv(16, 24); R(x, '#8d8f98', 2, 12, 12, 10); R(x, '#a9abb4', 3, 11, 10, 3); R(x, '#2b6a99', 5, 14, 6, 5); R(x, '#5a3f22', 2, 4, 2, 10); R(x, '#5a3f22', 12, 4, 2, 10); R(x, '#8a2f2a', 1, 1, 14, 4); R(x, '#a23c34', 2, 0, 12, 2); m.well = c; }
    { const [c, x] = cv(16, 16); R(x, '#6b4a2b', 0, 0, 16, 16); for (let i = 0; i < 16; i += 4) { R(x, '#8a6038', i, 1, 3, 14); R(x, '#33200f', i + 3, 3, 1, 12); R(x, '#8a6038', i + 1, 0, 1, 1); } m.wall = c; }
    // construções grandes
    m.cabin = ['#c9a24f', '#7a4a2b', '#3f5f9a', '#6b4a8a', '#a23c34'].map((roof) => { const [c, x] = cv(32, 40);
      R(x, '#6b4326', 2, 18, 28, 20); for (let y = 19; y < 38; y += 4) R(x, '#8a5a30', 2, y, 28, 3); R(x, '#4a2f1a', 2, 37, 28, 1);
      for (let i = 0; i < 12; i++) R(x, roof, 0 + Math.floor(i * 0.2), 18 - i - 1 + 7, 32 - Math.floor(i * 0.4) * 1, 1);
      R(x, roof, 0, 17, 32, 3); R(x, 'rgba(0,0,0,.25)', 0, 19, 32, 1); R(x, 'rgba(255,255,255,.14)', 0, 6, 32, 1);
      R(x, '#4a2f1a', 22, 6, 4, 11); R(x, '#33200f', 22, 6, 1, 11); R(x, '#5c3a22', 21, 5, 6, 2); R(x, '#3a2414', 13, 26, 6, 12); R(x, '#d9b673', 17, 31, 1, 1);
      R(x, '#2b3a4a', 5, 25, 5, 5); R(x, '#2b3a4a', 23, 25, 5, 5); R(x, '#7a5a33', 5, 27, 5, 1); R(x, '#7a5a33', 7, 25, 1, 5); R(x, '#7a5a33', 23, 27, 5, 1); R(x, '#7a5a33', 25, 25, 1, 5); return c; });
    m.barn = (() => { const [c, x] = cv(48, 40); R(x, '#8f2f2a', 2, 14, 44, 24); for (let i = 4; i < 46; i += 6) R(x, '#7a2622', i, 14, 1, 24); R(x, '#4a3028', 0, 8, 48, 8); R(x, '#5c3a30', 3, 3, 42, 6); R(x, '#6e463a', 8, 0, 32, 4);
      R(x, '#f2f2f2', 17, 22, 14, 16); R(x, '#8f2f2a', 18, 23, 12, 14); R(x, '#f2f2f2', 18, 23, 12, 1); R(x, '#f2f2f2', 18, 36, 12, 1); for (let i = 0; i < 12; i++) { R(x, '#f2f2f2', 18 + i, 23 + Math.floor(i * 13 / 12), 1, 1); R(x, '#f2f2f2', 29 - i, 23 + Math.floor(i * 13 / 12), 1, 1); } return c; })();
    m.forge = (() => { const [c, x] = cv(32, 40); R(x, '#6c6f78', 1, 12, 30, 26); for (let y = 14; y < 38; y += 4) { R(x, '#50525a', 1, y, 30, 1); } R(x, '#3a3c44', 0, 8, 32, 6); R(x, '#4a4d56', 2, 5, 28, 4); R(x, '#50525a', 22, 0, 6, 12); R(x, '#3a3c44', 22, 0, 6, 2);
      R(x, '#1c1c22', 8, 24, 16, 14); R(x, '#ff7a1f', 10, 28, 12, 10); R(x, '#ffd24a', 13, 31, 6, 7); R(x, '#3a3c44', 5, 20, 22, 3); return c; })();
    m.market = (() => { const [c, x] = cv(32, 28); R(x, '#6b4a2b', 1, 12, 30, 14); R(x, '#8a6038', 1, 12, 30, 3); const cols = ['#c9433a', '#f2f2f2', '#3f6fa8', '#f2f2f2', '#d8a33a', '#f2f2f2'];
      for (let i = 0; i < 6; i++) { R(x, cols[i], 0 + i * 5.4, 2, 5, 9); R(x, cols[i], 0 + i * 5.4 + 1, 11, 3, 2); } R(x, '#4a3020', 1, 0, 2, 28); R(x, '#4a3020', 29, 0, 2, 28);
      R(x, '#d6335b', 5, 16, 3, 3); R(x, '#e0b83a', 11, 16, 3, 3); R(x, '#4f9f3f', 17, 16, 3, 3); R(x, '#d6335b', 23, 16, 3, 3); return c; })();
    m.tower = (() => { const [c, x] = cv(16, 40); R(x, '#7b7e87', 2, 12, 12, 26); for (let y = 14; y < 38; y += 4) R(x, '#5c5f68', 2, y, 12, 1); R(x, '#8d909a', 0, 6, 16, 6); for (let i = 0; i < 16; i += 4) R(x, '#8d909a', i, 2, 3, 4); R(x, '#33353c', 6, 26, 4, 7); R(x, '#33353c', 7, 16, 2, 4); R(x, '#4a3020', 7, 4, 1, 6); return c; })();
    m.library = (() => { const [c, x] = cv(48, 40); R(x, '#7a6a54', 2, 14, 44, 24); for (let y = 16; y < 38; y += 4) R(x, '#665843', 2, y, 44, 1); R(x, '#2f4a7a', 0, 6, 48, 9); R(x, '#3f5f9a', 4, 2, 40, 5); R(x, '#2f4a7a', 14, 0, 20, 3);
      [8, 20, 34].forEach((ax) => { R(x, '#1c2638', ax, 22, 6, 10); R(x, '#d9c27a', ax + 1, 23, 4, 8); }); R(x, '#3a2414', 21, 28, 6, 10); return c; })();
    m.castle = (() => { const [c, x] = cv(112, 80); R(x, '#8a8d96', 20, 28, 72, 48); for (let y = 30; y < 76; y += 5) { R(x, '#6c6f78', 20, y, 72, 1); } R(x, '#50525a', 20, 24, 72, 6); for (let i = 20; i < 92; i += 8) R(x, '#8a8d96', i, 18, 5, 8);
      [[0, 8], [92, 8]].forEach(([tx]) => { R(x, '#7b7e87', tx, 14, 20, 62); for (let y = 16; y < 76; y += 5) R(x, '#5c5f68', tx, y, 20, 1); R(x, '#50525a', tx - 2, 8, 24, 8); for (let i = 0; i < 20; i += 7) R(x, '#7b7e87', tx + i, 2, 5, 7); R(x, '#1c2638', tx + 8, 30, 4, 8); R(x, '#4a2f8a', tx + 9, -6, 2, 10); R(x, '#6b4aa8', tx + 11, -6, 8, 5); });
      R(x, '#33200f', 46, 46, 20, 30); R(x, '#4a3020', 48, 48, 16, 28); R(x, '#d9b673', 62, 62, 2, 2); R(x, '#a23c34', 51, 28, 10, 14); R(x, '#d8a33a', 54, 31, 4, 6);
      [30, 76].forEach((bx) => { R(x, '#4a2f8a', bx, 34, 6, 18); R(x, '#d8a33a', bx + 2, 38, 2, 6); }); return c; })();
    m.skeleton = (() => { const [c, x] = cv(96, 48); const bone = '#e6dfc8', sh = '#b7ae92';
      R(x, bone, 4, 14, 22, 14); R(x, bone, 0, 18, 8, 8); R(x, '#1c1c22', 8, 18, 4, 4); R(x, '#1c1c22', 17, 18, 4, 4); R(x, bone, 6, 4, 3, 14); R(x, bone, 19, 4, 3, 14); R(x, bone, 4, 0, 3, 6); R(x, bone, 21, 0, 3, 6);
      R(x, sh, 28, 24, 66, 4); for (let i = 0; i < 6; i++) { R(x, bone, 34 + i * 10, 10 + Math.abs(i - 3) * 2, 3, 16); R(x, bone, 36 + i * 10, 8 + Math.abs(i - 3) * 2, 3, 4); R(x, sh, 34 + i * 10, 24, 3, 2); }
      R(x, bone, 30, 30, 6, 12); R(x, bone, 84, 30, 6, 12); return c; })();
    m.obelisk = (() => { const [c, x] = cv(32, 48); R(x, '#4a4d5c', 8, 6, 16, 40); for (let y = 8; y < 44; y += 4) R(x, '#3a3c48', 8, y, 16, 1); R(x, '#5a5d6e', 10, 2, 12, 5); R(x, '#4a4d5c', 14, 0, 6, 3); R(x, '#2a2c36', 12, 24, 4, 8); R(x, '#5a5d6e', 2, 36, 10, 10); R(x, '#5a5d6e', 22, 38, 8, 8); return c; })();
    m.waterfall = [0, 1, 2].map((f) => { const [c, x] = cv(64, 48); R(x, '#6c6f78', 0, 0, 64, 48); R(x, '#50525a', 0, 0, 64, 6); for (let i = 0; i < 64; i += 8) R(x, '#7b7e87', i, 6 + (i % 16), 5, 8);
      R(x, '#3f86bf', 24, 6, 16, 42); for (let y = (f * 4) % 12; y < 48; y += 12) { R(x, '#cfe9f8', 26, y, 4, 7); R(x, '#cfe9f8', 34, y + 5, 4, 7); } R(x, '#7ab6e0', 20, 40, 24, 8); return c; });
    m.peak = (() => { const [c, x] = cv(48, 36); for (let y = 0; y < 36; y++) { const hw = Math.floor(4 + y * 0.62); R(x, '#5d5f68', 24 - hw, y, hw * 2, 1); if (y < 13) R(x, '#eef3f7', 24 - Math.floor(hw * 0.8), y, Math.floor(hw * 1.6), 1); } R(x, '#4a4c54', 26, 12, 14, 24); return c; })();
    m.pegadas = (() => { const [c, x] = cv(32, 32); [[4, 4], [18, 14]].forEach(([px, py]) => { R(x, '#2a1c10', px + 3, py + 6, 8, 8); [[0, 0], [4, -2], [8, -2], [12, 0]].forEach(([a, b]) => R(x, '#2a1c10', px + a, py + b, 3, 5)); }); return c; })();
    return m;
  }

  makeLight() { const [c, x] = cv(128, 128); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,190,90,0.9)'); g.addColorStop(0.35, 'rgba(255,160,60,0.4)'); g.addColorStop(1, 'rgba(255,140,40,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return c; }

  // Personagem 10x16 (2 frames de caminhada). Em cache por aparência.
  person(a, frame, flags = 0) {
    const key = `p${a.skin}${a.hair}${a.hue}${frame}${flags}`;
    let c = this.cache.get(key);
    if (c) return c;
    const [cc, x] = cv(10, 16); c = cc;
    const skin = ['#f1c9a0', '#e0a878', '#b9805a', '#8a5a3c'][a.skin], hair = ['#3a2414', '#c8a14a', '#8a3a1e', '#1c1c20', '#d8d8d8'][a.hair];
    const shirt = `hsl(${a.hue} 55% 48%)`, shirt2 = `hsl(${a.hue} 55% 36%)`;
    R(x, 'rgba(0,0,0,.0)', 0, 0, 1, 1);
    R(x, hair, 2, 1, 6, 3); R(x, skin, 3, 3, 4, 4); R(x, hair, 2, 3, 1, 2); R(x, hair, 7, 3, 1, 2); R(x, '#1c1c22', 3, 5, 1, 1); R(x, '#1c1c22', 6, 5, 1, 1);
    R(x, shirt, 2, 8, 6, 5); R(x, shirt2, 2, 12, 6, 1); R(x, skin, 1, 9, 1, 3); R(x, skin, 8, 9, 1, 3);
    R(x, '#3a3040', frame ? 2 : 3, 13, 2, 3); R(x, '#3a3040', frame ? 6 : 5, 13, 2, 3);
    if (flags & 1) { R(x, '#e8c030', 2, 0, 6, 2); R(x, '#e8c030', 2, -1 + 0, 1, 1); R(x, '#e8c030', 5, 0, 1, 1); R(x, '#e8c030', 7, 0, 1, 1); }
    this.cache.set(key, c);
    return c;
  }
}
