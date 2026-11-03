import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.js';
import { TPD } from '../src/world.js';
import { marry, birth, dailyLife, startAffair, deathChance } from '../src/life.js';
import { YEAR_DAYS } from '../src/agent.js';
import { mindOf, chooseGoal, parseMind } from '../src/mind.js';

const people = (s) => { s.addFollowers(Array.from({ length: 6 }, (_, i) => 'P' + i)); const l = s.living(); l.forEach((a) => { a.age = 28; }); return l; };
const pair = (s) => { const l = people(s); const f = l.find((a) => a.sex === 'f'), m = l.find((a) => a.sex === 'm'); return [f, m, l]; };

test('casamento, gravidez, nascimento e a criança que cresce', () => {
  const s = new Sim(21); const [f, m] = pair(s);
  marry(s, f, m);
  assert.equal(f.spouse, m.id); assert.equal(f.home, m.home);
  f.preg = { father: m.id, due: s.tick }; s.stock.food = 500;
  dailyLife(s);
  const kid = s.byId(f.kids[0]);
  assert.ok(kid && kid.age < 1, 'não nasceu ninguém');
  assert.deepEqual(kid.parents, [f.id, m.id]); assert.equal(kid.fam, m.fam); assert.ok(kid.stats.str >= 3 && kid.cls);
  assert.ok(kid.age < 16 && !kid.role);
  kid.age = 15.9; for (let i = 0; i < YEAR_DAYS; i++) dailyLife(s);
  assert.ok(kid.age >= 16, 'não cresceu');
  assert.ok(s.logs.some((l) => /completou 16 anos/.test(l.text)));
});

test('morte por velhice, luto do cônjuge e órfãos acolhidos', () => {
  const s = new Sim(22); const [f, m, l] = pair(s);
  marry(s, f, m); s.stock.food = 500;
  const kid = s.spawnAgent(null, true, [f.x, f.y], { age: 6, parents: [f.id, m.id], fam: m.fam }); f.kids.push(kid.id); m.kids.push(kid.id);
  assert.ok(deathChance({ age: 54, stats: { con: 10 } }) === 0 && deathChance({ age: 85, stats: { con: 10 } }) > 0.05);
  f.age = 99.5; m.age = 99.5;
  for (let i = 0; i < 12 && (f.alive || m.alive); i++) dailyLife(s);
  assert.ok(!f.alive && !m.alive, 'ninguém morreu de velhice');
  assert.ok(s.logs.some((x) => x.kind === 'death' && /de velhice, aos/.test(x.text)));
  assert.ok(kid.guardian && s.byId(kid.guardian).alive, 'órfão não foi acolhido');
});

test('traição: caso secreto é descoberto e tem consequências', () => {
  const s = new Sim(23); const [f, m, l] = pair(s);
  const others = l.filter((a) => a !== f && a !== m);
  marry(s, f, m);
  const lover = others[0]; startAffair(s, m, lover);
  assert.ok(s.logs.some((x) => x.kind === 'secret'));
  for (let i = 0; i < 80 && m.affair; i++) dailyLife(s);
  assert.ok(!m.affair, 'caso nunca foi descoberto');
  assert.ok(s.logs.some((x) => /traição/.test(x.text)));
  assert.ok((f.rel[m.id] || 0) < 0, 'quem foi traído deveria ter perdido a confiança');
});

test('Cupido une dois moradores e parentes não se casam', () => {
  const s = new Sim(24); const [f, m, l] = pair(s);
  assert.ok(s.cupid(f, m)); assert.equal(f.spouse, m.id);
  const kid = s.spawnAgent(null, true, null, { age: 20, parents: [f.id, m.id] });
  assert.equal(s.cupid(f, kid), false, 'incesto não pode');
});

test('consciência: objetivos por regras e reflexão por IA com objetivo nas palavras da pessoa', async () => {
  const s = new Sim(25); const l = people(s);
  s.addFollowers(Array.from({ length: 14 }, (_, i) => 'Q' + i)); s.living().forEach((a) => { a.age = 30; });
  for (let i = 0; i < TPD * 3; i++) s.step();
  const goals = new Set(s.living().filter((a) => a.age >= 16).map((a) => mindOf(a).goal?.kind));
  assert.ok(goals.size >= 3, `pouca variedade de objetivos: ${[...goals]}`);
  const a = s.living().find((x) => x.age >= 16);
  s.llm = { enabled: true, ready: () => true, begin() {}, end() {}, fail() {}, wants: () => false, deliberate: async () => parseMind('{"thought":"Cansei de obedecer.","mood":"rancoroso","goal":{"kind":"rei","text":"Vou governar esta vila do meu jeito"},"summary":"Quem sou eu.","action":{"type":"campaign"}}') };
  mindOf(a).dirty = true; a.delib = false; a.act = null;
  s.maybeDeliberate(a); await new Promise((r) => setTimeout(r, 10));
  assert.equal(mindOf(a).goal.kind, 'rei'); assert.equal(mindOf(a).goal.text, 'Vou governar esta vila do meu jeito'); assert.equal(mindOf(a).mood, 'rancoroso');
  assert.ok(a.mem.some((x) => /Refleti: Cansei/.test(x.text)));
});

test('deixar a vila para sempre', () => {
  const s = new Sim(26); const l = people(s); const a = l[0];
  assert.ok(s.applyDecision(a, { type: 'leave' }, 'teste'));
  for (let i = 0; i < 400 && a.alive; i++) s.step();
  assert.ok(a.left && !a.alive, 'não partiu');
  assert.ok(s.logs.some((x) => /deixou .* para sempre/.test(x.text)));
});
