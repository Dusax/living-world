// Vida real: idade, romance, casamento, gravidez, filhos que crescem, traição, boatos, golpe contra o rei e morte por velhice.
// Funções puras sobre o Sim (sem DOM). Chamadas pelo motor em sim.js.
import { CLASSES, YEAR_DAYS, ADULT_AGE, XP_TABLE, mod, maxHpFor } from './agent.js';
import { TPD } from './world.js';

const MARRY_AGE = 18;
export const isAdult = (a) => a.age >= ADULT_AGE;
const name = (a) => a.name;

// Parentes próximos (pais, filhos, irmãos) não se casam.
export function isKin(a, b) {
  if (a.parents?.includes(b.id) || b.parents?.includes(a.id)) return true;
  return !!(a.parents?.length && b.parents?.length && a.parents.some((p) => b.parents.includes(p)));
}

// Quem pode ser tentado a trair: infiel por temperamento ou casamento frio.
export function tempted(sim, a) {
  if (!a.spouse) return true;
  const cold = (a.rel[a.spouse] ?? 0) < 60;
  return (a.traits.kindness < 0.5 || a.traits.diligence < 0.45) && cold ? true : sim.rng() < 0.05;
}

// Alvo de flerte para o instinto (ou null).
export function romanceTarget(sim, a) {
  if (a.age < MARRY_AGE || a.age > 75) return null;
  let best = null, bs = -1e9;
  for (const o of sim.living()) {
    if (o === a || o.age < MARRY_AGE || o.age > 75 || o.sleeping || isKin(a, o)) continue;
    const rel = a.rel[o.id] || 0, love = a.love[o.id] || 0;
    if (a.spouse && a.spouse !== o.id && !tempted(sim, a)) continue;
    if (!a.spouse && o.spouse && !(love >= 40 && tempted(sim, o))) continue;
    if (rel < 10 && love < 10) continue;
    const d = Math.abs(o.x - a.x) + Math.abs(o.y - a.y);
    const s = love * 0.8 + rel * 0.3 - d * 0.35 - Math.abs(a.age - o.age) * 0.9 + sim.rng() * 8 + (a.spouse === o.id ? 10 : 0);
    if (s > bs) { bs = s; best = o; }
  }
  return best;
}

// Fim de uma conversa romântica: o amor cresce (ou é rejeitado) e pode virar casamento ou caso.
export function romanticTalk(sim, a, t) {
  const gain = 8 + Math.max(0, mod(a.stats.cha)) * 1.5 + (a.cls === 'bardo' ? 5 : 0) + sim.rng() * 6;
  if ((t.rel[a.id] || 0) < -10 || (t.spouse && t.spouse !== a.id && !tempted(sim, t) && (a.love[t.id] || 0) < 50)) {
    a.love[t.id] = Math.max(0, (a.love[t.id] || 0) - 8); a.loneliness = Math.min(100, a.loneliness + 12);
    sim.log('intrigue', `💔 ${name(a)} foi rejeitado(a) por ${name(t)}.`, a.id);
    sim.note(a, `${t.name} não correspondeu ao meu interesse.`, 'triste', 12);
    return;
  }
  a.love[t.id] = Math.min(100, (a.love[t.id] || 0) + gain);
  t.love[a.id] = Math.min(100, (t.love[a.id] || 0) + 4 + (t.rel[a.id] || 0) / 10 + Math.max(0, mod(t.stats.cha)) * 0.6 + sim.rng() * 5);
  sim.bond(a, t, 3); sim.bond(t, a, 3);
  sim.remember(a, `Passei um tempo perto de ${t.name}. Meu coração acelera.`);
  const both = a.love[t.id] >= 62 && t.love[a.id] >= 62;
  if (!both || a.spouse === t.id) return;
  if (!a.spouse && !t.spouse) {
    if ((a.rel[t.id] || 0) >= 35 && (t.rel[a.id] || 0) >= 35 && sim.rng() < 0.6) marry(sim, a, t);
  } else if (!a.affair && !t.affair && a.love[t.id] >= 72 && t.love[a.id] >= 72 && tempted(sim, a) && tempted(sim, t)) startAffair(sim, a, t);
}

export function marry(sim, a, t) {
  a.spouse = t.id; t.spouse = a.id; a.marriedTick = t.marriedTick = sim.tick;
  a.affair = t.affair = null;
  const hs = (id) => sim.world.structures.find((s) => s.id === id);
  const cabinA = hs(a.home)?.type === 'cabin', cabinT = hs(t.home)?.type === 'cabin';
  if (cabinA || (!cabinT && a.home)) t.home = a.home; else a.home = t.home;
  a.loneliness = t.loneliness = 0;
  sim.bond(a, t, 25); sim.bond(t, a, 25);
  for (const o of sim.living()) if (o !== a && o !== t) o.loneliness = Math.max(0, o.loneliness - 15);
  sim.note(a, `Casei com ${t.name}!`, 'feliz', 48); sim.note(t, `Casei com ${a.name}!`, 'feliz', 48);
  sim.log('wedding', `💍 ${a.name} e ${t.name} se casaram.`, a.id);
  sim.beat(`${a.name} e ${t.name} se casaram. A vila inteira fez festa.`, { prio: 3, agent: a.id, at: [a.x, a.y] });
}

export function divorce(sim, a, t, why) {
  if (a.spouse !== t.id) return;
  a.spouse = t.spouse = null;
  sim.bond(a, t, -30); sim.bond(t, a, -30);
  const stay = a.sex === 'f' ? a : t, leave = stay === a ? t : a;   // as crianças ficam com a mãe
  leave.home = null; sim.assignHomes();
  sim.log('intrigue', `⚖ ${a.name} e ${t.name} se separaram (${why}).`, a.id);
  sim.note(a, `Me separei de ${t.name}.`, 'triste', 48); sim.note(t, `Me separei de ${a.name}.`, 'triste', 48);
}

export function startAffair(sim, a, t) {
  a.affair = { with: t.id, since: sim.tick }; t.affair = { with: a.id, since: sim.tick };
  sim.log('secret', `🤫 ${a.name} e ${t.name} têm um caso em segredo.`, a.id);
  sim.remember(a, `Estou me encontrando às escondidas com ${t.name}.`); sim.remember(t, `Estou me encontrando às escondidas com ${a.name}.`);
}

// Boato: quem não gosta de alguém fala mal dele para outra pessoa.
export function gossip(sim, a, t) {
  if (a.traits.kindness > 0.6 || sim.rng() > 0.3) return;
  const targets = sim.living().filter((c) => c !== a && c !== t && (a.rel[c.id] || 0) < -15 && (t.rel[c.id] || 0) > -60);
  if (!targets.length) return;
  const c = targets[Math.floor(sim.rng() * targets.length)];
  t.rel[c.id] = Math.max(-100, (t.rel[c.id] || 0) - 8 - sim.rng() * 6);
  sim.log('intrigue', `🗣 ${a.name} espalhou boatos sobre ${c.name} para ${t.name}.`, a.id);
  sim.remember(t, `${a.name} me contou coisas feias sobre ${c.name}.`);
  sim.remember(c, `Ouvi dizer que ${a.name} anda falando mal de mim.`);
}

function discoverAffair(sim, a, lover) {
  const traitor = a, betrayed = [a.spouse, lover.spouse].filter(Boolean).map((id) => sim.byId(id)).filter((x) => x && x.alive);
  a.affair = lover.affair = null;
  sim.log('intrigue', `💥 A traição de ${a.name} e ${lover.name} veio à tona.`, a.id);
  sim.beat(`A traição de ${a.name} e ${lover.name} veio à tona.`, { prio: 3, agent: a.id });
  for (const b of betrayed) {
    const cheat = b.spouse === a.id ? a : lover, other = cheat === a ? lover : a;
    b.rel[cheat.id] = Math.max(-100, (b.rel[cheat.id] || 0) - 60); b.love[cheat.id] = 0;
    b.rel[other.id] = Math.max(-100, (b.rel[other.id] || 0) - 35);
    sim.note(b, `Descobri que ${cheat.name} me traiu com ${other.name}.`, 'rancoroso', 72);
    const roll = sim.rng();
    if (roll < 0.5) divorce(sim, b, cheat, 'traição');
    else if (roll < 0.8) {   // briga: o traído parte para cima do amante
      other.hp -= 25 + sim.rng() * 15; b.hp -= 8;
      sim.log('conflict', `⚔ ${b.name} partiu para cima de ${other.name} por ciúme.`, b.id);
      if (other.hp <= 0) sim.kill(other, 'num duelo por ciúme');
    } else { b.rel[cheat.id] += 25; sim.log('intrigue', `🕊 ${b.name} perdoou ${cheat.name}.`, b.id); }
  }
  for (const x of [a, lover]) if (x.alive) x.loneliness = Math.min(100, x.loneliness + 20);
}

// Nascimento: um bebê entra na vila, com a família dos pais.
export function birth(sim, mother, father) {
  const twins = sim.rng() < 0.03 ? 2 : 1, out = [];
  for (let i = 0; i < twins; i++) {
    const kid = sim.spawnAgent(null, true, [mother.x, mother.y], { age: 0, parents: [mother.id, father.id], fam: father.fam });
    kid.inv.food = 0; kid.hunger = 20; kid.home = mother.home;
    mother.kids.push(kid.id); father.kids.push(kid.id); out.push(kid);
    sim.stats.born++;
  }
  mother.preg = null;
  const k = out.map((x) => x.name).join(' e ');
  sim.log('birth', `👶 ${k} ${out.length > 1 ? 'nasceram' : 'nasceu'}, ${out.length > 1 ? 'filhos' : 'filho(a)'} de ${mother.name} e ${father.name}.`, out[0].id);
  sim.beat(`Nasceu${out.length > 1 ? 'm' : ''} ${k}, ${out.length > 1 ? 'filhos' : 'filho(a)'} de ${mother.name} e ${father.name}.`, { prio: 3, agent: out[0].id, at: [mother.x, mother.y] });
  sim.note(mother, `${k} ${out.length > 1 ? 'nasceram' : 'nasceu'}. Sou mãe.`, 'feliz', 72); sim.note(father, `${k} ${out.length > 1 ? 'nasceram' : 'nasceu'}. Sou pai.`, 'feliz', 72);
  if (sim.rng() < 0.008) sim.kill(mother, 'no parto');
  return out;
}

export function deathChance(a) {
  if (a.age < 55) return 0;
  const base = Math.min(1, ((a.age - 55) / 40) ** 2 * 0.18);
  return a.age >= 100 ? 1 : base * (1 - 0.04 * mod(a.stats.con));
}

// Chamado quando alguém morre (qualquer causa): luto, viuvez, órfãos.
export function onDeath(sim, a, cause) {
  const sp = a.spouse ? sim.byId(a.spouse) : null;
  if (sp && sp.alive) { sp.spouse = null; sp.loneliness = Math.min(100, sp.loneliness + 45); sim.note(sp, cause === '__left' ? `${a.name}, meu cônjuge, foi embora da vila.` : `${a.name}, meu cônjuge, morreu ${cause}. Estou de luto.`, 'enlutado', 96); }
  a.spouse = null;
  const lover = a.affair ? sim.byId(a.affair.with) : null;
  if (lover) lover.affair = null;
  a.affair = null;
  const kids = (a.kids || []).map((id) => sim.byId(id)).filter((k) => k && k.alive);
  for (const k of kids) {
    sim.note(k, cause === '__left' ? `${a.name}, ${a.sex === 'f' ? 'minha mãe' : 'meu pai'}, foi embora da vila.` : `${a.name}, ${a.sex === 'f' ? 'minha mãe' : 'meu pai'}, morreu ${cause}.`, 'enlutado', 72);
    k.loneliness = Math.min(100, k.loneliness + 40);
    if (k.age < ADULT_AGE && !(k.parents || []).some((pid) => sim.byId(pid)?.alive)) {   // órfão: alguém da vila acolhe
      const guardian = sim.living().filter((o) => isAdult(o) && o !== k && o.age < 65).sort((x, y) => (y.rel[k.id] || 0) - (x.rel[k.id] || 0))[0];
      if (guardian) { k.guardian = guardian.id; k.home = guardian.home; sim.log('event', `🏠 ${guardian.name} acolheu ${k.name}, que ficou órfão(ã).`, guardian.id); }
    }
  }
}

// Rotina diária da vida: idade, velhice, gravidez, partos, casos descobertos, golpes.
export function dailyLife(sim) {
  const live = sim.living();
  const pop = live.length, fed = sim.stock.food >= Math.max(8, pop * 2.5) && pop < sim.foodCap();
  for (const a of live) {
    const before = a.age;
    a.age += 1 / YEAR_DAYS;
    for (const id of Object.keys(a.love)) if (+id !== a.spouse) a.love[id] = Math.max(0, a.love[id] - 1.2);
    if (before < ADULT_AGE && a.age >= ADULT_AGE) comingOfAge(sim, a);
    if (Math.floor(before / 10) !== Math.floor(a.age / 10) && a.age >= 60) sim.log('event', `🎂 ${a.name} completou ${Math.floor(a.age / 10) * 10} anos.`, a.id);
    if (a.alive && sim.rng() < deathChance(a)) {
      const kids = a.kids.filter((id) => sim.byId(id)?.alive).length;
      const txt = `${a.name} morreu de velhice, aos ${Math.floor(a.age)} anos.${kids ? ` Deixa ${kids} ${kids > 1 ? 'filhos' : 'filho(a)'}.` : ''}`;
      sim.kill(a, 'de velhice', txt);
    }
  }
  // gravidez
  for (const m of sim.living()) {
    if (m.preg) { if (sim.tick >= m.preg.due) { const f = sim.byId(m.preg.father); if (f && f.alive) birth(sim, m, f); else { m.preg = null; } } continue; }
    if (m.sex !== 'f' || m.age < MARRY_AGE || m.age > 42 || !m.spouse || !fed || pop >= 90) continue;
    const f = sim.byId(m.spouse);
    if (!f || !f.alive || f.sex !== 'm' || m.kids.filter((id) => sim.byId(id)?.alive).length >= 4) continue;
    if (sim.rng() < 0.2) {
      m.preg = { father: f.id, due: sim.tick + Math.round(TPD * 2.25) };
      sim.log('birth', `🤰 ${m.name} está esperando um filho de ${f.name}.`, m.id);
      sim.beat(`${m.name} está esperando um filho.`, { prio: 2, agent: m.id });
    }
  }
  // casos descobertos
  for (const a of sim.living()) {
    if (!a.affair || a.id > a.affair.with) continue;
    const lover = sim.byId(a.affair.with);
    if (!lover || !lover.alive) { a.affair = null; continue; }
    if (sim.rng() < 0.14) discoverAffair(sim, a, lover);
  }
  // golpe: rei impopular é deposto
  if (sim.king && sim.tier() >= 3 && sim.day() % 4 === 0) {
    const k = sim.byId(sim.king);
    const voters = sim.living().filter((o) => o !== k && isAdult(o));
    const avg = voters.reduce((s, o) => s + (o.rel[k.id] || 0), 0) / Math.max(1, voters.length);
    if (k && voters.length >= 8 && avg < -12 && sim.rng() < 0.5) {
      sim.king = null; k.role = null; sim.clamorDay = sim.day();
      sim.log('intrigue', `⚔ O povo se revoltou e depôs ${k.name}.`, k.id);
      sim.beat(`O povo se revoltou. ${k.name} não é mais rei.`, { prio: 3, agent: k.id });
      for (const o of voters) o.rel[k.id] = (o.rel[k.id] || 0) - 5;
    }
  }
}

function comingOfAge(sim, a) {
  a.maxHp = maxHpFor(a); a.hp = Math.min(a.maxHp, a.hp + 10); a.role = null;
  sim.log('event', `🎓 ${a.name} completou 16 anos e agora é ${CLASSES[a.cls].label.toLowerCase()}.`, a.id);
  sim.note(a, `Cresci. Agora sou ${CLASSES[a.cls].label.toLowerCase()}.`, 'esperançoso', 48);
  if ((a.mind?.taught || 0) >= 3) { a.lvl = 2; a.xp = XP_TABLE[2]; a.maxHp = maxHpFor(a); a.hp = a.maxHp; sim.log('level', `⭐ ${a.name} começa a vida adulta no nível 2, graças ao que aprendeu com os mais velhos.`, a.id); }
  sim.beat(`${a.name} cresceu. Agora é ${CLASSES[a.cls].label.toLowerCase()}.`, { prio: 2, agent: a.id });
}
