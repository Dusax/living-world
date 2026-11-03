import { pick } from './rng.js';

export const NAMES = ['Mira', 'Teo', 'Lúcio', 'Aurora', 'Bento', 'Cora', 'Davi', 'Elisa', 'Fausto', 'Gaia', 'Hugo', 'Iara', 'Jonas', 'Kira', 'Léo', 'Nina', 'Otto', 'Pia', 'Rúbia', 'Saulo', 'Tânia', 'Ulisses', 'Vera', 'Zeca'];

export const TRAIT_LABELS = {
  bravery: ['medroso', 'corajoso'],
  sociability: ['reservado', 'sociável'],
  diligence: ['preguiçoso', 'trabalhador'],
  curiosity: ['caseiro', 'curioso'],
  kindness: ['egoísta', 'generoso'],
};

export function makeAgent(sim, name, x, y) {
  const r = sim.rng;
  const id = sim.nextAgentId++;
  return {
    id, name, x, y, px: x, py: y,
    hue: Math.floor((id * 137.5) % 360),
    traits: {
      bravery: 0.1 + r() * 0.85, sociability: 0.1 + r() * 0.85, diligence: 0.1 + r() * 0.85,
      curiosity: 0.1 + r() * 0.85, kindness: 0.1 + r() * 0.85,
    },
    hp: 100, hunger: 20 + r() * 20, fatigue: r() * 20, loneliness: 20 + r() * 20,
    inv: { wood: 0, food: 2, stone: 0 },
    home: null, alive: true, sleeping: false,
    act: null, pending: null, thought: '', say: '', sayUntil: 0,
    mem: [], rel: {}, fails: {}, whisper: null,
    born: sim.tick, died: null,
  };
}

export function describeTraits(a) {
  const scored = Object.entries(a.traits).map(([k, v]) => [k, v, Math.abs(v - 0.5)]).sort((p, q) => q[2] - p[2]);
  return scored.slice(0, 2).map(([k, v]) => TRAIT_LABELS[k][v >= 0.5 ? 1 : 0]).join(' e ');
}

export function randomName(sim) {
  const used = new Set(sim.agents.map((a) => a.name));
  const free = NAMES.filter((n) => !used.has(n));
  return free.length ? pick(sim.rng, free) : 'Forasteiro' + sim.nextAgentId;
}
