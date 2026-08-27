// patterns.js — spell cards: bullet emitters. Pure functions of time → spawn().
// spawn(x, y, vx, vy, hue, r?) — bullets are linear; patterns carry the art.
import { CFG } from './config.js';

export class Patterns {
  constructor(rng) {
    this.rng = rng;
    this.card = 'spiral';
    this.t = 0;                 // time on current card
    this.calm = 1.6;            // grace after card switch
    // boss "heart" position (drifts on lissajous)
    this.bx = CFG.FW / 2; this.by = 90;
    this._a = 0; this._emit = 0;
  }

  setCard(name) {
    this.card = name;
    this.t = 0;
    this.calm = 1.6;
    this._a = this.rng() * 6.28;
    this._emit = 0;
    this._gap = 0.2 + this.rng() * 0.6;
    this._spin = this.rng() < 0.5 ? 1 : -1;
  }

  // aimX/aimY: where the storm looks (a living dodger or the player)
  update(dt, spawn, aimX, aimY) {
    this.t += dt;
    const t = this.t;
    // heart drift
    this.bx = CFG.FW / 2 + Math.sin(t * 0.31) * CFG.FW * 0.28;
    this.by = 84 + Math.sin(t * 0.53) * 30;
    if (this.calm > 0) { this.calm -= dt; return; }

    const R = this.rng;
    switch (this.card) {
      case 'spiral': {
        // 4 rotating arms from the heart
        this._a += dt * 1.9 * this._spin;
        this._emit -= dt;
        while (this._emit <= 0) {
          this._emit += 0.068;
          for (let arm = 0; arm < 4; arm++) {
            const a = this._a + arm * Math.PI / 2;
            spawn(this.bx, this.by, Math.cos(a) * 76, Math.sin(a) * 76, 190, 3.2);
          }
        }
        break;
      }
      case 'rings': {
        this._emit -= dt;
        while (this._emit <= 0) {
          this._emit += 1.05;
          const n = 26, gapAt = Math.atan2(aimY - this.by, aimX - this.bx);
          const gapW = 0.5 + R() * 0.25;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            let d = Math.abs(((a - gapAt + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            if (d < gapW) continue;                    // aimed gap
            spawn(this.bx, this.by, Math.cos(a) * 62, Math.sin(a) * 62, 320, 3.4);
          }
        }
        break;
      }
      case 'rain': {
        this._emit -= dt;
        while (this._emit <= 0) {
          this._emit += 0.05;
          const x = R() * CFG.FW;
          spawn(x, -6, (R() - 0.5) * 30, 78 + R() * 40, 210, 3.0);
          if (R() < 0.14) {                            // aimed needle
            const dx = aimX - x, dy = aimY + 6, d = Math.hypot(dx, dy) || 1;
            spawn(x, -6, dx / d * 128, dy / d * 128, 0, 2.6);
          }
        }
        break;
      }
      case 'flower': {
        this._a += dt * 0.9 * this._spin;
        this._emit -= dt;
        while (this._emit <= 0) {
          this._emit += 0.09;
          for (let petal = 0; petal < 5; petal++) {
            const a = this._a + petal * (Math.PI * 2 / 5);
            const s = 70 + 30 * Math.sin(t * 1.3);
            spawn(this.bx, this.by, Math.cos(a) * s, Math.sin(a) * s, 280, 3.2);
          }
        }
        break;
      }
      case 'walls': {
        this._emit -= dt;
        this._gap += (R() - 0.5) * dt * 1.6;           // gap wanders
        this._gap = Math.min(0.85, Math.max(0.15, this._gap));
        while (this._emit <= 0) {
          this._emit += 0.20;
          const gx = this._gap * CFG.FW;
          for (let x = 8; x < CFG.FW; x += 26) {
            if (Math.abs(x - gx) < 42) continue;       // the gap
            spawn(x + (R() - 0.5) * 6, -6, 0, 118, 150, 3.6);
          }
        }
        break;
      }
      case 'star': {
        this._a += dt * 0.7;
        this._emit -= dt;
        while (this._emit <= 0) {
          this._emit += 0.058;
          for (let pt = 0; pt < 5; pt++) {
            const a = this._a + pt * (Math.PI * 4 / 5);  // 144° → pentagram
            spawn(this.bx, this.by, Math.cos(a) * 82, Math.sin(a) * 82, 45, 3.0);
          }
          if (R() < 0.3) {
            const dx = aimX - this.bx, dy = aimY - this.by, d = Math.hypot(dx, dy) || 1;
            spawn(this.bx, this.by, dx / d * 112, dy / d * 112, 0, 2.6);
          }
        }
        break;
      }
    }
  }
}
