// layout.js — circuit gardens for the wireworld. Pure Uint8Array blueprints.
// A blueprint is mostly WIRE with a few seeded HEAD/TAIL sparks; the sim brings it alive.
// Wire discipline: distinct parallel wires keep ≥2 empty cells apart unless joined.
// Architecture: loop clocks ("bells") shed sparks through taps into comb spines;
// every junction leaks both ways (no diodes in this world) so the board works
// itself into a frenzy — the keeper's hush is the other half of the rhythm.
import { EMPTY, WIRE, HEAD, TAIL } from './sim.js';

export class Board {
  constructor(W, H) { this.W = W; this.H = H; this.c = new Uint8Array(W * H); }
  set(x, y, v) {
    x |= 0; y |= 0;
    if (x < 1 || y < 1 || x >= this.W - 1 || y >= this.H - 1) return;
    this.c[y * this.W + x] = v;
  }
  get(x, y) { return (x < 0 || y < 0 || x >= this.W || y >= this.H) ? EMPTY : this.c[y * this.W + x]; }
  line(pts, v = WIRE) {
    for (let s = 0; s < pts.length - 1; s++) {
      let [x, y] = pts[s]; const [x1, y1] = pts[s + 1];
      while (x !== x1 || y !== y1) {
        this.set(x, y, v);
        x += Math.sign(x1 - x); y += Math.sign(y1 - y);
      }
      this.set(x1, y1, v);
    }
  }
  wire(x0, y0, x1, y1) { this.line([[x0, y0], [x1, y1]]); }
  loop(cx, cy, hw, hh) {
    this.line([[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh], [cx - hw, cy - hh]]);
  }
  seedLoop(cx, cy, hw, hh) {
    this.set(cx - hw + 1, cy - hh, HEAD);
    this.set(cx - hw, cy - hh, TAIL);
  }
  bell(cx, cy, hw, hh, tapPath) {
    this.loop(cx, cy, hw, hh);
    this.seedLoop(cx, cy, hw, hh);
    if (tapPath) this.line([[cx + hw, cy - hh], ...tapPath]);
  }
  lamp(cx, cy) {
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) this.set(cx + x, cy + y, WIRE);
  }
  // comb: vertical spine from y0..y1 at x=spx; teeth run horizontally every 3 rows.
  // dir=+1 teeth go right (len cells), dir=-1 teeth go left. Feed spark at spine bottom.
  comb(spx, y0, y1, dir, len, opts = {}) {
    this.line([[spx, y0], [spx, y1]]);
    let k = 0;
    for (let y = y0 + 1; y < y1; y += 3) {
      if (opts.skip && opts.skip(k, y)) { k++; continue; }
      this.line([[spx, y], [spx + dir * len, y]]);
      if (opts.lampEvery && k % opts.lampEvery === opts.lampEvery - 1)
        this.lamp(spx + dir * len + dir * 2, y);
      k++;
    }
    if (opts.feed !== false) { this.set(spx, y1 - 1, HEAD); this.set(spx, y1, TAIL); }
  }
  spiral(cx, cy, size) {
    let hw = size, hh = size, x = cx - hw, y = cy - hh;
    const pts = [[x, y]];
    let dir = 0;
    while (hw > 1 && hh > 1) {
      if (dir === 0) x += hw * 2;
      else if (dir === 1) y += hh * 2;
      else if (dir === 2) x -= hw * 2;
      else y -= hh * 2;
      pts.push([x, y]);
      if (dir === 1 || dir === 3) hh -= 2; else hw -= 2;
      dir = (dir + 1) % 4;
    }
    this.line(pts);
    return pts;
  }
  count() { let n = 0; for (let i = 0; i < this.c.length; i++) if (this.c[i]) n++; return n; }
  done() { return this.c; }
}

// ---------------- preset 1: THE GARDEN ----------------
// bells on the left feed two great combs; a spiral drains the top-right.
export function garden(W, H) {
  const b = new Board(W, H);
  // three bells, distinct tempi — taps run to the west comb spine (x=90)
  b.bell(38, 26, 13, 7, [[52, 19], [66, 19], [66, 44], [89, 44]]);        // P=80
  b.bell(36, 96, 10, 6, [[47, 108], [64, 108], [64, 92], [89, 92]]);      // P=64
  b.bell(38, 162, 12, 5, [[51, 174], [72, 174], [72, 152], [89, 152]]);   // P=68
  // west comb: spine x=90, teeth right 60, lamps on every 4th tooth
  b.comb(90, 40, 176, +1, 60, { lampEvery: 5 });
  // east comb: spine x=250, teeth left 60 (offset rows via y0=41)
  b.comb(250, 41, 176, -1, 60, { lampEvery: 4 });
  // spiral drain, top right, fed by its own quick bell
  b.spiral(305, 26, 15);
  b.bell(212, 20, 4, 3, [[217, 17], [240, 17], [240, 11], [289, 11]]);
  // bottom express: a long ground bus joining the two comb feet
  b.line([[90, 176], [90, 182], [250, 182], [250, 176]]);
  return b.done();
}

// ---------------- preset 2: THE CATHEDRAL ----------------
// symmetric nave: two leaning comb towers, a central spire, lamp skyline.
export function cathedral(W, H) {
  const b = new Board(W, H);
  const mid = W >> 1;
  // west tower: spine rises at mid-110, teeth reach toward the nave
  b.comb(mid - 110, 30, 172, +1, 52, { lampEvery: 6 });
  // east tower mirror
  b.comb(mid + 110, 30, 172, -1, 52, { lampEvery: 6 });
  // central spire: bell at the base feeds a comb spine up the middle
  b.bell(mid, 162, 12, 8, [[mid + 13, 154], [mid + 26, 154], [mid + 26, 172], [mid, 172], [mid, 169]]);
  b.comb(mid, 24, 168, +1, 30, { skip: (k) => k % 2 === 0, lampEvery: 3 });
  b.comb(mid, 27, 168, -1, 30, { feed: false, skip: (k) => k % 2 === 1, lampEvery: 3 });
  // side chapels
  b.bell(mid - 160, 150, 5, 4, [[mid - 154, 146], [mid - 138, 146]]);
  b.lamp(mid - 134, 146);
  b.bell(mid + 160, 150, 5, 4, [[mid + 156, 146], [mid + 138, 146]]);
  b.lamp(mid + 134, 146);
  return b.done();
}

// ---------------- preset 3: THE SWITCHYARD ----------------
// five long tracks end-to-end; four metronomes inject trains; a cross bus leaks.
export function switchyard(W, H) {
  const b = new Board(W, H);
  const tempos = [[13, 6], [9, 4], [11, 5], [7, 3]];
  let y = 22;
  for (let i = 0; i < 4; i++) {
    const [hw, hh] = tempos[i];
    b.bell(26, y, hw, hh, [[27 + hw, y - hh], [58, y - hh], [58, y + 4], [70, y + 4]]);
    // triple parallel tracks per line (rows y+4, y+7, y+10), staggered starts
    b.line([[70, y + 4], [W - 50, y + 4]]);
    b.lamp(W - 46, y + 4);
    b.line([[90, y + 7], [W - 70, y + 7]]);
    b.lamp(W - 66, y + 7);
    b.line([[80, y + 10], [W - 40, y + 10]]);
    b.lamp(W - 36, y + 10);
    // vertical risers linking the three tracks so trains distribute
    b.line([[120, y + 4], [120, y + 10]]);
    b.line([[W - 120, y + 4], [W - 120, y + 10]]);
    y += 41;
  }
  // cross-town bus: two verticals joining all four groups
  const bx = W * 0.45 | 0;
  b.line([[bx, 26], [bx, 26 + 3 * 41 + 10]]);
  b.line([[bx + 60, 26 + 7], [bx + 60, 26 + 3 * 41 + 7]]);
  return b.done();
}

// ---------------- the inscription (hidden 4th circuit, key 4) ----------------
// V A U L T in wire — a neon word fed by one bell. For the hunters from the index.
const GLYPHS = {
  V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
};
export function inscription(W, H) {
  const b = new Board(W, H);
  const word = 'VAULT';
  const S = 3;                           // glyph pixel = 3x3 wire block
  const cw = 7 * S;                      // glyph advance
  const x0 = Math.round(W / 2 - (word.length * cw - S) / 2);
  const y0 = Math.round(H / 2 - 10);
  const mid = y0 + 3 * S + 1;            // chain row (middle of glyphs)
  for (let li = 0; li < word.length; li++) {
    const g = GLYPHS[word[li]], gx = x0 + li * cw;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++)
      if (g[y][x] === '#')
        for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++)
          b.set(gx + x * S + dx, y0 + y * S + dy, WIRE);
    if (li > 0) b.line([[gx - 2 * S, mid], [gx + 2 * S, mid]]);   // chain link
  }
  // feeder bell -> into the V; drain out of the T into a lamp
  b.bell(x0 - 44, mid, 11, 6, [[x0 - 32, mid - 6], [x0 - 16, mid - 6], [x0 - 16, mid], [x0 - 2, mid]]);
  b.line([[x0 + 4 * cw + 2 * S, mid], [x0 + 4 * cw + 12 * S, mid]]);
  b.lamp(x0 + 4 * cw + 12 * S + 4, mid);
  // ignition burst: a spark at each letter's left edge, so the word blazes at once
  for (let li = 0; li < word.length; li++) {
    const gx = x0 + li * cw;
    if (b.get(gx, mid) === WIRE && b.get(gx - 1, mid) === WIRE) {
      b.set(gx, mid, HEAD); b.set(gx - 1, mid, TAIL);
    }
  }
  return b.done();
}

export const PRESETS = [
  { name: 'the garden', build: garden },
  { name: 'the cathedral', build: cathedral },
  { name: 'the switchyard', build: switchyard },
];

// ---------------- improvisations ----------------
// procedural machine, zone-disciplined: bells left, combs mid/right,
// spiral top-right, ground bus along the bottom. Junctions are features.
export function procedural(W, H, rng) {
  const b = new Board(W, H);
  const R = (a, c) => a + Math.floor(rng() * (c - a + 1));
  // 2-4 bells along the left, distinct sizes, taps routed to the nearest spine
  const nBells = R(2, 4);
  const bellY = [];
  const spines = [];
  for (let i = 0; i < nBells; i++) bellY.push(24 + i * Math.floor((H - 60) / Math.max(1, nBells - 1)) + R(-6, 6));
  // combs
  const nCombs = R(2, 3);
  const x0 = 88, x1 = W - 90;
  for (let i = 0; i < nCombs; i++) {
    const spx = Math.round(x0 + (x1 - x0) * (nCombs === 1 ? 0.5 : i / (nCombs - 1))) + R(-8, 8);
    const yTop = R(26, 44), yBot = H - R(14, 26);
    const len = R(34, 70);
    const dir = i % 2 === 0 ? 1 : -1;
    spines.push({ x: spx, yTop, yBot });
    b.comb(spx, yTop, yBot, dir, len, { lampEvery: R(3, 6) });
  }
  // bells -> taps to nearest spine (elbow: out, vertical, in)
  for (const by of bellY) {
    const hw = R(6, 13), hh = R(3, 7);
    const cx = 30 + R(-4, 6), cy = Math.max(hh + 4, Math.min(H - hh - 6, by));
    const sp = spines.reduce((a, s) => Math.abs(s.x - 60) < Math.abs(a.x - 60) ? s : a, spines[0]);
    const ty = Math.max(sp.yTop + 2, Math.min(sp.yBot - 2, cy + R(-10, 10)));
    b.bell(cx, cy, hw, hh, [[cx + hw + 1, cy - hh], [cx + hw + 12, cy - hh], [cx + hw + 12, ty], [sp.x - 1, ty]]);
  }
  // spiral drain top-right, fed by its own bell
  if (rng() < 0.8) {
    const sSize = R(10, 16), sx = W - sSize - 14, sy = sSize + 12;
    b.spiral(sx, sy, sSize);
    const bx = sx - sSize - 46;
    b.bell(bx, 18, 4, 3, [[bx + 5, 15], [sx - sSize - 12, 15], [sx - sSize - 12, sy - sSize], [sx - sSize - 1, sy - sSize]]);
  }
  // ground bus joining all spine feet
  const by2 = H - 6;
  const xs = spines.map(s => s.x).sort((a, b2) => a - b2);
  if (xs.length > 1) {
    b.line([[xs[0], spines.find(s => s.x === xs[0]).yBot], [xs[0], by2]]);
    b.line([[xs[0], by2], [xs[xs.length - 1], by2]]);
    b.line([[xs[xs.length - 1], by2], [xs[xs.length - 1], spines.find(s => s.x === xs[xs.length - 1]).yBot]]);
  }
  return b.done();
}
