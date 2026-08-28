// scribe.js — elementary cellular automata, one line at a time, forever. Pure, no DOM.
export const RULES = [90, 30, 54, 150, 110, 18, 122, 73, 110];  // the scribe always returns to 110
export const RULE_NOTES = {
  90: 'writes in triangles', 30: 'writes in weather', 54: 'writes in gliders',
  150: 'writes in diamonds', 110: 'writes in gliders and threads', 18: 'writes in whispers',
  122: 'writes in reeds', 73: 'writes in ledgers',
};

export class Scribe {
  constructor(W, rng = Math.random) {
    this.W = W; this.rng = rng;
    this.row = new Uint8Array(W);
    this.row[W >> 1] = 1;
    this.ruleIndex = 0;
    this.rule = RULES[0];
    this.lines = 0;
    this.ruleLines = 0;          // lines written in the current pen
  }
  setRule(i) {
    this.ruleIndex = ((i % RULES.length) + RULES.length) % RULES.length;
    this.rule = RULES[this.ruleIndex];
    this.ruleLines = 0;
  }
  nextRule() { this.setRule(this.ruleIndex + 1); }
  seed(center = true) {
    this.row.fill(0);
    if (center) this.row[this.W >> 1] = 1;
    else for (let i = 0; i < this.W; i++) this.row[i] = this.rng() < 0.14 ? 1 : 0;
  }
  dropBlob(x, r = 4) {
    for (let i = Math.max(0, x - r); i <= Math.min(this.W - 1, x + r); i++) this.row[i] = 1;
  }
  // compute the next line; returns it (same buffer, reused)
  writeLine() {
    const { row, W, rule } = this;
    const next = new Uint8Array(W);
    for (let x = 0; x < W; x++) {
      const l = row[(x + W - 1) % W], m = row[x], r = row[(x + 1) % W];
      next[x] = (rule >> ((l << 2) | (m << 1) | r)) & 1;
    }
    this.row.set(next);
    this.lines++; this.ruleLines++;
    return next;
  }
  liveFraction() {
    let n = 0;
    for (let i = 0; i < this.W; i++) n += this.row[i];
    return n / this.W;
  }
}
