// main.js — PYRE: a falling-sand alchemy kit. paint matter, set it on fire.
import { Pyre, EMPTY, STONE, SAND, WATER, OIL, WOOD, FIRE, LAVA, ACID, STEAM, SMOKE, MAT_NAME } from './sim.js';
import { VIGNETTES } from './vignettes.js';
import { Renderer } from './render.js';

const canvas = document.getElementById('stage');
const GW = 240, GH = 136;
const sim = new Pyre(GW, GH);
const rend = new Renderer(canvas, GW, GH);

const $ = id => document.getElementById(id);
const t0 = performance.now();

// material palette: keys 1..9,0
const PALETTE = [SAND, WATER, STONE, WOOD, OIL, FIRE, LAVA, ACID, STEAM, SMOKE];
const PAL_KEYS = '1234567890';
let curMat = SAND;

// opening set: undulating dunes, two stone ridges, a shack, a waiting oil pool
function opening() {
  sim.clear();
  for (let x = 6; x < GW - 6; x++) {
    const crest = Math.round(3 * Math.sin(x * 0.055) + 1.5 * Math.sin(x * 0.13 + 2));
    for (let d = 0; d < 6 + crest; d++) sim.paint(x, GH - 6 - 6 - crest + d + 6, 0, SAND);
  }
  // stone ridges
  for (let y = GH - 34; y < GH - 10; y++) { sim.paint(GW * 0.2 | 0, y, 2, STONE); sim.paint(GW * 0.8 | 0, y, 2, STONE); }
  // a little shack on the east ridge
  const sx = GW * 0.8 | 0;
  for (let x = sx - 5; x <= sx + 5; x++) { sim.paint(x, GH - 35, 1, WOOD); }
  for (let y = GH - 44; y < GH - 34; y++) { sim.paint(sx - 5, y, 1, WOOD); sim.paint(sx + 5, y, 1, WOOD); }
  for (let x = sx - 6; x <= sx + 6; x++) sim.paint(x, GH - 45, 1, WOOD);
  // oil pool between the ridges
  sim.paint(GW * 0.5 | 0, GH - 16, 5, OIL);
}
opening();

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
let drawing = 0;   // 1 paint, 2 erase
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
  const steps = Math.ceil(Math.hypot(c.x - lastCell.x, c.y - lastCell.y) / 1.5) || 1;
  for (let i = 1; i <= steps; i++)
    applyBrush({ x: lastCell.x + (c.x - lastCell.x) * i / steps, y: lastCell.y + (c.y - lastCell.y) * i / steps });
  lastCell = c;
});
addEventListener('pointerup', () => { drawing = 0; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
function applyBrush(c) {
  const r = curMat === STONE || curMat === WOOD ? 3 : curMat === FIRE ? 3 : 2;
  if (drawing === 1) sim.paint(c.x | 0, c.y | 0, r, curMat);
  else if (drawing === 2) sim.erase(c.x | 0, c.y | 0, 4);
}
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  touch();
  const ki = PAL_KEYS.indexOf(k);
  if (ki >= 0) { curMat = PALETTE[ki]; log('the hand takes ' + MAT_NAME[curMat]); }
  if (k === ' ') { e.preventDefault(); opening(); log('swept clean — the dunes return'); }
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

// ---------- ghost: the keeper of small fires ----------
const ghost = { armed: false, idx: 0, builtAt: 0, ignited: false, fuseAt: 0, nextAt: 0 };
function ghostPump(nowMs) {
  if (!document.body.classList.contains('cinematic')) { ghost.armed = false; return; }
  if (!ghost.armed) {
    ghost.armed = true;
    ghost.idx = (ghost.idx + 1) % VIGNETTES.length;
    const v = VIGNETTES[ghost.idx];
    sim.clear();
    ghost.fuseAt = v.build(sim, GW, GH);
    ghost.builtAt = nowMs;
    ghost.ignited = false;
    ghost.nextAt = nowMs + 42000 + Math.random() * 12000;
    log('the keeper builds ' + v.name);
    return;
  }
  const v = VIGNETTES[ghost.idx];
  if (!ghost.ignited && ghost.fuseAt && nowMs > ghost.builtAt + 2600) {
    ghost.ignited = true;
    sim.paint(ghost.fuseAt[0], ghost.fuseAt[1], 2, FIRE);
    log('a match is struck');
  }
  if (nowMs > ghost.nextAt) ghost.armed = false;   // sweep & rebuild next tick
}

// ---------- loop ----------
window.__pyre = { sim, rend, ghost };
let last = performance.now(), acc = 0;
const DT = 1 / 30;
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
  adaptQuality(e * 1000);          // BEFORE render: resize leaves no blank frame
  rend.frame(sim, now / 1000);

  // HUD
  const mEl = $('hud-mat');
  const mS = MAT_NAME[curMat].toUpperCase();
  if (mEl._v !== mS) { mEl._v = mS; mEl.textContent = mS; }
  const s = (now - t0) / 1000;
  const clk = `${String((s / 60) | 0).padStart(2, '0')}:${String((s | 0) % 60).padStart(2, '0')}`;
  const cEl = $('hud-clock');
  if (cEl._v !== clk) { cEl._v = clk; cEl.textContent = clk; }
}
requestAnimationFrame(frame);
setTimeout(() => log('paint matter with the hand — or wait, and watch the keeper work'), 2500);
setTimeout(() => log('keys 1–0 choose the element · fire is key 6'), 13000);
