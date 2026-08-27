// main.js — INFALL: raw Newton on a big dark field. throw stars into it.
import { NBody } from './sim.js';
import { Renderer } from './render.js';

const canvas = document.getElementById('stage');
const sim = new NBody(2400);
const rend = new Renderer(canvas);
sim.seedDisk();

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
  if (fps < 26 && qScale > 0.3) { qScale = Math.max(0.3, qScale * 0.8); resize(); }
  else if (fps > 46 && qScale < 0.85) { qScale = Math.min(0.85, qScale * 1.12); resize(); }
}

// ---------- input ----------
let lastInput = performance.now();
const touch = () => { lastInput = performance.now(); document.body.classList.remove('cinematic'); };
const toWorld = e => {
  const u2 = rend.u2px;
  return { x: (e.clientX - innerWidth / 2) / u2, y: (e.clientY - innerHeight / 2) / u2 };
};
let dragStart = null, dragNow = null;
let starMass = 3500;
canvas.addEventListener('pointerdown', e => {
  touch();
  canvas.setPointerCapture(e.pointerId);
  dragStart = toWorld(e); dragNow = dragStart;
});
canvas.addEventListener('pointermove', e => { if (dragStart) { touch(); dragNow = toWorld(e); } });
addEventListener('pointerup', e => {
  if (!dragStart) return;
  touch();
  const d = dragNow || dragStart;
  // slingshot: drag vector becomes launch velocity (scaled)
  let vx = (d.x - dragStart.x) * 0.006, vy = (d.y - dragStart.y) * 0.006;
  const sp = Math.hypot(vx, vy), vmax = 4;
  if (sp > vmax) { vx *= vmax / sp; vy *= vmax / sp; }
  sim.addStar(dragStart.x, dragStart.y, vx, vy, starMass);
  log('a star falls in — ' + (sim.sm.length) + ' abroad');
  dragStart = dragNow = null;
});
canvas.addEventListener('wheel', e => {
  touch();
  starMass = Math.max(800, Math.min(12000, starMass * (e.deltaY > 0 ? 0.85 : 1.18)));
  log('mass → ' + (starMass | 0));
}, { passive: true });
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  touch();
  if (k === '1') { sim.seedDisk(); log('a fresh disk condenses'); }
  if (k === '2') { sim.seedTwin(); log('two galaxies approach one another'); }
  if (k === ' ') { sim.seedDisk(); }
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

// ---------- ghost: the gardener of collapses ----------
const ghost = { armed: false, nextThrowAt: 0, nextResetAt: 0, throws: 0 };
function ghostPump(nowMs) {
  if (!document.body.classList.contains('cinematic')) { ghost.armed = false; return; }
  if (!ghost.armed) {
    ghost.armed = true;
    ghost.nextThrowAt = nowMs + 14000;
    ghost.nextResetAt = nowMs + 150000 + Math.random() * 60000;
    log('the gardener begins to throw stars');
  }
  if (nowMs > ghost.nextThrowAt && sim.sm.length < 5) {
    ghost.nextThrowAt = nowMs + 22000 + Math.random() * 16000;
    ghost.throws++;
    const a = Math.random() * 6.283, r = 650 + Math.random() * 350;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    // tangential-ish orbit with inward bias — sometimes resonant, sometimes fatal
    const v = Math.sqrt(sim.M0 / r) * (0.5 + Math.random() * 0.75);
    sim.addStar(x, y, -Math.sin(a) * v, Math.cos(a) * v, 2000 + Math.random() * 5000);
    log('the gardener throws a star');
  }
  if (nowMs > ghost.nextResetAt) {
    ghost.nextResetAt = nowMs + 150000 + Math.random() * 90000;
    if (ghost.throws % 2 === 0) { sim.seedTwin(); log('the gardener collides two galaxies'); }
    else { sim.seedDisk(); log('the gardener condenses a fresh disk'); }
  }
}

// ---------- loop ----------
window.__infall = { sim, rend };
let last = performance.now(), acc = 0;
const DT = 1 / 30;
function frame(now) {
  requestAnimationFrame(frame);
  let e = (now - last) / 1000; last = now;
  if (e > 0.25) e = 0.25;
  acc += e;
  let steps = 0;
  while (acc >= DT && steps < 2) { sim.step(0.075); acc -= DT; steps++; }
  if (steps === 2) acc = 0;

  if (now - lastInput > 75000) document.body.classList.add('cinematic');
  ghostPump(now);
  adaptQuality(e * 1000);
  rend.frame(sim, now / 1000);

  // HUD
  const dEl = $('hud-dust');
  const dS = String(sim.liveDust());
  if (dEl._v !== dS) { dEl._v = dS; dEl.textContent = dS; }
  const sEl = $('hud-stars');
  const sS = String(sim.sm.length);
  if (sEl._v !== sS) { sEl._v = sS; sEl.textContent = sS; }
  const mEl = $('hud-mass');
  const mS = String(starMass | 0);
  if (mEl._v !== mS) { mEl._v = mS; mEl.textContent = mS; }
  const s2 = (now - t0) / 1000;
  const clk = `${String((s2 / 60) | 0).padStart(2, '0')}:${String((s2 | 0) % 60).padStart(2, '0')}`;
  const cEl = $('hud-clock');
  if (cEl._v !== clk) { cEl._v = clk; cEl.textContent = clk; }
}
requestAnimationFrame(frame);
setTimeout(() => log('2,400 grains of dust circle a hungry center'), 2500);
setTimeout(() => log('click throws a star · drag sets its velocity · scroll sets its mass'), 14000);
