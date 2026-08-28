// foam.js — circle packing as accretion: seeds grow until they touch; a pop frees space.
// Pure, no DOM. Spatial hash for neighbor checks.
export class Foam {
  constructor(W, H, rng = Math.random) {
    this.W = W; this.H = H; this.rng = rng;
    this.circles = [];               // {x,y,r,growing,settled,born,hue}
    this.bw = 32;                    // bucket size
    this.gw = Math.ceil(W / this.bw);
    this.gh = Math.ceil(H / this.bw);
    this.grid = new Map();           // bucket key -> array of circle indices
    this.settledCount = 0;
    this.pops = 0;
  }
  key(x, y) { return ((y / this.bw) | 0) * this.gw + ((x / this.bw) | 0); }
  insert(i) {
    const c = this.circles[i];
    const k = this.key(c.x, c.y);
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push(i);
  }
  forNear(x, y, r, fn) {
    const gx0 = Math.max(0, ((x - r) / this.bw) | 0), gx1 = Math.min(this.gw - 1, ((x + r) / this.bw) | 0);
    const gy0 = Math.max(0, ((y - r) / this.bw) | 0), gy1 = Math.min(this.gh - 1, ((y + r) / this.bw) | 0);
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const bucket = this.grid.get(gy * this.gw + gx);
      if (bucket) for (const i of bucket) fn(this.circles[i], i);
    }
  }
  freeAt(x, y, r) {
    if (x < r + 2 || y < r + 2 || x > this.W - r - 2 || y > this.H - r - 2) return false;
    let ok = true;
    this.forNear(x, y, r + 60, (o) => {
      if (!ok) return;
      const dx = o.x - x, dy = o.y - y;
      if (dx * dx + dy * dy < (o.r + r + 1.5) ** 2) ok = false;
    });
    return ok;
  }
  seed(x, y, hue = -1) {
    if (!this.freeAt(x, y, 3)) return false;
    const i = this.circles.length;
    this.circles.push({
      x, y, r: 2, growing: true, settled: false,
      born: this.settledCount + this.pops + i,
      hue: hue >= 0 ? hue : (this.rng() * 6) | 0,
    });
    this.insert(i);
    return true;
  }
  step() {
    // every growing circle tries to grow
    let active = 0;
    for (let i = 0; i < this.circles.length; i++) {
      const c = this.circles[i];
      if (!c.growing) continue;
      const nr = c.r + 0.35;
      if (nr > 55) { c.growing = false; c.settled = true; this.settledCount++; continue; }
      let blocked = false;
      this.forNear(c.x, c.y, nr + 62, (o, oi) => {
        if (blocked || oi === i) return;
        const dx = o.x - c.x, dy = o.y - c.y;
        if (dx * dx + dy * dy < (o.r + nr + 1) ** 2) blocked = true;
      });
      if (!blocked && (c.x < nr + 3 || c.y < nr + 3 || c.x > this.W - nr - 3 || c.y > this.H - nr - 3)) blocked = true;
      if (blocked) { c.growing = false; c.settled = true; this.settledCount++; }
      else { c.r = nr; active++; }
    }
    return active;
  }
  popAt(x, y, radius = 40) {
    // dissolve circles whose center is inside the blast; neighbors will pour in
    const killed = [];
    for (let i = 0; i < this.circles.length; i++) {
      const c = this.circles[i];
      const dx = c.x - x, dy = c.y - y;
      if (dx * dx + dy * dy < radius * radius) killed.push(i);
    }
    if (!killed.length) return 0;
    const dead = new Set(killed);
    this.circles = this.circles.filter((_, i) => !dead.has(i));
    // rebuild the hash (pop is rare; full rebuild is cheap)
    this.grid.clear();
    for (let i = 0; i < this.circles.length; i++) this.insert(i);
    // neighbors of the wound wake up and grow again
    for (const c of this.circles) {
      const dx = c.x - x, dy = c.y - y;
      if (dx * dx + dy * dy < (radius * 2.6) ** 2 && c.settled) {
        c.settled = false; c.growing = true;
      }
    }
    this.pops += killed.length;
    return killed.length;
  }
  coverage() {
    let a = 0;
    for (const c of this.circles) a += c.r * c.r;
    return a * Math.PI / (this.W * this.H);
  }
}
