// vehicles.js — Braitenberg's four wirings. Pure, no DOM.
// Each vehicle: two eyes (left/right), two motors. The wiring decides the feeling.
export const WIRINGS = ['fear', 'hunger', 'love', 'wanderlust'];
// fear: uncrossed excitation — veers away from light, speeds up near it
// hunger: crossed excitation — turns into the light and charges
// love: uncrossed inhibition — approaches, then slows and stays
// wanderlust: crossed inhibition — drifts in slow, then wanders off

export class Lamps {
  constructor() { this.list = []; }
  add(x, y, hue) { this.list.push({ x, y, hue, on: 1 }); if (this.list.length > 8) this.list.shift(); }
  clear() { this.list = []; }
  lightAt(x, y) {
    let s = 0;
    for (const l of this.list) {
      const dx = x - l.x, dy = y - l.y;
      s += l.on / (1 + (dx * dx + dy * dy) * 0.0004);
    }
    return s;
  }
}

let VID = 0;
export class Vehicle {
  constructor(x, y, wiring, rng = Math.random) {
    this.id = VID++;
    this.x = x; this.y = y;
    this.a = rng() * Math.PI * 2;
    this.wiring = wiring;   // 0..3
    this.base = 1.1 + rng() * 0.5;
    this.gain = 0.55 + rng() * 0.5;
    this.vL = 0; this.vR = 0;
  }
  // sensor positions: eyes forward-left / forward-right
  step(lamps, W, H) {
    const ex = Math.cos(this.a), ey = Math.sin(this.a);
    const nx = -ey, ny = ex;                     // left normal
    // eyes mostly LATERAL (wide sensor cone) with a little forward bias
    const lx = this.x + ex * 4 + nx * 9, ly = this.y + ey * 4 + ny * 9;
    const rx = this.x + ex * 4 - nx * 9, ry = this.y + ey * 4 - ny * 9;
    const L = lamps.lightAt(lx, ly), R = lamps.lightAt(rx, ry);
    let vL, vR;
    switch (this.wiring) {
      case 0: vL = this.base * (0.5 + this.gain * 1.4 * L); vR = this.base * (0.5 + this.gain * 1.4 * R); break; // fear: same-side excite
      case 1: vL = this.base * (0.5 + this.gain * 1.4 * R); vR = this.base * (0.5 + this.gain * 1.4 * L); break; // hunger: crossed excite
      case 2: vL = this.base * (0.12 + 2.6 / (1 + L * 2.2)); vR = this.base * (0.12 + 2.6 / (1 + R * 2.2)); break; // love: same-side inhibit — slows into the halo
      case 3: vL = this.base * (0.12 + 2.6 / (1 + R * 1.6)); vR = this.base * (0.12 + 2.6 / (1 + L * 1.6)); break; // wanderlust: crossed inhibit — drifts off again
    }
    const cap = 4.2;
    if (vL > cap) vL = cap; if (vR > cap) vR = cap;
    if (vL < 0.04) vL = 0.04; if (vR < 0.04) vR = 0.04;
    this.vL = vL; this.vR = vR;
    // normalized differential drive: turn rate tracks the sensor IMBALANCE
    this.a += ((vL - vR) / (vL + vR)) * 0.24;
    const v = (vL + vR) * 0.5;
    this.x += ex * v; this.y += ey * v;
    // soft wrap
    if (this.x < -8) this.x += W + 16; else if (this.x > W + 8) this.x -= W + 16;
    if (this.y < -8) this.y += H + 16; else if (this.y > H + 8) this.y -= H + 16;
  }
}
