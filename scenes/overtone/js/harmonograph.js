// harmonograph.js — four damped pendulums driving one pen. Pure, no DOM.
// X(t) = sin(f·t) + sin(2.01f·t);  Y(t) = sin(r·f·t + φ) + sin(2.005r·f·t) — all × e^{−d·t}.
// The near-integer detunings make the rosette precess; the damping ends the figure.

export const LADDER = [
  { name: 'UNISON', r: 1.0 },
  { name: 'THE OCTAVE', r: 2.0 },
  { name: 'THE FIFTH', r: 1.5 },
  { name: 'THE FOURTH', r: 4 / 3 },
  { name: 'THE THIRD', r: 1.25 },
  { name: 'THE SIXTH', r: 5 / 3 },
  { name: 'THE SEVENTH', r: 7 / 4 },
  { name: 'THE TRITONE', r: 45 / 32 },   // the devil's interval — the wildest figure
];

export class Harmonograph {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.ladderIndex = 2;                 // start on the fifth
    this.newFigure();
    this.figures = 0;
  }
  newFigure() {
    const { rng } = this;
    const L = LADDER[this.ladderIndex];
    const f = 5.5 + rng() * 1.5;          // ~1 Hz pen
    this.f = f;
    this.r = L.r;
    this.phi = rng() * Math.PI * 2;       // phase between axes
    this.detuneA = 2.0 + (rng() - 0.5) * 0.02;
    this.detuneB = 2.0 + (rng() - 0.5) * 0.02;
    this.d = 1 / (18 + rng() * 8);        // figure completes in ~60-90 s
    this.t0 = 0;
    this.t = 0;
    this.done = false;
  }
  next() { this.ladderIndex = (this.ladderIndex + 1) % LADDER.length; this.newFigure(); this.figures++; }
  pick(i) { this.ladderIndex = ((i % LADDER.length) + LADDER.length) % LADDER.length; this.newFigure(); }
  energy() { return Math.exp(-this.d * this.t); }
  pos(out) {
    const { f, r, phi, detuneA, detuneB } = this;
    const e = Math.exp(-this.d * this.t);
    const t = this.t;
    const x = (Math.sin(f * t) + Math.sin(detuneA * f * t)) * 0.5 * e;
    const y = (Math.sin(r * f * t + phi) + Math.sin(detuneB * r * f * t)) * 0.5 * e;
    out.x = x * 0.46;   // centered, ~[-0.46, 0.46] — renderer maps by height
    out.y = y * 0.46;
    return out;
  }
  advance(dt) {
    this.t += dt;
    if (!this.done && this.energy() < 0.035) this.done = true;
    return !this.done;
  }
}
