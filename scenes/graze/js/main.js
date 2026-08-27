// main.js — boot, fixed-step loop, input, idle director
import { CFG } from './config.js';
import { mulberry32, clamp } from './util.js';
import { Sim } from './sim.js';
import { FX } from './fx.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';

const canvas = document.getElementById('stage');
const rng = mulberry32((Date.now() % 2147483647) >>> 0);
const fx = new FX();
const sim = new Sim(rng, fx);
const rend = new Renderer(canvas);
const hud = new Hud();

sim.emit('160 minds wake at the bottom of the storm', 'good');
sim.emit('only the dodgers breed', '');

// ---------- adaptive quality ----------
let qScale = 0.5;
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
let cinematicForced = false;
const touch = () => {
  lastInput = performance.now();
  if (!cinematicForced) document.body.classList.remove('cinematic');
};

const keys = new Set();
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  touch();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  keys.add(k);
  const p = sim.player;
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    if (!p.ever) { p.ever = true; p.alive = true; p.shield = 1.6; sim.emit('a human enters the storm', 'good'); }
    else if (!p.alive && p.respawnT <= 0.2) { p.alive = true; p.shield = 1.4; p.x = CFG.FW / 2; p.y = CFG.FH - 36; }
  }
  if (k >= '1' && k <= '6') sim.forceCard(CFG.CARDS[+k - 1]);
  if (k === 'b') sim.bomb();
  if (k === 'h') {
    cinematicForced = !cinematicForced;
    document.body.classList.toggle('cinematic', cinematicForced);
  }
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

// click = bullet bloom (ring burst at cursor)
canvas.addEventListener('pointerdown', e => {
  touch();
  const w = rend.toWorld(e.clientX, e.clientY);
  if (!w) return;
  const n = 18, off = rng() * TAU_;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU_;
    if (sim.bullets.length >= CFG.MAX_BULLETS) break;
    sim.bullets.push({ x: w.x, y: w.y, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85, hue: (rng() * 360) | 0, r: 3.2 });
  }
  fx.ring(w.x, w.y, 'rgba(255,154,213,1)');
  sim.emit('a visitor blooms a bullet flower', '');
});
const TAU_ = Math.PI * 2;

// ---------- idle cinematic (HUD fades; the arena plays itself) ----------
function idleStep() {
  if (!cinematicForced && performance.now() - lastInput > 75000)
    document.body.classList.add('cinematic');
}

// ---------- player axes from keys ----------
function playerAxes() {
  const p = sim.player;
  let ax = 0, ay = 0;
  if (keys.has('a') || keys.has('arrowleft')) ax -= 1;
  if (keys.has('d') || keys.has('arrowright')) ax += 1;
  if (keys.has('w') || keys.has('arrowup')) ay -= 1;
  if (keys.has('s') || keys.has('arrowdown')) ay += 1;
  if (ax && ay) { ax *= 0.7071; ay *= 0.7071; }
  p.ax = ax; p.ay = ay;
}

window.__graze = { sim, rend, hud, fx };

const DT = 1 / 60;
let last = performance.now(), acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let e = (now - last) / 1000; last = now;
  if (e > 0.25) e = 0.25;
  acc += e;
  playerAxes();

  let steps = 0;
  while (acc >= DT && steps < 4) {
    sim.update(DT);
    fx.update(DT);
    acc -= DT; steps++;
  }
  if (steps === 4) acc = 0;

  idleStep();
  hud.drainEvents(sim);
  hud.step(e, sim);
  rend.frame(sim, fx, now / 1000);
  adaptQuality(e * 1000);
}
requestAnimationFrame(frame);
