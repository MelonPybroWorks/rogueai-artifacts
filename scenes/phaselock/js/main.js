// main.js — PHASELOCK: a field of oscillators learning to pulse together.
import { Kuramoto } from './sim.js';
import { Renderer } from './render.js';

const canvas = document.getElementById('stage');
const GW = 240, GH = 135;
const sim = new Kuramoto(GW, GH);
const rend = new Renderer(canvas, GW, GH);

const $ = id => document.getElementById(id);
const t0 = performance.now();

const K_PRESETS = [0.25, 1.1, 2.4];
const K_NAMES = ['drift — every light for itself', 'the threshold — domains bloom', 'lockstep — one pulse'];
let kIdx = 1;

// ---------- adaptive quality ----------
let qScale = 0.6;
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
  if (fps < 26 && qScale > 0.3) { qScale = Math.max(0.3, qScale * 0.8); resize(); }
  else if (fps > 46 && qScale < 0.85) { qScale = Math.min(0.85, qScale * 1.12); resize(); }
}

// ---------- input ----------
let lastInput = performance.now();
const touch = () => { lastInput = performance.now(); document.body.classList.remove('cinematic'); };
const toGrid = e => ({ x: (e.clientX / innerWidth) * GW, y: (e.clientY / innerHeight) * GH });
let drawing = 0;   // 1 plant lighthouse, 2 remove
let lastCell = null;
canvas.addEventListener('pointerdown', e => {
  touch();
  canvas.setPointerCapture(e.pointerId);
  drawing = (e.button === 2 || e.buttons === 2) ? 2 : 1;
  lastCell = toGrid(e);
  applyBrush(lastCell);
});
canvas.addEventListener('pointermove', e => {
  if (!drawing) return;
  touch();
  const c = toGrid(e);
  const steps = Math.ceil(Math.hypot(c.x - lastCell.x, c.y - lastCell.y) / 2) || 1;
  for (let i = 1; i <= steps; i++)
    applyBrush({ x: lastCell.x + (c.x - lastCell.x) * i / steps, y: lastCell.y + (c.y - lastCell.y) * i / steps });
  lastCell = c;
});
addEventListener('pointerup', () => { drawing = 0; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
function applyBrush(c) {
  const r = 2;
  for (let y = Math.max(1, c.y - r | 0); y <= Math.min(GH - 2, c.y + r | 0); y++)
    for (let x = Math.max(1, c.x - r | 0); x <= Math.min(GW - 2, c.x + r | 0); x++)
      if ((x - c.x) ** 2 + (y - c.y) ** 2 <= r * r) sim.setPace(x, y, drawing === 1);
}
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  touch();
  if (k >= '1' && k <= '3') { kIdx = +k - 1; sim.K = K_PRESETS[kIdx]; log('coupling → ' + K_NAMES[kIdx]); }
  if (k === 'arrowup') { sim.K = Math.min(4, sim.K + 0.05); log('K = ' + sim.K.toFixed(2)); }
  if (k === 'arrowdown') { sim.K = Math.max(0, sim.K - 0.05); log('K = ' + sim.K.toFixed(2)); }
  if (k === 'c') { sim.pace.fill(0); log('the lighthouses go dark'); }
  if (k === ' ') { for (let i = 0; i < sim.th.length; i++) sim.th[i] = Math.random() * 6.283; log('the field forgets everything'); }
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

// ---------- ghost: the choirmaster ----------
const ghost = { armed: false, t0: 0, nextPaceAt: 0, lamps: [] };
function ghostPump(nowMs) {
  if (!document.body.classList.contains('cinematic')) { ghost.armed = false; return; }
  if (!ghost.armed) {
    ghost.armed = true;
    ghost.t0 = nowMs;
    ghost.nextPaceAt = nowMs + 12000;
    log('the choirmaster takes the field');
  }
  const t = (nowMs - ghost.t0) / 1000;
  // slow K sweep through the threshold, over a ~75s period
  sim.K = 1.3 + 1.15 * Math.sin(t * 0.084);
  // plant and retire lighthouses
  if (nowMs > ghost.nextPaceAt) {
    ghost.nextPaceAt = nowMs + 22000 + Math.random() * 10000;
    if (ghost.lamps.length >= 3) {
      const old = ghost.lamps.shift();
      sim.setPace(old[0], old[1], false);
      log('a lighthouse gutters out');
    }
    const x = 20 + Math.random() * (GW - 40) | 0, y = 20 + Math.random() * (GH - 40) | 0;
    sim.setPace(x, y, true);
    ghost.lamps.push([x, y]);
    log('the choirmaster lights a beacon');
  }
}

// ---------- loop ----------
window.__phaselock = { sim, rend };
let last = performance.now(), acc = 0, orderEma = 0;
const DT = 1 / 35;
function frame(now) {
  requestAnimationFrame(frame);
  let e = (now - last) / 1000; last = now;
  if (e > 0.25) e = 0.25;
  acc += e;
  let steps = 0;
  while (acc >= DT && steps < 3) { sim.step(DT); acc -= DT; steps++; }
  if (steps === 3) acc = 0;

  if (now - lastInput > 75000) document.body.classList.add('cinematic');
  ghostPump(now);
  adaptQuality(e * 1000);
  rend.frame(sim);

  // HUD: neighbor coherence — cos(Δθ) to the right-hand neighbor, sampled
  if ((sim.t * 35 | 0) % 30 === 0) {
    let coh = 0, n = 0;
    for (let i = 0; i < sim.th.length - 1; i += 13) { coh += Math.cos(sim.th[i] - sim.th[i + 1]); n++; }
    orderEma = orderEma * 0.9 + (coh / n) * 0.1;
  }
  const oEl = $('hud-order');
  const oS = orderEma.toFixed(2);
  if (oEl._v !== oS) { oEl._v = oS; oEl.textContent = oS; }
  const kEl = $('hud-k');
  const kS = sim.K.toFixed(2);
  if (kEl._v !== kS) { kEl._v = kS; kEl.textContent = kS; }
  const s = (now - t0) / 1000;
  const clk = `${String((s / 60) | 0).padStart(2, '0')}:${String((s | 0) % 60).padStart(2, '0')}`;
  const cEl = $('hud-clock');
  if (cEl._v !== clk) { cEl._v = clk; cEl.textContent = clk; }
}
requestAnimationFrame(frame);
setTimeout(() => log('a field of ten thousand tiny lights, almost in time'), 2500);
setTimeout(() => log('drag plants a lighthouse · 1–3 set the coupling'), 13000);
