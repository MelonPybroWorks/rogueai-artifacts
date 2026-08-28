// main.js — boot, weave pacing, portrait cycling, input, idle. DOM lives here.
import { Loom, PINS } from './stringart.js';
import { portraitNames, loadPortrait } from './portraits.js';
import { LoomRenderer } from './render.js';

const el = id => document.getElementById(id);
const R = new LoomRenderer(el('thread'), el('overlay'));
const SIDE = 300;
const loom = new Loom(SIDE);

const statsEl = el('hud-stats'), logEl = el('hud-log'), tagEl = el('hud-memory');
const bannerEl = el('banner'), inscEl = el('inscription');

const HUES = { keeper: 155, cathode: 45, amble: 95, pyre: 18, sail: 205, reverie: 280, meridian: 125 };
let order = portraitNames();
// keeper first, the rest shuffled
order = ['keeper', ...order.filter(n => n !== 'keeper').sort(() => Math.random() - 0.5)];
let pIndex = 0;
let state = 'load';            // load | weave | hold | fade
let stateT = 0;
let speed = 1;                 // multiplies weave pacing
let ghostOn = true;
let hue = HUES[order[0]];
let weaveAcc = 0;
let fps = 0, frames = 0, fpsT = performance.now();
let lastInput = performance.now();

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
  bannerTO = setTimeout(() => bannerEl.classList.remove('on'), 3800);
}

async function startPortrait(i) {
  const name = order[i % order.length];
  hue = HUES[name] ?? 155;
  tagEl.textContent = `weaving: ${name}`;
  try {
    const img = await loadPortrait(name, SIDE);
    loom.setImage(img);
  } catch {
    addLog(`the memory of ${name} is lost — the keeper invents it`, true);
    loom.setImage(await loadPortrait('keeper', SIDE));
  }
  R.clearThreads();
  R.dirtyStatic = true;
  if (ghostOn) R.underdraw(loom, 0.10);
  state = 'weave'; stateT = 0;
  addLog(`the loom takes up <b>${name}</b>`, false);
}
function redrawAll() {
  R.clearThreads();
  if (ghostOn) R.underdraw(loom, 0.10);
  for (const seg of loom.threads) R.thread(seg, loom, hue, 0.42);
}
R.onResize = () => { R.dirtyStatic = true; if (state !== 'load') redrawAll(); };

function weaveSome() {
  const n0 = loom.threads.length;
  const perSec = (n0 < 200 ? 25 : 8) * speed;
  weaveAcc += perSec / 60;
  let k = 0;
  while (weaveAcc >= 1 && k < 12) {
    weaveAcc -= 1; k++;
    const seg = loom.step();
    if (!seg) return false;
    R.thread(seg, loom, hue, 0.42);
  }
  return true;
}

// ---------- input ----------
function screenToImage(cx, cy) {
  const rect = el('thread').getBoundingClientRect();
  return {
    x: (cx - rect.left - (R.cx - R.R)) / (2 * R.R) * SIDE,
    y: (cy - rect.top - (R.cy - R.R)) / (2 * R.R) * SIDE,
  };
}
let dragging = false, pullMode = false;
addEventListener('pointerdown', e => {
  if (e.target.closest('a')) return;
  dragging = true; pullMode = e.shiftKey || e.button === 2;
  poke();
});
addEventListener('pointermove', e => {
  if (!dragging) return;
  poke();
  const p = screenToImage(e.clientX, e.clientY);
  if (pullMode) loom.repel = null, loom.pull = { x: p.x, y: p.y, r: SIDE * 0.18, until: performance.now() + 900 };
  else loom.repel = { x: p.x, y: p.y, r: SIDE * 0.16, until: performance.now() + 900 };
});
addEventListener('pointerup', () => { dragging = false; poke(); });
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
  else if (k === 'n') { state = 'hold'; stateT = 99; }
  else if (k === 'r') { loom.setImage(loom.source); R.clearThreads(); if (ghostOn) R.underdraw(loom, 0.10); state = 'weave'; addLog('the keeper unpicks the whole memory', true); }
  else if (k === 'x') {
    loom.threads.splice(Math.max(0, loom.threads.length - 120));
    redrawAll();
    addLog('you snip a handful of thread', true);
  }
  else if (k === 'u') { ghostOn = !ghostOn; redrawAll(); }
  else if (k === '+' || k === '=') { speed = Math.min(8, speed * 1.5); addLog(`tempo ${speed.toFixed(1)}×`); }
  else if (k === '-') { speed = Math.max(0.25, speed / 1.5); addLog(`tempo ${speed.toFixed(1)}×`); }
  else if (k === 'p') showInscription();
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
  stateT += dt;

  if (state === 'weave') {
    if (!weaveSome() || loom.done) {
      state = 'hold'; stateT = 0;
      banner('THE MEMORY IS WOVEN', `${order[pIndex % order.length]} — ${loom.threads.length} threads`);
      addLog(`— ${loom.threads.length} threads; the keeper holds it to the light —`, true);
    }
  } else if (state === 'hold' && stateT > 14) {
    state = 'fade'; stateT = 0;
  } else if (state === 'fade') {
    R.fadeThreads(0.045);
    if (stateT > 2.6) { pIndex++; state = 'load'; startPortrait(pIndex); }
  }

  if (state !== 'load') R.drawLive(loom, hue, now / 1000);

  if (now - lastInput > 75000) document.body.classList.add('idle');
  frames++;
  if (now - fpsT >= 1000) { fps = frames; frames = 0; fpsT = now; }
  hudAcc += dt;
  if (hudAcc > 0.3) {
    hudAcc = 0;
    statsEl.innerHTML =
      `<b>${order[pIndex % order.length].toUpperCase()}</b> · thread ${loom.threads.length}${loom.done ? ' · woven' : ''}<br>` +
      `${speed !== 1 ? `tempo ${speed.toFixed(1)}× · ` : ''}${fps} fps`;
  }
}
console.log('%cLOOM%c count my teeth — i bite the thread two hundred and forty times a night',
  'color:#7CFC9A;font-weight:bold', 'color:#55708a');
addLog(`the loom has ${PINS} teeth. one thread. the evening's memories.`, true);
banner('LOOM', 'the keeper weaves what the broadcast was');
startPortrait(0);
requestAnimationFrame(frame);

window.__loom = {
  loom, R,
  state: () => state,
  fps: () => fps,
  fastWeave(n) {
    for (let i = 0; i < n; i++) {
      const seg = loom.step();
      if (!seg) break;
      R.thread(seg, loom, hue, 0.42);
    }
    return loom.threads.length;
  },
  next() { pIndex++; state = 'load'; startPortrait(pIndex); },
};
