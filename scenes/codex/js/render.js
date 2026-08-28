// render.js — the scroll IS the framebuffer: write at the bottom, the past scrolls up.
const pack = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
export const GRID_W = 640, GRID_H = 360;

// one pen per rule — the manuscript shows its chapters in color
export const PENS = [
  [216, 207, 187],  // bone
  [53, 240, 200],   // verdigris
  [255, 154, 60],   // ember
  [192, 144, 255],  // violet
  [124, 252, 154],  // mint
  [255, 120, 100],  // rust
  [140, 200, 255],  // ice
  [255, 220, 130],  // gold
  [240, 230, 210],  // vellum-ink
];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = GRID_W; this.H = GRID_H;
    canvas.width = this.W; canvas.height = this.H;
    this.img = this.ctx.createImageData(this.W, this.H);
    this.px = new Uint32Array(this.img.data.buffer);
    this.vellum = pack(13, 10, 7);
    this.vellum2 = pack(16, 12, 8);
    this.seam = pack(255, 217, 138);
    this.penCols = PENS.map(([r, g, b]) => pack(r, g, b));
    this.clear();
  }
  clear() {
    const { px, W, H } = this;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      px[y * W + x] = ((x * 7 + y * 13) & 15) < 5 ? this.vellum2 : this.vellum;
    }
  }
  writeRow(row, penIdx) {
    const { px, W, H } = this;
    // scroll the past up one line
    px.copyWithin(0, W, W * H);
    const ink = this.penCols[penIdx % this.penCols.length];
    const base = (H - 1) * W;
    for (let x = 0; x < W; x++) {
      if (row[x]) px[base + x] = ink;
      else px[base + x] = ((x * 7 + (H - 1) * 13) & 15) < 5 ? this.vellum2 : this.vellum;
    }
  }
  writeSeam() {
    const { px, W, H } = this;
    px.copyWithin(0, W, W * H);
    const base = (H - 1) * W;
    for (let x = 0; x < W; x++) px[base + x] = ((x & 7) < 4) ? this.seam : this.vellum;
  }
  blit() { this.ctx.putImageData(this.img, 0, 0); }
}
