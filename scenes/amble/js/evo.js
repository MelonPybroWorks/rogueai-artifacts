// evo.js — the population: timed trials, tournament selection, champion ghost. Pure, no DOM.
import { randomGenome, mutate, crossover, cloneGenome } from './genome.js';
import { Creature } from './creature.js';

const SIZE = 40, ELITES = 3, IMMIGRANTS = 2, TOURN = 3;
export const TRIAL = 16;   // seconds of walking per generation
export const X0 = 0;       // spawn line

export class Population {
  constructor(world, rng) {
    this.world = world;
    this.rng = rng;
    this.gen = 1;
    this.genomes = [];
    for (let i = 0; i < SIZE; i++) this.genomes.push(randomGenome(rng));
    this.history = [];
    this.bestEver = { fit: -1, genome: null };
    this.champion = null;
    this.t = 0;
    this.stall = 0;
    this.leaderMark = 0;
    this.mutRate = 1;
    this.gensSinceBest = 0;
    this.onEvent = () => {};
    this.spawnAll();
  }
  reset(rng) {
    this.rng = rng || this.rng;
    this.gen = 1;
    this.genomes = [];
    for (let i = 0; i < SIZE; i++) this.genomes.push(randomGenome(this.rng));
    this.history = [];
    this.bestEver = { fit: -1, genome: null };
    this.mutRate = 1;
    this.gensSinceBest = 0;
    this.t = 0; this.stall = 0;
    this.spawnAll();
  }
  spawnAll() {
    this.creatures = this.genomes.map(g => new Creature(g, X0, this.world));
    this.champion = this.bestEver.genome ? new Creature(this.bestEver.genome, X0, this.world, true) : null;
    this.leaderMark = -1;
  }
  leader() {
    let best = null, bx = -Infinity;
    for (const c of this.creatures) if (!c.dead && c.maxCX > bx) { bx = c.maxCX; best = c; }
    return best;
  }
  step() {
    this.t += 1 / 60;
    for (const c of this.creatures) c.step(this.t, this.world);
    if (this.champion) this.champion.step(this.t, this.world);
    this._sec = (this._sec || 0) + 1;
    if (this._sec >= 60) {
      this._sec = 0;
      const lead = this.leader();
      const mark = lead ? lead.maxCX : 0;
      if (mark - this.leaderMark < 2) this.stall++; else this.stall = 0;
      this.leaderMark = mark;
    }
    if (this.t >= TRIAL || (this.stall >= 4 && this.t > 8)) this.endTrial();
  }
  endTrial() {
    const fits = this.creatures.map(c => c.fitness());
    const order = fits.map((f, i) => i).sort((a, b) => fits[b] - fits[a]);
    const best = fits[order[0]];
    const mean = fits.reduce((s, f) => s + f, 0) / fits.length;
    this.history.push({ gen: this.gen, best: +best.toFixed(3), mean: +mean.toFixed(3) });
    if (this.history.length > 600) this.history.shift();
    let newChamp = false;
    if (best > this.bestEver.fit) {
      this.bestEver = { fit: best, genome: cloneGenome(this.genomes[order[0]]) };
      newChamp = true;
      this.gensSinceBest = 0;
    } else this.gensSinceBest++;
    let surge = false;
    if (this.gensSinceBest > 20 && this.mutRate < 1.5) { this.mutRate = 1.8; surge = true; }
    else if (this.gensSinceBest === 0) this.mutRate = 1;
    const leveled = this.world.escalate(this.bestEver.fit);
    this.onEvent('gen', { gen: this.gen, best, mean, newChamp, leveled, surge, level: this.world.level });
    const next = [];
    for (let k = 0; k < ELITES; k++) next.push(cloneGenome(this.genomes[order[k]]));
    for (let k = 0; k < IMMIGRANTS; k++) next.push(randomGenome(this.rng));
    const tourn = () => {
      let bi = Math.floor(this.rng() * SIZE), bf = fits[bi];
      for (let k = 1; k < TOURN; k++) {
        const i = Math.floor(this.rng() * SIZE);
        if (fits[i] > bf) { bf = fits[i]; bi = i; }
      }
      return this.genomes[bi];
    };
    while (next.length < SIZE) {
      const p1 = tourn(), p2 = tourn();
      let child = this.rng() < 0.6 ? crossover(p1, p2, this.rng) : cloneGenome(p1);
      child = mutate(child, this.rng, this.mutRate);
      next.push(child);
    }
    this.genomes = next;
    this.gen++;
    this.t = 0; this.stall = 0; this._sec = 0;
    this.spawnAll();
  }
}
