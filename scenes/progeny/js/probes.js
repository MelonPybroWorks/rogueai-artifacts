// probes.js — von Neumann probe ecology: seek → mine → replicate, with mutation (no DOM)
import { CFG } from './config.js';
import { clamp, lerp } from './util.js';
import { pheno, mutate, StrainBook } from './genome.js';

let PID = 1;

export class Ecology {
  constructor(rng, world, fx) {
    this.rng = rng; this.world = world; this.fx = fx;
    this.probes = [];
    this.book = new StrainBook();
    this.maxGen = 0;
    this.born = 0;
    this._prevFlarePhase = 'idle';
    this._burned = 0;
    this._sepT = 0;
    this._sepHash = new Map();
  }

  deployGenesis(x, y, genes, hue) {
    const strain = this.book.register(genes, hue ?? this.rng() * 360, 0);
    const p = this._spawn(x, y, genes, strain, 0);
    p.energy = CFG.START_ENERGY; p.cargo = p.ph.replicateCost * 0.5;  // ark carries a starter lode
    this.world.emit(`genesis probe deployed — strain ${strain.name}`, 'good');
    return p;
  }

  _spawn(x, y, genes, strain, gen) {
    const p = {
      id: PID++, x, y, vx: 0, vy: 0, heading: this.rng() * Math.PI * 2,
      state: 'seek', target: null, cargo: 0, energy: CFG.START_ENERGY,
      genes, ph: pheno(genes), strain, gen,
      buildT: 0, cooldown: 0, dead: false, derelictT: 0,
      orbitPhase: this.rng() * Math.PI * 2, thrust: 0, charted: false,
      size: 2.2 + genes[2] * 2.6,
    };
    strain.count++; this.born++;
    if (gen > this.maxGen) this.maxGen = gen;
    this.probes.push(p);
    return p;
  }

  replicate(parent) {
    const rng = this.rng;
    const childGenes = mutate(rng, parent.genes);
    let strain = this.book.classify(childGenes);
    if (!strain) {
      strain = this.book.register(childGenes,
        (parent.strain.hue + 34 + rng() * 26) % 360, parent.strain.id);
      this.world.emit(`strain ${strain.name} emerged from ${parent.strain.name}`, 'good');
      if (this.fx) this.fx.ring(parent.x, parent.y, `hsl(${strain.hue},90%,65%)`);
    }
    const ang = rng() * Math.PI * 2;
    const c = this._spawn(parent.x + Math.cos(ang) * 16, parent.y + Math.sin(ang) * 16,
      childGenes, strain, parent.gen + 1);
    c.vx = Math.cos(ang) * 70; c.vy = Math.sin(ang) * 70;
    c.cargo = parent.ph.replicateCost * 0.38;
    c.energy = clamp(parent.energy * 0.55, 26, 75);
    return c;
  }

  kill(p, idx, cause) {
    p.dead = true;
    p.strain.count--;
    this.probes[idx] = this.probes[this.probes.length - 1];
    this.probes.pop();
    if (this.fx) {
      const col = `hsl(${p.strain.hue},85%,${cause === 'burn' ? 62 : 40}%)`;
      this.fx.burst(p.x, p.y, cause === 'burn' ? 10 : 6, col, cause === 'burn' ? 150 : 60);
    }
    if (cause === 'burn') this._burned++;
  }

  popCount() { return this.probes.filter(p => p.state !== 'derelict').length; }

  update(dt) {
    const { world, probes, rng } = this;
    const W = world.R;

    // flare bookkeeping for aggregate log
    const phase = world.flare.phase;
    if (phase === 'sweep' && this._prevFlarePhase !== 'sweep') this._burned = 0;
    if (phase !== 'sweep' && this._prevFlarePhase === 'sweep' && this._burned > 0)
      world.emit(`${this._burned} hulls burned in the flare`, 'warn');
    this._prevFlarePhase = phase;

    const capped = probes.length >= CFG.MAX_PROBES;

    for (let i = probes.length - 1; i >= 0; i--) {
      const p = probes[i];
      if (p.dead) continue;

      // --- derelict hulls drift and fade ---
      if (p.state === 'derelict') {
        p.vx *= 1 - 0.4 * dt; p.vy *= 1 - 0.4 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.heading += 0.6 * dt;
        p.derelictT -= dt;
        if (p.derelictT <= 0) this.kill(p, i, 'decay');
        continue;
      }

      // --- energy budget ---
      const drain = p.thrust * CFG.THRUST_COST + CFG.IDLE_DRAIN - CFG.SOLAR;
      p.energy -= drain * dt;
      if (p.energy <= 0) {
        p.state = 'derelict'; p.derelictT = CFG.DERELICT_LIFE; p.thrust = 0;
        world.emit(`a ${p.strain.name} hull went dark`, '');
        if (this.fx) this.fx.burst(p.x, p.y, 4, '#5a7086', 30);
        continue;
      }
      if (p.cooldown > 0) p.cooldown -= dt;

      const ph = p.ph;

      switch (p.state) {
        case 'seek': {
          if (!p.target || p.target.ore < 4) {
            p.target = world.nearestRich(p.x, p.y, ph.sensor);
            p.charted = false;
            if (!p.target) { p.target = world.chartNearest(p.x, p.y); p.charted = true; }
            if (!p.target) { p.thrust = 0; break; }   // no ore anywhere — drift
          }
          const t = p.target;
          const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy) || 1;
          const arriveR = t.r + 15 + (p.id % 3) * 6;
          if (d < arriveR + 6) { p.state = 'mine'; break; }
          // trip audit: if the march would burn the reserve, power down and wait
          const netDrain = CFG.THRUST_COST + CFG.IDLE_DRAIN - CFG.SOLAR;
          const tripE = (d / (ph.speed * 0.8)) * netDrain * 1.15;
          if (tripE > p.energy * 0.72) { p.state = 'dormant'; p.recheckT = 0.5; p.thrust = 0; break; }
          const econ = p.energy < 22 ? 0.5 : 1;   // low reserve → cruise gently
          const spd = ph.speed * (p.charted ? 0.8 : 1) * econ * clamp(d / 140, 0.35, 1);
          const desX = dx / d * spd, desY = dy / d * spd;
          const k = 1 - Math.exp(-dt * 2.4);
          p.vx = lerp(p.vx, desX, k); p.vy = lerp(p.vy, desY, k);
          p.thrust = 1;
          p.heading = Math.atan2(p.vy, p.vx);
          break;
        }
        case 'mine': {
          const t = p.target;
          if (!t || t.ore < 1) { p.state = 'seek'; p.target = null; break; }
          // orbit slot around the rock
          const orbitR = t.r + 13 + (p.id % 3) * 7;
          const ang = t.rot * 2 + p.orbitPhase + world.time * 0.25;
          const ox = t.x + Math.cos(ang) * orbitR, oy = t.y + Math.sin(ang) * orbitR;
          const dx = ox - p.x, dy = oy - p.y, d = Math.hypot(dx, dy) || 1;
          const k = 1 - Math.exp(-dt * 3.2);
          p.vx = lerp(p.vx, dx / d * Math.min(ph.speed, d * 2.2), k);
          p.vy = lerp(p.vy, dy / d * Math.min(ph.speed, d * 2.2), k);
          p.thrust = d > 30 ? 0.8 : 0.25;
          p.heading = Math.atan2(p.vy, p.vx);
          // extraction
          const space = ph.cargo - p.cargo;
          const d_ = Math.min(ph.mine * dt, t.ore, Math.max(0, space));
          p.cargo += d_; t.ore -= d_; world.oreMined += d_;
          p.energy = Math.min(CFG.MAX_ENERGY, p.energy + d_ * CFG.MINE_ENERGY);
          if (t.ore <= 1 && !t.dead) { t.dead = true; }
          // colony-critical emergency protocol: replicate early while any hulls remain
          const panic = this.probes.length < 15;
          const need = panic ? ph.replicateCost * 0.55 : ph.replicateCost;
          if (!capped && p.cargo >= need && p.cooldown <= 0 && p.energy > CFG.FOUNDRY_ENERGY + 8) {
            p.state = 'foundry'; p.buildT = ph.build;
            p.energy -= CFG.FOUNDRY_ENERGY;
          } else if (capped && p.cargo >= ph.cargo * 0.98) {
            p.state = 'hold';
          }
          break;
        }
        case 'foundry': {
          // hold position, spin the scaffold
          p.vx *= 1 - 2.2 * dt; p.vy *= 1 - 2.2 * dt; p.thrust = 0;
          p.heading += dt * 1.4;
          p.buildT -= dt;
          if (this.fx && rng() < dt * 14)
            this.fx.spark(p.x, p.y, `hsl(${p.strain.hue},90%,70%)`);
          if (capped) { p.state = 'hold'; break; }
          if (p.buildT <= 0) {
            p.cargo = Math.max(0, p.cargo - p.ph.replicateCost);
            p.cooldown = CFG.REPLICATE_COOLDOWN;
            this.replicate(p);
            if (this.fx) this.fx.burst(p.x, p.y, 12, `hsl(${p.strain.hue},90%,72%)`, 110);
            p.state = p.cargo >= p.ph.replicateCost && p.energy > CFG.FOUNDRY_ENERGY + 8 ? 'foundry' : 'mine';
            if (p.state === 'foundry') { p.buildT = p.ph.build; p.energy -= CFG.FOUNDRY_ENERGY; }
            if (!p.target || p.target.ore < 1) p.state = 'seek';
          }
          break;
        }
        case 'hold': {
          p.vx *= 1 - 1.5 * dt; p.vy *= 1 - 1.5 * dt; p.thrust = 0;
          if (!capped) p.state = 'seek';
          break;
        }
        case 'dormant': {
          // powered down: drift, trickle-charge, wait for ore to come to you
          p.vx *= 1 - 1.1 * dt; p.vy *= 1 - 1.1 * dt; p.thrust = 0;
          p.heading += 0.22 * dt;
          p.recheckT -= dt;
          if (p.recheckT <= 0) {
            p.recheckT = 0.7;
            const near = world.nearestRich(p.x, p.y, ph.sensor);
            if (near) { p.target = near; p.charted = false; p.state = 'seek'; }
            else if (p.energy > 92 && world.chartNearest(p.x, p.y)) { p.state = 'seek'; }
            else if (!p.target || p.target.ore < 4) p.target = null;
          }
          break;
        }
      }

      // integrate (seek/mine/hold thrust)
      p.x += p.vx * dt; p.y += p.vy * dt;

      // soft world bounds — steer back toward center
      const m = 120;
      if (p.x < m) p.vx += (m - p.x) * 0.9 * dt;
      if (p.x > W - m) p.vx -= (p.x - (W - m)) * 0.9 * dt;
      if (p.y < m) p.vy += (m - p.y) * 0.9 * dt;
      if (p.y > W - m) p.vy -= (p.y - (W - m)) * 0.9 * dt;
    }
  }
}
