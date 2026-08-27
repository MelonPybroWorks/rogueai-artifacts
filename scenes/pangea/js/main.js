// main.js — boot, fixed-step loop, input, idle director
import { CFG } from './config.js';
import { mulberry32, clamp } from './util.js';
import { Sphere } from './sphere.js';
import { Life } from './life.js';
import { FX } from './fx.js';
import { Camera } from './camera.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';

const canvas = document.getElementById('stage');
const rng = mulberry32((Date.now() % 2147483647) >>> 0);
const sphere = new Sphere(rng);
const fx = new FX();
const life = new Life(rng, sphere, fx);
const cam = new Camera();
const rend = new Renderer(canvas);
const hud = new Hud();

// meteors in flight (telegraphed strikes)
const meteors = [];   // {dir:[x,y,z], t, sx, sy}

// ---------- adaptive quality ----------
let qScale = 0.55;
function resize() {
  rend.resize(innerWidth, innerHeight, qScale);
  cam.resize();
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
  cam.auto = false;
  if (!cinematicForced) document.body.classList.remove('cinematic');
};

let drag = null;
canvas.addEventListener('pointerdown', e => {
  touch();
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (drag.moved > 5) {
    cam.drag(dx, dy);
    drag.x = e.clientX; drag.y = e.clientY;
  }
  touch();
});
let meteorCD = 0;
canvas.addEventListener('pointerup', e => {
  touch();
  const wasClick = drag && drag.moved <= 5 && performance.now() - drag.t < 600;
  drag = null;
  if (!wasClick || meteorCD > 0) return;
  const dir = rend.pickDir(e.clientX, e.clientY, cam);
  if (!dir) return;
  meteorCD = CFG.METEOR_COOLDOWN;
  scheduleMeteor(dir);
});
canvas.addEventListener('wheel', e => {
  e.preventDefault(); touch();
  cam.zoom(Math.exp(e.deltaY * 0.001));
}, { passive: false });

function scheduleMeteor(dir) {
  meteors.push({ dir, t: 0.85 });
  life.emit('impact alarm — meteor inbound', 'warn');
}

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  touch();
  if (k === ' ') {
    e.preventDefault();
    for (let i = 0; i < 5; i++) {
      const a = rng() * Math.PI * 2, z = rng() * 2 - 1, r = Math.sqrt(1 - z * z);
      setTimeout(() => scheduleMeteor([r * Math.cos(a), z, r * Math.sin(a)]), i * 380);
    }
    life.emit('meteor storm summoned', 'warn');
  }
  if (k === 'h') {
    cinematicForced = !cinematicForced;
    document.body.classList.toggle('cinematic', cinematicForced);
    if (cinematicForced) cam.auto = true;
  }
});

// ---------- idle ----------
function idleStep() {
  if (!cinematicForced && performance.now() - lastInput > 75000) {
    document.body.classList.add('cinematic');
    cam.auto = true;
  }
}

window.__pangea = { sphere, life, fx, cam, rend };

const DT = 1 / 60;
let last = performance.now(), acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let e = (now - last) / 1000; last = now;
  if (e > 0.25) e = 0.25;
  acc += e;
  if (meteorCD > 0) meteorCD -= e;

  let steps = 0;
  while (acc >= DT && steps < 4) {
    life.update(DT);
    fx.update(DT);
    acc -= DT; steps++;
  }
  if (steps === 4) acc = 0;

  // meteors strike
  for (let i = meteors.length - 1; i >= 0; i--) {
    meteors[i].t -= e;
    if (meteors[i].t <= 0) {
      life.meteor(meteors[i].dir);
      fx.burst(meteors[i].dir[0], meteors[i].dir[1], meteors[i].dir[2], 14, '#ffb35c', 0.7);
      meteors.splice(i, 1);
    }
  }

  idleStep();
  cam.step(e, now / 1000);
  hud.drainEvents(life);
  hud.step(e, life);

  // sun direction (day cycle)
  const wt = (now / 1000) * (Math.PI * 2 / CFG.DAY_LEN);
  const sun = { x: Math.cos(wt), y: 0.22, z: Math.sin(wt) };
  rend.frame(sphere, life, fx, cam, sun, now / 1000);

  // draw inbound meteors as streaks (screen space overlay via fx rings is enough;
  // streak skip — impact flashes carry the read)
  adaptQuality(e * 1000);
}
requestAnimationFrame(frame);
