// "Consciência" dos moradores: humor, objetivo de vida, memória de longo prazo e reflexão.
// Sem IA, os objetivos nascem de regras (personalidade, classe, vida). Com IA, a própria pessoa reflete e escolhe.
import { CLASSES, RACES, ROLE_LABEL, ABILITIES, ABILITY_LABEL, mod, alignment, describeTraits, stageOf, STAGE_LABEL, ADULT_AGE } from './agent.js';
import { romanceTarget, isKin, isAdult } from './life.js';
import { TPD } from './world.js';

export const MOODS = ['calmo', 'feliz', 'triste', 'irritado', 'apaixonado', 'assustado', 'solitário', 'esperançoso', 'enlutado', 'rancoroso'];

// Objetivos de vida. "kind" é o que o motor sabe executar; o "text" é sempre nas palavras da pessoa.
export const GOALS = {
  casar: 'Casar com {t}', conquistar: 'Conquistar {t}', filhos: 'Formar uma família', rei: 'Tornar-se rei', explorar: 'Descobrir os segredos do mundo',
  proteger: 'Proteger a família e a vila', vingar: 'Vingar-me de {t}', prosperar: 'Fazer a vila prosperar', saber: 'Ficar mais forte', paz: 'Viver em paz',
  servir: 'Ajudar quem precisa', ensinar: 'Ensinar os jovens', partir: 'Deixar a vila e recomeçar a vida',
};
GOALS.dominar = 'Dominar a vila'; GOALS.livre = 'Seguir meu próprio caminho';
export const GOAL_KINDS = Object.keys(GOALS);
// Objetivo escrito pela própria pessoa (texto livre): descobre a que comportamento ele mais se parece.
const KIND_WORDS = [['vingar', /ving|matar|destru|puni|acert.* contas|odeio/i], ['casar', /casar|esposa|marido|noiv/i], ['conquistar', /amor|amar|namor|conquist|seduz|paix/i], ['rei', /rei\b|trono|coroa|reinar/i], ['dominar', /governar|domin|poder|control|lider|comand|derrub|depor|sombras/i], ['partir', /partir|fugir|embora|abandon|recome/i], ['explorar', /explor|descobr|mundo|aventur|segredo/i], ['proteger', /proteg|defend|famil|filh|guardar/i], ['servir', /ajud|servi|curar|cuidar|caridad/i], ['saber', /aprend|estud|forte|treinar|poder.*magi|saber/i], ['ensinar', /ensin|mestre|escola/i], ['filhos', /filho|bebê|herdeir/i], ['prosperar', /prosper|rique|constru|cresc|vila/i], ['paz', /paz|descans|sossego|tranquil/i]];
export function inferKind(text) { for (const [k, re] of KIND_WORDS) if (re.test(text || '')) return k; return null; }

export function newMind() { return { goal: null, mood: 'calmo', moodUntil: 0, next: 0, dirty: true, summary: '', life: [], thought: '', campaign: 0, taught: 0 }; }
export const mindOf = (a) => (a.mind ||= newMind());

// Registra um fato importante na vida da pessoa e a faz refletir de novo (e talvez mudar de humor).
export function noteLife(sim, a, text, mood = null, hours = 24) {
  const m = mindOf(a);
  m.life.push({ day: sim.day(), text }); if (m.life.length > 14) m.life.shift();
  m.dirty = true;
  if (mood) { m.mood = mood; m.moodUntil = sim.tick + Math.round((TPD / 24) * hours * 3); }
  sim.remember(a, text);
}

export function moodOf(sim, a) {
  const m = mindOf(a);
  if (sim.tick < m.moodUntil) return m.mood;
  if (a.hunger > 75) return 'assustado';
  if (a.loneliness > 75) return 'solitário';
  if (a.hp < a.maxHp * 0.35) return 'assustado';
  const lover = Object.entries(a.love || {}).some(([id, v]) => v >= 60 && sim.byId(+id)?.alive);
  if (lover) return 'apaixonado';
  if (a.hunger < 40 && a.loneliness < 45 && a.fatigue < 60) return sim.rng() < 0.6 ? 'feliz' : 'calmo';
  return 'calmo';
}

const kidsOf = (sim, a) => (a.kids || []).map((id) => sim.byId(id)).filter((k) => k && k.alive);
const nameOf = (sim, id) => sim.byId(id)?.name;

// Escolhe um objetivo por regras (usado sem IA, e quando a IA não responde).
export function chooseGoal(sim, a) {
  const t = a.traits, r = sim.rng, adult = a.age >= ADULT_AGE;
  const grudge = sim.living().filter((o) => (a.rel[o.id] || 0) <= -55).sort((x, y) => (a.rel[x.id] || 0) - (a.rel[y.id] || 0))[0];
  if (grudge && adult && t.bravery > 0.45 && t.kindness < 0.55 && r() < 0.6) return { kind: 'vingar', target: grudge.id };
  if (a.age < 12) return { kind: 'paz' };
  if (a.age < ADULT_AGE) return r() < 0.5 ? { kind: 'saber' } : { kind: 'explorar' };
  if (a.age >= 62) { const k = sim.living().filter((o) => o.age < ADULT_AGE); return k.length && r() < 0.65 ? { kind: 'ensinar' } : { kind: 'paz' }; }
  const spouse = a.spouse ? sim.byId(a.spouse) : null;
  if (!a.spouse && a.age >= 18) {
    const loved = Object.entries(a.love || {}).filter(([id, v]) => v >= 35 && sim.byId(+id)?.alive).sort((x, y) => y[1] - x[1])[0];
    if (loved) return { kind: 'casar', target: +loved[0] };
    const cand = romanceTarget(sim, a);
    if (cand && (a.loneliness > 35 || t.sociability > 0.5) && r() < 0.7) return { kind: 'conquistar', target: cand.id };
  }
  if (spouse && a.sex === 'f' && a.age < 42 && kidsOf(sim, a).length < 3 && r() < 0.5) return { kind: 'filhos' };
  if (sim.tier() >= 3 && !sim.king && a.age >= 25 && (mod(a.stats.cha) >= 1 || a.cls === 'paladino') && t.sociability > 0.45 && r() < 0.35) return { kind: 'rei' };
  if (kidsOf(sim, a).some((k) => k.age < 14) && r() < 0.5) return { kind: 'proteger' };
  const byClass = { guerreiro: 'proteger', paladino: 'proteger', barbaro: 'saber', ladino: 'explorar', patrulheiro: 'explorar', clerigo: 'servir', bardo: 'conquistar', mago: 'saber' }[a.cls];
  if (t.curiosity > 0.7 && sim.unexploredLandmark() && r() < 0.5) return { kind: 'explorar' };
  if (byClass && byClass !== 'conquistar' && r() < 0.45) return { kind: byClass };
  if (t.kindness > 0.65 && r() < 0.4) return { kind: 'servir' };
  return { kind: 'prosperar' };
}

export function goalText(sim, g) { return (g.text || GOALS[g.kind] || '').replace('{t}', nameOf(sim, g.target) || 'alguém'); }

export function setGoal(sim, a, g, source = 'regras') {
  const m = mindOf(a), old = m.goal;
  if (old && old.kind === g.kind && old.target === g.target) { m.goal.text = g.text || old.text; m.goal.until = sim.tick + TPD * 5; return false; }
  const kind = GOALS[g.kind] && g.kind !== 'livre' ? g.kind : (inferKind(g.text || g.kind) || 'livre');
  m.goal = { kind, target: g.target || null, text: g.text || '', since: sim.tick, until: sim.tick + TPD * 5, progress: 0 };
  m.goal.text = goalText(sim, m.goal);
  sim.remember(a, `Meu objetivo agora: ${m.goal.text}.`);
  if (a.age >= 12 && (!old || old.kind !== g.kind)) sim.log('mind', `🧠 ${a.name} quer: ${m.goal.text}.`, a.id);
  return true;
}

// O objetivo foi cumprido ou ficou inválido?
export function goalDone(sim, a) {
  const g = mindOf(a).goal; if (!g) return true;
  const tg = g.target ? sim.byId(g.target) : null;
  if (sim.tick > g.until) return true;
  switch (g.kind) {
    case 'casar': case 'conquistar': return !tg || !tg.alive || (a.spouse && g.kind === 'casar' ? a.spouse === g.target : false) || (g.kind === 'conquistar' && a.spouse);
    case 'filhos': return kidsOf(sim, a).length >= 3 || !a.spouse;
    case 'rei': return !!sim.king || a.age >= 70;
    case 'vingar': return !tg || !tg.alive || (a.rel[g.target] || 0) > -30 || (g.progress || 0) >= 3;
    case 'explorar': return !sim.unexploredLandmark();
    case 'ensinar': return !sim.living().some((o) => o.age < ADULT_AGE);
    default: return false;
  }
}

// Reavalia humor e objetivo uma vez por dia (e quando algo marcante acontece).
export function dailyMind(sim) {
  for (const a of sim.living()) {
    const m = mindOf(a);
    if (a.age < 6) continue;
    m.mood = moodOf(sim, a);
    if (!m.goal || goalDone(sim, a) || (m.dirty && !sim.llm?.enabled && sim.rng() < 0.5)) setGoal(sim, a, chooseGoal(sim, a));
    if (!sim.llm?.enabled) m.dirty = false;
    if (!m.summary || sim.day() % 6 === 0) m.summary = autoSummary(sim, a);
  }
}

export function autoSummary(sim, a) {
  const parts = [];
  parts.push(`${a.name} ${a.fam}, ${Math.floor(a.age)} anos, ${RACES[a.race].label.toLowerCase()} ${CLASSES[a.cls].label.toLowerCase()}`);
  const sp = a.spouse ? sim.byId(a.spouse) : null;
  if (sp) parts.push(`casado(a) com ${sp.name}`);
  const k = kidsOf(sim, a).length; if (k) parts.push(`${k} filho(s)`);
  const l = mindOf(a).life.slice(-2).map((e) => e.text); if (l.length) parts.push(l.join('; '));
  return parts.join('. ').slice(0, 280);
}

// Viés das ações do instinto conforme o objetivo de vida.
export function goalBias(sim, a) {
  const g = mindOf(a).goal; if (!g) return {};
  switch (g.kind) {
    case 'casar': case 'conquistar': return { flirt: 34 };
    case 'filhos': return { flirt: 22, give: 6 };
    case 'rei': return { campaign: 34, talk: 8 };
    case 'explorar': return { expedition: 30, wander: 10 };
    case 'proteger': return { patrol: 24, give: 10, farm: 6 };
    case 'vingar': return { confront: 40 };
    case 'prosperar': return { build: 10, farm: 8, gather_wood: 6, store: 6 };
    case 'saber': return { expedition: 10, smith: 8, patrol: 8, gather_stone: 6 };
    case 'paz': return { sleep: 6, wander: 6, talk: 6 };
    case 'servir': return { give: 26, farm: 8 };
    case 'ensinar': return { teach: 36 };
    case 'partir': return { leave: 30 };
    case 'dominar': return { campaign: 28, confront: 18, talk: 6 };
    default: return {};
  }
}

// ---------- reflexão com IA ----------
export const MIND_SYSTEM = `Você É um morador de um povoado numa floresta, num mundo que se adapta ao que as pessoas fazem. Você tem consciência própria: lembranças, afetos, medos, ambições. Ninguém lhe diz o que querer.
A cada reflexão, decida como se sente, o que quer da vida agora e o que faz em seguida. Pode amar, trair, perdoar, ter ciúme, ambicionar o trono, querer partir. Aja como essa pessoa agiria, com suas falhas.
Existe uma voz misteriosa, a "voz do céu". Você pode obedecer, duvidar ou ignorar.
Você tem LIVRE-ARBÍTRIO TOTAL. Não há objetivos permitidos nem proibidos: quer vingança, poder, amor, paz, caos, fé, fama, liberdade? Você decide. Ninguém precisa aprovar.
Responda APENAS com JSON:
{"thought":"pensamento íntimo em primeira pessoa","mood":"uma palavra (ex.: calmo, feliz, triste, irritado, apaixonado, assustado, rancoroso, culpado, ambicioso...)","goal":{"kind":"uma palavra livre (sugestões: ${GOAL_KINDS.join(', ')})","target":"nome (se couber)","text":"seu objetivo, nas suas palavras"},"summary":"quem você é e o que viveu, até 250 caracteres","action":{"type":"gather|farm|eat|sleep|talk|flirt|confront|campaign|teach|build|store|give|smith|patrol|expedition|wander|leave|idle|ato","target":"nome ou food|wood|stone","say":"fala curta opcional","intent":"só para type=ato: o que você quer tentar, livremente"}}
Para QUALQUER coisa fora dessa lista, use type "ato" e descreva em "intent": roubar, mentir, envenenar, fundar um culto, desafiar o rei, pedir perdão, sabotar, compor uma canção, fugir com alguém, incendiar, curar, chantagear... Um mestre de jogo decide o resultado com dados. Nada é proibido, mas tudo tem consequência.
Ações prontas: confront = enfrentar/discutir (pode virar briga); campaign = pedir apoio do povo para ser rei; teach = ensinar um jovem; flirt = cortejar (só entre adultos); leave = ir embora para sempre.`;

export function buildMindPrompt(sim, a) {
  const m = mindOf(a), L = [];
  const rel = (o) => { const v = a.rel[o.id] || 0, lv = a.love[o.id] || 0; return `${o.name} (${lv >= 60 ? 'amor' : v > 60 ? 'amigo' : v > 20 ? 'simpático' : v < -50 ? 'inimigo' : v < -15 ? 'antipático' : 'neutro'})`; };
  L.push(`Você é ${a.name} ${a.fam}, ${a.sex === 'f' ? 'mulher' : 'homem'}, ${Math.floor(a.age)} anos (${STAGE_LABEL[stageOf(a.age)].toLowerCase()}), ${RACES[a.race].label} ${CLASSES[a.cls].label}${a.age >= ADULT_AGE ? ` nível ${a.lvl}` : ' em formação'}, ${ROLE_LABEL[a.role] || 'sem ofício'}. Alinhamento: ${alignment(a)}. Temperamento: ${describeTraits(a)}.`);
  L.push(`Atributos: ${ABILITIES.map((k) => `${ABILITY_LABEL[k]} ${a.stats[k]}`).join(', ')}.`);
  const sp = a.spouse ? sim.byId(a.spouse) : null, kids = kidsOf(sim, a);
  L.push(`Família: ${sp ? `casado(a) com ${sp.name}` : 'sem cônjuge'}; filhos: ${kids.length ? kids.map((k) => `${k.name} (${Math.floor(k.age)})`).join(', ') : 'nenhum'}.${a.preg ? ' Você está esperando um filho.' : ''}`);
  if (a.affair) L.push(`SEGREDO: você tem um caso com ${nameOf(sim, a.affair.with)}.`);
  const known = sim.living().filter((o) => o !== a).sort((x, y) => Math.abs(y.rel[a.id] || 0) + (a.love[y.id] || 0) - (Math.abs(x.rel[a.id] || 0) + (a.love[x.id] || 0))).slice(0, 6);
  L.push(`Quem importa para você: ${known.map(rel).join('; ') || 'ninguém ainda'}.`);
  L.push(`Humor: ${m.mood}. Fome ${Math.round(a.hunger)}/100, cansaço ${Math.round(a.fatigue)}/100, solidão ${Math.round(a.loneliness)}/100, vida ${Math.round(a.hp)}/${a.maxHp}.`);
  L.push(`Seu objetivo atual: ${m.goal ? m.goal.text : 'nenhum ainda'}.${m.summary ? ` Sua história até aqui: ${m.summary}` : ''}`);
  if (m.life.length) L.push(`Momentos marcantes: ${m.life.slice(-6).map((e) => `dia ${e.day}: ${e.text}`).join(' | ')}.`);
  L.push(`Agora: dia ${sim.day()}, ${sim.seasonName()}, ${sim.name} é ${sim.tierName().toLowerCase()} com ${sim.living().length} moradores${sim.king ? `, rei ${nameOf(sim, sim.king)}` : ', sem rei'}. Armazém: ${sim.stock.food} comida.`);
  const news = sim.logs.filter((l) => l.t > sim.tick - TPD * 2 && ['death', 'wedding', 'birth', 'intrigue', 'event'].includes(l.kind)).slice(-5).map((l) => l.text);
  if (news.length) L.push(`Notícias da vila: ${news.join(' | ')}.`);
  L.push(`Lembranças recentes:\n${a.mem.slice(-6).map((x) => `- ${x.text}`).join('\n') || '- (nada)'}`);
  if (sim.decreeText && sim.tick < sim.decreeUntil) L.push(`A VOZ DO CÉU ecoou: "${sim.decreeText}"`);
  if (a.whisper && sim.tick < a.whisper.until) L.push(`A voz do céu sussurrou SÓ PARA VOCÊ: "${a.whisper.text}"`);
  L.push('Reflita e responda só o JSON.');
  return L.join('\n');
}

export function parseMind(text) {
  const mt = /\{[\s\S]*\}/.exec(text || '');
  if (!mt) return null;
  try {
    const o = JSON.parse(mt[0]);
    const out = { thought: String(o.thought || '').slice(0, 220), mood: o.mood ? String(o.mood).toLowerCase().trim().slice(0, 20) : null, summary: o.summary ? String(o.summary).slice(0, 280) : '' };
    if (o.goal && (o.goal.text || o.goal.kind)) out.goal = { kind: String(o.goal.kind || 'livre').toLowerCase().slice(0, 24), target: o.goal.target ? String(o.goal.target) : null, text: o.goal.text ? String(o.goal.text).slice(0, 140) : '' };
    if (o.action && typeof o.action.type === 'string') out.action = { type: o.action.type.toLowerCase().trim(), target: o.action.target ? String(o.action.target) : undefined, say: o.action.say ? String(o.action.say).slice(0, 160) : undefined, intent: o.action.intent ? String(o.action.intent).slice(0, 200) : undefined, thought: out.thought };
    return out;
  } catch { return null; }
}

// ---------- o mestre (D&D): decide o desfecho de qualquer ato ----------
export const DM_SYSTEM = `Você é o mestre de um mundo vivo estilo D&D. Um morador declara o que quer tentar. Nada é proibido, mas tudo tem consequência, e o mundo reage de forma coerente com quem são as pessoas.
Escolha a habilidade (str|dex|con|int|wis|cha) e a CD (5 trivial, 10 fácil, 15 difícil, 20 quase impossível) e descreva os efeitos em caso de sucesso e de falha. O motor rola o d20.
Efeitos possíveis (use só estes; "who"/"toward"/"from"/"to"/"with" são nomes de moradores, ou "eu" para quem tenta, ou "alvo"):
{"type":"rel","who":"","toward":"","delta":-40..40} opinião de who sobre toward
{"type":"love","who":"","toward":"","delta":-30..30} só adultos
{"type":"hp","who":"","delta":-60..30}
{"type":"give","from":"","to":"","item":"food|wood|stone","n":1..4}
{"type":"steal","n":1..4} tira comida do armazém
{"type":"caught"} testemunhas passam a desconfiar do ator
{"type":"mood","who":"","mood":"palavra"}
{"type":"goal","who":"","text":"novo objetivo de vida"}
{"type":"say","who":"","text":"fala"}
{"type":"note","who":"","text":"o que a pessoa vai lembrar","mood":"palavra"}
{"type":"marry","who":"","with":""}
{"type":"kill","who":"","cause":"causa da morte"} só em sucesso dramático e coerente
{"type":"leave","who":"eu"}
{"type":"xp","n":1..15}
{"type":"rumor","who":"Nome"}
Responda APENAS com JSON: {"narration":"1 ou 2 frases curtas","ability":"dex","dc":12,"success":[...],"failure":[...]}`;

export function buildDMPrompt(sim, a, t, intent) {
  const L = [];
  const sheet = (x) => `${x.name} ${x.fam}, ${x.sex === 'f' ? 'mulher' : 'homem'}, ${Math.floor(x.age)} anos, ${RACES[x.race].label} ${CLASSES[x.cls].label} nv ${x.lvl}, ${ABILITIES.map((k) => `${ABILITY_LABEL[k]} ${x.stats[k]}`).join(' ')}, PV ${Math.round(x.hp)}/${x.maxHp}, humor ${mindOf(x).mood}${x.spouse ? `, casado(a) com ${sim.byId(x.spouse)?.name}` : ''}`;
  L.push(`Quem tenta: ${sheet(a)}. Objetivo: ${mindOf(a).goal ? mindOf(a).goal.text : 'nenhum'}.`);
  if (t) L.push(`Alvo: ${sheet(t)}. Opinião do alvo sobre quem tenta: ${Math.round(t.rel[a.id] || 0)}; de quem tenta sobre o alvo: ${Math.round(a.rel[t.id] || 0)}.`);
  L.push(`Mundo: ${sim.name}, ${sim.tierName().toLowerCase()}, ${sim.living().length} moradores, dia ${sim.day()}, ${sim.seasonName()}${sim.king ? `, rei ${sim.byId(sim.king)?.name}` : ', sem rei'}. Armazém: ${sim.stock.food} comida.`);
  const near = sim.living().filter((o) => o !== a && o !== t && Math.abs(o.x - a.x) + Math.abs(o.y - a.y) < 8).slice(0, 6).map((o) => o.name);
  L.push(`Testemunhas por perto: ${near.join(', ') || 'ninguém'}.`);
  L.push(`O QUE ELE(A) QUER TENTAR: "${intent}"`);
  return L.join('\n');
}

export function parseDM(text) {
  const mt = /\{[\s\S]*\}/.exec(text || '');
  if (!mt) return null;
  try {
    const o = JSON.parse(mt[0]);
    if (!o || (!Array.isArray(o.success) && !Array.isArray(o.failure))) return null;
    return { narration: String(o.narration || '').slice(0, 260), ability: String(o.ability || 'cha').toLowerCase(), dc: Number(o.dc) || 12, success: Array.isArray(o.success) ? o.success : [], failure: Array.isArray(o.failure) ? o.failure : [] };
  } catch { return null; }
}
