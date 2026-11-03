import test from 'node:test';
import assert from 'node:assert/strict';
import { LLM, newProvider } from '../src/llm.js';

const okBody = (text) => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 700, completion_tokens: 60 } }) });

test('pool reveza provedores e respeita o limite por minuto', async () => {
  const hits = { a: 0, b: 0 };
  globalThis.fetch = async (url) => { hits[url.includes('aaa') ? 'a' : 'b']++; return okBody('{"action":"idle"}'); };
  const m = new LLM(); m.enabled = true;
  m.providers = [newProvider('custom', { baseUrl: 'https://aaa.test/v1', key: 'k', model: 'm', rpm: 3 }), newProvider('custom', { baseUrl: 'https://bbb.test/v1', key: 'k', model: 'm', rpm: 2 })];
  for (let i = 0; i < 5; i++) await m.complete('s', 'u');
  assert.equal(hits.a + hits.b, 5);
  assert.ok(hits.a >= 2 && hits.b >= 2, JSON.stringify(hits));
  assert.equal(m.ready(), false, 'deveria estar sem folga (3+2 chamadas no minuto)');
  await assert.rejects(() => m.complete('s', 'u'), /Nenhuma mente/);
});

test('429 põe o provedor em espera e o outro assume; chave recusada desliga', async () => {
  let n = 0;
  globalThis.fetch = async (url) => {
    if (url.includes('aaa')) return { ok: false, status: 429, headers: new Headers({ 'retry-after': '30' }), text: async () => 'slow down' };
    if (url.includes('ccc')) return { ok: false, status: 401, headers: new Headers(), text: async () => 'bad key' };
    n++; return okBody('ok');
  };
  const m = new LLM(); m.enabled = true;
  const a = newProvider('custom', { baseUrl: 'https://aaa.test', key: 'k', model: 'm', rpm: 50 });
  const b = newProvider('custom', { baseUrl: 'https://bbb.test', key: 'k', model: 'm', rpm: 50 });
  m.providers = [a];
  await assert.rejects(() => m.complete('s', 'u'), /429/);
  assert.equal(m.usable(a), false, 'a deveria estar em espera');
  m.providers = [a, b];
  assert.equal(await m.complete('s', 'u'), 'ok'); assert.equal(n, 1);
  const c = newProvider('custom', { baseUrl: 'https://ccc.test', key: 'k', model: 'm' });
  m.providers = [c];
  await assert.rejects(() => m.complete('s', 'u'), /401/);
  assert.equal(c.enabled, false);
  assert.match(m.lastError, /recusada/);
});

test('híbrido: decisões comuns só às vezes, as importantes sempre', () => {
  const m = new LLM(); m.share = 0;
  const sim = { tick: 10, decreeText: '', decreeUntil: 0, rng: () => 0.5 };
  const a = { mem: new Array(10).fill(0), loneliness: 10, role: 'lenhador', consulted: 0, whisper: null };
  assert.equal(m.wants(sim, a), false);
  a.whisper = { text: 'vá', until: 100 };
  assert.equal(m.wants(sim, a), true);
  assert.equal(m.wants(sim, a), false, 'o sussurro só consulta uma vez');
  m.share = 100; assert.equal(m.wants(sim, { ...a, whisper: null }), true);
});
