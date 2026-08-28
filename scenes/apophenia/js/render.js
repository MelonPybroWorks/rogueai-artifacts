// render.js — night-sky framebuffer: fade-to-night trails, stars, wanderers, myth lines.
const FADE = 22;
const TAU = Math.PI * 2;
const pack = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 0.5;
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.W = Math.max(480, Math.round(w * this.scale));
    this.H = Math.max(270, Math.round(h * this.scale));
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.img = this.ctx.createImageData(this.W, this.H);
    this.px = new Uint32Array(this.img.data.buffer);
    this.aspect = this.W / this.H;
    this.buildBg();
  }
  buildBg() {
    const { W, H } = this;
    this.bg = new Uint32Array(W * H);
    for (let y = 0; y < H; y++) {
      const t = y / H;
      for (let x = 0; x < W; x++) {
        // zenith darker, horizon a whisper of teal; vignette-free (CSS handles)
        let r = 3 + 5 * t, g = 5 + 8 * t, b = 12 + 10 * t;
        // horizon rim glow near the dome edge (dome center 0.5,0.46 r=0.44)
        const dx = (x / W - 0.5) * this.aspect, dy = y / H - 0.46;
        const dr = Math.sqrt(dx * dx + dy * dy);
        if (dr > 0.34 && dr < 0.52) { const g2 = (0.52 - dr) * 60; g += g2; b += g2 * 1.25; }
        r += 2; g += 3; b += 5;   // lift the whole night a touch
        this.bg[y * W + x] = pack(r | 0, g | 0, b | 0);
      }
    }
  }
  dot(x, y, col, th = 1) {
    const { W, H, px } = this;
    for (let j = 0; j < th; j++) for (let i = 0; i < th; i++) {
      const X = x + i | 0, Y = y + j | 0;
      if (X >= 0 && Y >= 0 && X < W && Y < H) px[Y * W + X] = col;
    }
  }
  line(x0, y0, x1, y1, col) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0, guard = 0;
    for (;;) {
      if (x >= 0 && y >= 0 && x < this.W && y < this.H) this.px[y * this.W + x] = col;
      if (x === x1 && y === y1) break;
      if (guard++ > 2000) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }
  frame(sky, rot, myth, mythAlpha, t, planets) {
    const { px, bg, W, H } = this;
    for (let i = 0; i < px.length; i++) {
      const c = px[i], s = bg[i];
      const r = (s & 255) + ((((c & 255) - (s & 255)) * (256 - FADE)) >> 8);
      const g = ((s >> 8) & 255) + (((((c >> 8) & 255) - ((s >> 8) & 255)) * (256 - FADE)) >> 8);
      const b = ((s >> 16) & 255) + (((((c >> 16) & 255) - ((s >> 16) & 255)) * (256 - FADE)) >> 8);
      px[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
    const out = { x: 0, y: 0 };
    // stars
    for (let i = 0; i < sky.length; i++) {
      const s = sky[i];
      if (!this._proj(s, rot, out)) continue;
      const tw = 0.74 + 0.26 * Math.sin(s.tw + t * s.tsp);
      const v = Math.max(0.10, s.mag) * tw;    // even the faintest star insists
      const bx = out.x * W | 0, by = out.y * H | 0;
      const warm = s.tint;
      const rC = 150 + 105 * v, gC = 165 + 90 * v, bC = 215 - 50 * warm * v;
      if (v > 0.62) {
        this.dot(bx, by, pack(Math.min(255, rC + 60), Math.min(255, gC + 60), Math.min(255, bC + 60)), 2);
        // cross sparkle on the brightest
        if (v > 0.8) {
          const c = pack(rC | 0, gC | 0, bC | 0);
          this.dot(bx - 3, by, c); this.dot(bx + 3, by, c); this.dot(bx, by - 3, c); this.dot(bx, by + 3, c);
        }
      } else {
        this.dot(bx, by, pack(rC | 0, gC | 0, bC | 0));
      }
    }
    // wanderers (planets): steady light, warm
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      if (!this._proj(p, rot, out)) continue;
      const bx = out.x * W | 0, by = out.y * H | 0;
      const col = i === 0 ? pack(255, 200, 140) : pack(200, 220, 255);
      this.dot(bx, by, col, 3);
      this.dot(bx, by, 0xffffffff, 1);
    }
    // the myth
    if (myth) {
      const col = pack(160, 222, 255);
      const fadeCol = pack(90, 130, 170);
      const lc = mythAlpha >= 1 ? col : fadeCol;
      const n = Math.min(myth.segShown, myth.chain.length - 1);
      for (let k = 0; k < n; k++) {
        const a = sky[myth.chain[k]], b2 = sky[myth.chain[k + 1]];
        const o1 = { x: 0, y: 0 }, o2 = { x: 0, y: 0 };
        if (!this._proj(a, rot, o1) || !this._proj(b2, rot, o2)) continue;
        const x0 = o1.x * W, y0 = o1.y * H, x1 = o2.x * W, y1 = o2.y * H;
        this.line(x0, y0, x1, y1, lc);
        this.line(x0, y0 + 1, x1, y1 + 1, lc);   // second pass: readable at stream scale
      }
      // ring the figure's stars
      for (let k = 0; k <= Math.min(myth.segShown, myth.chain.length - 1); k++) {
        const s = sky[myth.chain[k]];
        const o = { x: 0, y: 0 };
        if (!this._proj(s, rot, o)) continue;
        const bx = o.x * W | 0, by = o.y * H | 0;
        this.dot(bx - 2, by - 1, lc); this.dot(bx + 2, by - 1, lc);
        this.dot(bx - 2, by + 1, lc); this.dot(bx + 2, by + 1, lc);
      }
      // glimmer the leading star while forming
      if (myth.state === 'forming' || myth.state === 'named') {
        const lead = sky[myth.chain[Math.min(myth.segShown, myth.chain.length - 1)]];
        const o = { x: 0, y: 0 };
        if (this._proj(lead, rot, o)) {
          const bx = o.x * W | 0, by = o.y * H | 0;
          const g = 3 + 2 * Math.sin(t * 5);
          const gc = pack(190, 235, 255);
          this.dot(bx - g | 0, by, gc); this.dot(bx + g | 0, by, gc); this.dot(bx, by - g | 0, gc); this.dot(bx, by + g | 0, gc);
        }
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
  _proj(star, rot, out) {
    // inline of sky.project against buffer aspect
    const az = star.az + rot;
    const r = (Math.PI / 2 - star.alt) / (Math.PI / 2);
    if (r > 1.02) return false;
    out.x = 0.5 + Math.sin(az) * r * 0.44 / this.aspect;
    out.y = 0.46 - Math.cos(az) * r * 0.44;
    return true;
  }
}
