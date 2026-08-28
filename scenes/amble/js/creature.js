// creature.js — verlet soft body built from a genome. Pure, no DOM.
// Convention: world y is DOWN-positive; ground is below; "up" is -y.
const TAU = Math.PI * 2;
const GRAV = 0.32;      // px / step^2 (step = 1/60 s)
const AIR = 0.996;      // velocity retention in air
const FRIC = 0.42;      // horizontal velocity retention on ground contact
const ITERS = 7;        // constraint relaxation passes per step

export class Creature {
  constructor(genome, x0, world, ghost = false) {
    this.genome = genome;
    this.ghost = ghost;
    const pts = genome.nodes.map(n => ({
      x: (n.x - 0.5) * 56, y: -n.y * 46 - 4, ox: 0, oy: 0, im: 1 / n.m,
    }));
    // enforce a minimum separation so rest lengths never vanish
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
        if (dx * dx + dy * dy < 25) { pts[j].x += (dx >= 0 ? 1 : -1) * 3; pts[j].y -= 3; }
      }
    }
    // rest at x0 with the lowest point 2px above the ground
    let maxY = -Infinity;
    for (const p of pts) maxY = Math.max(maxY, p.y);
    const gy = world.groundY(x0);
    for (const p of pts) { p.x += x0; p.y += (gy - 2) - maxY; p.ox = p.x; p.oy = p.y; }
    this.pts = pts;
    this.edges = genome.edges.map(e => {
      const a = pts[e.a], b = pts[e.b];
      const l0 = Math.hypot(b.x - a.x, b.y - a.y) || 4;
      return { a: e.a, b: e.b, l0, rest: l0, st: e.st, mu: e.mu, amp: e.amp, ph: e.ph, fr: e.fr };
    });
    this.x0 = x0;
    this.maxCX = x0;
    this.hSum = 0; this.hN = 0;
    this.contactN = 0; this.contact = 0;
    this.dead = false;
    this.cx = x0; this.cy = gy - 20;
    this._tick = 0;
  }

  step(t, world) {
    if (this.dead) return;
    const pts = this.pts;
    for (const p of pts) {
      const vx = (p.x - p.ox) * AIR, vy = (p.y - p.oy) * AIR;
      p.ox = p.x; p.oy = p.y;
      p.x += vx;
      p.y += vy + GRAV;
    }
    for (const e of this.edges) {
      if (e.mu) e.rest = e.l0 * (1 + e.amp * Math.sin(e.ph + TAU * e.fr * t));
    }
    for (let k = 0; k < ITERS; k++) {
      for (const e of this.edges) {
        const p1 = pts[e.a], p2 = pts[e.b];
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const diff = (d - e.rest) / d * e.st;
        const ws = p1.im + p2.im, w1 = p1.im / ws, w2 = p2.im / ws;
        p1.x += dx * diff * w1; p1.y += dy * diff * w1;
        p2.x -= dx * diff * w2; p2.y -= dy * diff * w2;
      }
    }
    let cx = 0, cy = 0, bad = false;
    for (const p of pts) {
      const gy = world.groundY(p.x);
      if (p.y > gy) {
        p.y = gy;
        const vx = p.x - p.ox;
        p.x = p.ox + vx * FRIC;
        p.oy = p.y;
        this.contact++;
      }
      this.contactN++;
      cx += p.x; cy += p.y;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) bad = true;
    }
    if (bad) { this.dead = true; return; }
    cx /= pts.length; cy /= pts.length;
    this.cx = cx; this.cy = cy;
    if (cx > this.maxCX) this.maxCX = cx;
    if (++this._tick % 20 === 0) {
      this.hSum += Math.max(0, world.groundY(cx) - cy) / 50;
      this.hN++;
    }
  }

  fitness() {
    if (this.dead) return 0;
    const dist = Math.max(0, (this.maxCX - this.x0) / 50);
    const hb = this.hN ? Math.min(0.6, 0.25 * (this.hSum / this.hN)) : 0;
    return dist + hb;
  }
}
