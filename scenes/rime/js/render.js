// render.js — the pane IS the framebuffer: crystal cells persist, vapor fades.
const FADE = 26;   // applied every 2nd frame — effective trail time ≈ FADE 13
const pack = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;

export const GRID_W = 720, GRID_H = 405;   // buffer = grid; SwiftShader compositing cost scales with pixels

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = GRID_W; this.H = GRID_H;
    canvas.width = this.W; canvas.height = this.H;
    this.img = this.ctx.createImageData(this.W, this.H);
    this.px = new Uint32Array(this.img.data.buffer);
    this.buildBg();
    // ice palette: age bucket 1 (old steel blue) → 255 (fresh white)
    this.pal = new Uint32Array(256);
    for (let a = 1; a < 256; a++) {
      const t = (a - 1) / 254;
      const r = 74 + (242 - 74) * Math.pow(t, 0.7);
      const g = 112 + (251 - 112) * Math.pow(t, 0.7);
      const b = 143 + (255 - 143) * Math.pow(t, 0.7);
      this.pal[a] = pack(r | 0, g | 0, b | 0);
    }
    this.walkerCol = pack(70, 88, 108);
  }
  buildBg() {
    const { W, H } = this;
    this.bg = new Uint32Array(W * H);
    for (let y = 0; y < H; y++) {
      const t = y / H;
      for (let x = 0; x < W; x++) {
        const dith = ((x * 7 + y * 13) & 15) < 5 ? 2 : 0;
        this.bg[y * W + x] = pack(4 + 4 * t + dith | 0, 6 + 7 * t + dith | 0, 12 + 10 * t + dith | 0);
      }
    }
    // pane edge: a cold frame line inset a few px
    const edge = pack(38, 54, 70);
    for (let k = 0; k < W; k++) {
      this.bg[4 * W + k] = edge; this.bg[(H - 5) * W + k] = edge;
    }
    for (let k = 0; k < H; k++) {
      this.bg[k * W + 4] = edge; this.bg[k * W + W - 5] = edge;
    }
  }
  frame(frost, t) {
    const { px, bg, pal } = this;
    const cell = frost.cell;
    this._fadeFlip = !this._fadeFlip;
    if (this._fadeFlip) { this.drawVapor(frost); this.ctx.putImageData(this.img, 0, 0); return; }
    const sparkT = (t * 3) | 0;
    for (let i = 0; i < px.length; i++) {
      const c8 = cell[i];
      if (c8) {
        // crystal persists; only fresh tips are rewritten (they glitter)
        if (c8 > 235) {
          const h = ((i * 2654435761) >>> 0) ^ sparkT;
          px[i] = (h & 63) < 7 ? 0xffffffff : pal[c8];
        } else if (px[i] !== pal[c8]) px[i] = pal[c8];
        continue;
      }
      const c = px[i], s = bg[i];
      if (c === s) continue;           // most of the pane is already night
      const r = (s & 255) + ((((c & 255) - (s & 255)) * (256 - FADE)) >> 8);
      const g = ((s >> 8) & 255) + (((((c >> 8) & 255) - ((s >> 8) & 255)) * (256 - FADE)) >> 8);
      const b = ((s >> 16) & 255) + (((((c >> 16) & 255) - ((s >> 16) & 255)) * (256 - FADE)) >> 8);
      px[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
    this.drawVapor(frost);
    this.ctx.putImageData(this.img, 0, 0);
  }
  drawVapor(frost) {
    const { px } = this;
    const n = frost.WALKERS, wx = frost.wx, wy = frost.wy, W = this.W, H = this.H, cell = frost.cell;
    for (let i = 0; i < n; i += 2) {
      const x = wx[i], y = wy[i];
      if (x >= 0 && x < W && y >= 0 && y < H && !cell[y * W + x]) px[y * W + x] = this.walkerCol;
    }
  }
}
