// sim.js — PYRE: falling-sand alchemy. Uint8 materials + Uint8 life, in-place.
// Update order: bottom-up for fallers, top-down for risers; per-step stamp
// prevents double moves; horizontal bias alternates per row per step.
export const EMPTY = 0, STONE = 1, SAND = 2, WATER = 3, OIL = 4, WOOD = 5,
             FIRE = 6, LAVA = 7, ACID = 8, STEAM = 9, SMOKE = 10;

export const MAT_NAME = ['empty', 'stone', 'sand', 'water', 'oil', 'wood', 'fire', 'lava', 'acid', 'steam', 'smoke'];

export class Pyre {
  constructor(W, H, rand = Math.random) {
    this.W = W; this.H = H;
    this.m = new Uint8Array(W * H);
    this.life = new Uint8Array(W * H);   // fire ttl · wood fuel · steam/smoke ttl · acid charge
    this.stamp = new Uint16Array(W * H); // moved-this-step marker
    this.stepId = 0;
    this.rand = rand;
    this.dirFlip = new Uint8Array(H);
  }

  clear() { this.m.fill(0); this.life.fill(0); }

  paint(x, y, r, mat) {
    const { W, H, m, life } = this;
    for (let yy = Math.max(0, y - r | 0); yy <= Math.min(H - 1, y + r | 0); yy++)
      for (let xx = Math.max(0, x - r | 0); xx <= Math.min(W - 1, x + r | 0); xx++) {
        const d2 = (xx - x) ** 2 + (yy - y) ** 2;
        if (d2 > r * r) continue;
        if (mat !== STONE && mat !== WOOD && this.rand() < d2 / (r * r) * 0.55) continue; // ragged edges for powders
        const i = yy * W + xx;
        m[i] = mat;
        life[i] = this.initLife(mat);
      }
  }

  erase(x, y, r) { this.paint(x, y, r, EMPTY); }

  initLife(mat) {
    const R = this.rand;
    if (mat === FIRE) return 18 + (R() * 22 | 0);
    if (mat === WOOD) return 0;                       // 0 = unburnt
    if (mat === LAVA) return 255;
    if (mat === STEAM) return 90 + (R() * 120 | 0);
    if (mat === SMOKE) return 60 + (R() * 90 | 0);
    if (mat === ACID) return 90;
    return 0;
  }

  // swap helper
  _sw(i, j) {
    const { m, life, stamp } = this;
    const tm = m[i]; m[i] = m[j]; m[j] = tm;
    const tl = life[i]; life[i] = life[j]; life[j] = tl;
    stamp[j] = this.stepId;
  }

  step() {
    const { W, H, m, life, stamp, rand } = this;
    this.stepId = (this.stepId + 1) & 0xffff;
    const sid = this.stepId;
    for (let y = 0; y < H; y++) this.dirFlip[y] = (rand() * 2) | 0;

    // ---- fallers & statics & fire: bottom-up ----
    for (let y = H - 2; y >= 1; y--) {
      const row = y * W;
      const flip = this.dirFlip[y];
      for (let k = 1; k < W - 1; k++) {
        const x = flip ? W - 1 - k : k;
        const i = row + x;
        if (stamp[i] === sid) continue;
        const mat = m[i];
        if (mat === EMPTY || mat === STONE) continue;

        if (mat === SAND) {
          const dn = i + W;
          const dnMat = m[dn];
          if (dnMat === EMPTY || dnMat === WATER || dnMat === OIL || dnMat === ACID) { this._sw(i, dn); stamp[dn] = sid; continue; }
          const d = flip ? -1 : 1;
          const d1 = dn + d, d2 = dn - d;
          const m1 = m[d1], m2 = m[d2];
          if (m1 === EMPTY || m1 === WATER || m1 === OIL) { this._sw(i, d1); stamp[d1] = sid; continue; }
          if (m2 === EMPTY || m2 === WATER || m2 === OIL) { this._sw(i, d2); stamp[d2] = sid; continue; }
        }
        else if (mat === WATER || mat === ACID || mat === OIL) {
          const dn = i + W;
          if (mat === OIL && m[i - W] === WATER) { this._sw(i, i - W); stamp[i - W] = sid; continue; } // oil bubbles up through water
          if (m[dn] === EMPTY || (mat !== OIL && m[dn] === FIRE)) { this._sw(i, dn); stamp[dn] = sid; continue; }
          const d = flip ? -1 : 1;
          const d1 = dn + d, d2 = dn - d;
          if (m[d1] === EMPTY) { this._sw(i, d1); stamp[d1] = sid; continue; }
          if (m[d2] === EMPTY) { this._sw(i, d2); stamp[d2] = sid; continue; }
          // sideways dispersion (oil & acid are viscous); needs clear path
          const spread = (mat === OIL || mat === ACID) ? 2 : 4;
          for (let s2 = 1; s2 <= spread; s2++) {
            const t = i + d * s2;
            if (m[t] !== EMPTY) break;
            if (s2 === spread) { this._sw(i, t); stamp[t] = sid; }
          }
        }
        else if (mat === LAVA) {
          if (rand() < 0.45) continue;                          // sluggish but molten
          const dn = i + W;
          if (m[dn] === EMPTY) { this._sw(i, dn); stamp[dn] = sid; continue; }
          const d = flip ? -1 : 1;
          const d1 = dn + d;
          if (m[d1] === EMPTY) { this._sw(i, d1); stamp[d1] = sid; continue; }
          if (m[dn - d] === EMPTY && rand() < 0.5) { this._sw(i, dn - d); stamp[dn - d] = sid; continue; }
          // lava + water contact → stone + steam
          for (let o = 0; o < 4; o++) {
            const j = i + [W, -W, 1, -1][o];
            if (m[j] === WATER) { m[j] = STEAM; life[j] = 120; m[i] = STONE; life[i] = 0; break; }
          }
        }
        else if (mat === WOOD) {
          if (life[i] > 0) {                                    // burning wood: emits fire, chars down
            life[i]--;
            if (life[i] === 0) { m[i] = rand() < 0.6 ? SMOKE : FIRE; life[i] = this.initLife(m[i]); continue; }
            if (m[i - W] === EMPTY && rand() < 0.5) { m[i - W] = FIRE; life[i - W] = this.initLife(FIRE); stamp[i - W] = sid; }
          }
        }
        else if (mat === FIRE) {
          life[i]--;
          if (life[i] === 0) {
            // feed: a dying flame hops onto adjacent oil instead of going out
            let ate = false;
            for (let o = 0; o < 5; o++) {
              const j = i + [W, -W, 1, -1, 2 * W][o];
              if (j < W * H && m[j] === OIL && rand() < 0.85) {
                m[j] = FIRE; life[j] = this.initLife(FIRE) + 10; stamp[j] = sid;
                ate = true; break;
              }
            }
            m[i] = rand() < (ate ? 0.45 : 0.35) ? SMOKE : EMPTY;
            life[i] = this.initLife(m[i]);
            continue;
          }
        }
        // ignition pass: fire/lava light wood & oil
        if (mat === FIRE || mat === LAVA) {
          // a flame drowns only in real water — one wet side is just steam;
          // this is why oil slicks keep burning on water
          let waterNear = 0;
          for (let o = 0; o < 4; o++) if (m[i + [W, -W, 1, -1][o]] === WATER) waterNear++;
          for (let o = 0; o < 4; o++) {
            const j = i + [W, -W, 1, -1][o];
            const tj = m[j];
            if (tj === WOOD && life[j] === 0 && rand() < (mat === LAVA ? 0.45 : 0.18)) life[j] = 120;
            else if (tj === OIL && rand() < (mat === LAVA ? 0.6 : 0.35)) { m[j] = FIRE; life[j] = this.initLife(FIRE) + 20; stamp[j] = sid; }
          }
          if (mat === FIRE && waterNear >= 2 && rand() < 0.5) {
            m[i] = EMPTY;
            const j = i + W;                                 // the water below steams off
            if (m[j] === WATER) { m[j] = STEAM; life[j] = 100; }
          }
          // flames lick onto films: check two below for fuel
          const j2 = i + 2 * W;
          if (j2 < W * H && m[j2] === OIL && rand() < 0.30) { m[j2] = FIRE; life[j2] = this.initLife(FIRE) + 20; stamp[j2] = sid; }
          else if (j2 < W * H && m[j2] === WOOD && life[j2] === 0 && rand() < 0.12) life[j2] = 120;
        }
        // acid dissolves
        if (mat === ACID) {
          for (let o = 0; o < 4; o++) {
            const j = i + [W, -W, 1, -1][o];
            const tj = m[j];
            if ((tj === WOOD || tj === STONE || tj === SAND) && rand() < 0.08) {
              m[j] = EMPTY;
              life[i] -= 18;
              if (life[i] <= 0 || life[i] > 200) { m[i] = EMPTY; }
              break;
            }
          }
        }
      }
    }

    // ---- risers (fire, steam, smoke): top-down ----
    for (let y = 1; y < H - 1; y++) {
      const row = y * W;
      const flip = this.dirFlip[y] ^ 1;
      for (let k = 1; k < W - 1; k++) {
        const x = flip ? W - 1 - k : k;
        const i = row + x;
        if (stamp[i] === sid) continue;
        const mat = m[i];
        if (mat === FIRE) {
          // clinging: flames sit on fuel (oil/wood neighbor, or a film just below)
          let nearFuel = false;
          for (let o = 0; o < 5; o++) {
            const tj = m[i + [W, -W, 1, -1, 2 * W][o]];
            if (tj === OIL || tj === WOOD) { nearFuel = true; break; }
          }
          if (nearFuel && rand() < 0.78) continue;   // dance in place, ignition pass does the rest
          const up = i - W;
          const d = flip ? -1 : 1;
          if (m[up] === EMPTY && rand() < 0.8) { this._sw(i, up); stamp[up] = sid; continue; }
          if (m[up + d] === EMPTY && rand() < 0.6) { this._sw(i, up + d); stamp[up + d] = sid; continue; }
          if (m[up - d] === EMPTY && rand() < 0.6) { this._sw(i, up - d); stamp[up - d] = sid; continue; }
          if (m[i + d] === EMPTY && rand() < 0.25) { this._sw(i, i + d); stamp[i + d] = sid; }
          // flames lick downward occasionally — that's how fires find fuel
          if (m[i + W] === EMPTY && rand() < 0.18) { this._sw(i, i + W); stamp[i + W] = sid; }
        }
        else if (mat === STEAM || mat === SMOKE) {
          life[i]--;
          if (life[i] === 0 || life[i] > 250) {
            if (mat === STEAM && rand() < 0.5) { m[i] = WATER; life[i] = 0; }   // condense
            else m[i] = EMPTY;
            continue;
          }
          const up = i - W;
          const d = flip ? -1 : 1;
          if (m[up] === EMPTY && rand() < 0.7) { this._sw(i, up); stamp[up] = sid; continue; }
          if (m[up + d] === EMPTY && rand() < 0.5) { this._sw(i, up + d); stamp[up + d] = sid; continue; }
          if (m[i + d] === EMPTY && rand() < 0.3) { this._sw(i, i + d); stamp[i + d] = sid; }
        }
      }
    }
  }

  // census for HUD / tests
  census() {
    const c = new Array(11).fill(0);
    for (let i = 0; i < this.m.length; i++) c[this.m[i]]++;
    return c;
  }
}
