// tiles.js — MERIDIAN's tileset: 4-edge sockets, rotatable road/shore grammar.
// socket types: 0 grass · 1 road · 2 water · 3 built
// Each tile: { n,e,s,w sockets, name, render hints }
// Adjacency rule: matching sockets must be equal.

export const S_GRASS = 0, S_ROAD = 1, S_WATER = 2, S_BUILT = 3;

// base tiles (unrotated), then we add rotations
const BASE = [
  { name: 'meadow', s: [0, 0, 0, 0], w: 10 },
  { name: 'road EW', s: [0, 1, 0, 1], w: 4 },
  { name: 'road NS', s: [1, 0, 1, 0], w: 4 },
  { name: 'bend NE', s: [1, 1, 0, 0], w: 3 },
  { name: 'bend ES', s: [0, 1, 1, 0], w: 3 },
  { name: 'bend SW', s: [0, 0, 1, 1], w: 3 },
  { name: 'bend WN', s: [1, 0, 0, 1], w: 3 },
  { name: 'cross', s: [1, 1, 1, 1], w: 1 },
  { name: 'pond', s: [2, 2, 2, 2], w: 4 },
  // shores: water on one side
  { name: 'shore N', s: [2, 0, 0, 0], w: 3 },
  { name: 'shore E', s: [0, 2, 0, 0], w: 3 },
  { name: 'shore S', s: [0, 0, 2, 0], w: 3 },
  { name: 'shore W', s: [0, 0, 0, 2], w: 3 },
  // built blocks (city fabric)
  { name: 'block', s: [3, 3, 3, 3], w: 8 },
  // streets meeting buildings: road edge against built edge
  { name: 'front N', s: [1, 3, 3, 3], w: 4 },
  { name: 'front E', s: [3, 1, 3, 3], w: 4 },
  { name: 'front S', s: [3, 3, 1, 3], w: 4 },
  { name: 'front W', s: [3, 3, 3, 1], w: 4 },
];

export const TILES = BASE;

// compatibility: precompute for each tile & direction the allowed set
export function buildCompat() {
  const T = TILES.length;
  const DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // N E S W
  // socket of tile t facing direction d
  const sock = (t, d) => TILES[t].s[d];
  const opp = d => (d + 2) % 4;
  const ok = [];
  for (let d = 0; d < 4; d++) {
    ok[d] = [];
    for (let a = 0; a < T; a++) {
      ok[d][a] = [];
      for (let b = 0; b < T; b++) {
        // a at origin, b in direction d: a's d-socket meets b's opposite socket
        ok[d][a][b] = sock(a, d) === sock(b, opp(d));
      }
    }
  }
  return ok;
}
