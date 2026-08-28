// turmites.js — Langton's ants with multi-state rules on a shared torus. Pure, no DOM.
// Rule string over L/R/N/U turns; each ant: read state → turn → write (s+1)%K → step.
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];   // E S W N

export const RULESETS = [
  { rule: 'RL', name: 'the classic' },          // chaos → highway
  { rule: 'LLRR', name: 'the crystal' },        // dense cardioid blob
  { rule: 'RLR', name: 'the tangle' },          // chaotic fill
  { rule: 'LRRRLR', name: 'the labyrinth' },    // nested structure
];
const TURN = { L: -1, R: 1, N: 0, U: 2 };

export class Board {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.cell = new Uint8Array(W * H);
    this.ants = [];
    this.steps = 0;
  }
  addAnt(x, y, rulesetIdx) {
    const rs = RULESETS[rulesetIdx % RULESETS.length];
    this.ants.push({
      x: x | 0, y: y | 0, dir: (Math.random() * 4) | 0,
      rule: rs.rule.split('').map(c => TURN[c]),
      K: rs.rule.length,
      rs: rulesetIdx % RULESETS.length,
    });
  }
  step(n = 12) {
    const { cell, W, H } = this;
    for (let k = 0; k < n; k++) {
      for (const a of this.ants) {
        const i = a.y * W + a.x;
        const s = cell[i];
        a.dir = (a.dir + a.rule[s % a.K] + 4) & 3;
        cell[i] = (s + 1) % a.K;
        a.x = (a.x + DX[a.dir] + W) % W;
        a.y = (a.y + DY[a.dir] + H) % H;
      }
      this.steps++;
    }
  }
  fill() {
    let n = 0;
    for (let i = 0; i < this.cell.length; i++) if (this.cell[i]) n++;
    return n / this.cell.length;
  }
}
