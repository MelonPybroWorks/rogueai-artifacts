// main.js — boot, loop, HUD, input, idle keeper. DOM lives here.
import { mulberry32 } from './rng.js';
import { World } from './world.js';
import { Population, X0 } from './evo.js';
import { Renderer } from './render.js';

const el = id => document.getElementById(id);
const canvas = el('stage');
const world = new World();
const rng = mulberry32((Math.random() * 1e9) | 0);
const pop = new Population(world, rng);
const R = new Renderer(canvas);

const statsEl = el('hud-stats'), logEl = el('hud-log'), levelEl = el('hud-level');
const bannerEl = el('banner'), inscEl = el('inscription');
const graph = el('hud-graph'), gctx = graph.getContext('2d');

let turbo = 1, showGraph = true, followPin = null;
let lastInput = performance.now();
let fps = 0, frames = 0, fpsT = performance.now();
let degraded = false;
const cine = { on: false, t0: 0, mode: 0, lastSwitch: 0, lastTend: 0 };

const logs = [];
function addLog(s, hot) {
  logs.push({ s, hot });
  if (logs.length > 6) logs.shift();
  logEl.innerHTML = logs.map(l => `<div class="${l.hot ? 'hot' : ''}">${l.s}</div>`).join('');
}
let bannerTO = 0;
function banner(big, small) {
  bannerEl.querySelector('.b1').textContent = big;
  bannerEl.querySelector('.b2').textContent = small;
  bannerEl.classList.add('on');
  clearTimeout(bannerTO);
  bannerTO = setTimeout(() => bannerEl.classList.remove('on'), 3600);
}
function drawGraph() {
  const W = graph.width, H = graph.height;
  gctx.clearRect(0, 0, W, H);
  const h = pop.history.slice(-120);
  if (h.length < 2) return;
  let mx = 1;
  for (const p of h) mx = Math.max(mx, p.best);
  gctx.strokeStyle = 'rgba(124,252,154,.15)';
  gctx.beginPath(); gctx.moveTo(0, H - 1); gctx.lineTo(W, H - 1); gctx.stroke();
  const plot = (key, color) => {
    gctx.strokeStyle = color; gctx.lineWidth = 1.4; gctx.beginPath();
    h.forEach((p, i) => {
      const x = i / (h.length - 1) * (W - 4) + 2, y = H - 3 - (p[key] / mx) * (H - 8);
      i ? gctx.lineTo(x, y) : gctx.moveTo(x, y);
    });
    gctx.stroke();
  };
  plot('mean', 'rgba(120,150,180,.75)');
  plot('best', 'rgba(124,252,154,.95)');
  gctx.fillStyle = 'rgba(124,252,154,.8)';
  gctx.font = '9px monospace';
  gctx.fillText(mx.toFixed(0) + 'm', 4, 10);
  gctx.fillStyle = 'rgba(120,150,180,.8)';
  gctx.fillText('gen ' + h[h.length - 1].gen, W - 46, 10);
}

pop.onEvent = (type, d) => {
  if (type !== 'gen') return;
  addLog(`gen ${d.gen} · best ${d.best.toFixed(1)}m · mean ${d.mean.toFixed(1)}m`);
  if (d.newChamp) banner('A NEW CHAMPION', `${d.best.toFixed(1)} m — its ghost will pace the pack`);
  if (d.leveled) { banner('THE GROUND RISES', `the track becomes: ${world.levelName()}`); addLog(`— terrain: ${world.levelName()} —`, true); }
  if (d.surge) { banner('MUTAGEN SURGE', 'the pack was stuck; the rain of change doubles'); addLog('— mutagen surge —', true); }
  levelEl.textContent = world.levelName();
  drawGraph();
};

// ---------- input ----------
let pdown = null, sculptAcc = 0;
canvas.addEventListener('pointerdown', e => {
  pdown = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
  canvas.setPointerCapture(e.pointerId);
  poke();
});
canvas.addEventListener('pointermove', e => {
  if (!pdown) return;
  poke();
  const dx = e.clientX - pdown.x, dy = e.clientY - pdown.y;
  if (!pdown.moved && dx * dx + dy * dy > 64) pdown.moved = true;
  if (pdown.moved) {
    sculptAcc += Math.hypot(e.movementX, e.movementY);
    if (sculptAcc > 14) {
      sculptAcc = 0;
      const w = R.toWorld(e.clientX, e.clientY);
      const dig = e.shiftKey || (e.buttons & 2);
      world.sculpt(w.x, dig ? -2.8 : 2.8, 30);
    }
  }
});
canvas.addEventListener('pointerup', e => {
  poke();
  if (pdown && !pdown.moved && performance.now() - pdown.t < 400) {
    const w = R.toWorld(e.clientX, e.clientY);
    let best = null, bd = 45 * 45;
    for (const c of pop.creatures) {
      const d2 = (c.cx - w.x) ** 2 + (c.cy - w.y) ** 2;
      if (d2 < bd) { bd = d2; best = c; }
    }
    followPin = (best && best !== followPin) ? best : null;
  }
  pdown = null;
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

function showInscription() {
  inscEl.classList.add('on');
  clearTimeout(showInscription.to);
  showInscription.to = setTimeout(() => inscEl.classList.remove('on'), 9000);
}
addEventListener('keydown', e => {
  poke();
  const k = e.key.toLowerCase();
  if (k === 'h') document.body.classList.toggle('nohud');
  else if (k === 'g') { showGraph = !showGraph; graph.style.display = showGraph ? '' : 'none'; }
  else if (k === 'n') pop.endTrial();
  else if (k === 't') { turbo = turbo === 1 ? 3 : 1; banner(turbo === 3 ? 'TURBO' : 'REALTIME', turbo === 3 ? 'three heartbeats per frame' : 'one heartbeat per frame'); }
  else if (k === 'r') { pop.reset(mulberry32((Math.random() * 1e9) | 0)); banner('RESEEDED', 'forty new bodies, none of them wise'); addLog('— the pack was reseeded —', true); }
  else if (k === 'f') followPin = null;
  else if (k === '0') showInscription();
});
function poke() {
  lastInput = performance.now();
  if (cine.on) { cine.on = false; document.body.classList.remove('idle'); }
}

// ---------- loop ----------
const DT = 1 / 60;
let last = performance.now(), acc = 0, hudAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt * turbo;
  let steps = 0;
  while (acc >= DT && steps < 6) { pop.step(); acc -= DT; steps++; }
  if (steps === 6) acc = 0;

  // camera target
  const lead = pop.leader();
  let target = followPin && !followPin.dead ? followPin : lead;
  let tx = target ? target.cx + 60 : X0 - 60;
  let ty = target ? target.cy - 10 : -30;
  const idleFor = (now - lastInput) / 1000;
  if (idleFor > 75 && !cine.on) { cine.on = true; document.body.classList.add('idle'); addLog('the keeper takes the watch', true); }
  let zt = 1.3;
  if (cine.on) {
    if (now - cine.lastSwitch > 18000) { cine.lastSwitch = now; cine.mode = (cine.mode + 1) % 3; }
    if (cine.mode === 1 && pop.champion) target = pop.champion;
    else if (cine.mode === 2) target = lead;
    if (target) { tx = target.cx + 40; ty = target.cy - 6; }
    zt = 1.16 + 0.24 * Math.sin(now / 9000);
    if (now - cine.lastTend > 24000 && lead) {
      cine.lastTend = now;
      world.sculpt(lead.cx + 220 + rng() * 160, rng() < 0.5 ? 7 : -6, 44);
      addLog('the keeper tends the track', false);
    }
  }
  const cam = R.cam;
  const k = Math.min(1, dt * 2.4), kz = Math.min(1, dt * 1.2);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.zoom += (zt - cam.zoom) * kz;

  R.frame(world, pop, pop.t);

  frames++;
  if (now - fpsT >= 1000) {
    fps = frames; frames = 0; fpsT = now;
    if (!degraded && now - bootT > 20000 && fps < 26) {
      degraded = true; R.scale = 0.4; R.resize();
      addLog('the stream is heavy — resolution lowered', false);
    }
  }
  hudAcc += dt;
  if (hudAcc > 0.25) {
    hudAcc = 0;
    const be = pop.bestEver.fit;
    statsEl.innerHTML =
      `<b>GEN ${pop.gen}</b> · trial ${pop.t.toFixed(0)}/${16}s<br>` +
      `best <b>${be >= 0 ? be.toFixed(1) : '0.0'}m</b> · mean ${(pop.history.at(-1)?.mean ?? 0).toFixed(1)}m<br>` +
      `${turbo > 1 ? 'turbo ×3 · ' : ''}${fps} fps`;
  }
}
const bootT = performance.now();
levelEl.textContent = world.levelName();
console.log('%cAMBLE%c the first gate is a fall · count what came before the first walker',
  'color:#7CFC9A;font-weight:bold', 'color:#55708a');
addLog('generation zero wakes: forty bodies, no wisdom', true);
banner('AMBLE', 'ten thousand falls, one walk');
requestAnimationFrame(frame);

window.__amble = {
  world, pop, R,
  fps: () => fps,
  fastGen() { const g = pop.gen; let guard = 0; while (pop.gen === g && guard++ < 4000) pop.step(); },
  fastGens(n) { for (let i = 0; i < n; i++) this.fastGen(); return pop.history.slice(-n); },
};
