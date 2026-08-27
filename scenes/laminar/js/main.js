// main.js — LAMINAR: wind tunnel + ink. drag carves, shift stirs, space clears.
import { LBM } from './lbm.js';
import { Renderer } from './render.js';

const canvas = document.getElementById('stage');
const sim = new LBM(200, 112);
const rend = new Renderer(canvas);

const $ = id => document.getElementById(id);
const t0 = performance.now();
let simSteps = 0;

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

// ---------- presets ----------
function clearWalls() { sim.wall.fill(0); }
function preset(n) {
  clearWalls();
  const { W, H } = sim;
  if (n === 1) { /* open tunnel */ log('open tunnel — clean wind'); }
  if (n === 2) { sim.disc(W * 0.28 | 0, H / 2, 11); log('a cylinder — watch the street of vortices'); }
  if (n === 3) { // venturi slit (wide gap keeps velocities sub-critical)
    for (let y = 0; y < H; y++) for (const x of [W * 0.38 | 0, (W * 0.38 | 0) + 1]) {
      if (Math.abs(y - H / 2) > H * 0.22) sim.setWall(x, y, 1);
    }
    log('a slit — the river narrows and runs faster');
  }
  if (n === 4) { // double cylinder
    sim.disc(W * 0.25 | 0, H * 0.35 | 0, 8); sim.disc(W * 0.45 | 0, H * 0.65 | 0, 8);
    log('twin stones');
  }
}
preset(2);

// ---------- ink emitters ----------
const NOZZLES = [
  { y: 0.30, col: [1.2, 0.25, 0.15] },   // ember red
  { y: 0.52, col: [0.15, 0.7, 1.3] },    // glacier blue
  { y: 0.74, col: [1.0, 0.75, 0.2] },    // gold
];
function emitInk() {
  for (const nz of NOZZLES) {
    const y = (nz.y * sim.H + Math.sin(simSteps * 0.002 + nz.y * 9) * 6) | 0;
    sim.stir(6, y, 0, 0, 4, nz.col);
  }
}

// ---------- input ----------
let lastInput = performance.now();
const touch = () => { lastInput = performance.now(); document.body.classList.remove('cinematic'); };
function toGrid(e) {
  return { x: (e.clientX / innerWidth) * sim.W, y: (e.clientY / innerHeight) * sim.H };
}
let drawing = 0;   // 0 none, 1 carve, 2 erase, 3 stir
let lastCell = null;
canvas.addEventListener('pointerdown', e => {
  touch();
  canvas.setPointerCapture(e.pointerId);
  drawing = e.shiftKey ? 3 : (e.button === 2 || e.buttons === 2) ? 2 : 1;
  lastCell = toGrid(e);
  applyBrush(lastCell);
});
canvas.addEventListener('pointermove', e => {
  if (!drawing) return;
  touch();
  const c = toGrid(e);
  // walk the segment so fast strokes don't skip
  const steps = Math.ceil(Math.hypot(c.x - lastCell.x, c.y - lastCell.y) / 2) || 1;
  for (let i = 1; i <= steps; i++) {
    applyBrush({ x: lastCell.x + (c.x - lastCell.x) * i / steps, y: lastCell.y + (c.y - lastCell.y) * i / steps });
  }
  lastCell = c;
});
addEventListener('pointerup', () => { drawing = 0; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
function applyBrush(c) {
  if (drawing === 1) sim.disc(c.x | 0, c.y | 0, 3, 1);
  else if (drawing === 2) sim.disc(c.x | 0, c.y | 0, 5, 0);
  else if (drawing === 3) {
    const a = Math.random() * 6.28;
    sim.stir(c.x | 0, c.y | 0, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 5,
      [0.4 + Math.random() * 0.8, 0.3 + Math.random() * 0.6, 0.5 + Math.random() * 0.8]);
  }
}
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  touch();
  if (k === ' ') { e.preventDefault(); clearWalls(); log('the river runs clear'); }
  if (k >= '1' && k <= '4') preset(+k);
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

// ---------- idle: the river sculpts itself ----------
const PRESET_NAMES = { 1: 'open water', 2: 'the cylinder', 3: 'the slit', 4: 'twin stones' };
const TOUR = [2, 3, 4, 1, 3, 2];
const ghost = { queue: [], armed: false, tourIdx: 0, nextPresetAt: 0, nextStrokeAt: 0 };

function gq(delay, x, y, r, v) { ghost.queue.push({ at: performance.now() + delay, x, y, r, v }); }

// drip a preset's walls out as a timed sequence — the ghost draws, not teleports
function queuePresetShape(n) {
  const { W, H } = sim;
  let d = 200;
  const put = (x, y, r) => { gq(d, x, y, r, 1); d += 70; };
  if (n === 2) {                              // cylinder grows outward
    const cx = W * 0.28 | 0, cy = H >> 1;
    for (let r = 1; r <= 11; r += 2) put(cx, cy, r);
  } else if (n === 3) {                       // slit sweeps in from both banks
    const x = W * 0.38 | 0, gap = H * 0.22;
    for (let y = 1; y < H / 2 - gap; y += 2) { put(x, y, 2); put(x + 1, H - 1 - y, 2); }
  } else if (n === 4) {                       // twin stones rise together
    for (let r = 1; r <= 8; r += 2) { put(W * 0.25 | 0, H * 0.35 | 0, r); put(W * 0.45 | 0, H * 0.65 | 0, r); }
  }
}

// a wandering stroke that later dissolves
function queueStroke(now) {
  const { W, H } = sim;
  const x0 = W * (0.2 + Math.random() * 0.55), y0 = H * (0.2 + Math.random() * 0.6);
  const ang = Math.random() * 6.28, bend = (Math.random() - 0.5) * 0.9;
  const cells = [];
  let x = x0, y = y0, a = ang;
  for (let i = 0; i < 8; i++) {
    cells.push([x, y]);
    a += bend;
    x += Math.cos(a) * 4; y += Math.sin(a) * 4;
  }
  cells.forEach(([cx, cy], i) => {
    gq(i * 60, cx | 0, cy | 0, 2, 1);
    gq(20000 + (cells.length - i) * 60, cx | 0, cy | 0, 3, 0);   // erased tail-first
  });
}

function ghostPump(nowMs, tSec) {
  if (!document.body.classList.contains('cinematic')) { ghost.queue.length = 0; ghost.armed = false; return; }
  if (!ghost.armed) {
    ghost.armed = true;
    clearWalls();
    queuePresetShape(TOUR[ghost.tourIdx]);
    log('the ghost takes the pen — ' + PRESET_NAMES[TOUR[ghost.tourIdx]]);
    ghost.nextPresetAt = nowMs + 55000;
    ghost.nextStrokeAt = nowMs + 16000;
  }
  let n = 0;
  while (ghost.queue.length && n < 5) {
    const op = ghost.queue[0];
    if (op.at > nowMs) break;
    ghost.queue.shift();
    sim.disc(op.x, op.y, op.r, op.v);
    n++;
  }
  if (nowMs > ghost.nextPresetAt) {
    clearWalls();
    ghost.tourIdx = (ghost.tourIdx + 1) % TOUR.length;
    queuePresetShape(TOUR[ghost.tourIdx]);
    log('the ghost redraws — ' + PRESET_NAMES[TOUR[ghost.tourIdx]]);
    ghost.nextPresetAt = nowMs + 55000 + Math.random() * 15000;
  }
  if (nowMs > ghost.nextStrokeAt && ghost.queue.length < 40) {
    queueStroke(nowMs);
    ghost.nextStrokeAt = nowMs + 18000 + Math.random() * 9000;
  }
}

function idleStep(t) {
  if (performance.now() - lastInput > 75000) {
    document.body.classList.add('cinematic');
    // wandering ink stirrer
    const x = sim.W * (0.5 + 0.38 * Math.sin(t * 0.11));
    const y = sim.H * (0.5 + 0.36 * Math.sin(t * 0.161 + 2));
    const hues = [[1.2, 0.3, 0.2], [0.2, 0.8, 1.2], [1.1, 0.8, 0.25]];
    sim.stir(x | 0, y | 0, Math.sin(t * 0.4) * 0.2, Math.cos(t * 0.3) * 0.2, 4, hues[(t / 20 | 0) % 3]);
  }
}

// ---------- loop ----------
window.__laminar = { sim, rend };
let last = performance.now(), acc = 0;
const DT = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  let e = (now - last) / 1000; last = now;
  if (e > 0.25) e = 0.25;
  acc += e;
  let steps = 0;
  while (acc >= DT && steps < 3) {
    sim.step();
    simSteps++;
    emitInk();
    acc -= DT; steps++;
  }
  if (steps === 3) acc = 0;

  idleStep(now / 1000);
  ghostPump(now, now / 1000);
  rend.frame(sim, now / 1000);

  // HUD: Reynolds-ish number
  const nu = (sim.tau - 0.5) / 3;
  const re = Math.round(sim.inletU * 22 / nu);
  const reEl = $('hud-re');
  const reS = String(re);
  if (reEl._v !== reS) { reEl._v = reS; reEl.textContent = reS; }
  const s = (now - t0) / 1000;
  const clk = `${String((s / 60) | 0).padStart(2, '0')}:${String((s | 0) % 60).padStart(2, '0')}`;
  const cEl = $('hud-clock');
  if (cEl._v !== clk) { cEl._v = clk; cEl.textContent = clk; }

  adaptQuality(e * 1000);
}
requestAnimationFrame(frame);
