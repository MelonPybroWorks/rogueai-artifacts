// sim.js — the arena: bullets, dodgers, collisions, grazing, and the
// steady-state genetic algorithm. DOM-free; render reads arrays.
import { CFG } from './config.js';
import { clamp, lerp } from './util.js';
import { randomBrain, breed, think, WLEN } from './brain.js';
import { Patterns } from './patterns.js';

// fixed spatial grid for bullets (alloc-free after construction)
class BulletGrid {
  constructor(cols, rows, maxB) {
    this.cols = cols; this.rows = rows;
    this.head = new Int32Array(cols * rows).fill(-1);
    this.next = new Int32Array(maxB);
  }
  rebuild(bullets) {
    this.head.fill(-1);
    const cw = CFG.FW / this.cols, ch = CFG.FH / this.rows;
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      const cx = clamp((b.x / cw) | 0, 0, this.cols - 1);
      const cy = clamp((b.y / ch) | 0, 0, this.rows - 1);
      const c = cy * this.cols + cx;
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }
  // visit bullet indices near (x,y) radius r; cb returns nothing
  query(bullets, x, y, r, cb) {
    const cw = CFG.FW / this.cols, ch = CFG.FH / this.rows;
    const x0 = clamp(((x - r) / cw) | 0, 0, this.cols - 1), x1 = clamp(((x + r) / cw) | 0, 0, this.cols - 1);
    const y0 = clamp(((y - r) / ch) | 0, 0, this.rows - 1), y1 = clamp(((y + r) / ch) | 0, 0, this.rows - 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      let i = this.head[cy * this.cols + cx];
      while (i !== -1) { cb(i); i = this.next[i]; }
    }
  }
}

let AID = 1;

export class Sim {
  constructor(rng, fx) {
    this.rng = rng; this.fx = fx;
    this.bullets = [];
    this.agents = [];
    this.grid = new BulletGrid(12, 14, CFG.MAX_BULLETS + 64);
    this.pat = new Patterns(rng);
    this.cardIdx = (rng() * CFG.CARDS.length) | 0;
    this.pat.setCard('rings');           // gentle opener
    this.time = 0;
    this.births = 0;                 // "generation" counter
    this.maxGen = 0;
    this.bestFit = 0; this.bestTime = 0; this.bestGraze = 0;
    this.elites = [];                // {w, fit, hue, gen} sorted desc
    this.gravesFit = [];             // recent death fitness (rolling avg)
    this.events = [];
    this.flash = 0;                  // bullet-clear flash (render reads)
    this._aimPick = 0;
    // player ship (hidden until first input)
    this.player = { x: CFG.FW / 2, y: CFG.FH - 40, vx: 0, vy: 0, ax: 0, ay: 0,
                    alive: false, ever: false, shield: 0, t: 0, best: 0, respawnT: 0, grazes: 0 };
    // seed initial population
    for (let i = 0; i < CFG.AGENTS; i++) this._spawnAgent(null);
  }

  emit(msg, cls = '') { this.events.push({ msg, cls }); if (this.events.length > 24) this.events.shift(); }

  _spawnAgent(brainInfo) {
    const rng = this.rng;
    let w, hue, gen;
    if (!brainInfo) {
      w = randomBrain(rng); hue = rng() * 360; gen = 0;
    } else {
      w = brainInfo.w; hue = brainInfo.hue; gen = brainInfo.gen;
    }
    const a = {
      id: AID++, x: CFG.FW / 2 + (rng() - 0.5) * 160, y: CFG.FH - 30 - rng() * 60,
      vx: 0, vy: 0, w, hue, gen,
      fit: 0, aliveT: 0, grazes: 0, shield: 2.0, grazeT: 0,
      dead: false, elite: false,
      in: new Float32Array(CFG.IN),
    };
    this.agents.push(a);
    this.births++;
    return a;
  }

  _tournament() {
    const e = this.elites;
    if (!e.length) return null;
    const a = e[(this.rng() * e.length) | 0], b = e[(this.rng() * e.length) | 0];
    return (a.fit > b.fit ? a : b);
  }

  _replaceAgent(idx) {
    const rng = this.rng;
    let info = null;
    if (this.elites.length && rng() > 0.04) {
      const p1 = this._tournament(), p2 = this._tournament();
      const w = breed(rng, p1.w, p2.w);
      const hue = (p1.hue + (rng() - 0.5) * 24 + 360) % 360;
      info = { w, hue, gen: Math.max(p1.gen, p2.gen) + 1 };
    }
    // swap-remove dead, append child
    this.agents[idx] = this.agents[this.agents.length - 1];
    this.agents.pop();
    return this._spawnAgent(info);
  }

  _onDeath(a, idx) {
    const fit = a.fit;
    this.gravesFit.push(fit);
    if (this.gravesFit.length > 40) this.gravesFit.shift();
    // elite pool
    const e = this.elites;
    const min = e.length ? e[e.length - 1].fit : -1;
    if (fit > 0 && (e.length < CFG.ELITES || fit > min)) {
      e.push({ w: Float32Array.from(a.w), fit, hue: a.hue, gen: a.gen });
      e.sort((p, q) => q.fit - p.fit);
      if (e.length > CFG.ELITES) e.pop();
    }
    if (a.aliveT > this.bestTime + 0.5) {
      this.bestTime = a.aliveT;
      this.emit(`new record — a hull survived ${a.aliveT.toFixed(1)}s`, 'good');
    }
    if (fit > this.bestFit) this.bestFit = fit;
    if (a.grazes > this.bestGraze) this.bestGraze = a.grazes;
    if (this.fx) this.fx.burst(a.x, a.y, 7, `hsl(${a.hue},85%,65%)`, 70);
  }

  forceCard(name) {
    this._clearBullets();
    this.pat.setCard(name || CFG.CARDS[(this.cardIdx = (this.cardIdx + 1) % CFG.CARDS.length)]);
    this.emit(`spell card — ${this.pat.card.toUpperCase()}`, 'warn');
  }

  bomb() {
    this._clearBullets();
    this.flash = 1;
    this.emit('bomb — the field clears', 'good');
  }

  _clearBullets() {
    if (this.fx) for (let i = 0; i < this.bullets.length; i += 3) {
      const b = this.bullets[i];
      this.fx.spark(b.x, b.y, '#cfd8ff');
    }
    this.bullets.length = 0;
    this.flash = Math.max(this.flash, 0.6);
  }

  update(dt) {
    const rng = this.rng;
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt * 1.8);

    // ---- spell card rotation ----
    if (this.pat.t > CFG.CARD_TIME) {
      this.forceCard();
    }

    // ---- aim target: a random living agent (or player) rotates every ~2s ----
    this._aimPick -= dt;
    if (this._aimPick <= 0) {
      this._aimPick = 2;
      const alive = this.agents;
      this._aim = this.player.alive && rng() < 0.3 ? this.player
        : alive.length ? alive[(rng() * alive.length) | 0] : { x: CFG.FW / 2, y: CFG.FH - 60 };
    }
    const aim = this._aim || { x: CFG.FW / 2, y: CFG.FH - 60 };

    // ---- spawn bullets ----
    const spawn = (x, y, vx, vy, hue, r) => {
      if (this.bullets.length >= CFG.MAX_BULLETS) return;
      this.bullets.push({ x, y, vx, vy, hue, r: r || CFG.BULLET_R });
    };
    this.pat.update(dt, spawn, aim.x, aim.y);

    // ---- move bullets, cull ----
    const bs = this.bullets;
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < -24 || b.x > CFG.FW + 24 || b.y < -24 || b.y > CFG.FH + 24) {
        bs[i] = bs[bs.length - 1]; bs.pop();
      }
    }
    this.grid.rebuild(bs);

    // ---- agents ----
    const KN = 7;                       // nearest bullets encoded
    const near = this._near || (this._near = new Float64Array(KN * 5));
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const a = this.agents[i];
      a.aliveT += dt;
      a.fit += dt;
      if (a.shield > 0) a.shield -= dt;
      if (a.grazeT > 0) a.grazeT -= dt;

      // nearest-bullet scan via grid (candidates within 150u)
      near.fill(0);
      let found = 0, hit = false, grazed = false;
      const self = a;
      this.grid.query(bs, a.x, a.y, 150, (bi) => {
        const b = bs[bi];
        const dx = b.x - self.x, dy = b.y - self.y;
        const d2 = dx * dx + dy * dy;
        const rr = b.r + CFG.AGENT_R;
        if (d2 < rr * rr) { hit = true; return; }
        const gr = b.r + CFG.GRAZE_R;
        if (d2 < gr * gr) grazed = true;
        // insertion into near[] sorted by d2 (packed: d2,dx,dy,vx,vy → use separate arrays)
        if (found < KN) found++;
        // store into parallel scratch via index by d2 rank
        ins(near, d2, dx, dy, b.vx, b.vy, KN);
      });

      if (hit && a.shield <= 0) {
        this._onDeath(a, i);
        this._replaceAgent(i);
        continue;
      }
      if (grazed && a.grazeT <= 0) {
        a.grazeT = 0.35; a.grazes++; a.fit += CFG.GRAZE_BONUS;
        if (this.fx) this.fx.spark(a.x, a.y, '#ffffff');
      }

      // encode inputs
      const inp = a.in;
      for (let k = 0; k < KN; k++) {
        const o = k * 5;
        const d2 = near[o];
        if (d2 === 0 && near[o + 1] === 0 && near[o + 2] === 0) { inp[k * 4] = 0; inp[k * 4 + 1] = 0; inp[k * 4 + 2] = 0; inp[k * 4 + 3] = 0; continue; }
        inp[k * 4] = clamp(near[o + 1] / 160, -1, 1);
        inp[k * 4 + 1] = clamp(near[o + 2] / 160, -1, 1);
        inp[k * 4 + 2] = clamp(near[o + 3] / 150, -1, 1);
        inp[k * 4 + 3] = clamp(near[o + 4] / 150, -1, 1);
      }
      inp[28] = (a.x / CFG.FW) * 2 - 1;
      inp[29] = (a.y / CFG.FH) * 2 - 1;
      inp[30] = found > 0 ? clamp(Math.sqrt(near[0]) / 200, 0, 1) : 1;   // nearest distance (1 = none near)
      inp[31] = 1;                                       // bias

      const out = think(a.w, inp);
      const k = 1 - Math.exp(-dt * 9);
      a.vx = lerp(a.vx, out[0] * CFG.AGENT_SPEED, k);
      a.vy = lerp(a.vy, out[1] * CFG.AGENT_SPEED, k);
      a.x = clamp(a.x + a.vx * dt, 6, CFG.FW - 6);
      a.y = clamp(a.y + a.vy * dt, 6, CFG.FH - 6);
    }

    // mark top-3 alive as elite (render halo)
    // (cheap partial pass every ~1s)
    this._eliteT = (this._eliteT || 0) - dt;
    if (this._eliteT <= 0) {
      this._eliteT = 1;
      for (const a of this.agents) a.elite = false;
      const top = [...this.agents].sort((p, q) => q.aliveT - p.aliveT).slice(0, 3);
      for (const a of top) a.elite = true;
      if (this.maxGen < this.agents.reduce((m, a) => Math.max(m, a.gen), 0))
        this.maxGen = this.agents.reduce((m, a) => Math.max(m, a.gen), 0);
    }

    // ---- player ----
    const p = this.player;
    if (p.alive) {
      p.t += dt;
      if (p.shield > 0) p.shield -= dt;
      const k = 1 - Math.exp(-dt * 11);
      p.vx = lerp(p.vx, p.ax * CFG.AGENT_SPEED * 1.12, k);
      p.vy = lerp(p.vy, p.ay * CFG.AGENT_SPEED * 1.12, k);
      p.x = clamp(p.x + p.vx * dt, 6, CFG.FW - 6);
      p.y = clamp(p.y + p.vy * dt, 6, CFG.FH - 6);
      let phit = false, pgraze = false;
      this.grid.query(bs, p.x, p.y, 150, (bi) => {
        const b = bs[bi];
        const dx = b.x - p.x, dy = b.y - p.y, d2 = dx * dx + dy * dy;
        const rr = b.r + CFG.AGENT_R;
        if (d2 < rr * rr) phit = true;
        const gr = b.r + CFG.GRAZE_R;
        if (d2 < gr * gr) pgraze = true;
      });
      if (pgraze && (p.grazeT = (p.grazeT || 0) - dt) <= 0) { p.grazeT = 0.35; p.grazes++; if (this.fx) this.fx.spark(p.x, p.y, '#aff'); }
      if (phit && p.shield <= 0) {
        p.alive = false; p.respawnT = 2.2;
        if (p.t > p.best) p.best = p.t;
        this.emit(`you fell after ${p.t.toFixed(1)}s — the machines continue`, 'warn');
        if (this.fx) this.fx.burst(p.x, p.y, 16, '#ffffff', 130);
        p.t = 0; p.grazes = 0;
      }
    } else if (p.ever) {
      p.respawnT -= dt;
      if (p.respawnT <= 0 && (p.ax || p.ay)) {
        p.alive = true; p.shield = 1.4; p.x = CFG.FW / 2; p.y = CFG.FH - 36; p.vx = p.vy = 0;
      }
    }
  }
}

// insertion into packed best-K list [d2,dx,dy,vx,vy]*K sorted by d2 asc.
// empty slots are all-zero and read as Infinity distance
function ins(near, d2, dx, dy, vx, vy, K) {
  // find slot
  let o = 0;
  for (; o < K; o++) {
    const oo = o * 5;
    const ed = near[oo] === 0 && near[oo + 1] === 0 && near[oo + 2] === 0 ? Infinity : near[oo];
    if (d2 < ed) break;
  }
  if (o >= K) return;
  // shift down
  for (let j = K - 1; j > o; j--) {
    const a = j * 5, b = (j - 1) * 5;
    near[a] = near[b]; near[a + 1] = near[b + 1]; near[a + 2] = near[b + 2]; near[a + 3] = near[b + 3]; near[a + 4] = near[b + 4];
  }
  const oo = o * 5;
  near[oo] = d2; near[oo + 1] = dx; near[oo + 2] = dy; near[oo + 3] = vx; near[oo + 4] = vy;
}

// headless stats for tests
export function stats(sim) {
  const n = sim.agents.length || 1;
  let sumT = 0, maxT = 0, sumG = 0;
  for (const a of sim.agents) { sumT += a.aliveT; if (a.aliveT > maxT) maxT = a.aliveT; sumG += a.gen; }
  const gf = sim.gravesFit.length ? sim.gravesFit.reduce((s, v) => s + v, 0) / sim.gravesFit.length : 0;
  return {
    t: +sim.time.toFixed(0), births: sim.births, maxGen: sim.maxGen,
    avgAliveT: +(sumT / n).toFixed(1), maxAliveT: +maxT.toFixed(1),
    bestTime: +sim.bestTime.toFixed(1), avgDeathFit: +gf.toFixed(1),
    bestFit: +sim.bestFit.toFixed(1), elites: sim.elites.length,
    bullets: sim.bullets.length, card: sim.pat.card,
  };
}
