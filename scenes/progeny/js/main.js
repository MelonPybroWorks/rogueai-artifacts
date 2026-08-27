// main.js — boot, fixed-step loop, input, idle director. Sim modules stay DOM-free.
import { CFG } from './config.js';
import { mulberry32, clamp } from './util.js';
import { World } from './world.js';
import { Ecology } from './probes.js';
import { FX } from './fx.js';
import { Camera } from './camera.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';

const canvas = document.getElementById('stage');
const rng = mulberry32((Date.now() % 2147483647) >>> 0);
const world = new World(rng);
const fx = new FX();
const eco = new Ecology(rng, world, fx);
const cam = new Camera(CFG.WORLD);
const rend = new Renderer(canvas);
const hud = new Hud();

// genesis on the richest rock, proven all-rounder hull
{
  const rich = world.richest();
  eco.deployGenesis(rich.x + rich.r + 26, rich.y, new Float32Array([0.55, 0.60, 0.45, 0.55, 0.52, 0.58]), 168);
  cam.jumpTo(rich.x, rich.y, 0.55);
  cam._poi = { x: rich.x, y: rich.y, z: 0.55 };
}

world.onCometLand = (a) => {
  fx.ring(a.x, a.y, 'rgba(160,230,255,1)');
  fx.burst(a.x, a.y, 10, '#9fdcff', 120);
  world.emit('comet delivered a fresh lode', 'good');
  lastComet = { x: a.x, y: a.y, t: simTime };
};
let lastComet = null;
let simTime = 0;

// ---------- adaptive quality (vesper lesson: small buffers under SwiftShader) ----------
let qScale = 0.6;
function resize() {
  rend.resize(innerWidth, innerHeight, qScale);
  cam.resize(innerWidth, innerHeight);
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
  if (fps < 26 && qScale > 0.32) { qScale = Math.max(0.32, qScale * 0.8); resize(); }
  else if (fps > 52 && qScale < 0.85) { qScale = Math.min(0.85, qScale * 1.12); resize(); }
}

// ---------- input ----------
let lastInput = performance.now();
let cinematicForced = false;
const touch = () => {
  lastInput = performance.now();
  if (cam.auto && !cinematicForced) { cam.auto = false; document.body.classList.remove('cinematic'); }
};

let drag = null, pinch = null;
canvas.addEventListener('pointerdown', e => {
  touch();
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
});
canvas.addEventListener('pointermove', e => {
  rend.mouse.x = e.clientX; rend.mouse.y = e.clientY; rend.mouse.active = true;
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (drag.moved > 6) {
    cam.pan(dx, dy);
    drag.x = e.clientX; drag.y = e.clientY;
  }
  touch();
});
canvas.addEventListener('pointerup', e => {
  touch();
  const wasClick = drag && drag.moved <= 6 && performance.now() - drag.t < 600;
  drag = null;
  if (!wasClick) return;
  // click = seed a fresh asteroid (gift of ore)
  const wx = clamp(cam.toWorldX(e.clientX), 60, CFG.WORLD - 60);
  const wy = clamp(cam.toWorldY(e.clientY), 60, CFG.WORLD - 60);
  const a = world._addAsteroid(wx, wy, true, 1.1);
  fx.ring(a.x, a.y, 'rgba(126,224,194,1)');
  fx.burst(a.x, a.y, 8, '#7ee0c2', 80);
  world.emit('an asteroid condenses from the dust — seeded by a visitor', 'good');
});
canvas.addEventListener('pointerleave', () => { rend.mouse.active = false; });
canvas.addEventListener('wheel', e => {
  e.preventDefault(); touch();
  cam.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0012));
}, { passive: false });

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'f') { touch(); world.forceFlare(); }
  else if (k === 'n') {
    touch();
    const rich = world.richest();
    if (rich) {
      const g = new Float32Array(6);
      for (let i = 0; i < 6; i++) g[i] = rng();
      eco.deployGenesis(rich.x + rich.r + 30, rich.y + 20, g, rng() * 360);
      fx.ring(rich.x, rich.y, 'rgba(255,255,255,0.9)');
    }
  }
  else if (k === 'h') {
    cinematicForced = !cinematicForced;
    cam.auto = cinematicForced;
    document.body.classList.toggle('cinematic', cinematicForced);
    lastInput = performance.now();
  }
});

// ---------- idle director ----------
let poiTimer = 0, poiIdx = 0;
function directorStep(dt) {
  const idleFor = performance.now() - lastInput;
  if (!cam.auto && idleFor > 75000) {
    cam.auto = true; cinematicForced = false;
    document.body.classList.add('cinematic');
  }
  if (!cam.auto) return;
  poiTimer -= dt;
  if (poiTimer > 0) return;
  poiTimer = 13 + rng() * 7;

  // candidate points of interest
  const pois = [];
  // 1. densest probe cluster (coarse grid)
  const grid = new Map();
  for (const p of eco.probes) {
    if (p.state === 'derelict') continue;
    const k = ((p.x / 700) | 0) * 1000 + ((p.y / 700) | 0);
    const g = grid.get(k) || { x: 0, y: 0, n: 0 };
    g.x += p.x; g.y += p.y; g.n++;
    grid.set(k, g);
  }
  let best = null;
  for (const g of grid.values()) if (g.n > 4 && (!best || g.n > best.n)) best = g;
  if (best) pois.push({ x: best.x / best.n, y: best.y / best.n, z: 0.85 });
  // 2. flare front
  if (world.flare.phase === 'sweep') {
    const f = world.flare;
    pois.push({ x: f.ox + f.nx * f.dist, y: f.oy + f.ny * f.dist, z: 0.5 });
  }
  // 3. recent comet lode
  if (lastComet && simTime - lastComet.t < 40) pois.push({ x: lastComet.x, y: lastComet.y, z: 0.9 });
  // 4. whole-field vista
  pois.push({ x: CFG.WORLD / 2, y: CFG.WORLD / 2, z: cam.fitZoom() * 1.25 });

  const pick = pois.length ? pois[poiIdx++ % pois.length] : null;
  if (pick) cam.setPoi(pick.x, pick.y, pick.z);
}

// ---------- extinction watch: the ark reseeds ----------
let deadT = 0;
function reseedStep(dt) {
  if (eco.probes.length > 0) { deadT = 0; return; }
  deadT += dt;
  if (deadT > 5) {
    deadT = 0;
    const rich = world.richest();
    if (rich) {
      const g = new Float32Array(6);
      for (let i = 0; i < 6; i++) g[i] = 0.3 + rng() * 0.5;
      eco.deployGenesis(rich.x + rich.r + 30, rich.y, g, rng() * 360);
      world.emit('generation zero remembers — the ark reseeds the sector', 'good');
    }
  }
}

// ---------- main loop ----------
window.__progeny = { world, eco, fx, cam, rend, hud };   // headless smoke tests
const DT = 1 / 60;
let last = performance.now(), acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let e = (now - last) / 1000; last = now;
  if (e > 0.25) e = 0.25;
  acc += e;

  let steps = 0;
  while (acc >= DT && steps < 4) {
    world.update(DT, eco.probes, (p, i) => eco.kill(p, i, 'burn'));
    eco.update(DT);
    fx.update(DT);
    simTime += DT;
    acc -= DT; steps++;
  }
  if (steps === 4) acc = 0;

  directorStep(e);
  reseedStep(e);
  cam.step(e, now / 1000);
  hud.drainEvents(world);
  hud.step(e, world, eco);
  rend.frame(world, eco, fx, cam, now / 1000);
  adaptQuality(e * 1000);
}
requestAnimationFrame(frame);
