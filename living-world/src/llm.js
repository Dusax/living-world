// Pool de "mentes": vários provedores (grátis ou não), cada um com limite por minuto e por dia.
// O jogo reveza entre os que têm folga; se nenhum puder responder, os moradores usam o instinto.
import { SYSTEM_PROMPT, buildPrompt, parseDecision } from './brain.js';

// Valores iniciais conservadores. Limites e nomes de modelo mudam: ajuste na tela conforme a página do provedor.
export const PRESETS = {
  gemini: { label: 'Gemini (AI Studio, plano grátis)', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-flash-latest', rpm: 8, rpd: 200 },
  groq: { label: 'Groq (plano grátis)', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.1-8b-instant', rpm: 25, rpd: 10000 },
  openrouter: { label: 'OpenRouter (modelo :free)', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', rpm: 12, rpd: 40 },
  ollama: { label: 'Ollama (no seu PC, ilimitado)', kind: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1:8b', rpm: 300, rpd: 100000, keyOptional: true },
  custom: { label: 'Outro (URL compatível com OpenAI)', kind: 'openai', baseUrl: 'https://', model: '', rpm: 10, rpd: 500 },
  anthropic: { label: 'Claude (Anthropic, pago)', kind: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-haiku-5-5', rpm: 50, rpd: 2000 },
};

let uid = 1;
export function newProvider(preset, over = {}) {
  const p = PRESETS[preset] || PRESETS.custom;
  return { id: `${preset}-${uid++}-${Math.floor(Math.random() * 1e4)}`, preset, label: p.label, kind: p.kind, baseUrl: p.baseUrl, key: '', model: p.model, rpm: p.rpm, rpd: p.rpd, keyOptional: !!p.keyOptional, enabled: true, ...over };
}
const dayKey = () => new Date().toISOString().slice(0, 10);
const runtime = () => ({ stats: { calls: 0, errors: 0, inTok: 0, outTok: 0 }, cool: 0, stamps: [], dayCount: 0, day: dayKey(), lastError: '' });

export class LLM {
  constructor() {
    this.providers = [];
    this.enabled = false;
    this.share = 25;            // % das decisões "comuns" que vão para a IA (as importantes sempre vão)
    this.maxInflight = 3;
    this.inflight = 0;
    this.onChange = null;
    this.rt = new Map();        // estado de execução por provedor (não salvo)
    this.rr = 0;
  }
  state(p) { let r = this.rt.get(p.id); if (!r) { r = runtime(); this.rt.set(p.id, r); } if (r.day !== dayKey()) { r.day = dayKey(); r.dayCount = 0; } return r; }

  usable(p, now = Date.now()) {
    if (!p.enabled || !p.baseUrl || !p.model || (!p.key && !p.keyOptional)) return false;
    const r = this.state(p);
    if (now < r.cool) return false;
    r.stamps = r.stamps.filter((t) => now - t < 60000);
    return r.stamps.length < p.rpm && r.dayCount < p.rpd;
  }
  // Escolhe o provedor com mais folga por minuto (revezando em empate).
  pick() {
    const now = Date.now(), ok = this.providers.filter((p) => this.usable(p, now));
    if (!ok.length) return null;
    let best = null, bs = -1;
    ok.forEach((p, i) => { const r = this.state(p); const room = (p.rpm - r.stamps.length) / p.rpm + ((i + this.rr) % ok.length) * 1e-3; if (room > bs) { bs = room; best = p; } });
    this.rr++;
    return best;
  }
  ready() { return this.enabled && this.inflight < this.maxInflight && !!this.pick(); }
  // Híbrido: decisões importantes sempre consultam a IA; as comuns, só uma fração.
  wants(sim, a) {
    const dec = sim.decreeText && sim.tick < sim.decreeUntil && a.consulted !== sim.decreeUntil;
    const whisp = a.whisper && sim.tick < a.whisper.until && a.consulted !== a.whisper.until;
    if (dec) { a.consulted = sim.decreeUntil; return true; }
    if (whisp) { a.consulted = a.whisper.until; return true; }
    if (a.mem.length < 5 || a.loneliness > 60 || a.role === 'rei') return true;
    return sim.rng() * 100 < this.share;
  }
  begin() { this.inflight++; }
  end() { this.inflight = Math.max(0, this.inflight - 1); this.onChange?.(); }
  fail() { this.onChange?.(); }
  get stats() { const t = { calls: 0, errors: 0, inTok: 0, outTok: 0 }; for (const r of this.rt.values()) for (const k in t) t[k] += r.stats[k]; return t; }
  get lastError() { for (const p of this.providers) { const r = this.rt.get(p.id); if (r && r.lastError) return `${p.label}: ${r.lastError}`; } return ''; }

  async complete(system, user, maxTokens = 300) {
    const p = this.pick();
    if (!p) throw new Error('Nenhuma mente disponível agora (limites ou chaves).');
    const r = this.state(p), now = Date.now();
    r.stamps.push(now); r.dayCount++; r.stats.calls++;
    try {
      let res, text, usage;
      if (p.kind === 'anthropic') {
        res = await fetch(p.baseUrl.replace(/\/+$/, '') + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': p.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: p.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }) });
      } else {
        res = await fetch(p.baseUrl.replace(/\/+$/, '') + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', ...(p.key ? { authorization: `Bearer ${p.key}` } : {}) }, body: JSON.stringify({ model: p.model, max_tokens: maxTokens, temperature: 0.8, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
      }
      if (!res.ok) { const body = (await res.text()).slice(0, 160); const e = new Error(`HTTP ${res.status} ${body}`); e.status = res.status; e.retry = Number(res.headers.get('retry-after')) || 0; throw e; }
      const data = await res.json();
      if (p.kind === 'anthropic') { text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''); usage = [data.usage?.input_tokens, data.usage?.output_tokens]; }
      else { text = data.choices?.[0]?.message?.content || ''; usage = [data.usage?.prompt_tokens, data.usage?.completion_tokens]; }
      r.stats.inTok += usage[0] || 0; r.stats.outTok += usage[1] || 0; r.lastError = '';
      return text;
    } catch (e) {
      r.stats.errors++; r.lastError = String(e.message || e).slice(0, 140);
      if (e.status === 401 || e.status === 403) { p.enabled = false; r.lastError = 'chave recusada, desligado. ' + r.lastError; }
      else if (e.status === 429 || e.status >= 500 || !e.status) r.cool = Date.now() + (e.retry ? e.retry * 1000 : e.status === 429 ? 60000 : 20000);
      this.onChange?.();
      throw e;
    }
  }
  async decide(sim, agent) { return parseDecision(await this.complete(SYSTEM_PROMPT, buildPrompt(sim, agent), 300)); }
  async narrate(sim, events) {
    const sys = 'Você é o cronista de uma vila numa floresta. Escreva em português, em 6 a 10 frases curtas e vívidas (uma por linha), a crônica a partir dos eventos. Não invente fatos que não estejam nos eventos.';
    return this.complete(sys, events.join('\n'), 500);
  }

  // Persistência (as chaves ficam só no localStorage deste navegador).
  toJSON() { return { enabled: this.enabled, share: this.share, providers: this.providers }; }
  load(o) { if (!o) return; this.enabled = !!o.enabled; this.share = o.share ?? 25; this.providers = (o.providers || []).map((p) => ({ ...newProvider(p.preset || 'custom'), ...p })); }
}
