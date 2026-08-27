// main.js — CATHODE: a machine of sparks. drag cuts, right-drag lays wire,
// shift-drag strikes sparks, space hushes, 1–3 rewires the whole board.
import { WW, EMPTY, WIRE, HEAD, TAIL } from './sim.js';
import { PRESETS, procedural } from './layout.js';
import { mulberry32 } from './util.js';
import { Renderer } from './render.js';

const canvas = document.getElementById('stage');
const GW = 336, GH = 189;
const sim = new WW(GW, GH);
const rend = new Renderer(canvas, GW, GH);

const $ = id => document.getElementById(id);
const t0 = performance.now();

// ---------- presets + blueprint (the ghost's memory) ----------
let presetIdx = 0;
let blueprint = null;
let improvCount = 0;
function preset(n, silent) {
  if (n < PRESETS.length) {
    presetIdx = n;
    blueprint = PRESETS[presetIdx].build(GW, GH);
    if (!silent) log('rewired — ' + PRESETS[presetIdx].name);
  } else {
    // the keeper improvises: a fresh machine every time past the tour
    presetIdx = n;
    improvCount++;
    blueprint = procedural(GW, GH, mulberry32((Date.now() ^ (improvCount * 0x9e3779b9)) >>> 0));
    if (!silent) log('the keeper improvises — machine #' + improvCount);
  }
  sim.load(blueprint);
}
preset(0, true);
setTimeout(() => log('three bells feed the looms — cut a trace (drag), the keeper will come'), 2500);
setTimeout(() => log('space stills every spark'), 14000);

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
let drawing = 0;                 // 1 cut · 2 lay wire · 3 strike sparks
let lastCell = null;
canvas.addEventListener('pointerdown', e => {
  touch();
  canvas.setPointerCapture(e.pointerId);
  drawing = e.shiftKey ? 3 : (e.button === 2 || e.buttons === 2) ? 2 : 1;
  lastCell = toGrid(e);
  applyBrush(lastCell, lastCell);
});
canvas.addEventListener('pointermove', e => {
  if (!drawing) return;
  touch();
  const c = toGrid(e);
  const steps = Math.ceil(Math.hypot(c.x - lastCell.x, c.y - lastCell.y) / 1.5) || 1;
  for (let i = 1; i <= steps; i++)
    applyBrush({ x: lastCell.x + (c.x - lastCell.x) * i / steps, y: lastCell.y + (c.y - lastCell.y) * i / steps }, c);
  lastCell = c;
});
addEventListener('pointerup', () => { drawing = 0; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

function brushDisc(c, r, fn) {
  for (let y = Math.max(1, c.y - r | 0); y <= Math.min(GH - 2, c.y + r | 0); y++)
    for (let x = Math.max(1, c.x - r | 0); x <= Math.min(GW - 2, c.x + r | 0); x++)
      if ((x - c.x) ** 2 + (y - c.y) ** 2 <= r * r) fn(x, y);
}
function applyBrush(c, toward) {
  if (drawing === 1) brushDisc(c, 2.5, (x, y) => { sim.cells[y * GW + x] = EMPTY; });
  else if (drawing === 2) brushDisc(c, 1.5, (x, y) => { const i = y * GW + x; if (sim.cells[i] === EMPTY) sim.cells[i] = WIRE; });
  else if (drawing === 3) {
    // strike a spark oriented along the stroke so it has somewhere to go
    const dx = Math.sign(toward.x - c.x), dy = Math.sign(toward.y - c.y);
    const i = (c.y | 0) * GW + (c.x | 0);
    if (sim.cells[i] === WIRE) {
      sim.cells[i] = HEAD;
      const bx = (c.x | 0) - (dx || 1), by = (c.y | 0) - dy;
      if (bx > 0 && by > 0 && bx < GW - 1 && by < GH - 1 && sim.cells[by * GW + bx] === WIRE)
        sim.cells[by * GW + bx] = TAIL;
    }
  }
}
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  touch();
  if (k === ' ') { e.preventDefault(); sim.hush(); log('the machine holds its breath'); }
  if (k >= '1' && k <= '3') preset(+k - 1);
  if (k === 'r') { sim.load(blueprint); log('restored from the blueprint'); }
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

// ---------- ghost: idle screensaver — repair, stir, rewire ----------
const ghost = { nextSparkAt: 0, nextPresetAt: 0, lastHush: 0 };
function ghostPump(nowMs) {
  if (!document.body.classList.contains('cinematic')) { ghost.armed = false; return; }
  if (!ghost.armed) {
    ghost.armed = true;
    ghost.nextSparkAt = nowMs + 6000;
    ghost.nextPresetAt = nowMs + 70000;
    log('the keeper walks the halls of the machine');
  }
  // repair structure: restore cut wires, clear stray ones (≤4 cells / frame,
  // scanning with a persistent cursor so the whole board gets visited)
  let fixed = 0, scanned = 0;
  ghost.scanPos = ghost.scanPos || GW;
  while (fixed < 4 && scanned < 4000) {
    const i = ghost.scanPos;
    ghost.scanPos += 1 + ((Math.random() * 9) | 0);
    if (ghost.scanPos >= blueprint.length - GW) ghost.scanPos = GW;
    scanned++;
    const b = blueprint[i], c = sim.cells[i];
    if (b === WIRE && c === EMPTY) { sim.cells[i] = WIRE; fixed++; }
    else if (b === EMPTY && (c === WIRE || c === HEAD || c === TAIL)) { sim.cells[i] = EMPTY; fixed++; }
  }
  // strike a spark on a random intact wire
  if (nowMs > ghost.nextSparkAt) {
    ghost.nextSparkAt = nowMs + 7000 + Math.random() * 5000;
    for (let tries = 0; tries < 40; tries++) {
      const i = (1 + (Math.random() * (GH - 2)) | 0) * GW + (1 + (Math.random() * (GW - 2)) | 0);
      if (sim.cells[i] !== WIRE) continue;
      // orient along any wire neighbor
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const d = dirs[(Math.random() * 4) | 0];
      if (sim.cells[i + d[1] * GW + d[0]] === WIRE) {
        sim.cells[i] = HEAD; sim.cells[i + d[1] * GW + d[0]] = TAIL;
        break;
      }
    }
  }
  // frenzy cap: silence, then the overture again
  if (sim.sparks > 2200 && nowMs - ghost.lastHush > 45000) {
    ghost.lastHush = nowMs;
    sim.hush();
    log('overloaded — the keeper pulls the main switch');
  }
  if (nowMs > ghost.nextPresetAt) {
    ghost.nextPresetAt = nowMs + 70000 + Math.random() * 20000;
    preset(presetIdx + 1);
  }
}

// ---------- loop ----------
window.__cathode = { sim, rend, ghost, preset };
let last = performance.now(), acc = 0;
const DT = 1 / 22;                       // 22 generations per second
function frame(now) {
  requestAnimationFrame(frame);
  let e = (now - last) / 1000; last = now;
  if (e > 0.25) e = 0.25;
  acc += e;
  let steps = 0;
  while (acc >= DT && steps < 3) { sim.step(); acc -= DT; steps++; }
  if (steps === 3) acc = 0;

  if (now - lastInput > 75000) document.body.classList.add('cinematic');
  ghostPump(now);
  adaptQuality(e * 1000);   // BEFORE render: resize leaves no blank frame
  rend.frame(sim, now / 1000);

  // HUD
  const gEl = $('hud-gen');
  const gS = String(sim.gen);
  if (gEl._v !== gS) { gEl._v = gS; gEl.textContent = gS; }
  const sEl = $('hud-sparks');
  const sS = String(sim.sparks);
  if (sEl._v !== sS) { sEl._v = sS; sEl.textContent = sS; }
  const s = (now - t0) / 1000;
  const clk = `${String((s / 60) | 0).padStart(2, '0')}:${String((s | 0) % 60).padStart(2, '0')}`;
  const cEl = $('hud-clock');
  if (cEl._v !== clk) { cEl._v = clk; cEl.textContent = clk; }

}
requestAnimationFrame(frame);
