// render.js — two stacked canvases at full css resolution: thread (never cleared) + overlay.
// The overlay is static (hoop + pins) except a small clipped zone around the active pin.
export class LoomRenderer {
  constructor(threadCanvas, overlayCanvas) {
    this.tc = threadCanvas;
    this.tctx = this.tc.getContext('2d');
    this.oc = overlayCanvas;
    this.octx = this.oc.getContext('2d');
    this._gz = null;
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    const S = this.pixelScale || 0.66;   // backing store scale — compositing two full-res canvases kills SwiftShader
    this.tc.width = Math.round(w * S); this.tc.height = Math.round(h * S);
    this.oc.width = Math.round(w * S); this.oc.height = Math.round(h * S);
    this.tctx.setTransform(S, 0, 0, S, 0, 0);
    this.octx.setTransform(S, 0, 0, S, 0, 0);
    this.w = w; this.h = h;              // logical coords stay in css px
    this.cx = w / 2; this.cy = h / 2;
    this.R = Math.min(w, h) * 0.42;
    this.dirtyStatic = true;
    this._gz = null;
    if (this.onResize) this.onResize();
  }
  pinXY(loom, i) {
    const side = loom.side;
    const p = loom.pins[i];
    return [this.cx + (p.x / side - 0.5) * 2 * this.R, this.cy + (p.y / side - 0.5) * 2 * this.R];
  }
  strokeHoop(ctx) {
    ctx.strokeStyle = 'rgba(140,170,190,.35)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R + 12, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(140,170,190,.14)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R + 20, 0, Math.PI * 2); ctx.stroke();
  }
  dotPins(ctx, nearX, nearY, nearR) {
    ctx.fillStyle = 'rgba(200,230,255,.55)';
    for (let i = 0; i < this._loomRef.pins.length; i++) {
      const [x, y] = this.pinXY(this._loomRef, i);
      if (nearX !== undefined) {
        const dx = x - nearX, dy = y - nearY;
        if (dx * dx + dy * dy > nearR * nearR) continue;
      }
      ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  drawStatic(loom) {
    this._loomRef = loom;
    const ctx = this.octx;
    ctx.clearRect(0, 0, this.w, this.h);
    this.strokeHoop(ctx);
    this.dotPins(ctx);
    this.dirtyStatic = false;
    this._gz = null;
  }
  fadeThreads(a) {
    this.tctx.fillStyle = `rgba(3,6,10,${a})`;
    this.tctx.fillRect(0, 0, this.w, this.h);
  }
  clearThreads() { this.tctx.clearRect(0, 0, this.w, this.h); }
  underdraw(loom, alpha) {
    const { side } = loom;
    const c = document.createElement('canvas');
    c.width = side; c.height = side;
    const x = c.getContext('2d');
    const im = x.createImageData(side, side);
    for (let i = 0; i < side * side; i++) {
      const v = loom.source[i] * 255;
      im.data[i * 4] = v * 0.72; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v * 0.88;
      im.data[i * 4 + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    this.tctx.save();
    this.tctx.globalAlpha = alpha;
    this.tctx.imageSmoothingEnabled = true;
    this.tctx.drawImage(c, this.cx - this.R, this.cy - this.R, this.R * 2, this.R * 2);
    this.tctx.restore();
  }
  thread(segment, loom, hue, alpha) {
    const [x0, y0] = this.pinXY(loom, segment[0]);
    const [x1, y1] = this.pinXY(loom, segment[1]);
    const ctx = this.tctx;
    ctx.strokeStyle = `hsla(${hue},85%,68%,${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  restoreZone(x, y, r) {
    const ctx = this.octx;
    ctx.save();
    ctx.beginPath(); ctx.rect(x - r, y - r, r * 2, r * 2); ctx.clip();
    ctx.clearRect(x - r, y - r, r * 2, r * 2);
    this.strokeHoop(ctx);
    this.dotPins(ctx, x, y, r + 6);
    ctx.restore();
  }
  drawLive(loom, hue, t) {
    if (this.dirtyStatic) this.drawStatic(loom);
    if (this._gz) this.restoreZone(...this._gz);
    const [ax, ay] = this.pinXY(loom, loom.current);
    const pr = 24;
    this._gz = [ax, ay, pr];
    this.restoreZone(ax, ay, pr);
    const ctx = this.octx;
    const pulse = 2.2 + 1.1 * Math.sin(t * 4);
    ctx.strokeStyle = `hsla(${hue},90%,75%,.8)`;
    ctx.lineWidth = 1.2;
    const g = 7 + 2 * Math.sin(t * 4);
    ctx.beginPath();
    ctx.moveTo(ax - g, ay); ctx.lineTo(ax - g + 4, ay);
    ctx.moveTo(ax + g - 4, ay); ctx.lineTo(ax + g, ay);
    ctx.moveTo(ax, ay - g); ctx.lineTo(ax, ay - g + 4);
    ctx.moveTo(ax, ay + g - 4); ctx.lineTo(ax, ay + g);
    ctx.stroke();
    ctx.fillStyle = `hsla(${hue},90%,82%,.95)`;
    ctx.beginPath(); ctx.arc(ax, ay, pulse, 0, Math.PI * 2); ctx.fill();
  }
}
