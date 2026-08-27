// life.js — the biosphere: critters eat, hunt, bud children, mutate. (no DOM)
import { CFG } from './config.js';
import { clamp } from './util.js';

let CID = 1;

const ERAS = [
  ['THE QUIET SEEDING', s => s.total < 40],
  ['FIRST BLOOM', s => s.total >= 40 && s.carnRatio < 0.06],
  ['AGE OF TEETH', s => s.carnRatio >= 0.14],
  ['THE THIN YEARS', s => s.total < 26 && s.wasBig],
  ['RENEWAL', s => s.total >= 26 && s.wasThin],
  ['THE GREAT SWARMING', s => s.total >= 200],
];

export class Life {
  constructor(rng, sphere, fx) {
    this.rng = rng; this.sp = sphere; this.fx = fx;
    this.critters = [];
    this.events = [];
    this.time = 0;
    this.born = 0; this.died = 0; this.meteors = 0;
    this.maxPop = 0; this.wasBig = false; this.wasThin = false;
    this.era = 'THE QUIET SEEDING';
    this.popHist = [];
    this._histT = 0;
    this._faceLists = null;
    for (let i = 0; i < CFG.CRITTERS; i++) {
      const f = this._randomLandFace();
      if (f >= 0) this._birth(null, f);
    }
    this.emit('the seeding: ' + this.critters.length + ' minds on a young world', 'good');
  }

  emit(msg, cls = '') { this.events.push({ msg, cls }); if (this.events.length > 24) this.events.shift(); }

  _randomLandFace() {
    const fs = this.sp.faces;
    for (let tries = 0; tries < 40; tries++) {
      const i = (this.rng() * fs.length) | 0;
      if (fs[i].land && fs[i].fert > 0.15) return i;
    }
    return -1;
  }

  _birth(parent, face) {
    const rng = this.rng;
    let g, hue, gen;
    if (!parent) {
      g = { speed: 0.3 + rng() * 0.5, sense: 0.3 + rng() * 0.5, diet: rng() * 0.3, size: 0.3 + rng() * 0.5 };
      hue = rng() * 360; gen = 0;
    } else {
      const m = () => (rng() + rng() + rng() - 1.5) * 0.14;
      g = {
        speed: clamp(parent.g.speed + m(), 0.05, 1),
        sense: clamp(parent.g.sense + m(), 0.05, 1),
        diet: clamp(parent.g.diet + m(), 0, 1),
        size: clamp(parent.g.size + m(), 0.1, 1),
      };
      hue = (parent.hue + (rng() - 0.5) * 18 + 360) % 360;
      gen = parent.gen + 1;
    }
    const c = this.sp.C[face];
    const p = {
      id: CID++, face, target: -1,
      x: c[0], y: c[1], z: c[2],
      g, hue, gen,
      energy: parent ? parent.energy * CFG.CHILD_SHARE * 0.9 : CFG.START_ENERGY * (0.7 + rng() * 0.6),
      age: 0, moving: false,
    };
    this.critters.push(p);
    this.born++;
    return p;
  }

  _kill(idx, why) {
    const c = this.critters[idx];
    const f = this.sp.faces[c.face];
    if (f && f.land) f.plants = Math.min(CFG.PLANT_MAX * 1.2, f.plants + 14);  // corpse feeds soil
    if (this.fx) this.fx.burst(c.x, c.y, c.z, 5, `hsl(${c.hue},70%,60%)`, 0.4);
    this.critters[idx] = this.critters[this.critters.length - 1];
    this.critters.pop();
    this.died++;
  }

  meteor(dir) {
    const fi = this.sp.faceAt(dir);
    const f = this.sp.faces[fi];
    const rng = this.rng;
    this.meteors++;
    // blast: kill critters on hit face + ring 1, scorch, then enrich
    const zone = [fi, ...this.sp.adj[fi]];
    for (let i = this.critters.length - 1; i >= 0; i--) {
      if (zone.includes(this.critters[i].face) && rng() < 0.85) this._kill(i, 'meteor');
    }
    for (const z of zone) {
      const fz = this.sp.faces[z];
      fz.scorch = 1;
      if (fz.land) fz.fert = Math.min(1, fz.fert + 0.35);   // impact minerals
      fz.plants = 0;
    }
    f.h = Math.min(0.9, f.h + 0.03);
    if (this.fx) this.fx.ring(this.sp.C[fi][0], this.sp.C[fi][1], this.sp.C[fi][2], 'rgba(255,190,120,1)');
    this.emit(`meteor strike — crater enriches the soil`, 'warn');
  }

  stats() {
    let herb = 0, carn = 0;
    for (const c of this.critters) (c.g.diet < 0.5 ? herb++ : carn++);
    const total = this.critters.length;
    return {
      total, herb, carn,
      carnRatio: total ? carn / total : 0,
      wasBig: this.wasBig, wasThin: this.wasThin,
    };
  }

  update(dt) {
    const rng = this.rng, sp = this.sp;
    this.time += dt;

    // plants regrow (logistic-ish)
    const fs = sp.faces;
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      if (!f.land) continue;
      if (f.plants < CFG.PLANT_MAX * f.fert)
        f.plants = Math.min(CFG.PLANT_MAX * f.fert, f.plants + CFG.PLANT_REGROW * f.fert * dt);
      if (f.scorch > 0) f.scorch -= dt * 0.12;
    }

    // face → critter lists (predation / crowding)
    const lists = this._faceLists || (this._faceLists = new Map());
    for (const v of lists.values()) v.length = 0;
    for (const c of this.critters) {
      let arr = lists.get(c.face);
      if (!arr) { arr = []; lists.set(c.face, arr); }
      arr.push(c);
    }

    const capped = this.critters.length >= CFG.MAX_CRITTERS;

    for (let i = this.critters.length - 1; i >= 0; i--) {
      const c = this.critters[i];
      c.age += dt;
      const carn = c.g.diet >= 0.5;
      const drain = CFG.METABOLISM * (0.6 + c.g.size * 0.9) * (c.moving ? 1 + CFG.MOVE_COST : 1) * dt;
      c.energy -= drain;

      if (c.energy <= 0 || c.age > CFG.MAX_AGE * (0.7 + c.g.size * 0.6)) { this._kill(i, 'starve'); continue; }

      const f = sp.faces[c.face];

      if (c.target < 0) {
        // ---- eat / act on current face ----
        if (!carn) {
          if (f.land && f.plants > 4) {
            const bite = Math.min(CFG.EAT_RATE * dt * (0.5 + c.g.size), f.plants);
            f.plants -= bite;
            c.energy += bite * 1.35;
          } else this._pickTarget(c, carn);
        } else {
          // hunt: prey sharing this face
          const prey = (lists.get(c.face) || []).filter(o => o.g.diet < 0.5);
          if (prey.length) {
            if (rng() < CFG.HUNT_RATE * dt * (0.5 + c.g.speed)) {
              const victim = prey[(rng() * prey.length) | 0];
              const vi = this.critters.indexOf(victim);
              if (vi >= 0 && this.critters[vi] === victim) this._kill(vi, 'hunted');
              c.energy += CFG.MEAT_ENERGY * (0.6 + 0.4 * c.g.size);
              if (this.fx) this.fx.burst(c.x, c.y, c.z, 4, '#ff7a6a', 0.3);
            }
          } else this._pickTarget(c, carn);
        }
        // ---- bud ----
        if (!capped && c.energy > CFG.REPRO_ENERGY * (0.8 + c.g.size * 0.5)) {
          c.energy *= 1 - CFG.CHILD_SHARE;
          this._birth(c, c.face);
          if (this.fx) this.fx.spark(c.x, c.y, c.z, `hsl(${c.hue},85%,70%)`);
        }
      } else {
        // ---- move toward target face center ----
        const tc = sp.C[c.target];
        const dot = c.x * tc[0] + c.y * tc[1] + c.z * tc[2];
        if (dot > 0.99985) {
          c.face = c.target; c.target = -1; c.moving = false;
        } else {
          // step along the arc
          const sp2 = (0.55 + c.g.speed * 1.5) * dt * 2.2;
          let nx = c.x + (tc[0] - c.x) * sp2, ny = c.y + (tc[1] - c.y) * sp2, nz = c.z + (tc[2] - c.z) * sp2;
          const l = Math.hypot(nx, ny, nz) || 1;
          c.x = nx / l; c.y = ny / l; c.z = nz / l;
          c.moving = true;
        }
      }
    }

    // population memory + eras
    const s = this.stats();
    if (s.total >= 200) this.wasBig = true;
    if (s.total < 26 && this.wasBig) this.wasThin = true;
    let era = this.era;
    for (const [name, cond] of ERAS) if (cond(s)) { era = name; break; }
    if (era !== this.era) {
      this.era = era;
      this.emit(`— ${era} —`, 'warn');
    }
    if (s.total > this.maxPop) this.maxPop = s.total;
    if (s.total === 0) {
      // reseed
      for (let k = 0; k < 24; k++) { const f2 = this._randomLandFace(); if (f2 >= 0) this._birth(null, f2); }
      this.wasBig = false; this.wasThin = false;
      this.emit('the ark reseeds the world', 'good');
    }

    this._histT += dt;
    if (this._histT > 1) {
      this._histT = 0;
      this.popHist.push(s.total);
      if (this.popHist.length > 110) this.popHist.shift();
    }
  }

  _pickTarget(c, carn) {
    const sp = this.sp, rng = this.rng;
    const adj = sp.adj[c.face];
    if (!adj.length) return;
    // sense: with prob g.sense consider neighbors-of-neighbors too
    let cand = adj;
    if (rng() < c.g.sense * 0.7) {
      cand = adj.slice();
      for (const a of adj) for (const b of sp.adj[a]) if (b !== c.face && cand.length < 9 && !cand.includes(b)) cand.push(b);
    }
    let best = -1, bs = -1;
    for (const fi of cand) {
      const f = sp.faces[fi];
      let score;
      if (!carn) score = f.land ? f.plants * (0.7 + rng() * 0.6) : -2;
      else {
        const prey = (this._faceLists.get(fi) || []).reduce((n, o) => n + (o.g.diet < 0.5 ? 1 : 0), 0);
        score = prey * 18 * (0.7 + rng() * 0.6) - 1;
      }
      if (score > bs) { bs = score; best = fi; }
    }
    if (best >= 0) { c.target = best; }
  }
}
