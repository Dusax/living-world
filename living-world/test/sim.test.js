import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.js';
import { TPD } from '../src/world.js';

test('mundo é determinístico por semente', () => {
  const a = new Sim(5), b = new Sim(5);
  for (let i = 0; i < 400; i++) { a.step(); b.step(); }
  assert.deepEqual(a.agents.map((x) => [x.x, x.y, x.hunger]), b.agents.map((x) => [x.x, x.y, x.hunger]));
});

test('povoado sobrevive 15 dias por instinto', () => {
  const s = new Sim(11);
  for (let i = 0; i < TPD * 15; i++) s.step();
  assert.ok(s.living().length >= 4, `só ${s.living().length} vivos`);
  assert.ok(s.houses().length >= 1, 'ninguém construiu casa');
  assert.ok(s.logs.some((l) => l.kind === 'talk'), 'ninguém conversou');
});

test('save/load preserva o estado', () => {
  const s = new Sim(3);
  for (let i = 0; i < 300; i++) s.step();
  const copy = Sim.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  for (let i = 0; i < 200; i++) { s.step(); copy.step(); }
  assert.deepEqual(copy.agents.map((x) => [x.x, x.y]), s.agents.map((x) => [x.x, x.y]));
  assert.equal(copy.tick, s.tick);
});

test('decreto e sussurro influenciam decisões', () => {
  const s = new Sim(2);
  s.decree('construam casas para todos');
  assert.ok(s.biasFor(s.agents[0]).build > 0);
  const a = s.agents[0];
  s.whisperTo(a, 'vá comer algo');
  assert.ok(a.whisper && a.mem.at(-1).text.includes('sussurrar'));
});

test('eventos do deus funcionam', () => {
  const s = new Sim(4);
  const n = s.living().length;
  s.trigger('forasteiro'); assert.equal(s.living().length, n + 1);
  s.trigger('dadiva'); assert.ok(s.stock.food >= 18);
  s.trigger('meteoro'); s.trigger('praga'); s.trigger('colheita');
  for (let i = 0; i < 100; i++) s.step();
});

test('mente LLM (mock) decide, e falha cai para o instinto', async () => {
  const s = new Sim(8);
  let n = 0;
  s.llm = {
    ready: () => true, begin() {}, end() {}, fail() {},
    decide: async (_sim, a) => (++n % 3 === 0 ? null : { type: 'talk', target: s.agents.find((o) => o !== a).name, say: 'Olá!', thought: 'quero companhia' }),
  };
  for (let i = 0; i < 60; i++) { s.step(); await new Promise((r) => setTimeout(r, 0)); }
  const sources = new Set(s.agents.flatMap((a) => a.mem.map((m) => (/^\[([^\]]+)\]/.exec(m.text) || [])[1]).filter(Boolean)));
  assert.ok(sources.has('mente'), 'ninguém usou a mente LLM');
  assert.ok([...sources].some((x) => x.startsWith('instinto')), 'sem fallback para instinto');
});
