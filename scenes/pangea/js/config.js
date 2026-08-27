// config.js — PANGEA tuning knobs
export const CFG = {
  SUBDIV: 3,                 // icosphere subdivisions (20 * 4^n faces → 1280)
  RADIUS: 200,               // world units

  CRITTERS: 170,             // starting herbivores
  MAX_CRITTERS: 320,
  PLANT_MAX: 100,            // per-face plant stock cap
  PLANT_REGROW: 1.6,         // per second × fertility
  EAT_RATE: 7.0,             // plant/s a grazer pulls
  METABOLISM: 1.0,           // energy/s baseline drain
  MOVE_COST: 0.55,           // extra drain multiplier while moving
  START_ENERGY: 26,
  REPRO_ENERGY: 46,          // energy needed to bud a child
  CHILD_SHARE: 0.42,         // fraction of parent energy to child
  MAX_AGE: 95,               // seconds → senescence

  // carnivory
  HUNT_RATE: 0.9,            // kills/s chance factor when co-located with prey
  MEAT_ENERGY: 30,

  DAY_LEN: 96,               // seconds per full day cycle
  METEOR_COOLDOWN: 1.2,
};
