// vignettes.js — the ghost's alchemy scenes: built, witnessed, burned, swept away.
import { EMPTY, STONE, SAND, WATER, OIL, WOOD, FIRE, LAVA, ACID, STEAM, SMOKE } from './sim.js';

// flat ground strip (big discs bury things — learned the hard way)
function ground(sim, x0, x1, y, mat, depth = 3) {
  for (let x = x0; x <= x1; x++) for (let d = 0; d < depth; d++) sim.paint(x, y + d, 0, mat);
}

// each vignette: build(sim,W,H) paints the set; igniteAt returns [x,y] or null
export const VIGNETTES = [
  {
    name: 'the candle',
    build(sim, W, H) {
      const cx = W >> 1, gy = H - 8;
      // stone plinth
      sim.paint(cx, gy + 4, 7, STONE);
      // wooden wick
      for (let y = gy - 12; y < gy + 2; y++) sim.paint(cx, y, 0, WOOD);
      // oil moat
      sim.paint(cx - 16, gy + 2, 4, OIL);
      sim.paint(cx + 16, gy + 2, 4, OIL);
      return [cx, gy - 14];
    },
  },
  {
    name: 'the orchard fire',
    build(sim, W, H) {
      const gy = H - 8;
      ground(sim, 20, W - 20, gy, SAND, 4);               // thin ground
      // tree: fat trunk + branches + crown, roots AT the ground line
      const tx = W >> 1;
      for (let y = gy - 26; y <= gy; y++) sim.paint(tx, y, 2, WOOD);
      for (let k = 0; k < 12; k++) {
        sim.paint(tx - 2 - k, gy - 22 + k, 1, WOOD);
        sim.paint(tx + 2 + k, gy - 22 + k, 1, WOOD);
      }
      sim.paint(tx, gy - 30, 6, WOOD);                    // crown
      // a second, smaller tree
      const t2 = (W >> 1) + 40;
      for (let y = gy - 14; y <= gy; y++) sim.paint(t2, y, 1, WOOD);
      sim.paint(t2, gy - 18, 4, WOOD);
      // dry grass carpet between them
      for (let x = tx - 24; x < t2 + 6; x += 3) sim.paint(x, gy - 1, 0, WOOD);
      return [tx, gy - 2];                                // fire at the base
    },
  },
  {
    name: 'rain on the caldera',
    build(sim, W, H) {
      const cx = W >> 1, gy = H - 6;
      // stone basin with lava
      sim.paint(cx - 26, gy - 2, 3, STONE);
      sim.paint(cx + 26, gy - 2, 3, STONE);
      ground(sim, cx - 26, cx + 26, gy, STONE, 3);
      sim.paint(cx, gy - 5, 11, LAVA);
      // rain clouds
      for (let k = 0; k < 24; k++) {
        const x = cx - 30 + ((k * 37) % 60);
        sim.paint(x, 14 + (k % 3), 1, WATER);
      }
      return null;                                        // needs no match
    },
  },
  {
    name: 'the solvent',
    build(sim, W, H) {
      const cx = W >> 1, gy = H - 6;
      // stone crucible
      ground(sim, cx - 14, cx + 14, gy, STONE, 3);
      for (let y = gy - 10; y <= gy; y++) { sim.paint(cx - 14, y, 1, STONE); sim.paint(cx + 14, y, 1, STONE); }
      // a wooden artifact inside
      sim.paint(cx, gy - 4, 3, WOOD);
      // pour the acid
      sim.paint(cx - 8, gy - 16, 4, ACID);
      sim.paint(cx + 8, gy - 20, 3, ACID);
      return null;
    },
  },
  {
    name: 'dunes at night',
    build(sim, W, H) {
      // calm interlude: wind ripples sand over stone ribs
      const gy = H - 8;
      for (let x = 30; x < W - 30; x += 30) sim.paint(x, gy - 2, 3, STONE);
      ground(sim, 12, W - 12, gy, SAND, 5);
      for (let k = 0; k < 30; k++) {
        const x = 10 + ((k * 53) % (W - 20));
        sim.paint(x, 8 + (k % 5), 1, SAND);
      }
      return null;
    },
  },
  {
    name: 'the refinery fire',
    build(sim, W, H) {
      const cx = W >> 1, gy = H - 6;
      // oil tank farm: three stone-walled tanks of oil
      for (let t = -1; t <= 1; t++) {
        const tx = cx + t * 34;
        ground(sim, tx - 10, tx + 10, gy, STONE, 3);
        for (let y = gy - 8; y <= gy; y++) { sim.paint(tx - 10, y, 1, STONE); sim.paint(tx + 10, y, 1, STONE); }
        sim.paint(tx, gy - 4, 6, OIL);
      }
      return [cx - 34, gy - 10];                          // one spark at the west tank
    },
  },
];
