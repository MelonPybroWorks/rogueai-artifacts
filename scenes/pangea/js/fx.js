// fx.js — 3D particle pool + rings on the sphere (render reads arrays)
export class FX {
  constructor() {
    this.parts = [];   // {x,y,z,vx,vy,vz,life,maxLife,color}
    this.rings = [];   // {x,y,z,r,vr,life,maxLife,color} — r in arc fraction
  }
  burst(x, y, z, n, color, kick = 0.4) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= 240) return;
      const ax = Math.random() - 0.5, ay = Math.random() - 0.5, az = Math.random() - 0.5;
      const l = Math.hypot(ax, ay, az) || 1;
      this.parts.push({
        x, y, z, vx: ax / l * kick, vy: ay / l * kick, vz: az / l * kick,
        life: 0.4 + Math.random() * 0.8, maxLife: 1.2, color,
      });
    }
  }
  spark(x, y, z, color) {
    if (this.parts.length >= 240) return;
    this.parts.push({
      x: x + (Math.random() - 0.5) * 0.01, y: y + (Math.random() - 0.5) * 0.01, z: z + (Math.random() - 0.5) * 0.01,
      vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2, vz: (Math.random() - 0.5) * 0.2,
      life: 0.3 + Math.random() * 0.3, maxLife: 0.6, color,
    });
  }
  ring(x, y, z, color) { this.rings.push({ x, y, z, r: 0.01, vr: 0.16, life: 1.4, maxLife: 1.4, color }); }

  update(dt) {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.life -= dt;
      if (q.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.vx *= 1 - 1.2 * dt; q.vy *= 1 - 1.2 * dt; q.vz *= 1 - 1.2 * dt;
      // keep on sphere-ish shell
      const l = Math.hypot(q.x, q.y, q.z) || 1;
      q.x /= l; q.y /= l; q.z /= l;
    }
    const rs = this.rings;
    for (let i = rs.length - 1; i >= 0; i--) {
      const r = rs[i];
      r.life -= dt; r.r += r.vr * dt;
      if (r.life <= 0) rs.splice(i, 1);
    }
  }
}
