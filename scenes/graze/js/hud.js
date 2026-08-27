// hud.js — DOM overlay: evolution stats, spell card bar, event log, sparkline
import { CFG } from './config.js';

export class Hud {
  constructor() {
    this.el = {
      births: document.getElementById('hud-births'),
      alive: document.getElementById('hud-alive'),
      best: document.getElementById('hud-best'),
      gen: document.getElementById('hud-gen'),
      graze: document.getElementById('hud-graze'),
      clock: document.getElementById('hud-clock'),
      card: document.getElementById('hud-cardname'),
      cardfill: document.getElementById('cardfill'),
      you: document.getElementById('hud-you'),
      log: document.getElementById('hud-log'),
      banner: document.getElementById('banner'),
    };
    this.pc = document.getElementById('popcanvas');
    this.pctx = this.pc.getContext('2d');
    this.samples = new Array(110).fill(0);
    this._sT = 0;
    this._logItems = [];
    this._t0 = performance.now();
    this._dirty = true;
    this._bannerT = 0;
    this._lastCard = '';
  }

  drainEvents(sim) {
    for (const ev of sim.events) {
      this._logItems.push({ msg: ev.msg, cls: ev.cls, t: performance.now() });
      this._dirty = true;
      if (ev.msg.startsWith('spell card')) this._showBanner(sim.pat.card.toUpperCase(), 'SPELL CARD');
      else if (ev.msg.startsWith('new record')) this._showBanner(ev.msg.split('—')[1]?.trim().toUpperCase() || '', 'NEW RECORD');
    }
    sim.events.length = 0;
    while (this._logItems.length > 7) { this._logItems.shift(); this._dirty = true; }
  }

  _showBanner(big, small) {
    this.el.banner.innerHTML = `${this._esc(big)}<small>${this._esc(small)}</small>`;
    this.el.banner.classList.add('show');
    this._bannerT = 2.2;
  }
  _esc(s) { return s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

  step(dt, sim) {
    this._text(this.el.births, String(sim.births));
    this._text(this.el.alive, String(sim.agents.length));
    this._text(this.el.best, sim.bestTime.toFixed(1) + 's');
    this._text(this.el.gen, String(sim.maxGen));
    const grazes = sim.agents.reduce((s, a) => s + a.grazes, 0);
    this._text(this.el.graze, String(sim.bestGraze));
    const s = (performance.now() - this._t0) / 1000;
    this._text(this.el.clock, `${String((s / 60) | 0).padStart(2, '0')}:${String((s | 0) % 60).padStart(2, '0')}`);

    // spell card bar
    this._text(this.el.card, sim.pat.card.toUpperCase());
    const pct = Math.min(100, (sim.pat.t / CFG.CARD_TIME) * 100);
    this.el.cardfill.style.width = pct.toFixed(0) + '%';

    // player line
    const p = sim.player;
    const you = !p.ever ? 'press WASD / arrows to fly yourself'
      : p.alive ? `YOU · alive ${p.t.toFixed(1)}s · best ${p.best.toFixed(1)}s`
      : `YOU · down — best ${p.best.toFixed(1)}s (the machines continue)`;
    this._text(this.el.you, you);

    // banner fade
    if (this._bannerT > 0) {
      this._bannerT -= dt;
      if (this._bannerT <= 0) this.el.banner.classList.remove('show');
    }

    // log
    const now = performance.now();
    let need = this._dirty;
    for (let i = this._logItems.length - 1; i >= 0; i--) {
      const it = this._logItems[i];
      const age = (now - it.t) / 1000;
      const op = age < 13 ? 1 : Math.max(0, 1 - (age - 13) / 6);
      if (op <= 0) { this._logItems.splice(i, 1); need = true; }
      else if (!it.op || Math.abs(it.op - op) > 0.08) { it.op = op; need = true; }
    }
    if (need) {
      this.el.log.innerHTML = this._logItems
        .map(it => `<div class="ev ${it.cls}" style="opacity:${(it.op ?? 1).toFixed(2)}">${it.msg}</div>`)
        .join('');
      this._dirty = false;
    }

    // sparkline: rolling avg death fitness (learning curve)
    this._sT += dt;
    if (this._sT > 0.5) {
      this._sT = 0;
      const gf = sim.gravesFit.length ? sim.gravesFit.reduce((s2, v) => s2 + v, 0) / sim.gravesFit.length : 0;
      this.samples.push(gf); this.samples.shift();
      this._drawSpark();
    }
  }

  _drawSpark() {
    const c = this.pctx, W = this.pc.width, H = this.pc.height;
    c.clearRect(0, 0, W, H);
    const max = Math.max(10, ...this.samples);
    c.beginPath();
    this.samples.forEach((v, i) => {
      const x = (i / (this.samples.length - 1)) * W;
      const y = H - 3 - (v / max) * (H - 8);
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    });
    c.strokeStyle = 'rgba(255,154,213,0.8)'; c.lineWidth = 1.2; c.stroke();
    c.lineTo(W, H); c.lineTo(0, H); c.closePath();
    c.fillStyle = 'rgba(255,154,213,0.10)'; c.fill();
  }

  _text(el, v) { if (el._v !== v) { el._v = v; el.textContent = v; } }
}
