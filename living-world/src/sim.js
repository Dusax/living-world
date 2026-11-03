// Motor da simulação. Sem DOM. O "cérebro" pode ser instinto (síncrono) ou LLM (assíncrono, via sim.llm).
import { mulberry32 } from './rng.js';
import { newWorld, isWalkable, addStructure, removeStructure, inBounds, T, K, KIND_NAME, TPD, SEASONS, SEASON_DAYS, W, H } from './world.js';
import { bfs, cheb } from './path.js';
import { makeAgent, randomName } from './agent.js';
import { utilityDecide, keywordBias, templateLine, templateReply } from './brain.js';

export const HOUSE_COST = { wood: 10, stone: 2 };
export const INV_CAP = 8;
const START_TICK = 35; // dia 1, ~07h
const LLM_TIMEOUT_MS = 15000;
const REGROW = { [K.WOOD]: 0.02, [K.FOOD]: 0.011, [K.STONE]: 0.0015 };

export class Sim {
  constructor(seed = 1) {
    this.seed = seed;
    const { world, rng } = newWorld(seed);
    this.world = world;
    this.rng = rng;
    this.tick = START_TICK;
    this.agents = [];
    this.nextAgentId = 1;
    this.stock = { food: 6, wood: 4, stone: 0 };
    this.weather = { type: 'limpo', until: 0 };
    this.decreeText = ''; this.decreeUntil = 0;
    this.logs = []; this.graves = [];
    this.llm = null; // objeto com ready() e decide(sim, agent)
    this.onLog = null;
    this.stats = { born: 0, died: 0, houses: 0 };
    for (let i = 0; i < 6; i++) this.spawnAgent(null, true);
    this.log('info', 'Seis náufragos chegaram à ilha. O mundo está nas suas mãos.');
  }

  // ---------- tempo ----------
  day() { return Math.floor(this.tick / TPD) + 1; }
  hour() { return ((this.tick % TPD) / TPD) * 24; }
  season() { return Math.floor((this.day() - 1) / SEASON_DAYS) % 4; }
  seasonName() { return SEASONS[this.season()]; }
  living() { return this.agents.filter((a) => a.alive); }
  byId(id) { return this.agents.find((a) => a.id === id); }
  byName(n) { const s = String(n || '').toLowerCase().trim(); return this.living().find((a) => a.name.toLowerCase() === s); }
  houses() { return this.world.structures.filter((s) => s.type === 'house'); }
  struct(type) { return this.world.structures.find((s) => s.type === type); }

  log(kind, text, agentId = null) {
    const e = { t: this.tick, day: this.day(), hour: Math.floor(this.hour()), kind, text, agent: agentId };
    this.logs.push(e);
    if (this.logs.length > 500) this.logs.shift();
    if (this.onLog) this.onLog(e);
  }
  remember(a, text) {
    a.mem.push({ t: this.tick, day: this.day(), text });
    if (a.mem.length > 40) a.mem.shift();
  }

  // ---------- população ----------
  spawnAgent(name, near = false) {
    const s = this.world.start;
    let x = s.x, y = s.y;
    for (let i = 0; i < 60; i++) {
      const nx = s.x + Math.floor((this.rng() - 0.5) * (near ? 7 : 14)), ny = s.y + Math.floor((this.rng() - 0.5) * (near ? 7 : 14));
      if (isWalkable(this.world, nx, ny)) { x = nx; y = ny; break; }
    }
    const a = makeAgent(this, name || randomName(this), x, y);
    this.agents.push(a);
    this.stats.born++;
    this.assignHomes();
    return a;
  }

  assignHomes() {
    const counts = {};
    for (const a of this.living()) if (a.home) counts[a.home] = (counts[a.home] || 0) + 1;
    for (const a of this.living()) {
      if (a.home && this.world.structures.some((s) => s.id === a.home)) continue;
      a.home = null;
      const h = this.houses().find((s) => (counts[s.id] || 0) < 2);
      if (h) { a.home = h.id; counts[h.id] = (counts[h.id] || 0) + 1; this.remember(a, 'Agora tenho uma casa para chamar de minha.'); }
    }
  }

  // ---------- consultas usadas pelo cérebro ----------
  hasResource(kind) {
    const k = KIND_NAME[kind], w = this.world;
    for (let i = 0; i < w.rk.length; i++) if (w.rk[i] === k && w.ra[i] > 0) return true;
    return false;
  }
  foodAvailable(a) { return a.inv.food > 0 || this.stock.food > 0; }
  pooled(res) { return this.stock[res] + this.living().reduce((s, a) => s + a.inv[res], 0); }
  canBuild() { return this.pooled('wood') >= HOUSE_COST.wood && this.pooled('stone') >= HOUSE_COST.stone && !!this.findSite(); }
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
    if (this.decreeText && this.tick < this.decreeUntil) add(keywordBias(this.decreeText), 0.5 + a.traits.sociability * 0.2 + (1 - a.traits.curiosity) * 0.1);
    if (a.whisper && this.tick < a.whisper.until) add(keywordBias(a.whisper.text), 1.2);
    return out;
  }

  // ---------- passo ----------
  step() {
    this.tick++;
    if ((this.tick % TPD) === 0) this.onNewDay();
    if (this.weather.until && this.tick >= this.weather.until) { this.weather = { type: 'limpo', until: 0 }; this.log('event', 'O tempo firmou.'); }
    if (this.tick % 4 === 0) this.regrow();
    for (const a of this.agents) if (a.alive) this.stepAgent(a);
  }

  onNewDay() {
    const r = this.rng();
    if (this.weather.type === 'limpo') {
      if (r < 0.18) this.setWeather('chuva', TPD);
      else if (r < 0.23) this.setWeather('seca', TPD * 2);
    }
    this.maybeBirth();
    if (this.day() % SEASON_DAYS === 1 && this.day() > 1) this.log('event', `Chegou ${this.seasonName()}.`);
  }
  // Casais que se gostam, com teto e fartura no armazém, podem ter um filho.
  maybeBirth() {
    const pop = this.living();
    if (pop.length >= 16 || this.stock.food < pop.length * 5 || this.houses().length * 2 <= pop.length - 1) return;
    for (const a of pop) {
      for (const b of pop) {
        if (a.id >= b.id || (a.rel[b.id] || 0) < 55 || (b.rel[a.id] || 0) < 55) continue;
        if (this.rng() > 0.12) continue;
        const kid = this.spawnAgent(null, true);
        kid.x = a.x; kid.y = a.y; kid.px = a.x; kid.py = a.y; kid.inv.food = 0;
        this.log('birth', `👶 ${kid.name} nasceu, filho(a) de ${a.name} e ${b.name}.`, kid.id);
        this.remember(kid, `Nasci ao lado de ${a.name} e ${b.name}.`);
        this.remember(a, `Meu filho(a) ${kid.name} nasceu!`); this.remember(b, `Meu filho(a) ${kid.name} nasceu!`);
        return;
      }
    }
  }
  setWeather(type, dur) {
    this.weather = { type, until: this.tick + dur };
    this.log('event', type === 'chuva' ? 'Começou a chover. As plantas agradecem.' : type === 'seca' ? 'Uma seca castiga a ilha. Tudo para de crescer.' : `Clima: ${type}.`);
  }

  regrow() {
    const w = this.world;
    const seasonMult = [1.5, 1.0, 0.9, 0.15][this.season()];
    const wm = this.weather.type === 'chuva' ? 3 : this.weather.type === 'seca' ? 0.05 : 1;
    for (let i = 0; i < w.rk.length; i++) {
      const k = w.rk[i];
      if (!k || w.ra[i] >= w.rm[i]) continue;
      if (this.rng() < REGROW[k] * seasonMult * wm) w.ra[i]++;
    }
  }

  stepAgent(a) {
    a.px = a.x; a.py = a.y;
    this.updateNeeds(a);
    if (!a.alive) return;
    if (a.hunger >= 90 && !(a.act && a.act.type === 'eat') && this.foodAvailable(a)) {
      this.endAct(a);
      this.beginAct(a, { type: 'eat' }, 'reflexo');
      this.remember(a, 'A fome apertou demais. Larguei tudo para comer.');
    }
    if (a.pending) {
      if (Date.now() - a.pending.at > LLM_TIMEOUT_MS) a.pending = null;
      else { a.thought = 'Pensando…'; return; }
    }
    if (!a.act) {
      this.decide(a);
      if (!a.act) return;
    }
    this.runAct(a);
  }

  updateNeeds(a) {
    const winter = this.season() === 3;
    a.hunger = Math.min(100, a.hunger + (winter ? 0.6 : 0.5) * (a.sleeping ? 0.6 : 1));
    a.fatigue = a.sleeping ? Math.max(0, a.fatigue - 1.6) : Math.min(100, a.fatigue + 0.3);
    a.loneliness = Math.min(100, a.loneliness + 0.2 * (0.5 + a.traits.sociability));
    if (a.hunger >= 100) a.hp -= 2;
    else if (a.fatigue >= 100) a.hp -= 0.5;
    else if (a.hunger < 60 && a.fatigue < 70) a.hp = Math.min(100, a.hp + 0.3);
    if (a.hp <= 0) this.kill(a, a.hunger >= 100 ? 'de fome' : a.fatigue >= 100 ? 'de exaustão' : 'de ferimentos');
  }

  kill(a, cause) {
    if (!a.alive) return;
    a.alive = false; a.died = this.tick; a.sleeping = false; a.act = null; a.pending = null;
    this.graves.push({ x: a.x, y: a.y, name: a.name, day: this.day() });
    this.stats.died++;
    this.log('death', `${a.name} morreu ${cause}.`, a.id);
    for (const o of this.living()) {
      const rel = o.rel[a.id] || 0;
      this.remember(o, `${a.name} morreu ${cause}.`);
      if (rel > 40) o.loneliness = Math.min(100, o.loneliness + 30);
    }
    this.assignHomes();
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
        a.pending = null;
        if (this.llm) this.llm.fail(e);
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

  // Valida e inicia uma decisão. Retorna false se inviável.
  applyDecision(a, d, source) {
    const spec = { type: d.type };
    switch (d.type) {
      case 'gather': {
        const kind = normalizeKind(d.kind || d.target);
        if (!kind || !this.findResource(a, kind)) return false;
        spec.kind = kind;
        spec.until = Math.min(INV_CAP, a.inv[kind] + 3);
        if (a.inv[kind] >= INV_CAP) return false;
        break;
      }
      case 'eat': if (!this.foodAvailable(a)) return false; break;
      case 'talk': case 'give': {
        const t = this.byName(d.target);
        if (!t || t === a) return false;
        if (d.type === 'give' && a.inv.food < 1) return false;
        spec.targetId = t.id; spec.say = d.say;
        break;
      }
      case 'build': if (!this.canBuild()) return false; break;
      case 'store': if (!(a.inv.wood + a.inv.stone + a.inv.food > 0)) return false; break;
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
    const label = describeAct(this, spec);
    this.remember(a, `[${source}] ${a.thought ? a.thought + ' → ' : ''}${label}`);
  }
  endAct(a) { a.sleeping = false; a.act = null; }
  failAct(a, reason) {
    if (a.act) a.fails[a.act.type + (a.act.kind || '')] = this.tick;
    this.remember(a, `Não deu certo: ${reason}.`);
    this.endAct(a);
  }
  doneAct(a) { this.endAct(a); }

  // movimento: 'arrived' | 'moving' | 'fail'
  moveTo(a, act, isGoal) {
    if (isGoal(a.x, a.y)) return 'arrived';
    if (++act.moves > 120) return 'fail';
    if (!act.path || !act.path.length) {
      act.path = bfs(this.world, a.x, a.y, isGoal);
      if (!act.path || !act.path.length) return 'fail';
    }
    const [nx, ny] = act.path[0];
    if (!isWalkable(this.world, nx, ny)) { act.path = null; return 'moving'; }
    a.x = nx; a.y = ny; act.path.shift();
    return 'moving';
  }

  findResource(a, kind) {
    const k = KIND_NAME[kind], w = this.world;
    const path = bfs(w, a.x, a.y, (x, y) => w.rk[y * w.w + x] === k && w.ra[y * w.w + x] > 0);
    if (!path) return null;
    const end = path.length ? path[path.length - 1] : [a.x, a.y];
    return { x: end[0], y: end[1], path };
  }

  findSite() {
    const w = this.world, s = this.struct('storehouse');
    if (!s) return null;
    const free = (x, y) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (inBounds(w, x + dx, y + dy) && w.occ[(y + dy) * w.w + x + dx]) return false;
      }
      return true;
    };
    const path = bfs(w, s.x, s.y, (x, y) => {
      const i = y * w.w + x, c = cheb(x, y, s.x, s.y);
      return c >= 2 && c <= 10 && (w.tile[i] === T.GRASS || w.tile[i] === T.SAND) && !w.rk[i] && free(x, y);
    }, 3000);
    if (!path || !path.length) return null;
    const e = path[path.length - 1];
    return { x: e[0], y: e[1] };
  }

  runAct(a) {
    const act = a.act, w = this.world;
    const adj = (st) => (x, y) => cheb(x, y, st.x, st.y) <= 1;
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
          const R = act.far ? 18 : 7;
          for (let i = 0; i < 25; i++) {
            const x = Math.round(a.x + (this.rng() - 0.5) * 2 * R), y = Math.round(a.y + (this.rng() - 0.5) * 2 * R);
            if (isWalkable(w, x, y)) { act.target = { x, y }; break; }
          }
          if (!act.target) return this.doneAct(a);
        }
        const r = this.moveTo(a, act, (x, y) => x === act.target.x && y === act.target.y);
        if (r === 'arrived') this.doneAct(a); else if (r === 'fail') this.doneAct(a);
        return;
      }

      case 'gather': {
        const k = KIND_NAME[act.kind];
        if (a.inv[act.kind] >= act.until || a.inv[act.kind] >= INV_CAP) return this.doneAct(a);
        if (!act.target || w.ra[act.target.y * w.w + act.target.x] <= 0 || w.rk[act.target.y * w.w + act.target.x] !== k) {
          const f = this.findResource(a, act.kind);
          if (!f) return a.inv[act.kind] > 0 ? this.doneAct(a) : this.failAct(a, `não há ${act.kind} acessível`);
          act.target = { x: f.x, y: f.y }; act.path = f.path; act.work = 0;
        }
        const r = this.moveTo(a, act, (x, y) => x === act.target.x && y === act.target.y);
        if (r === 'fail') return this.failAct(a, 'caminho bloqueado');
        if (r === 'arrived') {
          if (++act.work >= 2) {
            const i = act.target.y * w.w + act.target.x;
            const yieldN = Math.min(w.ra[i], act.kind === 'wood' ? (a.traits.diligence > 0.6 ? 3 : 2) : (a.traits.diligence > 0.6 ? 2 : 1), INV_CAP - a.inv[act.kind]);
            w.ra[i] -= yieldN; a.inv[act.kind] += yieldN; act.work = 0;
            if (a.inv[act.kind] >= act.until) this.doneAct(a);
          }
        }
        return;
      }

      case 'eat': {
        if (a.inv.food <= 0) {
          const s = this.struct('storehouse');
          if (this.stock.food <= 0 || !s) return this.failAct(a, 'não há comida');
          const r = this.moveTo(a, act, adj(s));
          if (r === 'fail') return this.failAct(a, 'não alcancei o armazém');
          if (r === 'moving') return;
          const take = Math.min(this.stock.food, 2);
          this.stock.food -= take; a.inv.food += take;
        }
        a.inv.food--; a.hunger = Math.max(0, a.hunger - 40);
        if (a.hunger < 25 || (a.inv.food <= 0 && this.stock.food <= 0)) this.doneAct(a);
        return;
      }

      case 'sleep': {
        const home = this.world.structures.find((s) => s.id === a.home) || this.struct('fire');
        if (!a.sleeping) {
          const r = this.moveTo(a, act, adj(home));
          if (r === 'fail') a.sleeping = true; // dorme onde estiver
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

      case 'talk': case 'give': {
        const t = this.byId(act.targetId);
        if (!t || !t.alive) return this.failAct(a, 'a pessoa sumiu');
        if (act.type === 'talk' && t.sleeping) return this.failAct(a, `${t.name} está dormindo`);
        if (act.moves % 3 === 2) act.path = null;
        const r = this.moveTo(a, act, adj(t));
        if (r === 'fail') return this.failAct(a, `não alcancei ${t.name}`);
        if (r === 'moving') return;
        return act.type === 'talk' ? this.doTalk(a, t, act) : this.doGive(a, t, act);
      }

      case 'build': {
        if (!act.site) {
          if (!this.canBuild()) return this.failAct(a, 'faltam materiais');
          act.site = this.findSite();
          if (!act.site) return this.failAct(a, 'sem lugar para construir');
        }
        const sx = act.site.x, sy = act.site.y;
        const r = this.moveTo(a, act, (x, y) => cheb(x, y, sx, sy) <= 1 && !(x === sx && y === sy));
        if (r === 'fail') return this.failAct(a, 'não alcancei o terreno');
        if (r === 'moving') return;
        if (++act.work < 8) return;
        if (this.pooled('wood') < HOUSE_COST.wood || this.pooled('stone') < HOUSE_COST.stone || w.occ[sy * w.w + sx]) return this.failAct(a, 'faltou material');
        for (const res of ['wood', 'stone']) {
          let need = HOUSE_COST[res];
          const own = Math.min(need, a.inv[res]); a.inv[res] -= own; need -= own;
          const fromStock = Math.min(need, this.stock[res]); this.stock[res] -= fromStock; need -= fromStock;
          for (const o of this.living()) { if (need <= 0) break; const g = Math.min(need, o.inv[res]); o.inv[res] -= g; need -= g; }
        }
        addStructure(w, 'house', sx, sy, { builder: a.id });
        this.stats.houses++;
        this.log('build', `${a.name} construiu uma casa.`, a.id);
        this.remember(a, 'Terminei de construir uma casa.');
        this.assignHomes();
        return this.doneAct(a);
      }
    }
    this.doneAct(a);
  }

  doTalk(a, t, act) {
    if (act.work === 0) {
      const line = act.say || templateLine(this, a, t);
      this.say(a, line);
      this.log('talk', `${a.name} → ${t.name}: “${line}”`, a.id);
    }
    if (act.work === 1) {
      const reply = templateReply(this, t, a);
      this.say(t, reply);
      this.log('talk', `${t.name}: “${reply}”`, t.id);
    }
    act.work++;
    if (act.work < 3) return;
    const ka = a.traits.kindness, kt = t.traits.kindness;
    let delta = 4 + (ka + kt) * 4;
    if (this.rng() < 0.15 && (a.traits.bravery + t.traits.bravery) / 2 > 0.55 && (ka + kt) / 2 < 0.5) {
      delta = -12;
      this.log('conflict', `${a.name} e ${t.name} discutiram.`, a.id);
    }
    this.bond(a, t, delta); this.bond(t, a, delta);
    a.loneliness = Math.max(0, a.loneliness - 40);
    t.loneliness = Math.max(0, t.loneliness - 30);
    this.remember(a, `Conversei com ${t.name}.`);
    this.remember(t, `${a.name} veio conversar comigo.`);
    this.doneAct(a);
  }
  bond(a, t, delta) {
    const before = a.rel[t.id] || 0;
    const after = Math.max(-100, Math.min(100, before + delta));
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
    this.remember(a, `Dei ${n} comida a ${t.name}.`);
    this.remember(t, `${a.name} me deu ${n} comida. Não esquecerei.`);
    this.doneAct(a);
  }
  say(a, text) { a.say = text; a.sayUntil = this.tick + 10; }

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
        this.log('event', '🌾 Colheita farta: todos os arbustos e pescarias se reabasteceram.'); break;
      case 'dadiva':
        this.stock.food += 12; this.stock.wood += 8; this.stock.stone += 4;
        this.log('event', '🎁 Suprimentos misteriosos apareceram no armazém.'); break;
      case 'praga': {
        const victims = this.living().filter(() => this.rng() < 0.45);
        for (const a of victims) { a.hp -= 45; this.remember(a, 'Adoeci de repente.'); if (a.hp <= 0) this.kill(a, 'da praga'); }
        this.log('event', `☣ Uma praga se espalhou: ${victims.length} adoeceram.`); break;
      }
      case 'forasteiro': {
        const a = this.spawnAgent();
        this.log('event', `🧳 ${a.name} chegou à ilha, vindo de lugar nenhum.`);
        for (const o of this.living()) if (o !== a) this.remember(o, `Um forasteiro, ${a.name}, apareceu na ilha.`);
        this.remember(a, 'Acordei numa praia desconhecida.'); break;
      }
      case 'meteoro': {
        const cx = x ?? Math.floor(W / 2 + (this.rng() - 0.5) * 24), cy = y ?? Math.floor(H / 2 + (this.rng() - 0.5) * 16);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const tx = cx + dx, ty = cy + dy;
          if (!inBounds(w, tx, ty) || dx * dx + dy * dy > 5) continue;
          const i = ty * w.w + tx;
          const st = w.structures.find((s) => s.x === tx && s.y === ty);
          if (st && st.type === 'house') { removeStructure(w, st); this.assignHomes(); }
          if (w.tile[i] >= T.SAND && !w.occ[i]) { w.rk[i] = K.STONE; w.rm[i] = 6; w.ra[i] = 6; }
        }
        for (const a of this.living()) if (cheb(a.x, a.y, cx, cy) <= 2) { a.hp -= 70; if (a.hp <= 0) this.kill(a, 'por um meteoro'); }
        this.meteor = { x: cx, y: cy, t: this.tick };
        this.log('event', '☄ Um meteoro caiu na ilha!'); break;
      }
    }
  }

  placeTool(tool, x, y) {
    const w = this.world;
    if (!inBounds(w, x, y)) return false;
    const i = y * w.w + x, t = w.tile[i];
    if (t < T.SAND || w.occ[i]) return false;
    const set = (k, max) => { w.rk[i] = k; w.rm[i] = max; w.ra[i] = max; };
    if (tool === 'tree') { if (t === T.ROCK) return false; if (t === T.GRASS || t === T.SAND) w.tile[i] = T.FOREST; set(K.WOOD, 6); }
    else if (tool === 'bush') { if (t !== T.GRASS && t !== T.SAND) return false; set(K.FOOD, 4); }
    else if (tool === 'stone') set(K.STONE, 6);
    else if (tool === 'house') { if (w.rk[i]) return false; addStructure(w, 'house', x, y, { builder: 0 }); this.assignHomes(); this.log('god', '✦ Uma casa surgiu do nada.'); }
    else return false;
    return true;
  }

  // ---------- (de)serialização ----------
  toJSON() {
    const w = this.world;
    return {
      v: 1, seed: this.seed, tick: this.tick, rng: this.rng.getState(), nextAgentId: this.nextAgentId,
      stock: this.stock, weather: this.weather, decreeText: this.decreeText, decreeUntil: this.decreeUntil,
      stats: this.stats, graves: this.graves, logs: this.logs.slice(-200),
      agents: this.agents.map((a) => ({ ...a, pending: null })),
      world: { tile: Array.from(w.tile), rk: Array.from(w.rk), ra: Array.from(w.ra), rm: Array.from(w.rm), occ: Array.from(w.occ), structures: w.structures, nextStructId: w.nextStructId, start: w.start },
    };
  }
  static fromJSON(j) {
    const s = new Sim(j.seed);
    s.tick = j.tick; s.rng.setState(j.rng); s.nextAgentId = j.nextAgentId; s.stock = j.stock; s.weather = j.weather;
    s.decreeText = j.decreeText; s.decreeUntil = j.decreeUntil; s.stats = j.stats; s.graves = j.graves; s.logs = j.logs;
    s.agents = j.agents.map((a) => ({ ...a, pending: null }));
    const w = s.world;
    w.tile.set(j.world.tile); w.rk.set(j.world.rk); w.ra.set(j.world.ra); w.rm.set(j.world.rm); w.occ.set(j.world.occ);
    w.structures = j.world.structures; w.nextStructId = j.world.nextStructId; w.start = j.world.start;
    return s;
  }
}

function normalizeKind(v) {
  const s = String(v || '').toLowerCase();
  if (/food|comida|fruta|peixe|alimento/.test(s)) return 'food';
  if (/wood|madeira|lenha/.test(s)) return 'wood';
  if (/stone|pedra/.test(s)) return 'stone';
  return null;
}

export function describeAct(sim, spec) {
  const kinds = { food: 'comida', wood: 'madeira', stone: 'pedra' };
  switch (spec.type) {
    case 'gather': return `coletar ${kinds[spec.kind]}`;
    case 'eat': return 'comer';
    case 'sleep': return 'dormir';
    case 'talk': return `conversar com ${sim.byId(spec.targetId)?.name ?? '?'}`;
    case 'give': return `dar comida a ${sim.byId(spec.targetId)?.name ?? '?'}`;
    case 'build': return 'construir uma casa';
    case 'store': return 'guardar no armazém';
    case 'wander': return spec.far ? 'explorar longe' : 'dar uma volta';
    case 'goto': return 'ir até um lugar';
    default: return 'ficar parado';
  }
}
