// render.js — the board IS the framebuffer; ant trails are the cells themselves.
const pack = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
export const GRID_W = 640, GRID_H = 360;

// state colors: 0 is always bare ground; deeper states glow hotter
const PAL = [null, [216, 207, 187], [53, 240, 200], [255, 154, 60], [192, 144, 255], [255, 220, 130]]
  .map(c => c && pack(c[0], c[1], c[2]));

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = GRID_W; this.H = GRID_H;
    canvas.width = this.W; canvas.height = this.H;
    this.img = this.ctx.createImageData(this.W, this.H);
    this.px = new Uint32Array(this.img.data.buffer);
    this.groundA = pack(10, 12, 9);
    this.groundB = pack(13, 15, 11);
    this.clear();
  }
  clear() {
    const { px, W, H } = this;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      px[y * W + x] = ((x * 7 + y * 13) & 15) < 5 ? this.groundB : this.groundA;
    }
  }
  frame(board) {
    const { px, W, H } = this;
    const { cell } = board;
    for (let i = 0; i < px.length; i++) {
      const s = cell[i];
      if (s) px[i] = PAL[s % PAL.length] || PAL[1];
      // untouched cells keep their ground (no write = persistence)
    }
    // ants: bright crawlers
    for (const a of board.ants) {
      const x = a.x, y = a.y;
      if (x >= 1 && y >= 1 && x < W - 1 && y < H - 1) {
        px[y * W + x] = 0xffffffff;
        px[y * W + x + 1] = 0xffd8f0ff; px[y * W + x - 1] = 0xffd8f0ff;
        px[(y + 1) * W + x] = 0xffd8f0ff; px[(y - 1) * W + x] = 0xffd8f0ff;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
  // ground must be re-laid under cleared cells
  groundAt(i) {
    const x = i % this.W, y = (i / this.W) | 0;
    return ((x * 7 + y * 13) & 15) < 5 ? this.groundB : this.groundA;
  }
}
