// main.js — boot, myth lifecycle, sky rotation, input. DOM lives here.
import { buildSky, STAR_COUNT, planetPos } from './sky.js';
import { MythBook } from './myth.js';
import { Renderer } from './render.js';

const el = id => document.getElementById(id);
const canvas = el('stage');
const R = new Renderer(canvas);
const rng = Math.random;
const sky = buildSky(rng);
const book = new MythBook(rng);

const statsEl = el('hud-stats'), logEl = el('hud-log');
const bannerEl = el('banner'), inscEl = el('inscription'), cartEl = el('cartouche');

let rot = 0, rotVel = 0, paused = false;
const DRIFT = (Math.PI * 2) / 480;       // full turn of the sky every 8 minutes
let fps = 0, frames = 0, fpsT = performance.now();
let lastInput = performance.now();
let mythT = 0, gapT = 3;
let mythAlpha = 1;
const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];

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
function newMyth(heroIdx = -1) {
  const m = book.begin(sky, heroIdx);
  if (!m) return false;
  mythT = 0; mythAlpha = 1;
  cartEl.classList.remove('on');
  addLog(`the machine connects ${m.chain.length} stars…`, false);
  return true;
}

// ---------- input ----------
let dragging = false, dragX = 0, dragT = 0;
addEventListener('pointerdown', e => {
  if (e.target.closest('a')) return;
  dragging = true; dragX = e.clientX; dragT = performance.now();
  poke();
});
addEventListener('pointermove', e => {
  if (!dragging) return;
  poke();
  const dx = e.clientX - dragX;
  dragX = e.clientX;
  rotVel += dx * 0.0000042;
});
addEventListener('pointerup', e => {
  poke();
  const quick = performance.now() - dragT < 350 && Math.abs(e.clientX - dragX) < 8;
  dragging = false;
  if (quick) {
    // nearest star → force a myth from it
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width, ny = (e.clientY - rect.top) / rect.height;
    let best = -1, bd = 0.02;
    const out = { x: 0, y: 0 };
    for (let i = 0; i < sky.length; i++) {
      if (sky[i].mag < 0.18) continue;
      const az = sky[i].az + rot;
      const r = (Math.PI / 2 - sky[i].alt) / (Math.PI / 2);
      if (r > 1.02) continue;
      const sx = 0.5 + Math.sin(az) * r * 0.44 / R.aspect;
      const sy = 0.46 - Math.cos(az) * r * 0.44;
      const d = (sx - nx) ** 2 + (sy - ny) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0 && newMyth(best)) addLog('you pointed; the sky answered', true);
  }
});
addEventListener('contextmenu', e => e.preventDefault());

function showInscription() {
  inscEl.classList.add('on');
  clearTimeout(showInscription.to);
  showInscription.to = setTimeout(() => inscEl.classList.remove('on'), 9000);
}
addEventListener('keydown', e => {
  poke();
  const k = e.key.toLowerCase();
  if (k === 'h') document.body.classList.toggle('nohud');
  else if (k === 'n') { if (newMyth()) addLog('you asked for a new myth', true); }
  else if (k === ' ') { paused = !paused; addLog(paused ? 'the sky holds still' : 'the sky turns again'); }
  else if (k === '5') showInscription();
});
function poke() {
  lastInput = performance.now();
  document.body.classList.remove('idle');
}

// ---------- loop ----------
let last = performance.now(), hudAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!paused) rot += (DRIFT + rotVel) * dt;
  rotVel *= Math.pow(0.5, dt * 2);   // manual spin decays

  // myth lifecycle
  const m = book.active;
  if (!m) {
    gapT -= dt;
    if (gapT <= 0 && !newMyth()) gapT = 2;   // a sky that resists gets two seconds to think
  } else {
    mythT += dt;
    if (m.state === 'forming') {
      if (mythT > m.segShown * 0.45) m.segShown++;
      if (m.segShown >= m.chain.length - 1) {
        m.state = 'named'; mythT = 0;
        const no = ROMAN[Math.min(book.count - 1, 19)] || book.count;
        cartEl.innerHTML = `<div class="cno">MYTH ${no} · TONIGHT</div><div class="cname">${m.name}</div>`;
        cartEl.classList.add('on');
        addLog(`myth ${no.toLowerCase()} — <b>${m.name.toLowerCase()}</b>`, true);
      }
    } else if (m.state === 'named') {
      if (mythT > 6 + (book.count % 5)) { m.state = 'fading'; mythT = 0; cartEl.classList.remove('on'); }
    } else if (m.state === 'fading') {
      mythAlpha = Math.max(0, 1 - mythT / 2.2);
      if (mythT > 2.2) { book.active = null; gapT = 3 + Math.random() * 4; }
    }
  }

  const p1 = { az: 0, alt: 0 }, p2 = { az: 0, alt: 0 };
  planetPos(0, now / 1000, p1); planetPos(1, now / 1000, p2);
  R.frame(sky, rot, book.active, mythAlpha, now / 1000, [p1, p2]);

  if (now - lastInput > 75000) document.body.classList.add('idle');
  frames++;
  if (now - fpsT >= 1000) { fps = frames; frames = 0; fpsT = now; }
  hudAcc += dt;
  if (hudAcc > 0.3) {
    hudAcc = 0;
    statsEl.innerHTML =
      `<b>${STAR_COUNT}</b> fixed stars · ${book.count} myths told<br>` +
      `sky turns once per eight minutes · ${fps} fps`;
  }
}
console.log('%cAPOPHENIA%c five hundred and twelve stars, and every one a name',
  'color:#9fd8ff;font-weight:bold', 'color:#55708a');
addLog('the sky is out; the machine is watching for figures', true);
banner('APOPHENIA', 'the sky is a catalogue; the machine reads figures into it');
requestAnimationFrame(frame);

window.__apophenia = {
  sky, book, R,
  fps: () => fps,
  newMyth,
  rot: () => rot,
};
