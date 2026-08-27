// brain.js — tiny MLP genome: IN → HID (tanh) → OUT (tanh). Flat Float32Array.
// layout: W1[IN*HID] | b1[HID] | W2[HID*OUT] | b2[OUT]
import { CFG } from './config.js';

export const WLEN = CFG.IN * CFG.HID + CFG.HID + CFG.HID * CFG.OUT + CFG.OUT;
const O_W2 = CFG.IN * CFG.HID + CFG.HID;
const O_B2 = O_W2 + CFG.HID * CFG.OUT;

export function randomBrain(rng) {
  const w = new Float32Array(WLEN);
  const s1 = Math.sqrt(2 / CFG.IN), s2 = Math.sqrt(2 / CFG.HID);
  for (let i = 0; i < CFG.IN * CFG.HID; i++) w[i] = (rng() * 2 - 1) * s1;
  for (let i = CFG.IN * CFG.HID; i < O_W2; i++) w[i] = (rng() * 2 - 1) * 0.05;      // b1
  for (let i = O_W2; i < O_B2; i++) w[i] = (rng() * 2 - 1) * s2;                     // W2
  for (let i = O_B2; i < WLEN; i++) w[i] = 0;                                        // b2
  return w;
}

// uniform crossover + gaussian-ish mutation
export function breed(rng, A, B) {
  const w = new Float32Array(WLEN);
  for (let i = 0; i < WLEN; i++) {
    let v = rng() < CFG.CROSS ? A[i] : B[i];
    if (rng() < CFG.MUT_RATE) v += (rng() + rng() + rng() - 1.5) * 1.15 * CFG.MUT_AMP;
    w[i] = v > 3 ? 3 : v < -3 ? -3 : v;
  }
  return w;
}

// forward pass. input: Float32Array(IN), out: [dx, dy] in -1..1
const _h = new Float32Array(CFG.HID);
export function think(w, input) {
  for (let j = 0; j < CFG.HID; j++) {
    let s = w[CFG.IN * CFG.HID + j];
    const base = j * CFG.IN;
    for (let i = 0; i < CFG.IN; i++) s += w[base + i] * input[i];
    _h[j] = Math.tanh(s);
  }
  const out = [0, 0];
  for (let k = 0; k < CFG.OUT; k++) {
    let s = w[O_B2 + k];
    const base = O_W2 + k * CFG.HID;
    for (let j = 0; j < CFG.HID; j++) s += w[base + j] * _h[j];
    out[k] = Math.tanh(s);
  }
  return out;
}
