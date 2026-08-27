// main.js — REVERIE: the machine dreams aloud. motes gather into the words.
import { Reverie } from './sim.js';
import { museLine } from './muse.js';
import { px, blend } from './px.js';

const canvas = document.getElementById('stage');
const GW = 480, GH = 270;
const sim = new Reverie(1500, GW, GH);

const $ = id => document.getElementById(id);
const t0 = performance.now();

// ---------- renderer (inline — small) ----------
const ctx = canvas.getContext('2d', { alpha: false });
let qScale = 0.8;
let img, buf;
function resize() {
  const W = Math.max(2, Math.round(innerWidth * qScale)), H = Math.max(2, Math.round(innerHeight * qScale));
  canvas.width = W; canvas.height = H;
  canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
  img = ctx.createImageData(W, H);
  buf = new Uint32Array(img.data.buffer);
  rend.sx = W / GW; rend.sy = H / GH;
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
  if (fps < 26 && qScale > 0.4) { qScale = Math.max(0.4, qScale * 0.8); resize(); }
  else if (fps > 46 && qScale < 1.0) { qScale = Math.min(1.0, qScale * 1.12); resize(); }
}
function rend() {
  // fade
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    const r = (c & 255) * 0.905, g = ((c >> 8) & 255) * 0.905, b = ((c >> 16) & 255) * 0.92;
    buf[i] = 0xff000000 | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0);
  }
  const gather = sim.mode === 'gather' || sim.mode === 'hold';
  const sx = rend.sx, sy = rend.sy;
  const W2 = img.width, H2 = img.height;
  for (let i = 0; i < sim.N; i++) {
    const X = (sim.x[i] * sx) | 0, Y = (sim.y[i] * sy) | 0;
    if (X < 0 || Y < 0 || X >= W2 || Y >= H2) continue;
    const idx = Y * W2 + X;
    const gatherGlow = gather && sim.on[i];
    const col = gatherGlow ? px(255, 236, 190) : px(130, 195, 240);
    if (gatherGlow) {
      buf[idx] = blend(buf[idx], col, 255);
      if (X + 1 < W2) buf[idx + 1] = blend(buf[idx + 1], col, 160);
      if (Y + 1 < H2) buf[idx + W2] = blend(buf[idx + W2], col, 160);
    } else {
      buf[idx] = blend(buf[idx], col, 130);
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------- the dream loop ----------
const journal = [];
let dreaming = false;
async function dream() {
  if (dreaming) return;
  dreaming = true;
  const line = await museLine();
  journal.push(line);
  if (journal.length > 6) journal.shift();
  $('hud-journal').innerHTML = journal.map(l => `<div>“${l}”</div>`).join('');
  log('the machine dreams: ' + line);
  // render the line to an offscreen canvas → target points
  const off = document.createElement('canvas');
  const tw = 420, th = 120;
  off.width = tw; off.height = th;
  const oc = off.getContext('2d');
  oc.fillStyle = '#000'; oc.fillRect(0, 0, tw, th);
  oc.fillStyle = '#fff';
  oc.font = '700 30px Georgia, serif';
  oc.textAlign = 'center'; oc.textBaseline = 'middle';
  // wrap into ≤2 lines
  const words = line.split(' ');
  const mid = Math.ceil(words.length / 2);
  const l1 = words.slice(0, mid).join(' '), l2 = words.slice(mid).join(' ');
  oc.fillText(l1, tw / 2, th / 2 - (l2 ? 16 : 0));
  if (l2) oc.fillText(l2, tw / 2, th / 2 + 16);
  const pts = sim.setTextTargets(oc.getImageData(0, 0, tw, th), tw, th);
  if (pts > 40) {
    sim.mode = 'gather';
    setTimeout(() => { if (sim.mode === 'gather') sim.mode = 'hold'; }, 4200);
    setTimeout(() => { sim.mode = 'release'; }, 15000);
    setTimeout(() => { if (sim.mode === 'release') sim.mode = 'drift'; }, 19000);
  }
  dreaming = false;
}

// ---------- input ----------
let lastInput = performance.now();
const touch = () => { lastInput = performance.now(); document.body.classList.remove('cinematic'); };
canvas.addEventListener('pointerdown', e => {
  touch();
  sim.scatter();
  log('a lucid nudge — the dream stirs');
  if (sim.mode === 'hold' || sim.mode === 'gather') { sim.mode = 'release'; setTimeout(() => { sim.mode = 'drift'; }, 3000); }
});
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  touch();
  if (k === 'd') { dream(); log('the machine reaches for a new dream'); }
  if (k === 'h') document.body.classList.toggle('cinematic');
});

function log(msg) {
  const el = $('hud-log');
  const d = document.createElement('div');
  d.className = 'ev'; d.textContent = msg;
  el.appendChild(d);
  while (el.children.length > 5) el.firstChild.remove();
  setTimeout(() => { d.style.transition = 'opacity 2s'; d.style.opacity = '0'; }, 10000);
  setTimeout(() => d.remove(), 12500);
}

// ---------- ghost: the dreamer ----------
let nextDreamAt = performance.now() + 9000;   // first dream lands soon
function ghostPump(nowMs) {
  if (nowMs > nextDreamAt && !dreaming) {
    nextDreamAt = nowMs + 42000 + Math.random() * 25000;
    dream();
  }
}

// ---------- loop ----------
window.__reverie = { sim };
let last = performance.now(), acc = 0;
const DT = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  let e = (now - last) / 1000; last = now;
  if (e > 0.25) e = 0.25;
  acc += e;
  let steps = 0;
  while (acc >= DT && steps < 3) { sim.step(DT); acc -= DT; steps++; }
  if (steps === 3) acc = 0;

  if (now - lastInput > 75000) document.body.classList.add('cinematic');
  ghostPump(now);
  adaptQuality(e * 1000);
  rend();

  const mEl = $('hud-mode');
  const mS = sim.mode;
  if (mEl._v !== mS) { mEl._v = mS; mEl.textContent = mS; }
  const s = (now - t0) / 1000;
  const clk = `${String((s / 60) | 0).padStart(2, '0')}:${String((s | 0) % 60).padStart(2, '0')}`;
  const cEl = $('hud-clock');
  if (cEl._v !== clk) { cEl._v = clk; cEl.textContent = clk; }
}
requestAnimationFrame(frame);
setTimeout(() => log('the machine dreams aloud — watch the motes gather'), 2500);
setTimeout(() => log('click to nudge the dream · D reaches for a new one'), 13000);
