// config.js — all tuning knobs in one place
export const CFG = {
  WORLD: 5200,               // sector is WORLD x WORLD units
  ASTEROIDS: 148,            // initial asteroid count
  MAX_PROBES: 760,           // replication hard cap
  MAX_PARTICLES: 380,

  // --- economy ---
  ORE_PER_R3: 0.017,         // ore tonnes per unit radius^3
  MINE_ENERGY: 0.85,         // energy gained per tonne mined
  THRUST_COST: 0.85,         // energy/s at full thrust
  IDLE_DRAIN: 0.055,         // energy/s baseline
  SOLAR: 0.34,               // energy/s panel trickle
  START_ENERGY: 60,
  MAX_ENERGY: 100,
  CHILD_CARGO_SHARE: 0.22,   // fraction of parent cargo gifted to child
  FOUNDRY_ENERGY: 18,        // energy spent to run the foundry
  REPLICATE_COOLDOWN: 2.5,

  // --- flares ---
  FLARE_MIN: 75, FLARE_MAX: 150,   // seconds between flares
  FLARE_WARN: 6.5,                 // telegraph seconds
  FLARE_SPEED: 320,                // front speed u/s
  FLARE_KILL: 0.58,                // base kill threshold vs shield gene

  // --- comets (fresh ore) ---
  COMET_MIN: 16, COMET_MAX: 38,
  COMET_SPEED: 620,

  DERELICT_LIFE: 42,         // seconds a dead hull drifts
};
