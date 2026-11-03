// Cérebro por instinto: utilidade ponderada por necessidades, personalidade e "voz do céu".
import { pick } from './rng.js';

const KEYWORDS = [
  [/com(er|ida)|fome|fruta|pesc|ca[çc]a|colh|aliment/i, { gather_food: 45, eat: 10 }],
  [/madeira|lenha|[áa]rvore|cort/i, { gather_wood: 45 }],
  [/pedra|miner|rocha/i, { gather_stone: 45 }],
  [/\bcas(a|as)\b|constru|abrig|\blar\b|vila/i, { build: 60 }],
  [/descans|dorm|sono|\bpaz\b/i, { sleep: 40 }],
  [/fest|conver|amig|\buni|junt|dan[çc]|celebr/i, { talk: 50 }],
  [/ajud|compart|doa|gener|dividi/i, { give: 50 }],
  [/explor|aventur|descobr|viaj|al[ée]m/i, { wander: 50 }],
  [/guard|estoc|organiz|arrum/i, { store: 40 }],
];

export function keywordBias(text) {
  const out = {};
  for (const [re, b] of KEYWORDS) if (re.test(text || '')) for (const k in b) out[k] = (out[k] || 0) + b[k];
  return out;
}

const THOUGHTS = {
  eat: ['Estou com fome. Hora de comer.', 'Meu estômago ronca...'],
  gather_food: ['Preciso de comida pro povoado.', 'Vou procurar frutas e peixes.'],
  gather_wood: ['Precisamos de madeira.', 'Vou cortar lenha.'],
  gather_stone: ['Pedra serve pra construir.', 'Vou buscar pedras.'],
  store: ['Vou guardar isso no armazém.', 'Hora de organizar o estoque.'],
  build: ['Alguém precisa de um teto. Vou construir.', 'Chegou a hora de erguer uma casa.'],
  sleep: ['Estou exausto...', 'Preciso dormir.'],
  talk: ['Estou me sentindo sozinho. Vou procurar companhia.', 'Quero conversar com alguém.'],
  give: ['Tenho comida sobrando e alguém precisa.', 'Vou ajudar quem está passando fome.'],
  wander: ['Quero ver o que há por aí.', 'Vou dar uma volta.'],
};

export function utilityDecide(sim, a) {
  const t = a.traits, r = sim.rng;
  const living = sim.living();
  const pop = living.length;
  const st = sim.stock;
  const bias = sim.biasFor(a);
  const hour = sim.hour();
  const night = hour >= 21 || hour < 5;
  const opts = [];
  const add = (key, score, d) => {
    const recentFail = a.fails[d.type + (d.kind || '')] && sim.tick - a.fails[d.type + (d.kind || '')] < 40 ? 50 : 0;
    opts.push({ score: score + r() * 8 + (bias[key] || 0) - recentFail, d: { ...d, thought: pick(r, THOUGHTS[key]) } });
  };

  if (a.hunger > 40 && sim.foodAvailable(a)) add('eat', a.hunger * 1.5, { type: 'eat' });

  if (sim.hasResource('food')) {
    const low = st.food < pop * 2.5;
    const sat = Math.max(0, st.food - pop * 6) * 1.5; // estoque já farto: ninguém precisa acumular mais
    add('gather_food', 28 + Math.max(0, a.hunger - 30) * 1.1 + (low ? 22 : 0) + t.diligence * 8 - (a.inv.food >= 4 ? 40 : 0) - Math.min(60, sat), { type: 'gather', kind: 'food' });
  }
  if (sim.hasResource('wood')) {
    add('gather_wood', 30 + t.diligence * 14 + (st.wood + a.inv.wood < 14 ? 15 : 0) - (a.inv.wood >= 6 ? 40 : 0) - Math.min(60, Math.max(0, st.wood - 30) * 1.5), { type: 'gather', kind: 'wood' });
  }
  if (sim.hasResource('stone')) {
    add('gather_stone', 20 + t.diligence * 10 + (st.stone + a.inv.stone < 6 ? 10 : 0) - (a.inv.stone >= 4 ? 40 : 0) - Math.min(60, Math.max(0, st.stone - 12) * 2), { type: 'gather', kind: 'stone' });
  }

  const carry = a.inv.wood + a.inv.stone + Math.max(0, a.inv.food - 2);
  if (carry >= 4) add('store', 40 + carry * 3 + t.diligence * 6, { type: 'store' });

  if (sim.canBuild() && !living.some((o) => o !== a && o.act && o.act.type === 'build')) {
    const homeless = living.filter((o) => !o.home).length;
    if (homeless > 0) add('build', 52 + t.diligence * 12 + homeless * 3, { type: 'build' });
  }

  if (night && a.fatigue > 25) add('sleep', 70 + a.fatigue * 0.5, { type: 'sleep' });
  else if (a.fatigue > 65) add('sleep', a.fatigue * 1.2, { type: 'sleep' });

  if (a.loneliness > 35) {
    const partner = sim.bestPartner(a);
    if (partner) add('talk', a.loneliness * (0.5 + t.sociability) * 0.9 + 5, { type: 'talk', target: partner.name });
  }

  if (t.kindness > 0.45 && a.inv.food >= 3) {
    const needy = living.find((o) => o !== a && o.hunger > 70 && o.inv.food < 1);
    if (needy) add('give', 65 + t.kindness * 20, { type: 'give', target: needy.name, item: 'food' });
  }

  add('wander', 8 + t.curiosity * 14, { type: 'wander', far: t.bravery + t.curiosity > 1.2 });

  opts.sort((x, y) => y.score - x.score);
  return opts[0].d;
}

// ---- diálogo por modelos (usado quando não há LLM, ou quando o LLM não escreve a fala) ----
const OPENERS = ['Bom te ver, {t}.', 'Que dia, hein, {t}?', 'Ei, {t}! Tudo bem por aí?', 'Achei que ia ficar sozinho hoje, {t}.', 'Sabia que vi frutas perto da água, {t}?', 'O povoado está mudando, não acha, {t}?'];
const REPLIES_GOOD = ['Também fico feliz de te ver!', 'Conversar faz bem.', 'Haha, verdade.', 'Conte comigo pro que precisar.'];
const REPLIES_BAD = ['Hm. Estou ocupado.', 'Não tenho tempo pra isso.', 'Você de novo...', 'Anda, deixa eu trabalhar.'];

export function templateLine(sim, a, other) {
  const r = sim.rng;
  if (a.hunger > 70) return `Estou faminto, ${other.name}... você tem algo pra comer?`;
  if (sim.decreeText && sim.tick < sim.decreeUntil && r() < 0.5) return `Você ouviu a voz do céu? "${sim.decreeText}"`;
  if (!a.home && r() < 0.5) return `Preciso de um teto, ${other.name}. Alguém vai construir?`;
  if (sim.season() === 3 && r() < 0.5) return `Esse inverno está duro, ${other.name}.`;
  return pick(r, OPENERS).replace('{t}', other.name);
}
export function templateReply(sim, other, a) {
  const rel = other.rel[a.id] || 0;
  return pick(sim.rng, rel < -15 ? REPLIES_BAD : REPLIES_GOOD);
}

// ---- prompt para o LLM ----
export const ACTIONS_HELP = `Ações possíveis (campo "action"):
- gather: coletar. "target" = food | wood | stone
- eat: comer (se houver comida com você ou no armazém)
- sleep: dormir/descansar
- talk: conversar. "target" = nome de um habitante; "say" = o que você diz (curto)
- build: construir uma casa (custa 10 madeira + 2 pedra, do seu bolso + armazém)
- store: guardar madeira/pedra/comida extra no armazém
- give: dar comida a alguém. "target" = nome; "say" opcional
- wander: explorar por aí
- idle: ficar parado pensando`;

export const SYSTEM_PROMPT = `Você interpreta UM habitante de um pequeno povoado numa ilha, numa simulação de vida.
Decida a próxima ação como ESTA PESSOA decidiria — com a personalidade, as lembranças e os relacionamentos dela, não necessariamente a ação "ótima".
Existe uma entidade misteriosa chamada "voz do céu" (o deus do mundo). Você pode obedecer, duvidar ou ignorar, conforme seu temperamento — mas fome e cansaço extremos são reais.
Responda APENAS com um objeto JSON, sem texto fora dele:
{"thought":"pensamento curto em primeira pessoa","action":"...","target":"...","say":"..."}
${ACTIONS_HELP}`;

export function buildPrompt(sim, a) {
  const nearby = sim.living().filter((o) => o !== a).map((o) => ({ o, d: Math.abs(o.x - a.x) + Math.abs(o.y - a.y) })).sort((p, q) => p.d - q.d).slice(0, 6);
  const rel = (o) => { const v = a.rel[o.id] || 0; return v > 60 ? 'amigo' : v > 20 ? 'simpático' : v < -40 ? 'rival' : v < -15 ? 'antipático' : 'neutro'; };
  const lines = [];
  lines.push(`Você é ${a.name}, ${describeForPrompt(a)}.`);
  lines.push(`Agora: dia ${sim.day()}, ${String(Math.floor(sim.hour())).padStart(2, '0')}h, ${sim.seasonName()}, clima: ${sim.weather.type}.`);
  lines.push(`Seu estado: fome ${Math.round(a.hunger)}/100 (100 = morrendo), cansaço ${Math.round(a.fatigue)}/100, solidão ${Math.round(a.loneliness)}/100, vida ${Math.round(a.hp)}/100.`);
  lines.push(`Você carrega: ${a.inv.food} comida, ${a.inv.wood} madeira, ${a.inv.stone} pedra. ${a.home ? 'Você tem casa.' : 'Você NÃO tem casa.'}`);
  lines.push(`Armazém do povoado: ${sim.stock.food} comida, ${sim.stock.wood} madeira, ${sim.stock.stone} pedra. Casas: ${sim.houses().length}. População: ${sim.living().length}.`);
  lines.push(`Pessoas (mais próximas): ${nearby.map(({ o, d }) => `${o.name} (${rel(o)}, a ${d} passos, fome ${Math.round(o.hunger)}${o.sleeping ? ', dormindo' : ''})`).join('; ') || 'ninguém'}.`);
  const mem = a.mem.slice(-8).map((m) => `- ${m.text}`).join('\n');
  lines.push(`Lembranças recentes:\n${mem || '- (nada ainda)'}`);
  if (sim.decreeText && sim.tick < sim.decreeUntil) lines.push(`A VOZ DO CÉU ecoou para todos: "${sim.decreeText}"`);
  if (a.whisper && sim.tick < a.whisper.until) lines.push(`A voz do céu sussurrou SÓ PARA VOCÊ: "${a.whisper.text}"`);
  lines.push('Qual sua próxima ação? Responda só o JSON.');
  return lines.join('\n');
}

function describeForPrompt(a) {
  const t = a.traits;
  const w = (v, lo, hi) => (v >= 0.65 ? hi : v <= 0.35 ? lo : null);
  return [w(t.bravery, 'medroso', 'corajoso'), w(t.sociability, 'reservado', 'sociável'), w(t.diligence, 'preguiçoso', 'trabalhador'), w(t.curiosity, 'caseiro', 'curioso'), w(t.kindness, 'egoísta', 'generoso')].filter(Boolean).join(', ') || 'de temperamento equilibrado';
}

export function parseDecision(text) {
  const m = /\{[\s\S]*\}/.exec(text || '');
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (!o || typeof o.action !== 'string') return null;
    return { type: o.action.toLowerCase().trim(), target: o.target ? String(o.target) : undefined, say: o.say ? String(o.say).slice(0, 160) : undefined, thought: o.thought ? String(o.thought).slice(0, 200) : '' };
  } catch { return null; }
}
