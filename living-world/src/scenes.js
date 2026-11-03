// Cenas internas (forja, sino, trono, livro): quadros de pixel art desenhados por código. Grade lógica 90x160.
const FONT = "'Pixelify Sans', 'Silkscreen', monospace";

function person(ctx, k, x, y, o = {}) {
  const r = (a, b, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round((x + a) * k), Math.round((y + b) * k), Math.ceil(w * k), Math.ceil(h * k)); };
  const s = o.skin || '#e0a878', hair = o.hair || '#3a2414', shirt = o.shirt || '#3f6fa8';
  r(-4, 0, 8, 3, hair); r(-3, 2, 6, 6, s); r(-4, 3, 1, 3, hair); r(3, 3, 1, 3, hair); r(-2, 5, 1, 1, '#1c1c22'); r(1, 5, 1, 1, '#1c1c22');
  if (o.beard) r(-3, 7, 6, 4, '#e8e8e8');
  r(-5, 10, 10, 10, shirt); r(-5, 18, 10, 2, 'rgba(0,0,0,.25)');
  const up = o.armsUp;
  r(-7, up ? 1 : 11, 2, up ? 10 : 7, s); r(5, up ? 1 : 11, 2, up ? 10 : 7, s);
  r(-4, 20, 3, 6, '#3a3040'); r(1, 20, 3, 6, '#3a3040');
  if (o.crown) { r(-4, -2, 8, 2, '#e8c030'); r(-4, -4, 2, 2, '#e8c030'); r(-1, -4, 2, 2, '#e8c030'); r(2, -4, 2, 2, '#e8c030'); }
  if (o.hat) { r(-6, -1, 12, 2, '#a23c34'); r(-3, -8, 6, 8, '#a23c34'); r(-2, -12, 4, 4, '#a23c34'); }
}

export function drawScene(ctx, scene, cw, ch, t, name) {
  const k = cw / 90, W = 90, H = ch / k;
  const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x * k), Math.round(y * k), Math.ceil(w * k), Math.ceil(h * k)); };
  const fl = Math.floor(t * 9);
  ctx.save();
  if (scene === 'forge') {
    r(0, 0, W, H, '#33281f');
    for (let y = 0; y < 110; y += 6) for (let x = ((y / 6) % 2) * 5 - 5; x < W; x += 10) r(x, y, 9, 5, (x + y) % 3 ? '#5a5f68' : '#666b74');
    r(8, 40, 38, 72, '#2a2c33'); r(12, 46, 30, 66, '#16171c');
    for (let i = 0; i < 11; i++) { const hh = 14 + ((fl + i * 3) % 5) * 3 + (i % 3) * 2; r(15 + i * 2.5, 110 - hh, 3, hh, i % 2 ? '#ff7a1f' : '#ffb347'); }
    r(18, 100, 22, 10, '#ffd24a'); r(14, 24, 30, 18, '#3a3d46'); r(22, 0, 14, 26, '#454953');
    r(0, 112, W, 60, '#4a3322'); for (let x = 0; x < W; x += 8) r(x, 112, 4, 2, '#5c4129');
    r(48, 108, 26, 5, '#2a2a30'); r(52, 112, 18, 10, '#1f1f25'); r(44, 106, 8, 3, '#2a2a30');
    const hit = Math.sin(t * 7);
    person(ctx, k, 64, 80, { beard: true, shirt: '#7a4a2b', skin: '#e0b090', hair: '#dddddd' });
    ctx.save(); ctx.translate(58 * k, 96 * k); ctx.rotate(-0.5 - 0.9 * Math.max(0, hit)); r(-10, -2, 14, 2, '#6b4326'); r(-14, -6, 6, 8, '#9a9ca4'); ctx.restore();
    r(50, 100, 3, 8, '#ffb347'); if (hit > 0.8) for (let i = 0; i < 9; i++) r(46 + Math.random() * 14, 96 + Math.random() * 10, 1, 1, '#ffd24a');
  } else if (scene === 'bell') {
    r(0, 0, W, H, '#6b6e76');
    for (let y = 0; y < H; y += 6) for (let x = ((y / 6) % 2) * 5 - 5; x < W; x += 10) r(x, y, 9, 5, (x + y) % 3 ? '#7d8089' : '#8a8d96');
    const g = ctx.createLinearGradient(0, 14 * k, 0, 100 * k); g.addColorStop(0, '#4a4f8a'); g.addColorStop(0.6, '#c47a7a'); g.addColorStop(1, '#f0a868'); ctx.fillStyle = g; ctx.fillRect(18 * k, 14 * k, 54 * k, 88 * k);
    for (let i = 0; i < 9; i++) { r(18 + i * 6, 84 - (i % 3) * 3, 6, 18, '#2a2438'); if (i % 2) r(19 + i * 6, 88 - (i % 3) * 3, 1, 1, '#ffd24a'); }
    r(14, 8, 62, 8, '#5a3a22'); r(8, 0, 6, 120, '#8d909a'); r(76, 0, 6, 120, '#8d909a');
    ctx.save(); ctx.translate(45 * k, 16 * k); ctx.rotate(Math.sin(t * 3.2) * 0.2);
    r(-12, 0, 24, 3, '#a87a1a'); for (let y = 0; y < 26; y++) { const hw = Math.min(14, 6 + y * 0.5); r(-hw, 3 + y, hw * 2, 1, y % 5 === 0 ? '#e8c040' : '#d8a82a'); } r(-15, 29, 30, 3, '#e8c040'); r(-2, 32, 4, 4, '#8a6420'); r(-0.5, 36, 1, 50, '#d9c27a'); ctx.restore();
    r(0, 112, W, 60, '#7d8089'); for (let y = 112; y < H; y += 8) for (let x = ((y - 112) / 8 % 2) * 8; x < W; x += 16) r(x, y, 8, 8, '#6b6e76');
    person(ctx, k, 45, 98 + Math.abs(Math.sin(t * 3.2)) * 2, { armsUp: true, shirt: '#3f6fa8' });
  } else if (scene === 'throne') {
    r(0, 0, W, H, '#5a5d66');
    for (let y = 0; y < 100; y += 6) for (let x = ((y / 6) % 2) * 5 - 5; x < W; x += 10) r(x, y, 9, 5, (x + y) % 3 ? '#6c6f78' : '#767983');
    for (let y = 100; y < H; y += 9) for (let x = (((y - 100) / 9) % 2) * 9; x < W; x += 18) { r(x, y, 9, 9, '#8d909a'); r(x + 9, y, 9, 9, '#6e717a'); }
    r(30, 100, 30, 80, '#a23c34'); r(30, 100, 2, 80, '#e8c030'); r(58, 100, 2, 80, '#e8c030');
    [[14, '#6b4aa8'], [66, '#6b4aa8']].forEach(([bx, bc]) => { r(bx, 6, 10, 34, bc); r(bx + 3, 14, 4, 10, '#e8c030'); r(bx - 1, 4, 12, 3, '#e8c030'); });
    [8, 80].forEach((tx) => { r(tx, 44, 2, 10, '#4a3020'); r(tx - 1, 38 + (fl % 2), 4, 7, '#ff8a1f'); r(tx, 41, 2, 4, '#ffd24a'); });
    r(34, 34, 22, 6, '#e8c030'); r(32, 38, 26, 60, '#7a1f24'); r(36, 44, 18, 50, '#a23c34'); r(30, 90, 30, 8, '#4a3020');
    person(ctx, k, 45, 54, { crown: true, shirt: '#6b4aa8', skin: '#e0b090', hair: '#8a3a1e' });
    person(ctx, k, 22, 90, { hat: false, shirt: '#8d909a' }); person(ctx, k, 68, 90, { shirt: '#8d909a' });
  } else if (scene === 'book') {
    r(0, 0, W, H, '#3a2414'); for (let y = 0; y < H; y += 14) { r(0, y, W, 1, '#2a1a0e'); r(0, y + 7, W, 1, '#47301c'); }
    r(8, 36, 74, 70, '#5c3a1c'); r(10, 38, 34, 66, '#f1e2b8'); r(46, 38, 34, 66, '#ecdaa8'); r(44, 36, 2, 70, '#8a2f2a');
    const lines = Math.min(11, Math.floor(t * 3.5));
    for (let i = 0; i < lines; i++) { const wd = 24 + ((i * 7) % 8); r(14, 44 + i * 5, wd, 1.5, '#5a4630'); r(50, 44 + i * 5, wd - ((i * 5) % 6), 1.5, '#5a4630'); }
    r(60, 100, 3, 18, '#8a2f2a');
    r(70, 20, 8, 16, '#e8dcc0'); r(72, 14 + (fl % 2), 4, 7, '#ff8a1f'); r(73, 16 + (fl % 2), 2, 4, '#ffd24a');
    const g = ctx.createRadialGradient(74 * k, 24 * k, 0, 74 * k, 24 * k, 60 * k); g.addColorStop(0, 'rgba(255,190,90,.45)'); g.addColorStop(1, 'rgba(255,190,90,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
  }
  // moldura escura sutil
  const v = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.25, cw / 2, ch / 2, ch * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)'); ctx.fillStyle = v; ctx.fillRect(0, 0, cw, ch);
  ctx.restore();
}
