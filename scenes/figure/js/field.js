// field.js — Chladni square-plate eigenfield. Pure, no DOM.
// A(x,y) = |cos(nπx)cos(mπy) − cos(mπx)cos(nπy)| over x,y ∈ [0,1]².
// Sand settles where A ≈ 0 — the nodal lines are the figure.

export const MODES = [
  // [n, m] — curated ladder, low to high songs
  [1, 2], [2, 3], [1, 4], [3, 4], [2, 5], [1, 6], [4, 5], [3, 7], [5, 6],
];

export class Field {
  constructor() {
    this.modeIndex = 0;
    this.n = 1; this.m = 2;
    // press: a fingertip on the plate — local extra amplitude, grains flee it
    this.press = null;   // {x, y, r, until}
  }
  setMode(i) {
    const k = ((i % MODES.length) + MODES.length) % MODES.length;
    this.modeIndex = k;
    [this.n, this.m] = MODES[k];
  }
  nextMode() { this.setMode(this.modeIndex + 1); }
  // amplitude at unit-square coords
  at(x, y) {
    const { n, m } = this;
    const a = Math.abs(Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y) -
                       Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y));
    if (this.press) {
      const dx = x - this.press.x, dy = y - this.press.y;
      const d2 = dx * dx + dy * dy, r2 = this.press.r * this.press.r;
      if (d2 < r2) return Math.min(1.6, a + this.press.amp * Math.exp(-d2 / (r2 * 0.35)));
    }
    return a;
  }
  // tick press expiry — call once per frame
  tick(now) {
    if (this.press && this.press.until < now) this.press = null;
  }
}
