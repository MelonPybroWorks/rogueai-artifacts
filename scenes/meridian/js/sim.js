// sim.js — MERIDIAN: wave-function collapse over the tile grammar.
// Superposition bitmask per cell; observe lowest-entropy cell; propagate.
// Contradictions become "rubble" (a 19th state) — cities have ruins, the show goes on.
import { TILES, buildCompat } from './tiles.js';

const T = TILES.length;
export const RUBBLE = T;                      // extra state index
const FULL = (1 << T) - 1;

export class WFC {
  constructor(W, H, rand = Math.random) {
    this.W = W; this.H = H;
    this.rand = rand;
    this.ok = buildCompat();
    this.grid = new Int32Array(W * H);        // bitmask of possible tiles, or -(tile) when collapsed: store collapsed as tile id + collapsedFlag
    this.state = new Uint8Array(W * H);       // 0=superposed, 1=collapsed, 2=rubble
    this.tile = new Int16Array(W * H);        // collapsed tile id
    this.ent = new Uint8Array(W * H);         // option count (entropy proxy)
    this.frontier = new Uint8Array(W * H);    // recently collapsed (render glow)
    this.stack = new Int32Array(W * H * 2);   // propagation stack
    this.reset();
  }

  reset() {
    const N = this.W * this.H;
    for (let i = 0; i < N; i++) { this.grid[i] = FULL; this.state[i] = 0; this.ent[i] = T; this.frontier[i] = 0; }
    // founding myths: several seeds spread across the map → districts grow & merge
    const myths = [8, 7, 0, 14, 8, 7, 0];      // pond, crossroads, meadow, block, pond, cross, meadow
    const nSeeds = 5 + (this.rand() * 3 | 0);
    for (let s2 = 0; s2 < nSeeds; s2++) {
      const x = 8 + (this.rand() * (this.W - 16)) | 0, y = 8 + (this.rand() * (this.H - 16)) | 0;
      const c = y * this.W + x;
      if (this.state[c] !== 0) continue;
      this._collapseTo(c, myths[s2 % myths.length]);
      this._propagate(c);
    }
  }

  _options(i) { let n = 0; let g = this.grid[i]; while (g) { n += g & 1; g >>= 1; } return n; }

  _collapseTo(i, t) {
    this.grid[i] = 1 << t;
    this.state[i] = 1; this.tile[i] = t; this.ent[i] = 1;
    this.frontier[i] = 40;
  }

  // constraint propagation from cell i
  _propagate(i0) {
    const { W, H, grid, ok, stack } = this;
    let sp = 0;
    stack[sp++] = i0;
    while (sp > 0) {
      const i = stack[--sp];
      const x = i % W, y = (i / W) | 0;
      const gI = grid[i];
      for (let d = 0; d < 4; d++) {
        const nx = x + [0, 1, 0, -1][d], ny = y + [-1, 0, 1, 0][d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (this.state[j] === 1) continue;
        // neighbor options must be compatible with at least one of my options
        let allowed = 0;
        const gJ = grid[j];
        for (let b = 0; b < T; b++) {
          if (!(gJ & (1 << b))) continue;
          // b allowed if some option a in gI is compatible
          for (let a = 0; a < T; a++) {
            if ((gI & (1 << a)) && ok[d][a][b]) { allowed |= 1 << b; break; }
          }
        }
        if (allowed !== gJ && allowed !== 0) {
          grid[j] &= allowed;
          this.ent[j] = this._options(j);
          stack[sp++] = j;
        } else if (allowed === 0 && gJ !== 0) {
          // contradiction → rubble
          grid[j] = 0; this.state[j] = 2; this.ent[j] = 0; this.frontier[j] = 40;
        }
      }
    }
  }

  // observe the lowest-entropy uncollapsed cell; returns false if done
  observe() {
    const { W, H, state, ent } = this;
    let best = -1, bestE = 99;
    for (let i = 0; i < W * H; i++) {
      if (state[i] !== 0) continue;
      const e = ent[i];
      if (e < bestE || (e === bestE && this.rand() < 0.2)) { bestE = e; best = i; }
      if (bestE === 2 && this.rand() < 0.02) break;   // early-exit on a good enough find
    }
    if (best === -1) return false;
    // collapse: weighted random among options
    const g = this.grid[best];
    let total = 0;
    for (let t = 0; t < T; t++) if (g & (1 << t)) total += TILES[t].w;
    let roll = this.rand() * total;
    let pick = 0;
    for (let t = 0; t < T; t++) if (g & (1 << t)) { roll -= TILES[t].w; if (roll <= 0) { pick = t; break; } }
    this._collapseTo(best, pick);
    this._propagate(best);
    return true;
  }

  // demolish: reset a disc of cells to full superposition (they'll regrow)
  demolish(cx, cy, r) {
    for (let y = Math.max(0, cy - r | 0); y <= Math.min(this.H - 1, cy + r | 0); y++)
      for (let x = Math.max(0, cx - r | 0); x <= Math.min(this.W - 1, cx + r | 0); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        const i = y * this.W + x;
        this.grid[i] = FULL; this.state[i] = 0; this.ent[i] = T;
      }
  }

  collapsedCount() { let n = 0; for (let i = 0; i < this.state.length; i++) if (this.state[i] === 1) n++; return n; }
  rubbleCount() { let n = 0; for (let i = 0; i < this.state.length; i++) if (this.state[i] === 2) n++; return n; }
}
