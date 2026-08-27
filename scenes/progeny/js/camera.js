// camera.js — 2D pan/zoom camera + idle auto-director (no DOM beyond sizes)
import { clamp, lerp } from './util.js';

export class Camera {
  constructor(worldR) {
    this.R = worldR;
    this.x = worldR / 2; this.y = worldR / 2;   // look-at (world units)
    this.zoom = 0.2;
    this.w = 1280; this.h = 720;
    this.auto = true;                            // cinematic drift
    this._poi = { x: this.x, y: this.y, z: 0.2 };// current point of interest
    this._poiT = 0;
    this._breath = Math.random() * 100;
    // smoothed targets
    this._tx = this.x; this._ty = this.y; this._tz = this.zoom;
  }
  resize(w, h) { this.w = w; this.h = h; }

  fitZoom() { return Math.min(this.w, this.h) / (this.R * 1.12); }
  clampAll() {
    this._tz = clamp(this._tz, this.fitZoom() * 0.85, 2.4);
    const m = this.R * 0.06;
    this._tx = clamp(this._tx, -m, this.R + m);
    this._ty = clamp(this._ty, -m, this.R + m);
  }

  // ---- input ops ----
  pan(dxScreen, dyScreen) { this._tx -= dxScreen / this.zoom; this._ty -= dyScreen / this.zoom; this.clampAll(); }
  zoomAt(sx, sy, factor) {
    const wx = this.x + (sx - this.w / 2) / this.zoom;
    const wy = this.y + (sy - this.h / 2) / this.zoom;
    this._tz = clamp(this._tz * factor, this.fitZoom() * 0.85, 2.4);
    // keep the world point under the cursor stationary
    this._tx = wx - (sx - this.w / 2) / this._tz;
    this._ty = wy - (sy - this.h / 2) / this._tz;
    this.clampAll();
  }
  jumpTo(wx, wy, z) { this._tx = wx; this._ty = wy; if (z) this._tz = z; this.clampAll(); }

  toScreenX(wx) { return (wx - this.x) * this.zoom + this.w / 2; }
  toScreenY(wy) { return (wy - this.y) * this.zoom + this.h / 2; }
  toWorldX(sx) { return this.x + (sx - this.w / 2) / this.zoom; }
  toWorldY(sy) { return this.y + (sy - this.h / 2) / this.zoom; }

  // director picks a new point of interest (called by main when idle)
  setPoi(x, y, z) { this._poi = { x, y, z }; this._poiT = 0; }

  step(dt, timeS) {
    if (this.auto) {
      this._poiT += dt;
      const p = this._poi;
      const breathe = 1 + Math.sin(timeS * 0.11 + this._breath) * 0.10;
      this._tx = lerp(this._tx, p.x, dt * 0.55);
      this._ty = lerp(this._ty, p.y, dt * 0.55);
      this._tz = lerp(this._tz, clamp(p.z * breathe, this.fitZoom() * 0.9, 2.2), dt * 0.4);
      this.clampAll();
    }
    const k = 1 - Math.exp(-dt * 7);
    this.x = lerp(this.x, this._tx, k);
    this.y = lerp(this.y, this._ty, k);
    this.zoom = lerp(this.zoom, this._tz, k);
  }
}
