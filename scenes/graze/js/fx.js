// fx.js — particle pool + expanding rings. sim is DOM-free; render reads arrays.
import { CFG } from './config.js';

export class FX {
  constructor() {
    this.parts = [];   // {x,y,vx,vy,life,maxLife,color,size}
    this.rings = [];   // {x,y,r,vr,life,maxLife,color}
  }
  burst(x, y, n, color, speed = 100) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= CFG.MAX_PARTICLES) return;
      const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random() * 0.7) * speed;
      this.parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.9, maxLife: 1.4, color,
        size: 1 + Math.random() * 1.6,
      });
    }
  }
  spark(x, y, color) {
    if (this.parts.length >= CFG.MAX_PARTICLES) return;
    const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 70;
    this.parts.push({
      x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.25 + Math.random() * 0.3, maxLife: 0.55, color, size: 1,
    });
  }
  ring(x, y, color) { this.rings.push({ x, y, r: 6, vr: 190, life: 1.1, maxLife: 1.1, color }); }

  update(dt) {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.life -= dt;
      if (q.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.vx *= 1 - 1.6 * dt; q.vy *= 1 - 1.6 * dt;
    }
    const rs = this.rings;
    for (let i = rs.length - 1; i >= 0; i--) {
      const r = rs[i];
      r.life -= dt; r.r += r.vr * dt;
      if (r.life <= 0) rs.splice(i, 1);
    }
  }
}
