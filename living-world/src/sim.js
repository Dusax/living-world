// Motor da simulação (sem DOM). Habitantes decidem por instinto ou por um LLM (sim.llm).
import {
  newWorld, isWalkable, isWalkTile, addStructure, removeStructure, inBounds, footprint,
  T, K, KIND_NAME, DEFS, TPD, SEASONS, SEASON_DAYS, W, H,
} from './world.js';
import { bfs, cheb } from './path.js';
import { makeAgent, randomName, ROLE_LABEL } from './agent.js';
import { utilityDecide, keywordBias, templateLine, templateReply } from './brain.js';

export const INV_CAP = 8;
export const TIERS = ['Acampamento', 'Vila', 'Cidade', 'Reino'];
const START_TICK = 35;                 // dia 1, ~07h
const LLM_TIMEOUT_MS = 15000;
const BERRY_REGROW = 0.011;
const FIELD_STAGE_TICKS = 30;
const RING = { rx: 13, ry: 14 };
const ringE = (x, y, c) => ((x - c.x) / RING.rx) ** 2 + ((y - c.y) / RING.ry) ** 2;
const ROLE_SHARES = { fazendeiro: 0.34, lenhador: 0.26, mineiro: 0.14, construtor: 0.12, guarda: 0.12 };

export const rectDist = (x, y, r) => Math.max(r.x - x, 0, x - (r.x + r.w - 1), r.y - y, 0, y - (r.y + r.h - 1));
const inRect = (x, y, r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export class Sim {
  constructor(seed = 1, opts = {}) {
    this.seed = seed;
    const { world, rng } = newWorld(seed);
    this.world = world; this.rng = rng;
    this.name = opts.name || 'Alvorada';
    this.tick = START_TICK;
    this.agents = []; this.animals = []; this.nextAgentId = 1;
    this.stock = { food: 6, wood: 12, stone: 0, tools: 0 };
    this.weather = { type: 'limpo', until: 0 };
    this.decreeText = ''; this.decreeUntil = 0;
    this.logs = []; this.graves = [];
    this.king = null; this.forced = null; this.poll = null; this.pollId = 0;
    this.lastTier = 0; this.needSpace = false; this.firsts = {};
    this.llm = null; this.onLog = null; this.onBeat = null;
    this.stats = { followers: 0, died: 0, felled: 0 };
    this._cache = {};
    const n = opts.agents ?? 2;
    for (let i = 0; i < n; i++) { const a = this.spawnAgent(null, true); this.stats.followers++; a.hunger = 15; }
    this.rebalanceRoles();
    this.log('info', `${n} moradores acenderam uma fogueira numa clareira.`);
  }

  // ---------- tempo e consultas ----------
  day() { return Math.floor(this.tick / TPD) + 1; }
  hour() { return ((this.tick % TPD) / TPD) * 24; }
  season() { return Math.floor((this.day() - 1) / SEASON_DAYS) % 4; }
  seasonName() { return SEASONS[this.season()]; }
  get center() { return this.world.start; }
  living() { return this.agents.filter((a) => a.alive); }
  byId(id) { return this.agents.find((a) => a.id === id); }
  byName(n) { const s = String(n || '').toLowerCase().trim(); return this.living().find((a) => a.name.toLowerCase() === s); }
  structs(type) { return this.world.structures.filter((s) => s.type === type); }
  struct(type) { return this.world.structures.find((s) => s.type === type); }
  houses() { return this.world.structures.filter((s) => DEFS[s.type].cap); }
  tier() { const p = this.living().length; return p < 6 ? 0 : p < 16 ? 1 : p < 32 ? 2 : 3; }
  tierName() { return TIERS[this.tier()]; }
  log(kind, text, agentId = null) {
    const e = { t: this.tick, day: this.day(), hour: Math.floor(this.hour()), kind, text, agent: agentId };
    this.logs.push(e); if (this.logs.length > 500) this.logs.shift();
    if (this.onLog) this.onLog(e);
  }
  // Fala do narrador: opts {prio, scene, at:[x,y], agent}
  beat(text, opts = {}) { if (this.onBeat) this.onBeat(text, opts); }
  remember(a, text) { a.mem.push({ t: this.tick, day: this.day(), text }); if (a.mem.length > 40) a.mem.shift(); }
  hasResource(kind) {
    const c = this._cache;
    if (!c.res || this.tick - c.res.t > 10) {
      const w = this.world, r = { t: this.tick, wood: false, food: false, stone: false };
      for (let i = 0; i < w.rk.length; i++) if (w.ra[i] > 0) { if (w.rk[i] === K.WOOD) r.wood = true; else if (w.rk[i] === K.FOOD) r.food = true; else if (w.rk[i] === K.STONE) r.stone = true; }
      c.res = r;
    }
    return c.res[kind];
  }
  // Quanto de comida o povoado quer ter guardado: o outono prepara o inverno.
  foodGoal() { return this.living().length * [6, 9, 20, 30][this.season()]; }
  foodAvailable(a) { return a.inv.food > 0 || this.stock.food > 0; }
  pooled(res) { return this.stock[res] + this.living().reduce((s, a) => s + a.inv[res], 0); }

  // ---------- população ----------
  spawnAgent(name, near = false, at = null) {
    const c = this.center;
    let x = c.x, y = c.y + 2;
    if (at) { x = at[0]; y = at[1]; } else {
      for (let i = 0; i < 80; i++) {
        const nx = c.x + Math.floor((this.rng() - 0.5) * (near ? 7 : 12)), ny = c.y + Math.floor((this.rng() - 0.5) * (near ? 6 : 10));
        if (isWalkable(this.world, nx, ny)) { x = nx; y = ny; break; }
      }
    }
    const a = makeAgent(this, name || randomName(this), x, y);
    this.agents.push(a);
    this.assignHomes(); this.rebalanceRoles();
    return a;
  }

  // Seguidores chegam em fila pela trilha da montanha e caminham até a fogueira.
  addFollowers(names) {
    const trail = this.world.trails.find((t) => t.id === 'cachoeira')?.tiles || [];
    const list = names.length ? names : [null];
    const out = [];
    list.forEach((nm, i) => {
      const idx = Math.max(0, trail.length - 1 - i * 2);
      const at = trail.length ? trail[idx] : null;
      const a = this.spawnAgent(nm ? String(nm).slice(0, 16) : null, false, at);
      a.hunger = 25; this.stats.followers++;
      this.beginAct(a, { type: 'goto', gx: this.center.x, gy: this.center.y }, 'chegada');
      this.remember(a, `Cheguei a ${this.name} seguindo uma trilha pela mata.`);
      out.push(a);
    });
    const n = out.length;
    this.log('event', n === 1 ? `🚶 ${out[0].name} chegou a ${this.name}.` : `🚶 Uma caravana de ${n} seguidores chegou a ${this.name}.`);
    if (n === 1) this.beat(`Chegou ${out[0].name}. Mais um morador em ${this.name}.`, { prio: 2, agent: out[0].id });
    else this.beat(n > 5 ? `Chegaram ${n} novos seguidores. E com eles, muitos outros moradores.` : `Chegaram ${n} novos seguidores. Como ${out[0].name} e ${out[1].name}.`, { prio: 2, at: [this.center.x, this.center.y] });
    return out;
  }

  assignHomes() {
    const counts = {};
    for (const a of this.living()) if (a.home) counts[a.home] = (counts[a.home] || 0) + 1;
    const houses = this.houses();
    for (const a of this.living()) {
      if (a.home && houses.some((s) => s.id === a.home)) continue;
      a.home = null;
      const h = houses.find((s) => (counts[s.id] || 0) < DEFS[s.type].cap);
      if (h) { a.home = h.id; counts[h.id] = (counts[h.id] || 0) + 1; this.remember(a, `Agora tenho ${h.type === 'tent' ? 'uma tenda' : 'uma casa'} para chamar de minha.`); }
    }
  }

  // Cada morador exerce um ofício; novos moradores preenchem o que falta no povoado.
  roleAvailable(r) {
    if (r === 'ferreiro') return !!this.struct('forge');
    if (r === 'guarda') return this.structs('tower').length > 0 || this.structs('wall').length > 4;
    if (r === 'explorador') return this.living().length >= 4;
    return true;
  }
  rebalanceRoles() {
    const live = this.living().filter((a) => a.role !== 'rei');
    const pop = live.length;
    const wants = { ...ROLE_SHARES };
    for (const a of live) if (a.role && !this.roleAvailable(a.role)) a.role = null;
    const target = (r) => (r === 'ferreiro' ? Math.max(1, Math.floor(pop / 14)) : r === 'explorador' ? 1 : Math.max(r === 'fazendeiro' ? 1 : 0, Math.round(wants[r] * pop)));
    const roles = ['ferreiro', 'explorador', 'fazendeiro', 'lenhador', 'mineiro', 'construtor', 'guarda'].filter((r) => this.roleAvailable(r));
    const count = (r) => live.filter((a) => a.role === r).length;
    for (const a of live.filter((x) => !x.role)) {
      const t = a.traits;
      const aff = { ferreiro: t.diligence, explorador: t.curiosity + t.bravery * 0.3, fazendeiro: t.sociability * 0.3 + t.kindness * 0.4, lenhador: t.diligence * 0.4 + t.bravery * 0.2, mineiro: t.diligence * 0.5 + t.bravery * 0.3, construtor: t.diligence * 0.3 + t.sociability * 0.3, guarda: t.bravery };
      let best = null, bs = -1e9;
      for (const r of roles) { const s = (target(r) - count(r)) * 2 + (aff[r] || 0) + this.rng() * 0.3; if (s > bs) { bs = s; best = r; } }
      a.role = best;
      if (best) this.remember(a, `Agora sou ${ROLE_LABEL[best]} em ${this.name}.`);
    }
  }

  // ---------- planejamento de obras ----------
  // Quantos tiles andáveis o centro alcança (usado para provar que uma obra não cria bolsões isolados).
  reachCount() {
    const w = this.world, c = this.center;
    const seen = new Uint8Array(W * H), q = [c.y * W + c.x]; seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) {
      const x = q[h] % W, y = (q[h] / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!isWalkable(w, nx, ny) || seen[ny * W + nx]) continue;
        seen[ny * W + nx] = 1; q.push(ny * W + nx);
      }
    }
    return q.length;
  }
  // Ocupar estes tiles isolaria alguma parte do mapa (trilha, clareira, marco, gente)?
  breaksConnectivity(cells) {
    const w = this.world;
    const before = this.reachCount();
    const saved = cells.map(([x, y]) => w.occ[y * W + x]);
    cells.forEach(([x, y]) => { w.occ[y * W + x] = 1; });
    const after = this.reachCount();
    cells.forEach(([x, y], i) => { w.occ[y * W + x] = saved[i]; });
    return after < before - cells.length;
  }
  wallTiles() {
    if (this._cache.ring) return this._cache.ring;
    const c = this.center, out = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const e = ringE(x, y, c);
      if (e >= 0.96 && e <= 1.06) out.push({ x, y, ang: Math.atan2(y - c.y, x - c.x) });
    }
    out.sort((a, b) => a.ang - b.ang);
    return (this._cache.ring = out);
  }
  wallChunk() {
    const w = this.world;
    const ok = (t) => { const i = t.y * W + t.x; return w.tile[i] === T.GRASS && !w.occ[i] && !w.rk[i]; };
    const open = this.wallTiles().filter(ok), acc = [];
    for (const t of open) { if (acc.length >= 10) break; if (!this.breaksConnectivity([...acc, t].map((q) => [q.x, q.y]))) acc.push(t); }
    return acc.length >= 3 ? acc : null;
  }
  queue() {
    const pop = this.living().length, count = (t) => this.structs(t).length;
    const homeless = this.living().filter((a) => !a.home).length;
    const q = [];
    if (this.forced) q.push(this.forced);
    if (homeless > 0 || !count('cabin')) q.push('cabin');
    if (pop >= 2 && count('field') < Math.ceil(pop / 3)) q.push('field');
    if (pop >= 4 && !count('well')) q.push('well');
    if (pop >= 6 && !count('barn')) q.push('barn');
    if (pop >= 10 && !count('forge')) q.push('forge');
    if (pop >= 12 && !count('market')) q.push('market');
    if (pop >= 16 && this.wallChunk()) q.push('wall');
    if (pop >= 18 && count('tower') < 4) q.push('tower');
    if (pop >= 22 && !count('castle') && count('tower') >= 2) q.push('castle');
    if (pop >= 24 && !count('library')) q.push('library');
    return [...new Set(q)];
  }
  affordable(type) { const c = DEFS[type].cost || {}; return this.pooled('wood') >= (c.wood || 0) && this.pooled('stone') >= (c.stone || 0); }

  // Reserva cedo um terreno para o castelo (ninguém constrói ali) numa das direções ao redor do centro.
  ensurePlot() {
    if (this.plot) return this.plot;
    const w = this.world, c = this.center, d = DEFS.castle;
    let best = null, bs = 1e9;
    for (let ang = 0; ang < 16; ang++) for (let r = 6; r <= 10; r++) {
      const ax = Math.round(c.x + Math.cos(ang * Math.PI / 8) * r * 1.2 - d.w / 2), ay = Math.round(c.y + Math.sin(ang * Math.PI / 8) * r - d.h / 2);
      let ok = true, trees = 0;
      for (let y = ay - 1; y <= ay + d.h && ok; y++) for (let x = ax - 1; x <= ax + d.w && ok; x++) {
        if (!inBounds(w, x, y)) { ok = false; break; }
        const i = y * W + x;
        if (w.keep[i] || w.occ[i] || w.tile[i] === T.WATER || w.tile[i] === T.ROCK || w.tile[i] === T.FIELD) ok = false;
        else if (w.tile[i] === T.FOREST) trees++;
      }
      if (ringE(ax, ay, c) > 0.7 || ringE(ax + d.w, ay + d.h, c) > 0.8) ok = false;
      if (ok && trees + r * 2 < bs) { bs = trees + r * 2; best = { x: ax, y: ay }; }
    }
    return (this.plot = best);
  }
  inPlot(x, y) { const p = this.plot, d = DEFS.castle; return p && x >= p.x - 1 && x <= p.x + d.w && y >= p.y - 1 && y <= p.y + d.h; }

  // Procura um lugar livre (com margem) para a construção, do centro para fora.
  findSite(type, nearX, nearY, maxR = 40) {
    const w = this.world, d = DEFS[type], c = this.center;
    if (type === 'wall') { const ch = this.wallChunk(); return ch ? { tiles: ch } : null; }
    const free = (ax, ay) => {
      for (let y = ay - 1; y <= ay + d.h; y++) for (let x = ax - 1; x <= ax + d.w; x++) {
        if (!inBounds(w, x, y)) return false;
        if (type !== 'castle' && this.inPlot(x, y)) return false;
        const i = y * W + x, core = x >= ax && x < ax + d.w && y >= ay && y < ay + d.h;
        if (core) {
          const tree = type === 'castle' && w.tile[i] === T.FOREST && w.rk[i] === K.WOOD; // o terreno do castelo é desmatado
          if (!tree && (!(w.tile[i] === T.GRASS || w.tile[i] === T.PATH) || w.rk[i])) return false;
          if (w.occ[i] || w.keep[i]) return false;
        }
        else if (w.occ[i] && !(w.tile[i] === T.FIELD)) return false;
      }
      return true;
    };
    const minR = type === 'field' ? 4 : 3;
    if (nearX !== undefined) {
      for (let r = 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (free(nearX + dx, nearY + dy) && !this.breaksConnectivity(footprint({ x: nearX + dx, y: nearY + dy, w: d.w, h: d.h }))) return { x: nearX + dx, y: nearY + dy };
      }
      return null;
    }
    const seen = new Set(), q = [[c.x, c.y]]; seen.add(c.y * W + c.x);
    let h = 0;
    while (h < q.length && h < 4000) {
      const [x, y] = q[h++];
      const cd = Math.max(Math.abs(x - c.x), Math.abs(y - c.y));
      const lim = type === 'castle' ? [0.9, 1.0] : [0.72, 0.8];
      if (ringE(x, y, c) > lim[0] || ringE(x + d.w - 1, y + d.h - 1, c) > lim[1]) continue; // construções ficam dentro da muralha
      if (cd >= minR && free(x, y) && !this.breaksConnectivity(footprint({ x, y, w: d.w, h: d.h }))) return { x, y };
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(w, nx, ny)) continue;
        const k = ny * W + nx;
        if (seen.has(k) || !isWalkTile(w.tile[k])) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return null;
  }
  towerSite() {
    const c = this.center, have = this.structs('tower');
    for (const tr of this.world.trails) {
      if (!tr.tiles.length) continue;
      const gate = tr.tiles.find(([x, y]) => ringE(x, y, c) >= 1);
      if (!gate || have.some((t) => cheb(t.x, t.y, gate[0], gate[1]) < 7)) continue;
      const s = this.findSite('tower', gate[0] + 1, gate[1], 3);
      if (s) return s;
    }
    return null;
  }
  // Próxima obra possível: {type, site} ou null. needs = o que falta (para guiar a coleta).
  nextProject() {
    const c = this._cache;
    if (c.proj && this.tick - c.proj.t < 8) return c.proj.v;
    let v = null, needs = { wood: 0, stone: 0 }, space = false;
    for (const type of this.queue()) {
      const cost = DEFS[type].cost || {};
      if (!this.affordable(type)) {
        needs.wood = Math.max(needs.wood, (cost.wood || 0) - this.pooled('wood'));
        needs.stone = Math.max(needs.stone, (cost.stone || 0) - this.pooled('stone'));
        break; // prioridade estrita: junta material para a primeira da fila
      }
      const site = type === 'tower' ? this.towerSite() : this.findSite(type);
      if (site) { v = { type, site }; break; }
      space = true;
    }
    this.needSpace = space; c.proj = { t: this.tick, v, needs };
    return v;
  }
  projectNeeds() { this.nextProject(); return this._cache.proj.needs; }

  // ---------- consultas para o cérebro ----------
  farmTarget(a) {
    let best = null, bs = -1e9;
    const claimed = new Set(this.living().filter((o) => o !== a && o.act && o.act.type === 'farm').map((o) => o.act.fieldId));
    for (const f of this.structs('field')) {
      if (f.stage === 1 || f.stage === 2 || claimed.has(f.id)) continue;
      const d = Math.abs(f.x - a.x) + Math.abs(f.y - a.y);
      const s = (f.stage === 3 ? 30 : 0) - d;
      if (s > bs) { bs = s; best = f; }
    }
    return best;
  }
  bestPartner(a) {
    let best = null, bs = -1e9;
    for (const o of this.living()) {
      if (o === a || o.sleeping) continue;
      const d = Math.abs(o.x - a.x) + Math.abs(o.y - a.y);
      const s = (a.rel[o.id] || 0) * 0.5 - d * 0.6 + this.rng() * 10;
      if (s > bs) { bs = s; best = o; }
    }
    return best;
  }
  biasFor(a) {
    const out = {};
    const add = (b, k) => { for (const key in b) out[key] = (out[key] || 0) + b[key] * k; };
    if (this.decreeText && this.tick < this.decreeUntil) add(keywordBias(this.decreeText), 0.5 + a.traits.sociability * 0.2);
    if (a.whisper && this.tick < a.whisper.until) add(keywordBias(a.whisper.text), 1.2);
    return out;
  }
  unexploredLandmark() { return this.world.landmarks.find((l) => !l.found); }

  // ---------- passo ----------
  step() {
    this.tick++;
    if (this.tick % TPD === 0) this.onNewDay();
    if (this.weather.until && this.tick >= this.weather.until) { this.weather = { type: 'limpo', until: 0 }; this.log('event', 'O tempo firmou.'); }
    if (this.tick % 4 === 0) this.regrow();
    this.growFields();
    if (this.tick % 3 === 0) this.moveAnimals();
    for (const a of this.agents) if (a.alive) this.stepAgent(a);
  }

  onNewDay() {
    const r = this.rng();
    if (this.weather.type === 'limpo') {
      if (r < 0.16) this.setWeather('chuva', TPD);
      else if (r < 0.2) this.setWeather('seca', TPD * 2);
    }
    if (this.day() % SEASON_DAYS === 1 && this.day() > 1) { this.log('event', `Chegou ${this.seasonName()}.`); this.beat(`Chegou ${this.seasonName().toLowerCase()} em ${this.name}.`, { prio: 0 }); }
    this.rebalanceRoles();
    this.spreadForest();
    const pop = this.living().length;
    if (pop >= 4 && this.stock.food < pop && this.animals.length) {
      const an = this.animals.shift();
      this.stock.food += an.kind === 'sheep' ? 10 : 4;
      this.log('event', `🍖 A vila abateu ${an.kind === 'sheep' ? 'uma ovelha' : 'uma galinha'} para não passar fome.`);
    }
    if (pop >= 4 && this.stock.food < pop * 1.5 && this.day() - (this.lastFamine || -9) > 3) { this.lastFamine = this.day(); this.log('event', '⚠ A comida está acabando.'); this.beat(`A comida está acabando em ${this.name}.`, { prio: 2 }); }
    const tier = this.tier();
    if (tier !== this.lastTier) {
      if (tier > this.lastTier) {
        this.log('event', `🏘 ${this.name} agora é ${tier === 1 ? 'uma' : tier === 2 ? 'uma' : 'um'} ${this.tierName()}.`);
        const lines = ['', `${this.name} deixou de ser um acampamento. Agora é uma vila.`, `A vila virou cidade. ${this.name} cresce.`, `Não são castelos que fazem um reino. São lares. Mas ${this.name} quer um rei.`];
        this.beat(lines[tier], { prio: 3, at: [this.center.x, this.center.y] });
        if (tier === 3 && !this.king) this.log('event', '👑 O reino precisa de um rei. Abra uma votação!');
      }
      this.lastTier = tier;
    }
  }
  setWeather(type, dur) {
    this.weather = { type, until: this.tick + dur };
    this.log('event', type === 'chuva' ? 'Começou a chover. As plantações agradecem.' : type === 'seca' ? 'Uma seca castiga a terra. Nada cresce.' : `Clima: ${type}.`);
    if (type === 'chuva') this.beat('A chuva chegou. As plantações agradecem.', { prio: 0 });
    if (type === 'seca') this.beat('A seca castigou a terra. Nada cresce.', { prio: 1 });
  }
  regrow() {
    const w = this.world, sm = [1.5, 1, 0.9, 0.15][this.season()];
    const wm = this.weather.type === 'chuva' ? 3 : this.weather.type === 'seca' ? 0.05 : 1;
    for (let i = 0; i < w.rk.length; i++) {
      if (w.rk[i] === K.FOOD && w.ra[i] < w.rm[i] && this.rng() < BERRY_REGROW * sm * wm) w.ra[i]++;
    }
  }
  growFields() {
    const rain = this.weather.type === 'chuva' ? 1.6 : this.weather.type === 'seca' ? 0.2 : 1;
    const winter = this.season() === 3 ? 0.35 : 1;
    for (const f of this.structs('field')) {
      if (!f.stage) continue;
      f.timer = (f.timer || 0) + rain * winter;
      if (f.timer >= FIELD_STAGE_TICKS && f.stage < 3) { f.stage++; f.timer = 0; }
    }
  }
  // A floresta lentamente retoma terreno longe do povoado.
  spreadForest() {
    const w = this.world, c = this.center;
    for (let n = 0; n < 40; n++) {
      const x = 1 + Math.floor(this.rng() * (W - 2)), y = 1 + Math.floor(this.rng() * (H - 2)), i = y * W + x;
      if (w.tile[i] !== T.GRASS || w.rk[i] || w.occ[i] || Math.hypot(x - c.x, y - c.y) < 12) continue;
      let near = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.tile[(y + dy) * W + x + dx] === T.FOREST) near = true;
      if (near) { w.tile[i] = T.FOREST; w.rk[i] = K.WOOD; w.rm[i] = 5; w.ra[i] = 3; }
    }
  }
  moveAnimals() {
    const w = this.world;
    for (const an of this.animals) {
      an.px = an.x; an.py = an.y;
      if (this.rng() < 0.5) continue;
      const nx = an.x + Math.floor(this.rng() * 3) - 1, ny = an.y + Math.floor(this.rng() * 3) - 1;
      if (isWalkable(w, nx, ny) && Math.hypot(nx - an.hx, ny - an.hy) < 5) { an.x = nx; an.y = ny; }
    }
  }
  spawnAnimals(barn) {
    const n = 3 + Math.floor(this.living().length / 8);
    for (let i = 0; i < n; i++) this.animals.push({ id: this.animals.length + 1, kind: i % 4 === 3 ? 'chicken' : 'sheep', x: barn.x + (i % 3), y: barn.y + 2 + (i % 2), px: barn.x, py: barn.y + 2, hx: barn.x + 1, hy: barn.y + 3 });
  }

  stepAgent(a) {
    a.px = a.x; a.py = a.y;
    this.updateNeeds(a);
    if (!a.alive) return;
    if (a.hunger >= 90 && !(a.act && a.act.type === 'eat') && this.foodAvailable(a)) {
      this.endAct(a); this.beginAct(a, { type: 'eat' }, 'reflexo');
      this.remember(a, 'A fome apertou demais. Larguei tudo para comer.');
    }
    if (a.pending) {
      if (Date.now() - a.pending.at > LLM_TIMEOUT_MS) a.pending = null;
      else { a.thought = 'Pensando…'; return; }
    }
    if (!a.act) { this.decide(a); if (!a.act) return; }
    this.runAct(a);
  }
  updateNeeds(a) {
    const winter = this.season() === 3;
    a.hunger = Math.min(100, a.hunger + (winter ? 0.6 : 0.5) * (a.sleeping ? 0.6 : 1));
    a.fatigue = a.sleeping ? Math.max(0, a.fatigue - 1.6) : Math.min(100, a.fatigue + 0.3);
    a.loneliness = Math.min(100, a.loneliness + 0.2 * (0.5 + a.traits.sociability));
    if (a.hunger >= 100) a.hp -= 2; else if (a.fatigue >= 100) a.hp -= 0.5;
    else if (a.hunger < 60 && a.fatigue < 70) a.hp = Math.min(100, a.hp + 0.3);
    if (a.hp <= 0) this.kill(a, a.hunger >= 100 ? 'de fome' : a.fatigue >= 100 ? 'de exaustão' : 'de ferimentos');
  }
  kill(a, cause) {
    if (!a.alive) return;
    a.alive = false; a.died = this.tick; a.sleeping = false; a.act = null; a.pending = null;
    this.graves.push({ x: a.x, y: a.y, name: a.name, day: this.day() });
    this.stats.died++;
    if (this.king === a.id) this.king = null;
    this.log('death', `${a.name} morreu ${cause}.`, a.id);
    this.beat(`${a.name} não resistiu. Morreu ${cause}.`, { prio: 2, agent: a.id, at: [a.x, a.y] });
    for (const o of this.living()) { this.remember(o, `${a.name} morreu ${cause}.`); if ((o.rel[a.id] || 0) > 40) o.loneliness = Math.min(100, o.loneliness + 30); }
    this.assignHomes(); this.rebalanceRoles();
  }

  // ---------- decisão ----------
  decide(a) {
    if (this.llm && this.llm.ready()) {
      a.pending = { at: Date.now() };
      this.llm.begin();
      this.llm.decide(this, a).then((d) => {
        a.pending = null;
        if (!a.alive || a.act) return;
        if (d && this.applyDecision(a, d, 'mente')) return;
        this.instinct(a, d ? 'pedido inviável' : 'sem resposta');
      }).catch((e) => {
        a.pending = null; if (this.llm) this.llm.fail(e);
        if (a.alive && !a.act) this.instinct(a, 'erro');
      }).finally(() => this.llm && this.llm.end());
      return;
    }
    this.instinct(a);
  }
  instinct(a, why) {
    const d = utilityDecide(this, a);
    if (!this.applyDecision(a, d, why ? `instinto (${why})` : 'instinto')) this.beginAct(a, { type: 'idle' }, 'instinto');
  }

  applyDecision(a, d, source) {
    const spec = { type: d.type };
    switch (d.type) {
      case 'gather': {
        const kind = normalizeKind(d.kind || d.target);
        if (!kind || a.inv[kind] >= INV_CAP || !this.findResource(a, kind)) return false;
        spec.kind = kind; spec.until = Math.min(INV_CAP, a.inv[kind] + (kind === 'wood' ? 4 : 3));
        break;
      }
      case 'farm': { const f = this.farmTarget(a); if (!f) return false; spec.fieldId = f.id; break; }
      case 'eat': if (!this.foodAvailable(a)) return false; break;
      case 'talk': case 'give': {
        const t = this.byName(d.target);
        if (!t || t === a) return false;
        if (d.type === 'give' && a.inv.food < 1) return false;
        spec.targetId = t.id; spec.say = d.say; break;
      }
      case 'build': { const p = this.nextProject(); if (!p) return false; spec.project = { type: p.type, site: p.site }; break; }
      case 'smith': if (!this.struct('forge') || this.stock.wood < 2 || this.stock.stone < 1) return false; break;
      case 'store': if (!(a.inv.wood + a.inv.stone + a.inv.food > 0)) return false; break;
      case 'patrol': if (!this.roleAvailable('guarda')) return false; break;
      case 'expedition': {
        const lm = d.lm ? this.world.landmarks.find((l) => l.id === d.lm) : this.unexploredLandmark();
        if (!lm || lm.found) return false;
        spec.lm = lm.id; break;
      }
      case 'wander': case 'explore': spec.type = 'wander'; spec.far = !!d.far || d.type === 'explore'; break;
      case 'sleep': case 'idle': break;
      case 'goto': spec.gx = d.gx; spec.gy = d.gy; break;
      default: return false;
    }
    a.thought = d.thought || a.thought;
    this.beginAct(a, spec, source);
    return true;
  }
  beginAct(a, spec, source) {
    this.endAct(a);
    a.act = { ...spec, source, work: 0, moves: 0, path: null, started: this.tick };
    this.remember(a, `[${source}] ${a.thought ? a.thought + ' → ' : ''}${describeAct(this, spec)}`);
  }
  endAct(a) { a.sleeping = false; a.act = null; }
  failAct(a, reason) {
    if (a.act) a.fails[a.act.type + (a.act.kind || '')] = this.tick;
    this.remember(a, `Não deu certo: ${reason}.`); this.endAct(a);
  }
  doneAct(a) { this.endAct(a); }

  moveTo(a, act, isGoal) {
    if (isGoal(a.x, a.y)) return 'arrived';
    if (++act.moves > 160) return 'fail';
    if (!act.path || !act.path.length) {
      act.path = bfs(this.world, a.x, a.y, isGoal, 6000);
      if (!act.path || !act.path.length) return 'fail';
    }
    const [nx, ny] = act.path[0];
    if (!isWalkable(this.world, nx, ny)) { act.path = null; return 'moving'; }
    a.x = nx; a.y = ny; act.path.shift();
    this.wear(nx, ny);
    return 'moving';
  }
  // Onde muita gente anda, a grama vira trilha de terra, e (em cidades) pedra.
  wear(x, y) {
    const w = this.world, i = y * W + x;
    if (w.rk[i]) return;
    if (w.tile[i] === T.GRASS) { if (++w.trail[i] > 14) w.tile[i] = T.PATH; }
    else if (w.tile[i] === T.PATH && this.tier() >= 2) { if (++w.trail[i] > 110) w.tile[i] = T.COBBLE; }
  }

  findResource(a, kind, near) {
    const k = KIND_NAME[kind], w = this.world;
    const has = (x, y) => inBounds(w, x, y) && w.rk[y * W + x] === k && w.ra[y * W + x] > 0;
    const goal = (x, y) => { if (has(x, y)) return true; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && has(x + dx, y + dy)) return true; return false; };
    const start = near || a;
    const path = bfs(w, start.x, start.y, goal, 8000);
    if (!path) return null;
    const [sx, sy] = path.length ? path[path.length - 1] : [start.x, start.y];
    let t = null;
    if (has(sx, sy)) t = [sx, sy];
    else for (let dy = -1; dy <= 1 && !t; dy++) for (let dx = -1; dx <= 1 && !t; dx++) if ((dx || dy) && has(sx + dx, sy + dy)) t = [sx + dx, sy + dy];
    return t ? { tx: t[0], ty: t[1], sx, sy } : null;
  }

  runAct(a) {
    const act = a.act, w = this.world;
    const adj = (r) => (x, y) => rectDist(x, y, r) <= 1 && !inRect(x, y, r);
    switch (act.type) {
      case 'idle': if (++act.work >= 2) this.doneAct(a); return;

      case 'goto': {
        const tx = act.gx, ty = act.gy;
        const goal = isWalkable(w, tx, ty) ? (x, y) => x === tx && y === ty : (x, y) => cheb(x, y, tx, ty) <= 1;
        const r = this.moveTo(a, act, goal);
        if (r === 'arrived') this.doneAct(a); else if (r === 'fail') this.failAct(a, 'não consegui chegar lá');
        return;
      }

      case 'wander': {
        if (!act.target) {
          const R = act.far ? 16 : 6;
          for (let i = 0; i < 30; i++) {
            const x = Math.round(a.x + (this.rng() - 0.5) * 2 * R), y = Math.round(a.y + (this.rng() - 0.5) * 2 * R);
            if (isWalkable(w, x, y)) { act.target = { x, y }; break; }
          }
          if (!act.target) return this.doneAct(a);
        }
        const r = this.moveTo(a, act, (x, y) => x === act.target.x && y === act.target.y);
        if (r !== 'moving') this.doneAct(a);
        return;
      }

      case 'patrol': {
        if (!act.target) {
          const ring = this.wallTiles();
          for (let i = 0; i < 30; i++) {
            const t = ring[Math.floor(this.rng() * ring.length)];
            const c = this.center, ix = Math.round(t.x + (c.x - t.x) * 0.12), iy = Math.round(t.y + (c.y - t.y) * 0.12);
            if (isWalkable(w, ix, iy)) { act.target = { x: ix, y: iy }; break; }
          }
          if (!act.target) return this.doneAct(a);
        }
        const r = this.moveTo(a, act, (x, y) => x === act.target.x && y === act.target.y);
        if (r === 'arrived') { if (++act.work >= 3) this.doneAct(a); } else if (r === 'fail') this.doneAct(a);
        return;
      }

      case 'gather': {
        const k = KIND_NAME[act.kind];
        if (a.inv[act.kind] >= act.until || a.inv[act.kind] >= INV_CAP) return this.doneAct(a);
        const valid = (t) => t && w.ra[t.y * W + t.x] > 0 && w.rk[t.y * W + t.x] === k;
        if (!valid(act.target)) {
          const f = this.findResource(a, act.kind, act.kind === 'wood' ? this.center : null);
          if (!f) return a.inv[act.kind] > 0 ? this.doneAct(a) : this.failAct(a, `não há ${act.kind} acessível`);
          act.target = { x: f.tx, y: f.ty }; act.stand = { x: f.sx, y: f.sy }; act.path = null; act.work = 0; act.moves = 0;
        }
        const r = this.moveTo(a, act, (x, y) => x === act.stand.x && y === act.stand.y);
        if (r === 'fail') { act.target = null; act.retries = (act.retries || 0) + 1; if (act.retries > 2) return this.failAct(a, 'caminho bloqueado'); return; }
        if (r === 'arrived') {
          if (++act.work >= 2) {
            const i = act.target.y * W + act.target.x;
            const tools = this.stock.tools > 0 ? 1 : 0;
            const base = act.kind === 'wood' ? (a.traits.diligence > 0.6 ? 3 : 2) : (a.traits.diligence > 0.6 ? 2 : 1);
            const n = Math.min(w.ra[i], base + tools, INV_CAP - a.inv[act.kind]);
            w.ra[i] -= n; a.inv[act.kind] += n; act.work = 0;
            if (w.ra[i] <= 0 && act.kind === 'wood') { w.rk[i] = 0; w.rm[i] = 0; if (w.tile[i] === T.FOREST) w.tile[i] = T.GRASS; this.stats.felled++; }
            if (w.ra[i] <= 0 && act.kind === 'stone') { w.rk[i] = 0; w.rm[i] = 0; }
            if (a.inv[act.kind] >= act.until) this.doneAct(a);
          }
        }
        return;
      }

      case 'farm': {
        const f = this.structs('field').find((s) => s.id === act.fieldId);
        if (!f) return this.failAct(a, 'o campo sumiu');
        const r = this.moveTo(a, act, (x, y) => rectDist(x, y, f) === 0);
        if (r === 'fail') return this.failAct(a, 'não alcancei o campo');
        if (r === 'moving') return;
        if (++act.work < 3) return;
        if (f.stage === 3) {
          const n = Math.min(INV_CAP - a.inv.food, 8 + (this.stock.tools > 0 ? 1 : 0));
          a.inv.food += n; f.stage = 0; f.timer = 0;
          if (!this.firsts.harvest) { this.firsts.harvest = true; this.log('event', '🌾 Primeira colheita.'); this.beat('E pela primeira vez a terra deu comida.', { prio: 2, at: [f.x, f.y], agent: a.id }); }
          this.remember(a, `Colhi ${n} de comida no campo.`);
        } else if (!f.stage) { f.stage = 1; f.timer = 0; this.remember(a, 'Plantei sementes.'); }
        return this.doneAct(a);
      }

      case 'eat': {
        if (a.inv.food <= 0) {
          const s = this.struct('storehouse');
          if (this.stock.food <= 0 || !s) return this.failAct(a, 'não há comida');
          const r = this.moveTo(a, act, adj(s));
          if (r === 'fail') return this.failAct(a, 'não alcancei o armazém');
          if (r === 'moving') return;
          const take = Math.min(this.stock.food, 2); this.stock.food -= take; a.inv.food += take;
        }
        a.inv.food--; a.hunger = Math.max(0, a.hunger - 40);
        if (a.hunger < 25 || (a.inv.food <= 0 && this.stock.food <= 0)) this.doneAct(a);
        return;
      }

      case 'sleep': {
        const home = w.structures.find((s) => s.id === a.home) || this.struct('campfire');
        if (!a.sleeping) {
          const r = this.moveTo(a, act, adj(home));
          if (r === 'fail') a.sleeping = true;
          if (r === 'arrived') { a.sleeping = true; this.remember(a, 'Fui dormir.'); }
          return;
        }
        const h = this.hour(), day = h >= 6 && h < 20;
        if (a.fatigue <= 5 || (day && a.fatigue <= 25) || a.hunger >= 95 || ++act.work > 90) { a.sleeping = false; this.doneAct(a); }
        return;
      }

      case 'store': {
        const s = this.struct('storehouse');
        const r = this.moveTo(a, act, adj(s));
        if (r === 'fail') return this.failAct(a, 'não alcancei o armazém');
        if (r === 'moving') return;
        const extra = Math.max(0, a.inv.food - 2);
        this.stock.wood += a.inv.wood; this.stock.stone += a.inv.stone; this.stock.food += extra;
        this.remember(a, `Guardei ${a.inv.wood} madeira, ${a.inv.stone} pedra e ${extra} comida no armazém.`);
        a.inv.wood = 0; a.inv.stone = 0; a.inv.food -= extra;
        return this.doneAct(a);
      }

      case 'smith': {
        const f = this.struct('forge');
        if (!f) return this.failAct(a, 'não há forja');
        const r = this.moveTo(a, act, adj(f));
        if (r === 'fail') return this.failAct(a, 'não alcancei a forja');
        if (r === 'moving') return;
        if (++act.work < 6) return;
        if (this.stock.wood < 2 || this.stock.stone < 1) return this.failAct(a, 'falta material');
        this.stock.wood -= 2; this.stock.stone -= 1; this.stock.tools++;
        this.remember(a, 'Forjei uma ferramenta.');
        return this.doneAct(a);
      }

      case 'expedition': {
        const lm = w.landmarks.find((l) => l.id === act.lm);
        if (!lm || lm.found) return this.doneAct(a);
        const r = this.moveTo(a, act, (x, y) => cheb(x, y, lm.x, lm.y) <= 1);
        if (r === 'fail') return this.failAct(a, 'perdi a trilha');
        if (r === 'moving') return;
        lm.found = true;
        const night = this.hour() >= 20 || this.hour() < 5;
        const texts = {
          lagoa: 'Atrás das árvores, uma lagoa de água limpa.', acude: 'Um açude escondido. Água para os animais.',
          esqueleto: 'Ossos enormes. O que viveu aqui era maior que uma casa.', ruinas: 'No meio da mata, ruínas de uma torre antiga.',
          cachoeira: 'A montanha guarda uma cachoeira. E talvez mais que isso.',
        };
        this.log('event', `🧭 ${a.name} encontrou ${lm.name}.`, a.id);
        this.remember(a, `Encontrei ${lm.name}!`);
        if (night && this.rng() < 0.6) {
          w.decor.push({ type: 'pegadas', x: lm.x - 1, y: lm.y, w: 2, h: 2 });
          this.beat(`${a.name} encontrou ${lm.name}. E pegadas enormes. Garras. Voltou correndo.`, { prio: 3, at: [lm.x, lm.y], agent: a.id });
          this.beginAct(a, { type: 'goto', gx: this.center.x, gy: this.center.y }, 'fuga');
          a.hunger = Math.min(100, a.hunger + 5);
        } else {
          this.beat(`${a.name} encontrou ${lm.name}. ${texts[lm.id] || ''}`, { prio: 3, at: [lm.x, lm.y], agent: a.id });
          this.beginAct(a, { type: 'goto', gx: this.center.x, gy: this.center.y }, 'volta');
        }
        return;
      }

      case 'talk': case 'give': {
        const t = this.byId(act.targetId);
        if (!t || !t.alive) return this.failAct(a, 'a pessoa sumiu');
        if (act.type === 'talk' && t.sleeping) return this.failAct(a, `${t.name} está dormindo`);
        if (act.moves % 3 === 2) act.path = null;
        const r = this.moveTo(a, act, (x, y) => cheb(x, y, t.x, t.y) <= 1);
        if (r === 'fail') return this.failAct(a, `não alcancei ${t.name}`);
        if (r === 'moving') return;
        return act.type === 'talk' ? this.doTalk(a, t, act) : this.doGive(a, t, act);
      }

      case 'build': return this.runBuild(a, act);
    }
    this.doneAct(a);
  }

  runBuild(a, act) {
    const w = this.world, p = act.project, d = DEFS[p.type];
    const rect = p.type === 'wall' ? { x: p.site.tiles[Math.floor(p.site.tiles.length / 2)].x, y: p.site.tiles[Math.floor(p.site.tiles.length / 2)].y, w: 1, h: 1 } : { x: p.site.x, y: p.site.y, w: d.w, h: d.h };
    const r = this.moveTo(a, act, (x, y) => rectDist(x, y, rect) <= 1 && !inRect(x, y, rect));
    if (r === 'fail') return this.failAct(a, 'não alcancei o terreno');
    if (r === 'moving') return;
    if (++act.work < d.work * 2) return;
    if (!this.affordable(p.type)) return this.failAct(a, 'faltou material');
    if (p.type === 'castle') {
      for (const [fx, fy] of footprint({ x: p.site.x, y: p.site.y, w: d.w, h: d.h })) {
        const i = fy * W + fx;
        if (w.tile[i] === T.FOREST) { w.tile[i] = T.GRASS; w.rk[i] = 0; w.rm[i] = 0; w.ra[i] = 0; this.stats.felled++; }
      }
    }
    const cells = p.type === 'wall' ? p.site.tiles.filter((t) => w.tile[t.y * W + t.x] === T.GRASS && !w.occ[t.y * W + t.x] && !w.rk[t.y * W + t.x]) : footprint({ x: p.site.x, y: p.site.y, w: d.w, h: d.h }).map(([x, y]) => ({ x, y }));
    if (!cells.length || (p.type !== 'wall' && cells.some((c) => w.occ[c.y * W + c.x] || w.rk[c.y * W + c.x] || !isWalkTile(w.tile[c.y * W + c.x])))) return this.failAct(a, 'o terreno foi tomado');
    for (const res of ['wood', 'stone']) {
      let need = (d.cost || {})[res] || 0;
      const own = Math.min(need, a.inv[res]); a.inv[res] -= own; need -= own;
      const fs = Math.min(need, this.stock[res]); this.stock[res] -= fs; need -= fs;
      for (const o of this.living()) { if (need <= 0) break; const g = Math.min(need, o.inv[res]); o.inv[res] -= g; need -= g; }
    }
    this._cache.proj = null;
    if (p.type === 'wall') { for (const c of cells) addStructure(w, 'wall', c.x, c.y); }
    else addStructure(w, p.type, p.site.x, p.site.y, p.type === 'field' ? { stage: 0, timer: 0 } : {});
    if (this.forced === p.type) this.forced = null;
    this.evict();
    this.afterBuild(a, p.type, p.site);
    this.doneAct(a);
  }

  // Move quem ficou em cima de um tile agora ocupado para o tile livre mais próximo.
  evict() {
    const w = this.world;
    for (const a of [...this.agents.filter((x) => x.alive), ...this.animals]) {
      if (!w.occ[a.y * W + a.x]) continue;
      const free = (() => { for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (isWalkable(w, a.x + dx, a.y + dy)) return [a.x + dx, a.y + dy]; return null; })();
      if (free) { a.x = free[0]; a.y = free[1]; a.px = a.x; a.py = a.y; if (a.act) a.act.path = null; }
    }
  }
  afterBuild(a, type, site) {
    const at = site.tiles ? [site.tiles[0].x, site.tiles[0].y] : [site.x, site.y];
    this.remember(a, `Terminei de construir: ${type}.`);
    if (type === 'cabin' || type === 'tent') this.assignHomes();
    if (type === 'wall') { this.log('build', `${a.name} ergueu um trecho da muralha.`, a.id); if (!this.firsts.wall) { this.firsts.wall = true; this.beat('Madeira não faltou. Subiu uma muralha de estacas.', { prio: 2, at }); } return; }
    this.log('build', `${a.name} construiu: ${buildingName(type)}.`, a.id);
    const first = !this.firsts[type]; this.firsts[type] = true;
    const smith = this.living().find((o) => o.role === 'ferreiro') || a;
    const lines = {
      cabin: `${a.name} ergueu uma cabana.`, field: `${a.name} abriu uma plantação.`, well: `Cavaram um poço no meio da vila.`,
      barn: `O celeiro ficou pronto. E com ele, as primeiras ovelhas.`, forge: `A forja acendeu. ${smith.name} agora trabalha o ferro.`,
      market: `As primeiras barracas do mercado abriram.`, tower: `Uma torre de vigia se ergueu, com tocha acesa a noite inteira.`,
      library: `Um livro. A biblioteca é a primeira de ${this.name}.`, castle: `O castelo está de pé. O sino toca para toda a cidade.`,
    };
    const scene = type === 'forge' ? 'forge' : type === 'castle' ? 'bell' : type === 'library' ? 'book' : null;
    if (type === 'barn') this.spawnAnimals(this.struct('barn'));
    if (type === 'forge') this.rebalanceRoles();
    if (type === 'tower') this.rebalanceRoles();
    if (first && lines[type] && (type !== 'cabin' || this.structs('cabin').length <= 1)) this.beat(lines[type], { prio: type === 'castle' || type === 'forge' ? 3 : 2, scene, at, agent: a.id });
    else if (type === 'cabin' && this.structs('cabin').length % 4 === 0) this.beat(`${this.structs('cabin').length} cabanas já enfeitam a clareira.`, { prio: 1, at });
  }

  doTalk(a, t, act) {
    if (act.work === 0) { const line = act.say || templateLine(this, a, t); this.say(a, line); this.log('talk', `${a.name} → ${t.name}: “${line}”`, a.id); }
    if (act.work === 1) { const reply = templateReply(this, t, a); this.say(t, reply); this.log('talk', `${t.name}: “${reply}”`, t.id); }
    act.work++;
    if (act.work < 3) return;
    const ka = a.traits.kindness, kt = t.traits.kindness;
    let delta = 4 + (ka + kt) * 4;
    if (this.rng() < 0.15 && (a.traits.bravery + t.traits.bravery) / 2 > 0.55 && (ka + kt) / 2 < 0.5) { delta = -12; this.log('conflict', `${a.name} e ${t.name} discutiram.`, a.id); }
    this.bond(a, t, delta); this.bond(t, a, delta);
    a.loneliness = Math.max(0, a.loneliness - 40); t.loneliness = Math.max(0, t.loneliness - 30);
    this.remember(a, `Conversei com ${t.name}.`); this.remember(t, `${a.name} veio conversar comigo.`);
    this.doneAct(a);
  }
  bond(a, t, delta) {
    const before = a.rel[t.id] || 0, after = Math.max(-100, Math.min(100, before + delta));
    a.rel[t.id] = after;
    if (before <= 60 && after > 60 && a.id < t.id) this.log('bond', `${a.name} e ${t.name} viraram amigos.`, a.id);
    if (before >= -40 && after < -40 && a.id < t.id) this.log('conflict', `${a.name} e ${t.name} viraram rivais.`, a.id);
  }
  doGive(a, t, act) {
    const n = Math.min(2, a.inv.food);
    if (n <= 0) return this.failAct(a, 'não tenho o que dar');
    a.inv.food -= n; t.inv.food += n;
    if (act.say) this.say(a, act.say);
    this.bond(t, a, 12); this.bond(a, t, 5);
    this.log('give', `${a.name} deu ${n} comida a ${t.name}.`, a.id);
    this.remember(a, `Dei ${n} comida a ${t.name}.`); this.remember(t, `${a.name} me deu ${n} comida. Não esquecerei.`);
    this.doneAct(a);
  }
  say(a, text) { a.say = text; a.sayUntil = this.tick + 10; }

  // ---------- votação (as "stories") ----------
  createPoll(kind) {
    const live = this.living();
    let q, options;
    if (kind === 'king') {
      const score = (a) => Object.values(a.rel).reduce((s, v) => s + v, 0) + a.traits.sociability * 30 + a.traits.bravery * 20;
      options = live.slice().sort((x, y) => score(y) - score(x)).slice(0, 4).map((a) => ({ label: a.name, payload: { agent: a.id } }));
      q = `Quem será o rei de ${this.name}?`;
    } else if (kind === 'build') {
      const types = ['tower', 'market', 'library', 'forge', 'barn', 'well', 'castle', 'cabin'].filter((t) => !(t === 'castle' && this.structs('castle').length) && !(['forge', 'barn', 'well', 'library'].includes(t) && this.structs(t).length));
      options = types.slice(0, 4).map((t) => ({ label: buildingName(t), payload: { build: t } }));
      q = 'Qual será a próxima grande obra?';
    } else {
      options = this.world.landmarks.filter((l) => !l.found).slice(0, 4).map((l) => ({ label: l.name, payload: { lm: l.id } }));
      q = 'Para onde vai a expedição?';
    }
    if (options.length < 2) return null;
    this.poll = { id: ++this.pollId, kind, q, options: options.map((o) => ({ ...o, votes: 0 })) };
    this.log('god', `🗳 Votação aberta: ${q}`);
    this.beat(`A votação está nos stories. ${q}`, { prio: 3 });
    return this.poll;
  }
  resolvePoll(idx = null) {
    const p = this.poll; if (!p) return null;
    let i = idx;
    if (i === null || i === undefined) {
      const max = Math.max(...p.options.map((o) => o.votes));
      const top = p.options.map((o, k) => [o, k]).filter(([o]) => o.votes === max);
      i = top[Math.floor(this.rng() * top.length)][1];
    }
    const win = p.options[i], pl = win.payload;
    this.poll = null;
    this.log('god', `🗳 Resultado: ${win.label} (${win.votes} votos).`);
    if (p.kind === 'king') {
      const a = this.byId(pl.agent);
      if (a) {
        for (const o of this.living()) if (o.role === 'rei') o.role = null;
        a.role = 'rei'; this.king = a.id; this.remember(a, 'Fui escolhido rei por todos.');
        this.beat(`${a.name} foi escolhido rei de ${this.name}. Ele não pediu uma coroa.`, { prio: 3, scene: 'throne', agent: a.id, at: [a.x, a.y] });
        this.rebalanceRoles();
      }
    } else if (p.kind === 'build') {
      this.forced = pl.build; this._cache.proj = null;
      this.beat(`A votação decidiu. Vem aí: ${win.label.toLowerCase()}.`, { prio: 2 });
    } else {
      const who = this.living().filter((a) => a.role !== 'rei').sort((x, y) => (y.traits.curiosity + y.traits.bravery) - (x.traits.curiosity + x.traits.bravery))[0];
      if (who && this.applyDecision(who, { type: 'expedition', lm: pl.lm, thought: 'O povo votou. Eu vou.' }, 'votação')) {
        this.beat(`A votação decidiu. ${who.name} vai de expedição rumo a ${win.label}.`, { prio: 3, agent: who.id, at: [who.x, who.y] });
      }
    }
    return win;
  }
  vote(i, n = 1) { if (this.poll && this.poll.options[i]) this.poll.options[i].votes += n; }

  // ---------- poderes do deus ----------
  decree(text) {
    this.decreeText = text; this.decreeUntil = this.tick + TPD * 2;
    this.log('god', `✦ Voz do céu: “${text}”`);
    for (const a of this.living()) { this.remember(a, `Uma voz vinda do céu disse a todos: “${text}”`); if (a.act && a.act.type !== 'eat') this.endAct(a); }
  }
  whisperTo(a, text) {
    a.whisper = { text, until: this.tick + TPD * 2 };
    this.log('god', `✦ A voz do céu sussurrou algo a ${a.name}.`, a.id);
    this.remember(a, `Ouvi uma voz sussurrar em minha mente: “${text}”`);
    if (a.act && a.act.type !== 'eat') this.endAct(a);
  }
  order(a, d) {
    if (!a.alive) return false;
    const ok = this.applyDecision(a, { ...d, thought: 'Fui guiado por uma força maior.' }, 'ordem divina');
    if (ok) this.log('god', `✦ ${a.name} foi guiado pelo deus.`, a.id);
    return ok;
  }
  smite(a) { a.hp -= 50; this.log('god', `⚡ ${a.name} foi atingido por um raio!`, a.id); this.remember(a, 'Um raio caiu do céu sobre mim!'); if (a.hp <= 0) this.kill(a, 'por um raio'); }
  bless(a) { a.hp = 100; a.hunger = Math.min(a.hunger, 20); a.fatigue = Math.min(a.fatigue, 20); this.log('god', `✨ ${a.name} foi abençoado.`, a.id); this.remember(a, 'Uma luz quente me envolveu. Estou renovado.'); }

  trigger(name, x, y) {
    const w = this.world;
    switch (name) {
      case 'chuva': this.setWeather('chuva', TPD * 1.5); break;
      case 'seca': this.setWeather('seca', TPD * 2); break;
      case 'colheita':
        for (let i = 0; i < w.rk.length; i++) if (w.rk[i] === K.FOOD) w.ra[i] = w.rm[i];
        for (const f of this.structs('field')) { f.stage = 3; f.timer = 0; }
        this.log('event', '🌾 Colheita farta: campos e arbustos amadureceram.'); this.beat('A terra foi generosa. Os campos amadureceram de uma vez.', { prio: 2 }); break;
      case 'dadiva': this.stock.food += 12; this.stock.wood += 8; this.stock.stone += 6; this.log('event', '🎁 Suprimentos misteriosos apareceram no armazém.'); this.beat('Suprimentos apareceram no armazém. Ninguém soube explicar.', { prio: 2 }); break;
      case 'praga': {
        const victims = this.living().filter(() => this.rng() < 0.45);
        for (const a of victims) { a.hp -= 45; this.remember(a, 'Adoeci de repente.'); if (a.hp <= 0) this.kill(a, 'da praga'); }
        this.log('event', `☣ Uma praga se espalhou: ${victims.length} adoeceram.`); this.beat(`Uma praga cruzou a vila. ${victims.length} adoeceram.`, { prio: 3 }); break;
      }
      case 'forasteiro': this.addFollowers([]); break;
      case 'meteoro': {
        const c = this.center;
        const cx = x ?? Math.floor(c.x + (this.rng() - 0.5) * 24), cy = y ?? Math.floor(c.y + (this.rng() - 0.5) * 24);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const tx = cx + dx, ty = cy + dy;
          if (!inBounds(w, tx, ty) || dx * dx + dy * dy > 5) continue;
          const i = ty * W + tx;
          for (const st of w.structures.filter((s) => inRect(tx, ty, s) && s.type !== 'campfire')) removeStructure(w, st);
          if (w.tile[i] !== T.WATER && !w.occ[i] && !w.keep[i]) { w.tile[i] = T.GRASS; w.rk[i] = K.STONE; w.rm[i] = 6; w.ra[i] = 6; }
        }
        this.assignHomes();
        for (const a of this.living()) if (cheb(a.x, a.y, cx, cy) <= 2) { a.hp -= 70; if (a.hp <= 0) this.kill(a, 'por um meteoro'); }
        this.meteor = { x: cx, y: cy, t: this.tick };
        this.log('event', '☄ Um meteoro caiu!'); this.beat('Um meteoro rasgou o céu e caiu sobre a floresta.', { prio: 3, at: [cx, cy] }); break;
      }
    }
  }
  placeTool(tool, x, y) {
    const w = this.world;
    if (!inBounds(w, x, y)) return false;
    const i = y * W + x, t = w.tile[i];
    if (t === T.WATER || t === T.ROCK || w.occ[i] || w.keep[i]) return false;
    const set = (k, max) => { w.rk[i] = k; w.rm[i] = max; w.ra[i] = max; };
    if (tool === 'tree') { w.tile[i] = T.FOREST; set(K.WOOD, 5); }
    else if (tool === 'bush') { if (t === T.FOREST) return false; set(K.FOOD, 4); }
    else if (tool === 'stone') { if (t === T.FOREST) return false; set(K.STONE, 6); }
    else if (tool === 'house') { if (w.rk[i] || t === T.FOREST) return false; addStructure(w, 'cabin', x, y); this.assignHomes(); this.log('god', '✦ Uma cabana surgiu do nada.'); }
    else return false;
    this._cache.res = null;
    return true;
  }

  // ---------- (de)serialização ----------
  toJSON() {
    const w = this.world;
    return {
      v: 2, seed: this.seed, name: this.name, tick: this.tick, rng: this.rng.getState(), nextAgentId: this.nextAgentId,
      stock: this.stock, weather: this.weather, decreeText: this.decreeText, decreeUntil: this.decreeUntil, stats: this.stats, graves: this.graves,
      logs: this.logs.slice(-200), king: this.king, forced: this.forced, firsts: this.firsts, lastTier: this.lastTier, animals: this.animals, plot: this.plot,
      agents: this.agents.map((a) => ({ ...a, pending: null })),
      world: {
        tile: Array.from(w.tile), rk: Array.from(w.rk), ra: Array.from(w.ra), rm: Array.from(w.rm), occ: Array.from(w.occ), trail: Array.from(w.trail),
        structures: w.structures, decor: w.decor, landmarks: w.landmarks, nextStructId: w.nextStructId, start: w.start,
      },
    };
  }
  static fromJSON(j) {
    if (j.v !== 2) throw new Error('save de versão antiga');
    const s = new Sim(j.seed, { name: j.name, agents: 0 });
    s.tick = j.tick; s.rng.setState(j.rng); s.nextAgentId = j.nextAgentId; s.stock = j.stock; s.weather = j.weather;
    s.decreeText = j.decreeText; s.decreeUntil = j.decreeUntil; s.stats = j.stats; s.graves = j.graves; s.logs = j.logs;
    s.king = j.king; s.forced = j.forced; s.firsts = j.firsts; s.lastTier = j.lastTier; s.animals = j.animals; s.plot = j.plot || null;
    s.agents = j.agents.map((a) => ({ ...a, pending: null }));
    const w = s.world, jw = j.world;
    w.tile.set(jw.tile); w.rk.set(jw.rk); w.ra.set(jw.ra); w.rm.set(jw.rm); w.occ.set(jw.occ); w.trail.set(jw.trail);
    w.structures = jw.structures; w.decor = jw.decor; w.landmarks = jw.landmarks; w.nextStructId = jw.nextStructId; w.start = jw.start;
    s._cache = {};
    return s;
  }
}

function normalizeKind(v) {
  const s = String(v || '').toLowerCase();
  if (/food|comida|fruta|alimento|baga/.test(s)) return 'food';
  if (/wood|madeira|lenha/.test(s)) return 'wood';
  if (/stone|pedra/.test(s)) return 'stone';
  return null;
}
export function buildingName(t) {
  return { tent: 'uma tenda', cabin: 'uma cabana', field: 'uma plantação', well: 'um poço', barn: 'um celeiro', forge: 'uma forja', market: 'um mercado', tower: 'uma torre de vigia', wall: 'a muralha', library: 'uma biblioteca', castle: 'o castelo' }[t] || t;
}
export function describeAct(sim, spec) {
  const kinds = { food: 'comida', wood: 'madeira', stone: 'pedra' };
  switch (spec.type) {
    case 'gather': return `coletar ${kinds[spec.kind]}`;
    case 'farm': return 'cuidar do campo';
    case 'eat': return 'comer';
    case 'sleep': return 'dormir';
    case 'talk': return `conversar com ${sim.byId(spec.targetId)?.name ?? '?'}`;
    case 'give': return `dar comida a ${sim.byId(spec.targetId)?.name ?? '?'}`;
    case 'build': return `construir ${buildingName(spec.project?.type)}`;
    case 'store': return 'guardar no armazém';
    case 'smith': return 'forjar ferramentas';
    case 'patrol': return 'fazer a ronda';
    case 'expedition': return `partir em expedição (${sim.world.landmarks.find((l) => l.id === spec.lm)?.name || '?'})`;
    case 'wander': return spec.far ? 'explorar longe' : 'dar uma volta';
    case 'goto': return 'ir até um lugar';
    default: return 'ficar parado';
  }
}
