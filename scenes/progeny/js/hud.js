// hud.js — DOM overlay: stats, event log, population sparkline
export class Hud {
  constructor() {
    this.el = {
      pop: document.getElementById('hud-pop'),
      gen: document.getElementById('hud-gen'),
      ore: document.getElementById('hud-ore'),
      strains: document.getElementById('hud-strains'),
      flares: document.getElementById('hud-flares'),
      clock: document.getElementById('hud-clock'),
      log: document.getElementById('hud-log'),
    };
    this.pc = document.getElementById('popcanvas');
    this.pctx = this.pc.getContext('2d');
    this.samples = new Array(110).fill(0);
    this._sT = 0;
    this._logItems = [];
    this._t0 = performance.now();
    this._dirty = true;
  }

  drainEvents(world) {
    for (const ev of world.events) {
      this._logItems.push({ msg: ev.msg, cls: ev.cls, t: performance.now() });
      this._dirty = true;
    }
    world.events.length = 0;
    while (this._logItems.length > 7) { this._logItems.shift(); this._dirty = true; }
  }

  step(dt, world, eco) {
    // stats (cheap text writes, guarded by change)
    const pop = eco.probes.length;
    this._text(this.el.pop, String(pop));
    this._text(this.el.gen, String(eco.maxGen));
    this._text(this.el.ore, String(Math.round(world.totalOre() / 1000)) + 'k');
    this._text(this.el.strains, String(eco.book.strains.length));
    this._text(this.el.flares, String(world.flareCount));
    const s = (performance.now() - this._t0) / 1000;
    this._text(this.el.clock, `${String((s / 60) | 0).padStart(2, '0')}:${String((s | 0) % 60).padStart(2, '0')}`);

    // log fade + rebuild only when changed
    const now = performance.now();
    let need = this._dirty;
    for (const it of this._logItems) {
      const age = (now - it.t) / 1000;
      const op = age < 14 ? 1 : Math.max(0, 1 - (age - 14) / 6);
      if (op <= 0) { this._logItems.splice(this._logItems.indexOf(it), 1); need = true; }
      else if (!it.op || Math.abs(it.op - op) > 0.08) { it.op = op; need = true; }
    }
    if (need) {
      this.el.log.innerHTML = this._logItems
        .map(it => `<div class="ev ${it.cls}" style="opacity:${(it.op ?? 1).toFixed(2)}">${it.msg}</div>`)
        .join('');
      this._dirty = false;
    }

    // sparkline @2Hz
    this._sT += dt;
    if (this._sT > 0.5) {
      this._sT = 0;
      this.samples.push(pop); this.samples.shift();
      this._drawSpark();
    }
  }

  _drawSpark() {
    const c = this.pctx, W = this.pc.width, H = this.pc.height;
    c.clearRect(0, 0, W, H);
    const max = Math.max(60, ...this.samples);
    c.beginPath();
    this.samples.forEach((v, i) => {
      const x = (i / (this.samples.length - 1)) * W;
      const y = H - 3 - (v / max) * (H - 8);
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    });
    c.strokeStyle = 'rgba(126,224,194,0.8)'; c.lineWidth = 1.2; c.stroke();
    c.lineTo(W, H); c.lineTo(0, H); c.closePath();
    c.fillStyle = 'rgba(126,224,194,0.10)'; c.fill();
  }

  _text(el, v) { if (el._v !== v) { el._v = v; el.textContent = v; } }
}
