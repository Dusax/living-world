// Narrador: fila de falas curtas, mostradas em legendas de 2-3 palavras por vez (estilo vídeo curto).
const CHUNK_S = 0.55, HOLD_S = 1.0;

export function chunkWords(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean), out = [];
  let cur = [];
  for (const w of words) {
    const len = cur.join(' ').length + w.length + 1;
    if (cur.length && (cur.length >= 3 || len > 22)) { out.push(cur.join(' ')); cur = []; }
    cur.push(w);
    if (/[.!?]$/.test(w) && cur.length >= 2) { out.push(cur.join(' ')); cur = []; }
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

export class Narrator {
  constructor() { this.queue = []; this.cur = null; this.t = 0; this.gap = 0; this.enabled = true; this.speed = 1; }
  push(text, opts = {}) {
    if (!this.enabled || !text) return;
    const prio = opts.prio ?? 1;
    if (prio < 2 && this.queue.length >= 2) return;
    if (this.queue.length >= 5) { const i = this.queue.findIndex((b) => b.prio < prio); if (i < 0) return; this.queue.splice(i, 1); }
    const chunks = chunkWords(text);
    this.queue.push({ text, chunks, prio, scene: opts.scene || null, at: opts.at || null, agent: opts.agent || null, dur: (chunks.length * CHUNK_S + HOLD_S) / this.speed });
  }
  clear() { this.queue = []; this.cur = null; }
  update(dt) {
    if (this.cur) { this.t += dt; if (this.t >= this.cur.dur) { this.cur = null; this.gap = 0.5; } return; }
    if (this.gap > 0) { this.gap -= dt; return; }
    if (this.queue.length) { this.cur = this.queue.shift(); this.t = 0; }
  }
  current() {
    if (!this.cur) return null;
    const per = CHUNK_S / this.speed, i = Math.min(this.cur.chunks.length - 1, Math.floor(this.t / per));
    return { beat: this.cur, chunk: this.cur.chunks[i], scene: this.cur.scene, at: this.cur.at, agent: this.cur.agent, t: this.t };
  }
  get busy() { return !!this.cur || this.queue.length > 0; }
}
