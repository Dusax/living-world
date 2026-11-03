// Ponte com a API da Anthropic, direto do navegador (sua chave fica só no seu localStorage).
import { SYSTEM_PROMPT, buildPrompt, parseDecision } from './brain.js';

export const MODELS = [
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5 (rápido e barato)' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 (mais esperto)' },
];

export class LLM {
  constructor() {
    this.enabled = false;
    this.key = '';
    this.model = MODELS[0].id;
    this.maxInflight = 3;
    this.maxCalls = 400;
    this.inflight = 0;
    this.stats = { calls: 0, errors: 0, inTok: 0, outTok: 0 };
    this.lastError = '';
    this.onChange = null;
  }
  ready() { return this.enabled && !!this.key && this.inflight < this.maxInflight && this.stats.calls < this.maxCalls; }
  begin() { this.inflight++; }
  end() { this.inflight = Math.max(0, this.inflight - 1); this.onChange?.(); }
  fail(e) {
    this.stats.errors++; this.lastError = String(e?.message || e);
    if (/401|403|invalid x-api-key|authentication/i.test(this.lastError)) { this.enabled = false; this.lastError = 'Chave recusada. IA desligada. ' + this.lastError; }
    this.onChange?.();
  }

  async complete(system, user, maxTokens = 300) {
    if (this.stats.calls >= this.maxCalls) throw new Error('Limite de chamadas atingido');
    this.stats.calls++;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: this.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    this.stats.inTok += data.usage?.input_tokens || 0;
    this.stats.outTok += data.usage?.output_tokens || 0;
    this.lastError = '';
    return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  }

  async decide(sim, agent) {
    const text = await this.complete(SYSTEM_PROMPT, buildPrompt(sim, agent), 250);
    return parseDecision(text);
  }

  async narrate(sim, events) {
    const sys = 'Você é o cronista de uma ilha habitada. Escreva em português, em 1 a 2 parágrafos curtos e vívidos, a crônica do dia a partir dos eventos. Não invente fatos que não estejam nos eventos.';
    return this.complete(sys, events.join('\n'), 500);
  }
}
