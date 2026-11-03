// Livre-arbítrio: qualquer ato que o morador queira tentar vira uma "jogada" resolvida por um mestre (IA ou regras).
// O mestre descreve {ability, dc, success:[efeitos], failure:[efeitos]}; o motor rola o d20 e aplica os efeitos validados.
import { mod, ADULT_AGE } from './agent.js';
import { isKin, marry } from './life.js';
import { TPD } from './world.js';

export const ABIL = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));

const KW = [
  ['steal', /rouba|furta|surrup|pilha|saque/i],
  ['attack', /ataca|mata|assassin|esfaque|golpe|agrid|duelo|lut[ao]|espanc|envenen|incendi|enforc|atira/i],
  ['seduce', /seduz|corteja|beij|namor|conquist|paquer/i],
  ['persuade', /convenc|discurso|persuad|inspir|lider|apoio|incit|revolt|motiv|govern|reinar|depor|derrub/i],
  ['deceive', /menti|engan|fofoc|calun|boato|intrig|manipul|trair|conspir/i],
  ['pray', /rez|orar|medit|ador|culto|ritual|ben[çc]|reli|templ/i],
  ['help', /ajud|cur[ao]|trat|consol|abra[çc]|perdo|aconselh|aliment|cuid|socorr|salv/i],
  ['gift', /presente|doar|oferec|entreg/i],
  ['flee', /fug|escap|partir|ir embora|abandon/i],
  ['create', /fund|cri[ao]|invent|escrev|pint|cant|compor|toc[ao]r|esculp|ensin|estud|pesquis/i],
];
export function classifyIntent(text) { for (const [k, re] of KW) if (re.test(text || '')) return k; return 'other'; }

export function rollCheck(sim, a, ability, dc) {
  const ab = ABIL.includes(ability) ? ability : 'cha';
  const d20 = 1 + Math.floor(sim.rng() * 20), bonus = mod(a.stats[ab]), total = d20 + bonus, target = clamp(dc || 12, 3, 25);
  const ok = d20 === 20 ? true : d20 === 1 ? false : total >= target;
  return { d20, bonus, total, dc: target, ok, ability: ab, crit: d20 === 20 || d20 === 1 };
}

// Mestre de regras (sem IA): traduz a intenção em uma jogada.
export function ruleResolve(sim, a, t, intent) {
  const k = classifyIntent(intent), r = sim.rng;
  const foe = t || sim.living().filter((o) => o !== a && Math.abs(o.x - a.x) + Math.abs(o.y - a.y) < 8).sort((x, y) => (a.rel[x.id] || 0) - (a.rel[y.id] || 0))[0] || null;
  const adults = (x) => x && x.age >= ADULT_AGE && a.age >= ADULT_AGE && !isKin(a, x);
  switch (k) {
    case 'steal': return { narration: `${a.name} tenta pegar o que não é seu.`, ability: 'dex', dc: 12, success: [{ type: 'steal', n: 2 + Math.floor(r() * 3) }], failure: [{ type: 'caught' }] };
    case 'attack': return foe ? { narration: `${a.name} parte para cima de ${foe.name}.`, ability: 'str', dc: 10 + Math.max(0, mod(foe.stats.con)), success: [{ type: 'hp', who: foe, delta: -(14 + Math.floor(r() * 18)) }, { type: 'rel', who: foe, toward: a, delta: -40 }], failure: [{ type: 'hp', who: a, delta: -(8 + Math.floor(r() * 8)) }, { type: 'rel', who: foe, toward: a, delta: -25 }] } : { narration: 'Ninguém por perto.', ability: 'str', dc: 99, success: [], failure: [] };
    case 'seduce': return adults(t) ? { narration: `${a.name} tenta conquistar ${t.name}.`, ability: 'cha', dc: 13, success: [{ type: 'love', who: t, toward: a, delta: 20 }, { type: 'love', who: a, toward: t, delta: 15 }], failure: [{ type: 'rel', who: t, toward: a, delta: -8 }] } : { narration: 'Não vai rolar.', ability: 'cha', dc: 99, success: [], failure: [] };
    case 'persuade': return { narration: `${a.name} tenta convencer ${t ? t.name : 'o povo'}.`, ability: 'cha', dc: 12, success: [{ type: 'rel', who: t || '*near*', toward: a, delta: 15 }, { type: 'campaign' }], failure: [{ type: 'rel', who: t || '*near*', toward: a, delta: -5 }] };
    case 'deceive': return { narration: `${a.name} mente com a cara mais honesta do mundo.`, ability: 'cha', dc: 12, success: [{ type: 'rumor', who: t }], failure: [{ type: 'rel', who: t, toward: a, delta: -12 }] };
    case 'pray': return { narration: `${a.name} reza em silêncio.`, ability: 'wis', dc: 8, success: [{ type: 'mood', who: a, mood: 'esperançoso' }, { type: 'fatigue', who: a, delta: -15 }], failure: [] };
    case 'help': return { narration: `${a.name} cuida de ${t ? t.name : 'quem precisa'}.`, ability: 'wis', dc: 10, success: t ? [{ type: 'hp', who: t, delta: 15 }, { type: 'rel', who: t, toward: a, delta: 12 }] : [], failure: [] };
    case 'gift': return t ? { narration: `${a.name} dá um presente a ${t.name}.`, ability: 'cha', dc: 5, success: [{ type: 'give', from: a, to: t, item: 'food', n: 1 }, { type: 'rel', who: t, toward: a, delta: 8 }], failure: [] } : { narration: '', ability: 'cha', dc: 99, success: [], failure: [] };
    case 'flee': return { narration: `${a.name} decide ir embora.`, ability: 'con', dc: 0, success: [{ type: 'leave', who: a }], failure: [] };
    case 'create': return { narration: `${a.name} se dedica a criar algo novo.`, ability: 'int', dc: 11, success: [{ type: 'mood', who: a, mood: 'feliz' }, { type: 'xp', n: 6 }], failure: [] };
    default: return { narration: `${a.name} tenta: ${intent}.`, ability: 'cha', dc: 10, success: [{ type: 'mood', who: a, mood: 'feliz' }], failure: [] };
  }
}

// Resolve uma referência a morador: objeto, nome, "eu", "alvo".
function ag(sim, a, t, x) {
  if (x && typeof x === 'object' && x.id) return x;
  const s = String(x || '').toLowerCase().trim();
  if (!s || s === 'alvo' || s === 'target' || s === '*target*') return t;
  if (s === 'eu' || s === 'self' || s === 'ator' || s === '*self*' || s === a.name.toLowerCase()) return a;
  return sim.byName(s) || null;
}

// Aplica efeitos validados (limites de magnitude; romance só entre adultos; no máximo 8 efeitos).
export function applyEffects(sim, a, t, effects) {
  const applied = [];
  for (const e of (Array.isArray(effects) ? effects : []).slice(0, 8)) {
    if (!e || typeof e.type !== 'string') continue;
    const who = e.who === '*near*' ? null : ag(sim, a, t, e.who ?? 'alvo'), toward = ag(sim, a, t, e.toward ?? 'eu');
    switch (e.type) {
      case 'rel': {
        const targets = e.who === '*near*' ? sim.living().filter((o) => o !== a && Math.abs(o.x - a.x) + Math.abs(o.y - a.y) < 7) : [who];
        for (const x of targets) if (x && toward && x !== toward) { x.rel[toward.id] = clamp((x.rel[toward.id] || 0) + clamp(e.delta, -40, 40), -100, 100); applied.push(e.type); }
        break;
      }
      case 'love': if (who && toward && who !== toward && who.age >= ADULT_AGE && toward.age >= ADULT_AGE && !isKin(who, toward)) { who.love[toward.id] = clamp((who.love[toward.id] || 0) + clamp(e.delta, -30, 30), 0, 100); applied.push('love'); } break;
      case 'hp': if (who) { who.hp = Math.min(who.maxHp, who.hp + clamp(e.delta, -60, 30)); applied.push('hp'); if (who.hp <= 0) sim.kill(who, e.cause || 'num ato violento'); } break;
      case 'fatigue': if (who) { who.fatigue = clamp(who.fatigue + clamp(e.delta, -30, 30), 0, 100); applied.push('fatigue'); } break;
      case 'give': { const f = ag(sim, a, t, e.from ?? 'eu'), to = ag(sim, a, t, e.to), item = ['food', 'wood', 'stone'].includes(e.item) ? e.item : 'food', n = Math.min(clamp(e.n, 1, 4), f ? f.inv[item] : 0); if (f && to && n > 0) { f.inv[item] -= n; to.inv[item] += n; applied.push('give'); } break; }
      case 'steal': { const n = Math.min(clamp(e.n, 1, 4), sim.stock.food); if (n > 0) { sim.stock.food -= n; a.inv.food += n; applied.push('steal'); sim.log('intrigue', `🥷 ${a.name} levou ${n} comida do armazém.`, a.id); } break; }
      case 'caught': { for (const o of sim.living()) if (o !== a && Math.abs(o.x - a.x) + Math.abs(o.y - a.y) < 8) o.rel[a.id] = clamp((o.rel[a.id] || 0) - 22, -100, 100); applied.push('caught'); sim.log('intrigue', `🚨 ${a.name} foi pego(a) em flagrante.`, a.id); break; }
      case 'mood': if (who && e.mood) { const m = (who.mind ||= {}); m.mood = String(e.mood).slice(0, 20); m.moodUntil = sim.tick + TPD * 2; applied.push('mood'); } break;
      case 'goal': if (who && e.text) { sim.setLifeGoal(who, String(e.text).slice(0, 140)); applied.push('goal'); } break;
      case 'say': if (who && e.text) { sim.say(who, String(e.text).slice(0, 140)); applied.push('say'); } break;
      case 'note': if (who && e.text) { sim.note(who, String(e.text).slice(0, 160), e.mood || null, 24); applied.push('note'); } break;
      case 'xp': sim.gainXp(a, clamp(e.n, 1, 15)); break;
      case 'campaign': if (a.mind) a.mind.campaign = (a.mind.campaign || 0) + 1; break;
      case 'rumor': {
        const victim = sim.living().filter((o) => o !== a && o !== who && (a.rel[o.id] || 0) < -10)[0];
        if (who && victim) { who.rel[victim.id] = clamp((who.rel[victim.id] || 0) - 12, -100, 100); sim.log('intrigue', `🗣 ${a.name} plantou dúvidas sobre ${victim.name} na cabeça de ${who.name}.`, a.id); applied.push('rumor'); }
        break;
      }
      case 'marry': { const x = ag(sim, a, t, e.who ?? 'eu'), y = ag(sim, a, t, e.with); if (x && y && x !== y && x.age >= 18 && y.age >= 18 && !x.spouse && !y.spouse && !isKin(x, y)) { marry(sim, x, y); applied.push('marry'); } break; }
      case 'kill': if (who && who !== a) { who.hp = 0; sim.kill(who, e.cause || 'assassinado'); applied.push('kill'); } break;
      case 'leave': { const x = ag(sim, a, t, e.who ?? 'eu'); if (x === a && a.age >= 12) { applied.push('leave'); sim.emigrate(a); } break; }
      default: break;
    }
  }
  return applied;
}

// Rola o d20, aplica o ramo certo e devolve o texto para o diário/log.
export function resolveFreeAct(sim, a, t, intent, plan) {
  const res = plan && Array.isArray(plan.success) ? plan : ruleResolve(sim, a, t, intent);
  const roll = rollCheck(sim, a, res.ability, res.dc);
  const applied = applyEffects(sim, a, t, roll.ok ? res.success : res.failure);
  const dice = `d20 ${roll.d20}${roll.bonus >= 0 ? '+' : ''}${roll.bonus} = ${roll.total} vs CD ${roll.dc}`;
  const txt = `🎲 ${a.name}: “${intent}” (${dice}: ${roll.ok ? (roll.crit ? 'sucesso crítico' : 'sucesso') : (roll.crit ? 'falha crítica' : 'falha')})${res.narration ? ' — ' + res.narration : ''}`;
  sim.log('free', txt, a.id);
  sim.remember(a, `Tentei: ${intent}. ${roll.ok ? 'Deu certo.' : 'Não deu certo.'}`);
  sim.gainXp(a, 3);
  const dramatic = applied.some((x) => ['kill', 'leave', 'marry', 'caught', 'hp'].includes(x));
  if (res.narration && (dramatic || sim.rng() < 0.25)) sim.beat(res.narration, { prio: dramatic ? 3 : 1, agent: a.id });
  return { roll, applied };
}
