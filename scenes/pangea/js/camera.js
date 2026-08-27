// camera.js — orbit camera around the globe: drag-rotate w/ inertia, wheel zoom, idle drift
import { clamp, lerp } from './util.js';

export class Camera {
  constructor() {
    this.yaw = 0.6; this.pitch = 0.35;
    this.dist = 500;                    // world units from origin
    this.vyaw = 0; this.vpitch = 0;
    this.auto = true;
    this._tYaw = this.yaw; this._tPitch = this.pitch; this._tDist = this.dist;
  }
  resize() {}

  drag(dx, dy) {
    this._tYaw += dx * 0.006;
    this._tPitch = clamp(this._tPitch + dy * 0.004, -1.1, 1.1);
    this.vyaw = dx * 0.006; this.vpitch = dy * 0.004;
  }
  zoom(f) { this._tDist = clamp(this._tDist * f, 340, 900); }

  step(dt, t) {
    if (this.auto) {
      this._tYaw += dt * 0.05;                       // slow planetary spin
      this._tPitch = 0.3 + Math.sin(t * 0.043) * 0.22;
      this._tDist = 500 + Math.sin(t * 0.031) * 105; // breathing zoom
    } else {
      // inertia
      this._tYaw += this.vyaw; this._tPitch = clamp(this._tPitch + this.vpitch, -1.1, 1.1);
      this.vyaw *= 1 - 3.2 * dt; this.vpitch *= 1 - 3.2 * dt;
    }
    const k = 1 - Math.exp(-dt * 5);
    this.yaw = lerp(this.yaw, this._tYaw, k);
    this.pitch = lerp(this.pitch, this._tPitch, k);
    this.dist = lerp(this.dist, this._tDist, k);
  }
}
