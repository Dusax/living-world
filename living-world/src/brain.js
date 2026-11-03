// Cérebro por instinto: utilidade ponderada por necessidades, personalidade, ofício e "voz do céu".
import { pick } from './rng.js';
import { describeTraits, ROLE_LABEL, CLASSES, RACES, ABILITY_LABEL, ABILITIES, mod, alignment, ADULT_AGE } from './agent.js';
import { romanceTarget } from './life.js';
import { goalBias, mindOf } from './mind.js';

const KEYWORDS = [
  [/com(er|ida)|fome|fruta|colh|plant|aliment|campo/i, { gather_food: 40, farm: 45, eat: 10 }],
  [/madeira|lenha|[áa]rvore|cort/i, { gather_wood: 45 }],
  [/pedra|miner|rocha|montanha/i, { gather_stone: 45 }],
  [/\bcas(a|as)\b|constru|abrig|\blar\b|vila|obra|castelo|torre|muralha/i, { build: 60 }],
  [/descans|dorm|sono|\bpaz\b/i, { sleep: 40 }],
  [/fest|conver|amig|\buni|junt|dan[çc]|celebr/i, { talk: 50 }],
  [/ajud|compart|doa|gener|dividi/i, { give: 50 }],
  [/explor|aventur|descobr|viaj|al[ée]m|expedi/i, { wander: 40, expedition: 60 }],
  [/guard|estoc|organiz|arrum/i, { store: 40 }],
  [/forja|ferr|arma|espada|ferrament/i, { smith: 50 }],
  [/ronda|vigi|prote|defend|soldad/i, { patrol: 50 }],
];
export function keywordBias(text) {
  const out = {};
  for (const [re, b] of KEYWORDS) if (re.test(text || '')) for (const k in b) out[k] = (out[k] || 0) + b[k];
  return out;
}

const THOUGHTS = {
  eat: ['Estou com fome. Hora de comer.', 'Meu estômago ronca...'],
  gather_food: ['Preciso de comida pro povoado.', 'Vou procurar frutas.'],
  farm: ['A plantação precisa de mim.', 'Hora de cuidar do campo.'],
  gather_wood: ['Precisamos de madeira. A clareira tem que crescer.', 'Vou cortar lenha.'],
  gather_stone: ['Pedra serve pra poços, torres e muros.', 'Vou buscar pedra na montanha.'],
  store: ['Vou guardar isso no armazém.', 'Hora de organizar o estoque.'],
  build: ['Está na hora de construir.', 'O povoado precisa crescer. Mãos à obra.'],
  sleep: ['Estou exausto...', 'Preciso dormir.'],
  talk: ['Estou me sentindo sozinho. Vou procurar companhia.', 'Quero conversar com alguém.'],
  give: ['Tenho comida sobrando e alguém precisa.', 'Vou ajudar quem passa fome.'],
  wander: ['Quero ver o que há por aí.', 'Vou dar uma volta.'],
  smith: ['O ferro não se forja sozinho.', 'Ferramentas melhores deixam todo mundo mais rápido.'],
  patrol: ['Alguém precisa vigiar a mata.', 'Vou fazer a ronda.'],
  expedition: ['Quero saber o que existe além da clareira.', 'Vou explorar. Alguém precisa.'],
  flirt: ['Não consigo parar de pensar nessa pessoa.', 'Vou me aproximar.'],
  confront: ['Já aguentei demais. Vou tirar isso a limpo.', 'Isso não vai ficar assim.'],
  campaign: ['A vila precisa de um rei, e eu posso ser ele.', 'Preciso do apoio do povo.'],
  teach: ['Os jovens precisam aprender com a gente.', 'Vou ensinar o que sei.'],
  leave: ['Aqui não é mais o meu lugar.', 'Vou recomeçar a vida longe daqui.'],
};

const CLASS_BIAS = {
  guerreiro: { patrol: 12 }, barbaro: { gather_wood: 14 }, paladino: { patrol: 8, build: 6, give: 10 }, patrulheiro: { gather_food: 10, expedition: 14 },
  ladino: { expedition: 16 }, bardo: { talk: 22 }, clerigo: { give: 14, farm: 6 }, mago: { smith: 16, build: 8 },
};
// Ofício -> bônus por ação
const ROLE_BIAS = {
  lenhador: { gather_wood: 24 }, fazendeiro: { farm: 32, gather_food: 6 }, mineiro: { gather_stone: 32 },
  construtor: { build: 24 }, ferreiro: { smith: 44 }, guarda: { patrol: 28 }, explorador: { expedition: 22 }, rei: { talk: 15, patrol: -30, gather_wood: -25, gather_stone: -25, farm: -25 },
};

const TEEN_NO = new Set(['build', 'smith', 'patrol', 'expedition', 'gather_stone', 'confront', 'campaign', 'leave', 'flirt']);
const OLD_PEN = { gather_stone: -40, gather_wood: -25, patrol: -40, expedition: -45, build: -15, smith: -10, leave: 0 };

// Criança: come, dorme, brinca (anda por perto) e procura companhia (de preferência a família).
function childDecide(sim, a) {
  const r = sim.rng, opts = [];
  const add = (score, d, key) => opts.push({ score: score + r() * 8, d: { ...d, thought: pick(r, THOUGHTS[key] || THOUGHTS.wander) } });
  if (a.hunger > 35 && sim.foodAvailable(a)) add(a.hunger * 1.5, { type: 'eat' }, 'eat');
  const hr = sim.hour();
  if ((hr >= 20 || hr < 6) && a.fatigue > 25) add(80, { type: 'sleep' }, 'sleep'); else if (a.fatigue > 55) add(a.fatigue, { type: 'sleep' }, 'sleep');
  if (a.loneliness > 25) { const kin = [...(a.parents || []), ...(a.kids || [])].map((id) => sim.byId(id)).filter((o) => o && o.alive && !o.sleeping); const o = kin[0] || sim.bestPartner(a); if (o) add(a.loneliness * 0.9, { type: 'talk', target: o.name }, 'talk'); }
  add(14, { type: 'wander', far: false }, 'wander');
  opts.sort((x, y) => y.score - x.score);
  return opts[0].d;
}

export function romanticLine(sim, a, t) {
  const L = [`Você é a pessoa mais interessante desta vila, ${t.name}.`, `Gosto de estar perto de você, ${t.name}.`, `Posso te acompanhar, ${t.name}?`, `${t.name}, tenho pensado muito em você.`, `Sua companhia me faz bem, ${t.name}.`];
  return pick(sim.rng, L);
}

export function utilityDecide(sim, a) {
  if (a.age < 12) return childDecide(sim, a);
  const teen = a.age < ADULT_AGE, old = a.age >= 65, gb = goalBias(sim, a), lifeGoal = mindOf(a).goal;
  const t = a.traits, r = sim.rng;
  const living = sim.living(), pop = living.length, st = sim.stock;
  const bias = sim.biasFor(a), roleB = ROLE_BIAS[a.role] || {}, classB = CLASS_BIAS[a.cls] || {};
  const hour = sim.hour(), night = hour >= 21 || hour < 5;
  const needs = sim.projectNeeds();
  const famine = st.food < pop * 1.2 && pop >= 4;   // modo fome: todo mundo vira comida
  const opts = [];
  const add = (key, score, d) => {
    const fk = d.type + (d.kind || '');
    const recentFail = a.fails[fk] && sim.tick - a.fails[fk] < 40 ? 50 : 0;
    if (teen && TEEN_NO.has(key)) return;
    const fam = famine ? (key === 'gather_food' ? 35 : key === 'farm' ? 30 : ['build', 'patrol', 'smith', 'expedition', 'talk', 'wander', 'gather_stone', 'flirt', 'confront', 'campaign', 'teach'].includes(key) ? -35 : 0) : 0;
    opts.push({ score: score + r() * 8 + (bias[key] || 0) + (roleB[key] || 0) + (classB[key] || 0) + (gb[key] || 0) + (old ? OLD_PEN[key] || 0 : 0) + fam - recentFail, d: { ...d, thought: pick(r, THOUGHTS[key]) } });
  };

  if (a.hunger > 40 && sim.foodAvailable(a)) add('eat', a.hunger * 1.5, { type: 'eat' });

  const goal = sim.foodGoal(), foodLow = st.food < goal * 0.5;
  if (sim.structs('field').length) {
    const f = sim.farmTarget(a);
    if (f) add('farm', 26 + (f.stage === 3 ? 22 : 0) + (foodLow ? 18 : 0) + Math.max(0, a.hunger - 40) * 0.5 + t.diligence * 8 - Math.min(50, Math.max(0, st.food - goal)), { type: 'farm' });
  }
  if (sim.hasResource('food') && (!sim.structs('field').length || a.hunger > 55 || foodLow)) {
    add('gather_food', 24 + Math.max(0, a.hunger - 30) * 1.1 + (foodLow ? 22 : 0) + t.diligence * 6 - (a.inv.food >= 4 ? 40 : 0) - Math.min(60, Math.max(0, st.food - goal) * 1.5), { type: 'gather', kind: 'food' });
  }
  if (sim.hasResource('wood')) {
    const want = needs.wood > 0 ? 22 : 0;
    // Sem espaço para construir: derrubar floresta perto do centro vira prioridade (mesmo com madeira de sobra).
    const score = sim.needSpace
      ? 52 + t.diligence * 10 - (a.inv.wood >= 6 ? 40 : 0)
      : 26 + t.diligence * 12 + want + (st.wood + a.inv.wood < 14 ? 12 : 0) - (a.inv.wood >= 6 ? 40 : 0) - Math.min(60, Math.max(0, st.wood - 40 - needs.wood) * 1.5);
    add('gather_wood', score, { type: 'gather', kind: 'wood' });
  }
  if (sim.hasResource('stone')) {
    const want = needs.stone > 0 ? 28 : 0;
    add('gather_stone', 14 + t.diligence * 10 + want + (st.stone + a.inv.stone < 8 ? 8 : 0) - (a.inv.stone >= 5 ? 40 : 0) - Math.min(60, Math.max(0, st.stone - 20 - needs.stone) * 2), { type: 'gather', kind: 'stone' });
  }

  const carry = a.inv.wood + a.inv.stone + Math.max(0, a.inv.food - 2);
  if (carry >= 4) add('store', 40 + carry * 3 + t.diligence * 6, { type: 'store' });

  if (!living.some((o) => o !== a && o.act && o.act.type === 'build') && sim.nextProject()) {
    const homeless = living.filter((o) => !o.home).length;
    add('build', 50 + t.diligence * 12 + homeless * 3, { type: 'build' });
  }

  if (sim.struct('forge') && st.wood >= 2 && st.stone >= 1 && st.tools < pop * 0.5 + 2) add('smith', 14 + t.diligence * 8, { type: 'smith' });
  if (sim.roleAvailable('guarda')) add('patrol', 8 + t.bravery * 8 + (night ? 22 : 0), { type: 'patrol' });
  if (sim.unexploredLandmark() && pop >= 3 && !living.some((o) => o !== a && o.act && o.act.type === 'expedition') && a.hunger < 60 && a.fatigue < 60) {
    add('expedition', 4 + t.curiosity * 18 + t.bravery * 6, { type: 'expedition' });
  }

  if (night && a.fatigue > 25) add('sleep', 70 + a.fatigue * 0.5, { type: 'sleep' });
  else if (a.fatigue > 65) add('sleep', a.fatigue * 1.2, { type: 'sleep' });

  if (a.loneliness > 35) {
    const partner = sim.bestPartner(a);
    if (partner) add('talk', a.loneliness * (0.5 + t.sociability) * 0.9 + 5, { type: 'talk', target: partner.name });
  }
  // pais alimentam os filhos primeiro; os mais generosos ajudam quem passa fome
  const hungryKid = (a.kids || []).map((id) => sim.byId(id)).find((o) => o && o.alive && o.age < ADULT_AGE && o.hunger > 45 && o.inv.food < 1);
  if (hungryKid && a.inv.food >= 1) add('give', 85, { type: 'give', target: hungryKid.name, item: 'food' });
  else if (t.kindness > 0.45 && a.inv.food >= 3) {
    const needy = living.find((o) => o !== a && o.hunger > 70 && o.inv.food < 1);
    if (needy) add('give', 65 + t.kindness * 20, { type: 'give', target: needy.name, item: 'food' });
  }
  // vida social e ambição
  if (!teen) {
    const gt = lifeGoal && lifeGoal.target ? sim.byId(lifeGoal.target) : null;
    if (a.age >= 18 && a.age <= 75) {
      const tg = gt && gt.alive && (lifeGoal.kind === 'casar' || lifeGoal.kind === 'conquistar') ? gt : romanceTarget(sim, a);
      if (tg && !tg.sleeping) add('flirt', 12 + a.loneliness * 0.2 + (a.love[tg.id] || 0) * 0.25, { type: 'flirt', target: tg.name }); }
    const foe = gt && gt.alive && lifeGoal.kind === 'vingar' ? gt : sim.living().filter((o) => o !== a && (a.rel[o.id] || 0) < -45 && !o.sleeping)[0];
    if (foe && t.bravery > 0.35) add('confront', 3 + Math.max(0, -(a.rel[foe.id] || 0) - 40) * 0.3, { type: 'confront', target: foe.name });
    if (!sim.king && sim.tier() >= 2 && a.age >= 25 && a.age < 70) add('campaign', 2, { type: 'campaign' });
    const kid = sim.living().filter((o) => o.age < ADULT_AGE && o.age >= 3).sort((x, y) => Math.abs(x.x - a.x) + Math.abs(x.y - a.y) - Math.abs(y.x - a.x) - Math.abs(y.y - a.y))[0];
    if (kid && a.age >= 30) add('teach', 4 + t.kindness * 5, { type: 'teach', target: kid.name });
    if (lifeGoal && lifeGoal.kind === 'partir' && a.age >= 18) add('leave', 10, { type: 'leave' });
  }
  add('wander', 6 + t.curiosity * 12, { type: 'wander', far: t.bravery + t.curiosity > 1.3 });

  opts.sort((x, y) => y.score - x.score);
  return opts[0].d;
}

// ---- diálogo por modelos ----
const OPENERS = ['Bom te ver, {t}.', 'Que dia, hein, {t}?', 'Ei, {t}! Tudo bem por aí?', 'A clareira está crescendo, {t}.', 'Sabia que a floresta é maior do que parece, {t}?', 'Esse povoado vai longe, {t}.'];
const BY_ROLE = {
  lenhador: ['As árvores aqui perto já acabaram, {t}. Vou ter que ir mais fundo.'], fazendeiro: ['A colheita vem boa, {t}.'], mineiro: ['A montanha é longe, {t}, mas a pedra vale a viagem.'],
  ferreiro: ['Preciso de mais pedra pra forja, {t}.'], guarda: ['Ouvi barulhos na mata à noite, {t}.'], construtor: ['Tem muita obra pela frente, {t}.'], explorador: ['Quero ver o que há depois da trilha, {t}.'],
};
const REPLIES_GOOD = ['Também fico feliz de te ver!', 'Conversar faz bem.', 'Haha, verdade.', 'Conte comigo pro que precisar.'];
const REPLIES_BAD = ['Hm. Estou ocupado.', 'Não tenho tempo pra isso.', 'Você de novo...', 'Anda, deixa eu trabalhar.'];
export function templateLine(sim, a, other) {
  const r = sim.rng;
  if (a.hunger > 70) return `Estou faminto, ${other.name}... você tem algo pra comer?`;
  if (sim.decreeText && sim.tick < sim.decreeUntil && r() < 0.4) return `Você ouviu a voz do céu? "${sim.decreeText}"`;
  if (!a.home && r() < 0.5) return `Preciso de um teto, ${other.name}.`;
  if (BY_ROLE[a.role] && r() < 0.45) return pick(r, BY_ROLE[a.role]).replace('{t}', other.name);
  if (sim.season() === 3 && r() < 0.5) return `Esse inverno está duro, ${other.name}.`;
  return pick(r, OPENERS).replace('{t}', other.name);
}
export function templateReply(sim, other, a) { return pick(sim.rng, (other.rel[a.id] || 0) < -15 ? REPLIES_BAD : REPLIES_GOOD); }

// ---- prompt para o LLM ----
export const ACTIONS_HELP = `Ações possíveis (campo "action"):
- gather: coletar. "target" = food (frutas) | wood | stone
- farm: cuidar/colher um campo de plantação
- eat: comer
- sleep: dormir
- talk: conversar. "target" = nome; "say" = o que você diz (curto)
- build: construir a próxima obra do povoado (casa, poço, celeiro, forja, torre, muralha, castelo...)
- store: guardar o que carrega no armazém
- give: dar comida. "target" = nome
- smith: forjar ferramentas (só com forja)
- patrol: fazer a ronda de guarda
- expedition: explorar um lugar desconhecido (target opcional)
- flirt: cortejar alguém. "target" = nome
- confront: enfrentar/discutir com alguém (pode virar briga). "target" = nome
- campaign: pedir apoio ao povo para ser rei
- teach: ensinar um jovem. "target" = nome
- leave: deixar a vila para sempre
- ato: QUALQUER outra coisa que você queira tentar, descrita livremente em "intent" (roubar, mentir, fundar um culto, desafiar o rei...); o mestre decide o resultado com dados
- wander: andar por aí
- idle: ficar parado`;

export const SYSTEM_PROMPT = `Você interpreta UM morador de um povoado numa floresta, numa simulação de vida medieval.
Decida a próxima ação como ESTA PESSOA decidiria — com personalidade, ofício, lembranças e relações dela, não necessariamente a ação "ótima".
Existe uma entidade misteriosa, a "voz do céu" (o deus do mundo). Você pode obedecer, duvidar ou ignorar, conforme seu temperamento — mas fome e cansaço extremos são reais.
Responda APENAS com um objeto JSON: {"thought":"pensamento curto em primeira pessoa","action":"...","target":"...","say":"..."}
${ACTIONS_HELP}`;

export function buildPrompt(sim, a) {
  const nearby = sim.living().filter((o) => o !== a).map((o) => ({ o, d: Math.abs(o.x - a.x) + Math.abs(o.y - a.y) })).sort((p, q) => p.d - q.d).slice(0, 6);
  const rel = (o) => { const v = a.rel[o.id] || 0; return v > 60 ? 'amigo' : v > 20 ? 'simpático' : v < -40 ? 'rival' : v < -15 ? 'antipático' : 'neutro'; };
  const p = sim.nextProject();
  const L = [];
  L.push(`Você é ${a.name}, ${RACES[a.race].label} ${CLASSES[a.cls].label} nível ${a.lvl}, ${ROLE_LABEL[a.role] || 'morador'} de ${sim.name} (${describeTraits(a)}), alinhamento ${alignment(a)}.`);
  L.push(`Atributos: ${ABILITIES.map((k) => `${ABILITY_LABEL[k]} ${a.stats[k]} (${mod(a.stats[k]) >= 0 ? '+' : ''}${mod(a.stats[k])})`).join(', ')}. Aja como essa classe agiria: ${CLASSES[a.cls].desc}`);
  { const m = mindOf(a), sp = a.spouse ? sim.byId(a.spouse) : null; L.push(`Você tem ${Math.floor(a.age)} anos${sp ? `, é casado(a) com ${sp.name}` : ''}. Humor: ${m.mood}.${m.goal ? ` Seu objetivo de vida: ${m.goal.text}.` : ''}`); }
  L.push(`Agora: dia ${sim.day()}, ${String(Math.floor(sim.hour())).padStart(2, '0')}h, ${sim.seasonName()}, clima: ${sim.weather.type}. ${sim.name} é ${sim.tierName().toLowerCase()} com ${sim.living().length} moradores${sim.king ? ` e rei ${sim.byId(sim.king)?.name}` : ''}.`);
  L.push(`Seu estado: fome ${Math.round(a.hunger)}/100 (100 = morrendo), cansaço ${Math.round(a.fatigue)}/100, solidão ${Math.round(a.loneliness)}/100, vida ${Math.round(a.hp)}/100.`);
  L.push(`Você carrega: ${a.inv.food} comida, ${a.inv.wood} madeira, ${a.inv.stone} pedra. ${a.home ? 'Você tem casa.' : 'Você NÃO tem casa.'}`);
  L.push(`Armazém: ${sim.stock.food} comida, ${sim.stock.wood} madeira, ${sim.stock.stone} pedra, ${sim.stock.tools} ferramentas. Próxima obra viável: ${p ? p.type : 'nenhuma (faltam materiais ou espaço)'}.`);
  L.push(`Pessoas (mais próximas): ${nearby.map(({ o, d }) => `${o.name} (${ROLE_LABEL[o.role] || 'morador'}, ${rel(o)}, a ${d} passos, fome ${Math.round(o.hunger)}${o.sleeping ? ', dormindo' : ''})`).join('; ') || 'ninguém'}.`);
  L.push(`Lembranças recentes:\n${a.mem.slice(-8).map((m) => `- ${m.text}`).join('\n') || '- (nada ainda)'}`);
  if (sim.decreeText && sim.tick < sim.decreeUntil) L.push(`A VOZ DO CÉU ecoou para todos: "${sim.decreeText}"`);
  if (a.whisper && sim.tick < a.whisper.until) L.push(`A voz do céu sussurrou SÓ PARA VOCÊ: "${a.whisper.text}"`);
  L.push('Qual sua próxima ação? Responda só o JSON.');
  return L.join('\n');
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
