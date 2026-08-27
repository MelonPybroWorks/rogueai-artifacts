// main.js — SAIL: a banner in the wind. grab it, slash it, watch the keeper mend.
import { Cloth } from './sim.js';
import { Renderer } from './render.js';

const canvas = document.getElementById('stage');
const WORLD_W = 960, WORLD_H = 540;
const sim = new Cloth(88, 26, 10);
const rend = new Renderer(canvas);

const $ = id => document.getElementById(id);
const t0 = performance.now();

// ---------- adaptive quality ----------
let qScale = 0.62;
function resize() {
  rend.resize(innerWidth, innerHeight, qScale);
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
}
addEventListener('resize', resize);
resize();
let dtEma = 16, qTimer = 0;
function adaptQuality(ms) {
  dtEma = dtEma * 0.94 + Math.min(ms, 120) * 0.06;
  qTimer += ms;
  if (qTimer < 2500) return;
  qTimer = 0;
  const fps = 1000 / Math.max(dtEma, 1);
  if (fps < 26 && qScale > 0.35) { qScale = Math.max(0.35, qScale * 0.8); resize(); }
  else if (fps > 46 && qScale < 0.9) { qScale = Math.min(0.9, qScale * 1.12); resize(); }
}

// ---------- input ----------
let lastInput = performance.now();
const touch = () => { lastInput = performance.now(); document.body.classList.remove('cinematic'); };
const toWorld = e => ({ x: (e.clientX / innerWidth) * WORLD_W, y: (e.clientY / innerHeight) * WORLD_H });
let drawing = 0;   // 1 grab, 2 slash
let lastPt = null, grabbed = -1;
canvas.addEventListener('pointerdown', e => {
  touch();
  canvas.setPointerCapture(e.pointerId);
  const c = toWorld(e);
  if (e.button === 2 || e.buttons === 2) { drawing = 2; sim.tear(c.x - 1, c.y - 1, c.x, c.y); }
  else { drawing = 1; grabbed = sim.grab(c.x, c.y, 30); }
  lastPt = c;
});
canvas.addEventListener('pointermove', e => {
  if (!drawing) return;
  touch();
  const c = toWorld(e);
  if (drawing === 1 && grabbed >= 0) sim.pull(grabbed, c.x, c.y);
  else if (drawing === 2 && lastPt) sim.tear(lastPt.x, lastPt.y, c.x, c.y);
  lastPt = c;
});
addEventListener('pointerup', () => { drawing = 0; grabbed = -1; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  touch();
  if (k === ' ') { sim.buildBanner(); log('a fresh banner is hung'); }
  if (k === 'g') { sim.windDir *= -1; log('the wind turns'); }
  if (k === 'arrowup') { sim.wind = Math.min(2.2, sim.wind + 0.25); log('the gale rises'); }
  if (k === 'arrowdown') { sim.wind = Math.max(0.05, sim.wind - 0.25); log('the wind slackens'); }
  if (k === 'h') document.body.classList.toggle('cinematic');
});

function log(msg) {
  const el = $('hud-log');
  const d = document.createElement('div');
  d.className = 'ev'; d.textContent = msg;
  el.appendChild(d);
  while (el.children.length > 6) el.firstChild.remove();
  setTimeout(() => { d.style.transition = 'opacity 2s'; d.style.opacity = '0'; }, 9000);
  setTimeout(() => d.remove(), 11500);
}

// ---------- ghost: the keeper of banners ----------
const ghost = { armed: false, nextGustAt: 0, nextMendAt: 0, nextSlashAt: 0 };
function ghostPump(nowMs, t) {
  if (!document.body.classList.contains('cinematic')) { ghost.armed = false; return; }
  if (!ghost.armed) {
    ghost.armed = true;
    ghost.nextGustAt = nowMs + 9000;
    ghost.nextSlashAt = nowMs + 50000;
    ghost.nextMendAt = nowMs + 90000;
    log('the keeper climbs the mast');
  }
  if (nowMs > ghost.nextGustAt) {
    ghost.nextGustAt = nowMs + 12000 + Math.random() * 14000;
    if (Math.random() < 0.3) { sim.windDir *= -1; log('the wind turns'); }
    else { sim.wind = 0.2 + Math.random() * 1.6; log(sim.wind > 1.1 ? 'a gale' : 'a breeze'); }
  }
  if (nowMs > ghost.nextSlashAt) {
    ghost.nextSlashAt = nowMs + 55000 + Math.random() * 25000;
    // a lightning slash across a random band
    const y0 = 80 + Math.random() * (WORLD_H - 200);
    sim.tear(60, y0, WORLD_W - 60, y0 + (Math.random() - 0.5) * 160);
    log('something sharp passes through the banner');
  }
  if (nowMs > ghost.nextMendAt) {
    ghost.nextMendAt = nowMs + 95000 + Math.random() * 30000;
    const st = sim.stats();
    if (st.broken > st.total * 0.08) { sim.buildBanner(); log('the keeper hangs a fresh banner'); }
    else log('the keeper checks the knots');
  }
}

// ---------- loop ----------
window.__sail = { sim, rend };
let last = performance.now(), acc = 0;
const DT = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  let e = (now - last) / 1000; last = now;
  if (e > 0.25) e = 0.25;
  acc += e;
  let steps = 0;
  while (acc >= DT && steps < 3) { sim.step(DT, WORLD_W, WORLD_H, now / 1000); acc -= DT; steps++; }
  if (steps === 3) acc = 0;

  if (now - lastInput > 75000) document.body.classList.add('cinematic');
  ghostPump(now, now / 1000);
  adaptQuality(e * 1000);
  rend.frame(sim, now / 1000);

  const st = sim.stats();
  const sEl = $('hud-tears');
  const sS = String(st.broken);
  if (sEl._v !== sS) { sEl._v = sS; sEl.textContent = sS; }
  const wEl = $('hud-wind');
  const wS = (sim.wind * sim.windDir).toFixed(1);
  if (wEl._v !== wS) { wEl._v = wS; wEl.textContent = wS; }
  const s = (now - t0) / 1000;
  const clk = `${String((s / 60) | 0).padStart(2, '0')}:${String((s | 0) % 60).padStart(2, '0')}`;
  const cEl = $('hud-clock');
  if (cEl._v !== clk) { cEl._v = clk; cEl.textContent = clk; }
}
requestAnimationFrame(frame);
setTimeout(() => log('a banner in the wind — grab it, or right-drag to slash'), 2500);
setTimeout(() => log('G turns the wind · ↑↓ its strength · space re-hangs'), 13000);
