// render.js — the lattice IS the framebuffer: up warm, down deep, fresh flips sparkle.
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
    this.upA = pack(232, 221, 200);   // bone
    this.upB = pack(210, 196, 172);   // bone dithered
    this.dnA = pack(20, 30, 58);      // deep blue
    this.dnB = pack(16, 25, 48);      // deep blue dithered
    this.spark = pack(255, 244, 210); // fresh flip flash
  }
  frame(ising) {
    const { px, W, H } = this;
    const { spin, flips, tick } = ising;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      const dith = y & 1;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        if (flips[i] === tick) { px[i] = this.spark; continue; }
        const s = spin[i];
        const d = ((x * 7 + y * 13) & 15) < 5;
        px[i] = s > 0 ? (d ? this.upB : this.upA) : (d ? this.dnB : this.dnA);
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
