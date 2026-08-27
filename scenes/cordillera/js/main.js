// main.js — CORDILLERA: a million years of rain in a minute. sculpt; rivers answer.
import { Erosion } from './sim.js';
import { Renderer } from './render.js';

const canvas = document.getElementById('stage');
const GW = 256, GH = 144;
const sim = new Erosion(GW, GH);
const rend = new Renderer(canvas, GW, GH);

const $ = id => document.getElementById(id);
const t0 = performance.now();

// ---------- adaptive quality ----------
let qScale = 0.7;
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
const toGrid = e => ({ x: (e.clientX / innerWidth) * GW, y: (e.clientY / innerHeight) * GH });
let drawing = 0;
canvas.addEventListener('pointerdown', e => {
  touch();
  canvas.setPointerCapture(e.pointerId);
  drawing = (e.button === 2 || e.buttons === 2) ? -1 : 1;
  applyBrush(toGrid(e));
});
canvas.addEventListener('pointermove', e => {
  if (!drawing) return;
  touch();
  applyBrush(toGrid(e));
});
addEventListener('pointerup', () => { drawing = 0; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
function applyBrush(c) {
  // raise a ridge / cut a canyon — the rivers will answer
  sim.sculpt(c.x | 0, c.y | 0, 7, drawing * 0.05);
}
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  touch();
  if (k === '1') { sim.genTerrain(1); log('the alps rise'); }
  if (k === '2') { sim.genTerrain(2); log('a coastal plain'); }
  if (k === '3') { sim.genTerrain(3); log('a cratered land'); }
  if (k === 'arrowup') { sim.rain = Math.min(0.022, sim.rain * 1.4); log('the monsoon comes'); }
  if (k === 'arrowdown') { sim.rain = Math.max(0.002, sim.rain * 0.7); log('the drought begins'); }
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

// ---------- ghost: the geologist ----------
const ghost = { armed: false, nextRidgeAt: 0, nextClimateAt: 0, nextWorldAt: 0 };
function ghostPump(nowMs) {
  if (!document.body.classList.contains('cinematic')) { ghost.armed = false; return; }
  if (!ghost.armed) {
    ghost.armed = true;
    ghost.nextRidgeAt = nowMs + 20000;
    ghost.nextClimateAt = nowMs + 45000;
    ghost.nextWorldAt = nowMs + 240000 + Math.random() * 120000;
    log('the geologist takes the long view');
  }
  if (nowMs > ghost.nextRidgeAt) {
    ghost.nextRidgeAt = nowMs + 26000 + Math.random() * 18000;
    const x = 20 + (Math.random() * (GW - 40)) | 0, y = 20 + (Math.random() * (GH - 40)) | 0;
    const up = Math.random() < 0.65;
    sim.sculpt(x, y, 9, up ? 0.09 : -0.09);
    log(up ? 'a ridge rises' : 'a canyon opens');
  }
  if (nowMs > ghost.nextClimateAt) {
    ghost.nextClimateAt = nowMs + 45000 + Math.random() * 25000;
    sim.rain = Math.random() < 0.5 ? 0.004 : 0.018;
    log(sim.rain > 0.015 ? 'the monsoon comes' : 'the drought begins');
  }
  if (nowMs > ghost.nextWorldAt) {
    ghost.nextWorldAt = nowMs + 240000 + Math.random() * 120000;
    sim.genTerrain(1 + (Math.random() * 3 | 0));
    log('a new land is born');
  }
}

// ---------- loop ----------
window.__cordillera = { sim, rend };
let last = performance.now(), acc = 0;
const DT = 1 / 30;
function frame(now) {
  requestAnimationFrame(frame);
  let e = (now - last) / 1000; last = now;
  if (e > 0.25) e = 0.25;
  acc += e;
  let steps = 0;
  while (acc >= DT && steps < 1) { sim.step(); acc -= DT; steps++; }
  if (steps === 1) acc = 0;

  if (now - lastInput > 75000) document.body.classList.add('cinematic');
  ghostPump(now);
  adaptQuality(e * 1000);
  rend.frame(sim, now / 1000);

  // HUD
  const st = sim.stats();
  const rEl = $('hud-rivers');
  const rS = String(st.river);
  if (rEl._v !== rS) { rEl._v = rS; rEl.textContent = rS; }
  const wEl = $('hud-rain');
  const wS = (sim.rain * 1000).toFixed(1);
  if (wEl._v !== wS) { wEl._v = wS; wEl.textContent = wS; }
  const s = (now - t0) / 1000;
  const clk = `${String((s / 60) | 0).padStart(2, '0')}:${String((s | 0) % 60).padStart(2, '0')}`;
  const cEl = $('hud-clock');
  if (cEl._v !== clk) { cEl._v = clk; cEl.textContent = clk; }
}
requestAnimationFrame(frame);
setTimeout(() => log('a million years of rain, one minute at a time'), 2500);
setTimeout(() => log('drag to raise a ridge — right-drag cuts a canyon — the rivers will answer'), 14000);
