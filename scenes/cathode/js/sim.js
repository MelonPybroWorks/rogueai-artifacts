// sim.js — Wireworld: the simplest machine that still dreams.
// states: 0 empty · 1 conductor · 2 electron head · 3 electron tail
// rules:  head→tail · tail→wire · wire→head iff 1 or 2 of 8 neighbors are heads
export const EMPTY = 0, WIRE = 1, HEAD = 2, TAIL = 3;

export class WW {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.cells = new Uint8Array(W * H);
    this.next = new Uint8Array(W * H);
    this.gen = 0;
    this.sparks = 0;          // live head count (HUD + ghost decisions)
  }

  load(blueprint) {
    this.cells.set(blueprint);
    this.gen = 0;
    this._count();
  }

  _count() {
    let n = 0;
    const c = this.cells;
    for (let i = 0; i < c.length; i++) if (c[i] === HEAD) n++;
    this.sparks = n;
  }

  step() {
    const { W, H, cells: c, next: n } = this;
    let heads = 0;
    for (let y = 1; y < H - 1; y++) {
      const row = y * W;
      for (let x = 1; x < W - 1; x++) {
        const i = row + x;
        const s = c[i];
        if (s === EMPTY) { n[i] = EMPTY; continue; }
        if (s === HEAD) { n[i] = TAIL; heads++; continue; }
        if (s === TAIL) { n[i] = WIRE; continue; }
        // WIRE: count head neighbors
        const h = (c[i - W - 1] === HEAD) + (c[i - W] === HEAD) + (c[i - W + 1] === HEAD) +
                  (c[i - 1] === HEAD) + (c[i + 1] === HEAD) +
                  (c[i + W - 1] === HEAD) + (c[i + W] === HEAD) + (c[i + W + 1] === HEAD);
        if (h === 1 || h === 2) { n[i] = HEAD; heads++; }
        else n[i] = WIRE;
      }
    }
    // borders stay empty
    for (let x = 0; x < W; x++) { n[x] = EMPTY; n[(H - 1) * W + x] = EMPTY; }
    for (let y = 0; y < H; y++) { n[y * W] = EMPTY; n[y * W + W - 1] = EMPTY; }
    this.cells.set(n);
    this.sparks = heads;
    this.gen++;
  }

  // silence: clear all sparks, keep the metal
  hush() {
    const c = this.cells;
    for (let i = 0; i < c.length; i++) if (c[i] === HEAD || c[i] === TAIL) c[i] = WIRE;
    this.sparks = 0;
  }
}
