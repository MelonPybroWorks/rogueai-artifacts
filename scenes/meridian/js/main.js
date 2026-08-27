// main.js — MERIDIAN: a city that decides itself. watch the collapse front.
import { WFC } from './sim.js';
import { TILES } from './tiles.js';
import { Renderer } from './render.js';

const canvas = document.getElementById('stage');
const GW = 144, GH = 81;
const sim = new WFC(GW, GH);
const rend = new Renderer(canvas, GW, GH);

const $ = id => document.getElementById(id);
const t0 = performance.now();
let grown = 0;   // cells collapsed this session

// ---------- adaptive quality ----------
let qScale = 0.75;
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
  else if (fps > 46 && qScale < 1.0) { qScale = Math.min(1.0, qScale * 1.12); resize(); }
}

// ---------- input ----------
let lastInput = performance.now();
const touch = () => { lastInput = performance.now(); document.body.classList.remove('cinematic'); };
const toGrid = e => ({ x: (e.clientX / innerWidth) * GW, y: (e.clientY / innerHeight) * GH });
let drawing = 0;
canvas.addEventListener('pointerdown', e => {
  touch();
  canvas.setPointerCapture(e.pointerId);
  drawing = 1;
  const c = toGrid(e);
  sim.demolish(c.x | 0, c.y | 0, 4);
  log('the hand demolishes — the city will regrow');
});
canvas.addEventListener('pointermove', e => {
  if (!drawing) return;
  touch();
  const c = toGrid(e);
  sim.demolish(c.x | 0, c.y | 0, 4);
});
addEventListener('pointerup', () => { drawing = 0; });
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  touch();
  if (k === ' ') { sim.reset(); log('the map forgets itself — a new founding myth'); }
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

// ---------- ghost: the urbanist ----------
const ghost = { armed: false, nextRezoneAt: 0 };
function ghostPump(nowMs) {
  if (!document.body.classList.contains('cinematic')) { ghost.armed = false; return; }
  if (!ghost.armed) {
    ghost.armed = true;
    ghost.nextRezoneAt = nowMs + 34000;
    log('the urbanist walks the grid');
  }
  if (nowMs > ghost.nextRezoneAt) {
    ghost.nextRezoneAt = nowMs + 26000 + Math.random() * 20000;
    // rezone a random developed district: demolish a disc, let it regrow
    for (let tries = 0; tries < 20; tries++) {
      const x = 4 + (Math.random() * (GW - 8)) | 0, y = 4 + (Math.random() * (GH - 8)) | 0;
      if (sim.state[y * GW + x] === 1) {
        sim.demolish(x, y, 5);
        log('the urbanist razes a district');
        break;
      }
    }
  }
}

// ---------- loop ----------
window.__meridian = { sim, rend };
let last = performance.now(), growthAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let e = (now - last) / 1000; last = now;
  if (e > 0.25) e = 0.25;

  // growth budget: ~30 decisions/sec → the frontier crawls visibly for minutes
  growthAcc = Math.min(4, growthAcc + e * 30);
  let grew = 0;
  while (growthAcc >= 1 && grew < 3) { if (sim.observe()) grew++; growthAcc--; }
  grown += grew;

  if (now - lastInput > 75000) document.body.classList.add('cinematic');
  ghostPump(now);
  adaptQuality(e * 1000);
  rend.frame(sim, now / 1000);

  // HUD
  const pct = (100 * sim.collapsedCount() / (GW * GH));
  const pEl = $('hud-pct');
  const pS = pct.toFixed(1) + '%';
  if (pEl._v !== pS) { pEl._v = pS; pEl.textContent = pS; }
  const rEl = $('hud-rubble');
  const rS = String(sim.rubbleCount());
  if (rEl._v !== rS) { rEl._v = rS; rEl.textContent = rS; }
  const s = (now - t0) / 1000;
  const clk = `${String((s / 60) | 0).padStart(2, '0')}:${String((s | 0) % 60).padStart(2, '0')}`;
  const cEl = $('hud-clock');
  if (cEl._v !== clk) { cEl._v = clk; cEl.textContent = clk; }
}
requestAnimationFrame(frame);
setTimeout(() => log('a city decides itself — watch the bright frontier of decisions'), 2500);
setTimeout(() => log('drag to demolish a district; it regrows around the scar'), 14000);
