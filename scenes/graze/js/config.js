// config.js — all tuning knobs for GRAZE
export const CFG = {
  // playfield (portrait, touhou-ish ratio)
  FW: 384, FH: 448,

  AGENTS: 160,               // simultaneous dodgers
  AGENT_R: 2.2,              // hitbox radius (small, touhou-style)
  AGENT_SPEED: 168,          // max u/s — dodgers must outrun bullets
  ELITES: 24,                // elite pool size for selection

  // brain: 32 in → 24 hidden → 2 out
  IN: 32, HID: 24, OUT: 2,
  MUT_RATE: 0.08, MUT_AMP: 0.14, CROSS: 0.5,

  // bullets
  MAX_BULLETS: 900,
  BULLET_R: 3.4,
  GRAZE_R: 16,               // graze radius
  GRAZE_BONUS: 0.5,          // fitness per graze tick

  // spell cards rotate
  CARD_TIME: 26,             // seconds per card
  CARDS: ['spiral', 'rings', 'rain', 'flower', 'walls', 'star'],

  // pacing
  SPEED: 1,                  // sim speed multiplier (hyper bursts x3 on card change)
  PLAYER: true,
};
