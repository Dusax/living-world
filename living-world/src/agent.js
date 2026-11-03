import { pick } from './rng.js';

export const NAMES_F = ['Isabelle', 'Rafaelle', 'Jheni', 'Mira', 'Aurora', 'Cora', 'Elisa', 'Gaia', 'Iara', 'Kira', 'Nina', 'Pia', 'Rúbia', 'Tânia', 'Vera', 'Ana', 'Carla', 'Estela', 'Gisele', 'Julia', 'Lara', 'Noemi', 'Paula', 'Renata', 'Sofia', 'Ursula', 'Wanda', 'Yara', 'Zilda', 'Dora', 'Flora', 'Helena', 'Joana', 'Lívia', 'Nair', 'Priscila', 'Selma', 'Alice', 'Clara', 'Emília', 'Gabriela', 'Inês', 'Karina', 'Maria', 'Patrícia', 'Silvia'];
export const NAMES_M = ['Davi', 'Eduardo', 'Kevin', 'Guga', 'Matheus', 'Devair', 'Jonatas', 'Nunes', 'Pires', 'Rudolf', 'Teo', 'Lúcio', 'Bento', 'Fausto', 'Hugo', 'Jonas', 'Léo', 'Otto', 'Saulo', 'Ulisses', 'Zeca', 'Bruno', 'Diego', 'Fabio', 'Heitor', 'Ivo', 'Murilo', 'Olavo', 'Quirino', 'Tiago', 'Valter', 'Xavier', 'Caio', 'Enzo', 'Gael', 'Igor', 'Marcos', 'Orlando', 'Ramiro', 'Tomás', 'Vitor', 'Breno', 'Daniel', 'Felipe', 'Henrique', 'João', 'Lucas', 'Nelson', 'Otávio', 'Rodrigo', 'Thiago', 'Vinícius'];
export const NAMES = [...NAMES_F, ...NAMES_M];

export const SURNAMES = ['Silva', 'Nunes', 'Pires', 'Costa', 'Souza', 'Lima', 'Rocha', 'Alves', 'Dias', 'Moura', 'Ramos', 'Barros', 'Teixeira', 'Faria', 'Campos', 'Freitas', 'Cardoso', 'Melo', 'Araújo', 'Ribeiro', 'Pinto', 'Cunha', 'Matos', 'Brandão', 'Duarte'];
export const YEAR_DAYS = 3;   // 1 ano de vida = 3 dias de jogo (~72 s em 1×)
export const ADULT_AGE = 16;
export const stageOf = (age) => (age < 12 ? 'crianca' : age < 16 ? 'adolescente' : age < 60 ? 'adulto' : 'idoso');
export const STAGE_LABEL = { crianca: 'Criança', adolescente: 'Adolescente', adulto: 'Adulto', idoso: 'Idoso' };

export const ROLE_LABEL = { anciao: 'ancião', lenhador: 'lenhador', fazendeiro: 'fazendeiro', mineiro: 'mineiro', construtor: 'mestre de obras', ferreiro: 'ferreiro', guarda: 'guarda', explorador: 'explorador', rei: 'rei' };

export const TRAIT_LABELS = {
  bravery: ['medroso', 'corajoso'], sociability: ['reservado', 'sociável'], diligence: ['preguiçoso', 'trabalhador'],
  curiosity: ['caseiro', 'curioso'], kindness: ['egoísta', 'generoso'],
};

// ---- D&D: classes, raças, atributos, nível ----
export const CLASSES = {
  guerreiro:   { label: 'Guerreiro',   hd: 12, main: 'str', roles: ['guarda', 'mineiro'],        color: '#8d909a', desc: 'Armadura pesada. Vigia a vila e aguenta o tranco.' },
  barbaro:     { label: 'Bárbaro',     hd: 12, main: 'str', roles: ['lenhador', 'mineiro'],      color: '#8a5a30', desc: 'Fúria bruta. Derruba árvores como ninguém (+1 madeira).' },
  paladino:    { label: 'Paladino',    hd: 10, main: 'cha', roles: ['guarda', 'construtor'],     color: '#d0b04a', desc: 'Juramento e carisma. Candidato natural a rei.' },
  patrulheiro: { label: 'Patrulheiro', hd: 10, main: 'dex', roles: ['explorador', 'fazendeiro'], color: '#3f7a3a', desc: 'Sabe achar comida (+1 fruta) e anda rápido nas expedições.' },
  ladino:      { label: 'Ladino',      hd: 8,  main: 'dex', roles: ['explorador', 'construtor'], color: '#34343f', desc: 'Furtivo e veloz. Descobre o mapa primeiro.' },
  bardo:       { label: 'Bardo',       hd: 8,  main: 'cha', roles: ['fazendeiro', 'construtor'], color: '#c9433a', desc: 'Conversas rendem mais: amizades surgem mais rápido.' },
  clerigo:     { label: 'Clérigo',     hd: 8,  main: 'wis', roles: ['fazendeiro', 'construtor'], color: '#e6e6e6', desc: 'Cura quem está por perto.' },
  mago:        { label: 'Mago',        hd: 6,  main: 'int', roles: ['ferreiro', 'construtor'],   color: '#6b4aa8', desc: 'Mente afiada: constrói mais rápido e forja ferramentas em dobro.' },
};
export const RACES = {
  humano: { label: 'Humano', bonus: {} }, elfo: { label: 'Elfo', bonus: { dex: 2, con: -1 } }, anao: { label: 'Anão', bonus: { con: 2, cha: -1 } },
  halfling: { label: 'Halfling', bonus: { dex: 2, str: -1 } }, meioorc: { label: 'Meio-orc', bonus: { str: 2, int: -1 } },
};
export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_LABEL = { str: 'FOR', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR' };
export const XP_TABLE = [0, 0, 12, 35, 70, 120, 190, 280, 400, 560, 760];
export const MAX_LEVEL = 10;
export const mod = (score) => Math.floor((score - 10) / 2);

// Rola 4d6 descartando o menor, escolhe raça e classe (com variedade) e calcula PV.
export function rollSheet(sim, a) {
  const r = sim.rng;
  const d6 = () => 1 + Math.floor(r() * 6);
  const stat = () => { const v = [d6(), d6(), d6(), d6()].sort((x, y) => x - y); return v[1] + v[2] + v[3]; };
  a.stats = {}; for (const k of ABILITIES) a.stats[k] = stat();
  const raceKeys = Object.keys(RACES); a.race = pick(r, raceKeys);
  for (const [k, v] of Object.entries(RACES[a.race].bonus)) a.stats[k] = Math.max(3, a.stats[k] + v);
  const count = {}; for (const o of sim.agents) if (o.cls) count[o.cls] = (count[o.cls] || 0) + 1;
  let best = null, bs = -1e9;
  for (const [id, c] of Object.entries(CLASSES)) { const s = a.stats[c.main] + r() * 6 - (count[id] || 0) * 2.2; if (s > bs) { bs = s; best = id; } }
  a.cls = best; a.lvl = 1; a.xp = 0;
  a.maxHp = maxHpFor(a); a.hp = a.maxHp;
}
export function maxHpFor(a) { const c = CLASSES[a.cls]; return Math.round(50 + c.hd * 3 + mod(a.stats.con) * 5 + (a.lvl - 1) * (c.hd / 2 + 2)); }

export function alignment(a) {
  const law = a.traits.diligence >= 0.62 ? 'Leal' : a.traits.diligence <= 0.36 ? 'Caótico' : 'Neutro';
  const good = a.traits.kindness >= 0.62 ? 'Bom' : a.traits.kindness <= 0.36 ? 'Mau' : 'Neutro';
  return law === 'Neutro' && good === 'Neutro' ? 'Neutro' : `${law} ${good}`;
}

export function makeAgent(sim, name, x, y, opts = {}) {
  const r = sim.rng;
  const id = sim.nextAgentId++;
  const a = {
    id, name, x, y, px: x, py: y,
    hue: Math.floor((id * 137.5) % 360), skin: Math.floor(r() * 4), hair: Math.floor(r() * 5),
    role: null, cls: null, race: null, lvl: 1, xp: 0, stats: null, maxHp: 100,
    age: opts.age ?? 18 + Math.floor(r() * 26), sex: opts.sex ?? (r() < 0.5 ? 'f' : 'm'), fam: opts.fam || pick(r, SURNAMES),
    parents: opts.parents || [], kids: [], spouse: null, love: {}, affair: null, preg: null, marriedTick: 0, guardian: null,
    traits: { bravery: 0.1 + r() * 0.85, sociability: 0.1 + r() * 0.85, diligence: 0.1 + r() * 0.85, curiosity: 0.1 + r() * 0.85, kindness: 0.1 + r() * 0.85 },
    hp: 100, hunger: 20 + r() * 20, fatigue: r() * 20, loneliness: 20 + r() * 20,
    inv: { wood: 0, food: 2, stone: 0 },
    home: null, alive: true, sleeping: false,
    act: null, pending: null, thought: '', say: '', sayUntil: 0, consulted: 0,
    mem: [], rel: {}, fails: {}, whisper: null, born: sim.tick, died: null,
  };
  const [m, f] = (opts.parents || []).map((pid) => sim.byId(pid));
  if (m && f) inheritSheet(sim, a, m, f); else rollSheet({ rng: r, agents: sim.agents }, a);
  return a;
}

// Filho(a): atributos e personalidade são uma mistura dos pais, com variação; a vocação (classe) vem de um dos pais ou nasce nova.
export function inheritSheet(sim, a, m, f) {
  const r = sim.rng, clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  a.stats = {};
  for (const k of ABILITIES) a.stats[k] = clamp(Math.round((m.stats[k] + f.stats[k]) / 2 + (r() * 5 - 2.5)), 3, 18);
  a.race = r() < 0.5 ? m.race : f.race;
  for (const k of Object.keys(a.traits)) a.traits[k] = clamp((m.traits[k] + f.traits[k]) / 2 + (r() - 0.5) * 0.4, 0.05, 1);
  a.skin = r() < 0.5 ? m.skin : f.skin; a.hair = r() < 0.5 ? m.hair : f.hair;
  const best = Object.entries(CLASSES).map(([id, c]) => [id, a.stats[c.main] + r() * 6]).sort((x, y) => y[1] - x[1])[0][0];
  a.cls = r() < 0.5 ? (r() < 0.5 ? m.cls : f.cls) : best;
  a.lvl = 1; a.xp = 0; a.maxHp = maxHpFor(a); a.hp = a.maxHp;
}

export function describeTraits(a) {
  const scored = Object.entries(a.traits).map(([k, v]) => [k, v, Math.abs(v - 0.5)]).sort((p, q) => q[2] - p[2]);
  return scored.slice(0, 2).map(([k, v]) => TRAIT_LABELS[k][v >= 0.5 ? 1 : 0]).join(' e ');
}

export function randomName(sim, sex) {
  const used = new Set(sim.agents.map((a) => a.name));
  const pool = sex === 'f' ? NAMES_F : sex === 'm' ? NAMES_M : NAMES;
  const free = pool.filter((n) => !used.has(n));
  return free.length ? pick(sim.rng, free) : (sex === 'f' ? 'Moça' : 'Rapaz') + sim.nextAgentId;
}
