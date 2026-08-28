// sky.js — the star catalogue: 512 fixed stars, a milky band, two wanderers. Pure, no DOM.
// Sky coords: unit sphere directions. Rotation = slow turn about the pole (dec axis).
export const STAR_COUNT = 512;

export function buildSky(rng) {
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    // uniform-ish on the dome above the horizon: azimuth 0..2π, altitude 0.02..0.98 of hemisphere
    const az = rng() * Math.PI * 2;
    const alt = Math.asin(0.04 + rng() * 0.92);          // biased low-altitude dense
    const mag = Math.pow(rng(), 2.2);                     // few bright, many faint
    stars.push({
      az, alt,
      mag,
      tint: rng(),                                        // 0 blue-ish … 1 amber-ish
      tw: rng() * Math.PI * 2,                            // twinkle phase
      tsp: 0.4 + rng() * 1.6,
    });
  }
  // the milky band: a great-circle smear of extra dim stars
  const bandTilt = 0.7;
  for (let i = 0; i < 700; i++) {
    const t = rng() * Math.PI * 2;
    const wob = (rng() + rng() - 1) * 0.16;
    const az = t;
    const alt = Math.PI / 2 - (Math.cos(t) * Math.cos(bandTilt) * 0.9 + wob) * 1.2;
    if (alt <= 0.02 || alt >= Math.PI / 2) continue;
    stars.push({ az, alt: Math.abs(Math.sin(alt)) * 1.4 + 0.05, mag: Math.pow(rng(), 3.5) * 0.4, tint: 0.35, tw: rng() * 6.28, tsp: 0.5 });
  }
  return stars;
}

// polar dome map: zenith at (0.5, 0.46), co-altitude = radius; dome fits the height
export function project(star, rot, aspect, out) {
  const az = star.az + rot;
  const r = (Math.PI / 2 - star.alt) / (Math.PI / 2);   // 0 zenith → 1 horizon
  if (r > 1.02) return false;
  out.x = 0.5 + Math.sin(az) * r * 0.44 / aspect;
  out.y = 0.46 - Math.cos(az) * r * 0.44;
  return true;
}

// the two wanderers drift slowly among the stars (planets): bright, tinted, own periods
export function planetPos(i, t, out) {
  const om = i === 0 ? 0.021 : 0.013;                     // rad/s drift
  const base = i === 0 ? 1.2 : 3.9;
  const az = base + om * t + 0.12 * Math.sin(t * om * 7.3); // epicycle wobble → retrograde feel
  const alt = 0.62 + 0.22 * Math.sin(base + t * om * 0.31);
  out.az = az; out.alt = alt;
  return out;
}
