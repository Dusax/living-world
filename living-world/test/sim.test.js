import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.js';
import { TPD } from '../src/world.js';

const run = (s, days) => { for (let i = 0; i < TPD * days; i++) s.step(); };
const names = (n) => Array.from({ length: n }, (_, i) => 'Seg' + i);

test('mundo é determinístico por semente', () => {
  const a = new Sim(5), b = new Sim(5);
  for (let i = 0; i < 400; i++) { a.step(); b.step(); }
  assert.deepEqual(a.agents.map((x) => [x.x, x.y, x.hunger]), b.agents.map((x) => [x.x, x.y, x.hunger]));
});

test('dois moradores sobrevivem e constroem', () => {
  const s = new Sim(11);
  run(s, 6);
  assert.equal(s.living().length, 2, 'alguém morreu cedo demais');
  assert.ok(s.structs('field').length >= 1 || s.structs('cabin').length >= 1, 'nenhuma obra em 6 dias');
});

test('vila cresce com seguidores: profissões, obras, muralha', () => {
  const s = new Sim(3);
  run(s, 2); s.addFollowers(names(10));
  run(s, 6); s.addFollowers(names(12));
  run(s, 14);
  const built = new Set(s.world.structures.map((x) => x.type));
  assert.ok(s.living().length >= 18, `só ${s.living().length} vivos`);
  for (const t of ['cabin', 'field', 'well']) assert.ok(built.has(t), `faltou ${t}: ${[...built]}`);
  assert.ok(new Set(s.living().map((a) => a.role)).size >= 3, 'poucas profissões');
  assert.ok(s.stats.felled > 20, 'clareira não cresceu');
});

test('save/load preserva o estado', () => {
  const s = new Sim(3);
  s.addFollowers(names(4)); run(s, 3);
  const copy = Sim.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  for (let i = 0; i < 200; i++) { s.step(); copy.step(); }
  assert.deepEqual(copy.agents.map((x) => [x.x, x.y]), s.agents.map((x) => [x.x, x.y]));
});

test('decreto, sussurro, votações e eventos', () => {
  const s = new Sim(2);
  s.addFollowers(names(6));
  s.decree('construam casas para todos');
  assert.ok(s.biasFor(s.agents[0]).build > 0);
  s.whisperTo(s.agents[0], 'vá comer algo');
  const p = s.createPoll('king'); assert.ok(p && p.options.length >= 2);
  s.vote(1, 5); s.resolvePoll(); assert.ok(s.king);
  const p2 = s.createPoll('expedition'); assert.ok(p2);
  s.resolvePoll(0);
  s.trigger('dadiva'); s.trigger('meteoro'); s.trigger('praga'); s.trigger('colheita'); s.trigger('chuva');
  run(s, 2);
});

test('expedição descobre marcos e gera falas do narrador', () => {
  const s = new Sim(4);
  const beats = []; s.onBeat = (t) => beats.push(t);
  s.addFollowers(names(4)); run(s, 12);
  assert.ok(s.world.landmarks.some((l) => l.found), 'ninguém explorou');
  assert.ok(beats.length >= 3, 'narrador mudo');
});

test('mente LLM (mock) decide e falha cai para o instinto', async () => {
  const s = new Sim(8);
  let n = 0;
  s.llm = { ready: () => true, begin() {}, end() {}, fail() {}, decide: async (_s, a) => (++n % 3 === 0 ? null : { type: 'talk', target: s.agents.find((o) => o !== a).name, say: 'Olá!', thought: 'quero companhia' }) };
  for (let i = 0; i < 60; i++) { s.step(); await new Promise((r) => setTimeout(r, 0)); }
  const sources = new Set(s.agents.flatMap((a) => a.mem.map((m) => (/^\[([^\]]+)\]/.exec(m.text) || [])[1]).filter(Boolean)));
  assert.ok(sources.has('mente')); assert.ok([...sources].some((x) => x.startsWith('instinto')));
});
