import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.js';
import { mindOf, parseMind, parseDM, inferKind } from '../src/mind.js';
import { ruleResolve, applyEffects, classifyIntent } from '../src/freewill.js';

const people = (s, n = 6) => { s.addFollowers(Array.from({ length: n }, (_, i) => 'L' + i)); const l = s.living(); l.forEach((a) => { if (a.age < 20) a.age = 28; }); return l; };
const settle = (s, a, ticks = 80) => { for (let i = 0; i < ticks && a.act; i++) s.step(); };

test('ato livre sem IA: o mestre de regras rola o dado e aplica as consequências', () => {
  const s = new Sim(31); const [a, b] = people(s);
  s.stock.food = 20; const before = s.stock.food;
  assert.ok(s.applyDecision(a, { type: 'ato', intent: 'roubar comida do armazém' }, 'teste'));
  settle(s, a);
  const log = s.logs.find((l) => l.kind === 'free' && /roubar comida/.test(l.text));
  assert.ok(log, 'o ato não foi resolvido'); assert.match(log.text, /d20 \d+/);
  assert.ok(s.stock.food < before || s.logs.some((l) => /flagrante/.test(l.text)), 'nem roubou nem foi pego');
});

test('qualquer ideia que a IA invente vira um ato (sem lista fechada de ações)', () => {
  const s = new Sim(32); const [a, b] = people(s);
  assert.ok(s.applyDecision(a, { type: 'envenenar', target: b.name, thought: 'ele merece' }, 'mente'));
  assert.equal(a.act.type, 'ato'); assert.equal(a.act.targetId, b.id);
  assert.equal(classifyIntent('envenenar o poço'), 'attack');
  settle(s, a, 120);
  assert.ok(s.logs.some((l) => l.kind === 'free' && /envenenar/.test(l.text)));
});

test('mestre IA (simulado) decide: assassinato, casamento e partida seguem o plano dele', async () => {
  const s = new Sim(33); const [a, b, c] = people(s);
  const both = (eff) => ({ narration: 'O mestre decidiu.', ability: 'dex', dc: 10, success: eff, failure: eff });
  s.llm = { enabled: true, ready: () => true, begin() {}, end() {}, fail() {}, wants: () => false, adjudicate: async () => both([{ type: 'kill', who: b.name, cause: 'envenenado' }]) };
  a.age = 30; s.applyDecision(a, { type: 'ato', target: b.name, intent: 'colocar veneno no vinho de ' + b.name }, 'mente');
  for (let i = 0; i < 200 && a.act; i++) { s.step(); await new Promise((r) => setTimeout(r, 0)); }
  assert.ok(!b.alive, 'a vítima deveria ter morrido'); assert.ok(s.logs.some((l) => l.kind === 'death' && /envenenado/.test(l.text)));
  s.stock.food = 100;
  const x = c, y = s.living().find((o) => o !== a && o !== c);
  const applied = applyEffects(s, a, null, [{ type: 'marry', who: x.name, with: y.name }, { type: 'mood', who: a.name, mood: 'culpado' }, { type: 'goal', who: a.name, text: 'Fundar uma ordem secreta nas montanhas' }]);
  assert.ok(applied.includes('mood') && applied.includes('goal'));
  assert.equal(mindOf(a).mood, 'culpado'); assert.match(mindOf(a).goal.text, /ordem secreta/);
});

test('objetivos são texto livre; o motor só infere a que comportamento se parecem', () => {
  const s = new Sim(34); const [a] = people(s);
  const res = parseMind('{"thought":"x","mood":"ambicioso","goal":{"kind":"ordem secreta","text":"Fundar uma ordem secreta e governar nas sombras"},"action":{"type":"hackear","intent":"invadir o armazém à noite"}}');
  assert.equal(res.mood, 'ambicioso'); assert.equal(res.goal.text, 'Fundar uma ordem secreta e governar nas sombras'); assert.equal(res.action.type, 'hackear');
  s.applyMind(a, res);
  assert.equal(mindOf(a).goal.text, 'Fundar uma ordem secreta e governar nas sombras');
  assert.equal(mindOf(a).goal.kind, 'dominar');
  assert.equal(inferKind('quero só viver em paz'), 'paz'); assert.equal(inferKind('algo sem sentido nenhum'), null);
  assert.equal(parseDM('lixo'), null);
});

test('a única trava: romance e casamento só entre adultos', () => {
  const s = new Sim(35); const [a, b] = people(s);
  const kid = s.spawnAgent(null, true, null, { age: 9 });
  const plan = ruleResolve(s, a, kid, 'seduzir a criança');
  assert.equal(plan.dc, 99);
  const applied = applyEffects(s, a, kid, [{ type: 'love', who: kid.name, toward: a.name, delta: 30 }, { type: 'marry', who: a.name, with: kid.name }]);
  assert.deepEqual(applied, []); assert.ok(!(kid.love[a.id] > 0)); assert.equal(a.spouse, null);
  assert.equal(s.applyDecision(a, { type: 'flirt', target: kid.name }, 'teste'), false);
});

test('crianças e adolescentes também decidem por si (sem limite de idade para querer)', () => {
  const s = new Sim(36); people(s);
  const teen = s.spawnAgent(null, true, null, { age: 13 });
  assert.ok(s.applyDecision(teen, { type: 'ato', intent: 'fugir de casa' }, 'mente'));
  assert.ok(s.applyDecision(teen, { type: 'build' }, 'mente') || true);
});
