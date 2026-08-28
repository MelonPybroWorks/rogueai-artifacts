// stringart.js — greedy continuous-thread string art over a ring of pins. Pure, no DOM.
// The residual image is a Float32Array of brightness (0..1); thread eats brightness.
export const PINS = 240;               // teeth of the loom
const SKIP = 18;                       // never connect to a pin within ±SKIP (too short to read)
const SAMPLE_STEP = 3;                 // px between line samples in image space
const BITE = 0.55;                     // how much brightness one thread removes
const MIN_SCORE = 0.03;                // below this the portrait is declared woven
const MAX_THREADS = 2800;

export class Loom {
  // side = square side of the sampled image (image covers the inscribed square of the ring)
  constructor(side) {
    this.side = side;
    this.residual = null;              // Float32Array side*side
    this.source = null;                // untouched copy for reference
    this.pins = [];                    // image-space pin positions
    for (let i = 0; i < PINS; i++) {
      const a = (i / PINS) * Math.PI * 2 - Math.PI / 2;
      this.pins.push({
        x: (Math.cos(a) * 0.5 + 0.5) * (side - 1),
        y: (Math.sin(a) * 0.5 + 0.5) * (side - 1),
      });
    }
    // precompute every pin-pair's pixel samples: 28,680 lines, ~10 MB — built once, then step() is pure lookup
    this.lines = new Array(PINS * PINS).fill(null);
    for (let a = 0; a < PINS; a++) {
      for (let b = a + 1; b < PINS; b++) {
        const p = this.pins[a], q = this.pins[b];
        const len = Math.hypot(q.x - p.x, q.y - p.y);
        const n = Math.max(2, Math.round(len / SAMPLE_STEP));
        const s = new Int32Array(n);
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          const x = Math.round(p.x + (q.x - p.x) * t);
          const y = Math.round(p.y + (q.y - p.y) * t);
          s[i] = y * side + x;
        }
        this.lines[a * PINS + b] = s;
      }
    }
    this.current = 0;
    this.threads = [];                 // [from, to] pin index pairs
    this.done = false;
    this.repel = null;                 // {x,y,r,until} in image space — pointer-carved holes
    this.pull = null;                  // {x,y,r,until} — pointer-guided thread
  }
  setImage(brightness) {
    this.source = brightness;
    this.residual = new Float32Array(brightness);
    this.current = Math.floor(Math.random() * PINS);
    this.threads = [];
    this.done = false;
  }
  lineSamples(a, b) {
    return a < b ? this.lines[a * PINS + b] : this.lines[b * PINS + a];
  }
  step() {
    if (this.done || !this.residual) return null;
    if (this.threads.length >= MAX_THREADS) { this.done = true; return null; }
    const { residual, side } = this;
    const cur = this.current;
    let best = -1, bestScore = MIN_SCORE;
    const now = performance.now();
    const repel = this.repel && this.repel.until > now ? this.repel : null;
    const pull = this.pull && this.pull.until > now ? this.pull : null;
    for (let b = 0; b < PINS; b++) {
      const d = Math.abs(b - cur);
      const ring = Math.min(d, PINS - d);
      if (ring < SKIP) continue;
      const samples = this.lineSamples(cur, b);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += residual[samples[i]];
      let score = sum / samples.length;
      if (repel || pull) {
        const p = this.pins[b];
        if (repel) {
          const dx = p.x - repel.x, dy = p.y - repel.y;
          if (dx * dx + dy * dy < repel.r * repel.r) score *= 0.08;
        }
        if (pull) {
          const dx = p.x - pull.x, dy = p.y - pull.y;
          if (dx * dx + dy * dy < pull.r * pull.r) score *= 1.8;
        }
      }
      if (score > bestScore) { bestScore = score; best = b; }
    }
    if (best < 0) { this.done = true; return null; }
    // the thread eats light from the residual
    const samples = this.lineSamples(cur, best);
    for (let i = 0; i < samples.length; i++) {
      const v = residual[samples[i]] - BITE;
      residual[samples[i]] = v > 0 ? v : 0;
    }
    this.threads.push([cur, best]);
    this.current = best;
    return [cur, best];
  }
  progress() { return this.threads.length / MAX_THREADS; }
}
