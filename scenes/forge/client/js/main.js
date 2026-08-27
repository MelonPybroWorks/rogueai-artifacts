// main.js — FORGE client: net glue, input, camera, spectate director
import { Net } from './net.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';

const canvas = document.getElementById('stage');
const net = new Net();
const rend = new Renderer(canvas);
const hud = new Hud(net);

const st = {
  players: [], nodes: [], buildings: [], pickups: [], projectiles: [],
  myId: 0,
};
let joined = false;
let dead = false;

// ---------- adaptive quality ----------
let qScale = 0.55;
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

// ---------- camera ----------
const cam = { x: 1800, y: 1800, z: 0.9, _specT: 0, _sx: 1800, _sy: 1800 };
function camStep(e) {
  let tx = null, ty = null;
  const meAlive = joined && st.players.find(p => p[0] === st.myId && p[5] === 1);
  if (meAlive) {
    const me = st.players.find(p => p[0] === st.myId);
    tx = me[1]; ty = me[2];
    cam.z += (1.0 - cam.z) * e;
  } else {
    // spectate: centroid of living HUMANS; fall back to bots, then wander
    let alive = st.players.filter(p => p[5] === 1 && !p[7]);
    if (!alive.length) alive = st.players.filter(p => p[5] === 1);
    if (alive.length) {
      let sx = 0, sy = 0;
      for (const p of alive) { sx += p[1]; sy += p[2]; }
      tx = sx / alive.length; ty = sy / alive.length;
    } else {
      cam._specT += e;
      tx = 1800 + Math.cos(cam._specT * 0.05) * 900;
      ty = 1800 + Math.sin(cam._specT * 0.037) * 900;
    }
    cam.z += (0.62 - cam.z) * e * 0.5;
  }
  if (tx !== null) { cam._sx = tx; cam._sy = ty; }
  const k = 1 - Math.exp(-e * 3.2);
  cam.x += (cam._sx - cam.x) * k;
  cam.y += (cam._sy - cam.y) * k;
}

// ---------- net wiring ----------
net.on._open = () => {
  if (joined) { net.send({ t: 'join', name: myName() }); }   // rejoin after reconnect
};
net.on.snap = (m) => { st.players = m.pl; st.pickups = m.pk; st.projectiles = m.pr; };
net.on.nodes = (m) => { st.nodes = m.list; };
net.on.bld = (m) => { st.buildings = m.list; };
net.on.me = (m) => { hud.setMe(m); };
net.on.ev = (m) => {
  if (m.ev && m.ev.length) hud.events(m.ev);
  if (m.fx) for (const f of m.fx) {
    const parts = f.msg.split(' ');
    const kind = parts[0].slice(1);   // '·swing' → 'swing'
    if (kind === 'swing') rend.fxSwing(+parts[2], +parts[3], +parts[4]);
    else if (kind === 'shoot') rend.fxShoot(+parts[1], +parts[2], +parts[3], +parts[4]);
    else if (kind === 'die' || kind === 'razed') rend.fxDeath(+parts[parts.length - 2], +parts[parts.length - 1]);
  }
};
net.on.craft = (m) => hud.craftResult(m.item);
net.connect();

// ---------- join ----------
function myName() {
  let n = localStorage.getItem('forge-name');
  if (!n) {
    n = 'smith-' + Math.random().toString(36).slice(2, 6);
    localStorage.setItem('forge-name', n);
  }
  return n;
}
const joinEl = document.getElementById('join');
document.getElementById('join-name').value = myName();
document.getElementById('join-go').onclick = doJoin;
document.getElementById('join-name').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
function doJoin() {
  const name = document.getElementById('join-name').value.trim().slice(0, 16) || 'smith';
  localStorage.setItem('forge-name', name);
  net.send({ t: 'join', name });
  joined = true;
  joinEl.classList.add('hidden');
  document.body.classList.remove('cinematic');
}
document.getElementById('join-spec').onclick = () => joinEl.classList.add('hidden');
// spectators: server already streams snapshots; overlay fades itself after a while
setTimeout(() => { if (!joined) joinEl.classList.add('hidden'); }, 14000);

// death overlay click → hurry respawn
hud.el.death.onclick = () => net.send({ t: 'respawn-now' });

// ---------- input ----------
const keys = new Set();
let mouseX = 0, mouseY = 0, lastInput = performance.now();
const touch = () => { lastInput = performance.now(); document.body.classList.remove('cinematic'); };

addEventListener('keydown', e => {
  touch();
  const k = e.key.toLowerCase();
  if (hud.craftOpen) {
    if (k === 'escape' || k === 'c') hud.toggleCraft(false);
    return;
  }
  if (k === 'c') { hud.toggleCraft(); return; }
  if (k === 'h') { document.body.classList.toggle('cinematic'); return; }
  if (k === 'u') { net.send({ t: 'use', i: currentEquip() }); return; }
  if (k >= '1' && k <= '9') { net.send({ t: 'equip', i: +k - 1 }); return; }
  keys.add(k);
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
canvas.addEventListener('pointermove', e => { mouseX = e.clientX; mouseY = e.clientY; touch(); });
canvas.addEventListener('pointerdown', e => {
  touch();
  if (!joined) { joinEl.classList.remove('hidden'); return; }
  // placing a building? (equipped item is a building)
  const me = hud._me;
  const eq = me && me.equip >= 0 ? me.items[me.equip] : null;
  const wx = cam.x + (e.clientX - innerWidth / 2) / cam.z;
  const wy = cam.y + (e.clientY - innerHeight / 2) / cam.z;
  if (eq && eq.kind === 'building') net.send({ t: 'build', i: me.equip, x: wx, y: wy });
  else net.send({ t: 'swing' });
});
function currentEquip() { return hud._me ? hud._me.equip : -1; }

// input → server at 15Hz
setInterval(() => {
  if (!joined) return;
  let mx = 0, my = 0;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (keys.has('w') || keys.has('arrowup')) my -= 1;
  if (keys.has('s') || keys.has('arrowdown')) my += 1;
  const aim = Math.atan2(mouseY - innerHeight / 2, mouseX - innerWidth / 2);
  net.send({ t: 'in', mx, my, aim });
}, 66);

// idle → cinematic
function idleStep() {
  if (performance.now() - lastInput > 75000) document.body.classList.add('cinematic');
}

window.__forge = { st, cam, net, hud, rend };

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const f0 = performance.now();
  let e = (now - last) / 1000; last = now;
  if (e > 0.25) e = 0.25;
  camStep(e);
  idleStep();
  hud.step(e, st);
  st.meGather = hud._me ? hud._me.gather || 0 : 0;
  st.camX = cam.x; st.camY = cam.y;
  rend.frame(st, cam, now / 1000);
  adaptQuality(e * 1000);
  window.__forge.frameMs = (window.__forge.frameMs || 0) * 0.9 + (performance.now() - f0) * 0.1;
}
requestAnimationFrame(frame);
