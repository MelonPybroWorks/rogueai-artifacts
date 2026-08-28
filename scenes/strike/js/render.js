// render.js — the forest IS the framebuffer: 1 cell = 1 px, palettes by age/heat/flicker.
const pack = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
export const GRID_W = 640, GRID_H = 360;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = GRID_W; this.H = GRID_H;
    canvas.width = this.W; canvas.height = this.H;
    this.img = this.ctx.createImageData(this.W, this.H);
    this.px = new Uint32Array(this.img.data.buffer);
    // tree palette by age: dark pine → moss → pale old-growth
    this.treePal = new Uint32Array(256);
    for (let a = 0; a < 256; a++) {
      const t = a / 255;
      this.treePal[a] = pack(18 + 88 * t | 0, 52 + 110 * t | 0, 26 + 62 * t | 0);
    }
    // ember palette by heat
    this.heatPal = new Uint32Array(256);
    for (let h = 0; h < 256; h++) {
      const t = h / 255;
      this.heatPal[h] = pack(Math.min(255, 20 + 235 * t * 1.15) | 0, (12 + 110 * t * t) | 0, (6 + 40 * t * t) | 0);
    }
    this.soilA = pack(12, 15, 10);
    this.soilB = pack(9, 12, 8);
    this.firePal = [pack(255, 244, 200), pack(255, 196, 96), pack(255, 154, 60), pack(226, 96, 32)];
  }
  frame(forest, tick) {
    const { px, treePal, heatPal, soilA, soilB, firePal } = this;
    const { cell, age, heat } = forest;
    const htick = (tick * 2654435761) >>> 0;
    for (let i = 0; i < px.length; i++) {
      const c = cell[i];
      if (c === 1) { // TREE
        const dith = ((i * 7 + (i / this.W | 0) * 13) & 15) < 5 ? -8 : 0;
        const base = treePal[age[i]];
        if (dith) {
          const r = (base & 255) + dith, g = ((base >> 8) & 255) + dith, b = ((base >> 16) & 255) + dith;
          px[i] = pack(Math.max(0, r), Math.max(0, g), Math.max(0, b));
        } else px[i] = base;
      } else if (c === 2) { // FIRE — flickers
        const h = (i * 2654435761 ^ htick) >>> 0;
        const f = (h ^ (h >> 9)) & 7;
        px[i] = firePal[f === 0 ? 0 : f < 4 ? 1 : f < 6 ? 2 : 3];
      } else {        // EMPTY — soil, or cooling embers
        const ht = heat[i];
        px[i] = ht > 2 ? heatPal[ht] : (((i * 7 + (i / this.W | 0) * 13) & 15) < 5 ? soilA : soilB);
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
