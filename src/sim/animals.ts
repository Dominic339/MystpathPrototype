// Wild animals. Each herd (or flock, or fish shoal) is one simulated group with a home range:
// it grazes, wanders, notices people and flees, breeds in the warm seasons up to what its
// range can feed, and can be hunted out. A herd that dies out leaves its range empty until a
// few animals wander in from elsewhere, days later.

import { FAUNA, FAUNA_BY_ID, type AnimalSpecies } from './data/fauna';
import { Rng, subSeed } from './rng';
import type { Heightfield } from './terrain';

export const HERD_GRAZE = 0;
export const HERD_WALK = 1;
export const HERD_FLEE = 2;

export interface Herd {
  id: number;
  species: string;
  x: number;
  z: number;
  home: { x: number; z: number };
  range: number;
  /** Animals in the herd (fractional while breeding). */
  count: number;
  /** Most the range supports. */
  max: number;
  heading: number;
  vx: number;
  vz: number;
  state: number;
  target: { x: number; z: number };
  timer: number;
  /** Seconds until animals wander back into an emptied range. */
  returnIn: number;
}

/** Species index for the renderer. */
export function speciesIndex(id: string): number {
  return FAUNA.findIndex((f) => f.id === id);
}

function okFor(sp: AnimalSpecies, terrain: Heightfield, x: number, z: number): boolean {
  const half = terrain.size / 2 - 6;
  if (Math.abs(x) > half || Math.abs(z) > half) return false;
  const depth = terrain.waterLevel - terrain.sample(x, z);
  if (sp.movement === 'water') return sp.id.endsWith('fish') ? depth > 0.5 : depth > 0.15;
  return depth < -0.25 && terrain.slope(x, z) < 1.1;
}

/** Place the valley's wild animals: herds where their kind of land is. */
export function spawnHerds(seed: number, terrain: Heightfield, camp: { x: number; z: number }, forestAt: (x: number, z: number) => number): Herd[] {
  const rng = new Rng(subSeed(seed, 21));
  const herds: Herd[] = [];
  const half = terrain.size / 2 - 10;
  const place = (species: string, want: number, test: (x: number, z: number) => boolean, minCamp: number) => {
    const sp = FAUNA_BY_ID.get(species)!;
    for (let n = 0, tries = 0; n < want && tries < 6000; tries++) {
      const x = rng.range(-half, half);
      const z = rng.range(-half, half);
      if (Math.hypot(x - camp.x, z - camp.z) < minCamp) continue;
      if (!okFor(sp, terrain, x, z) || !test(x, z)) continue;
      if (herds.some((h) => h.species === species && Math.hypot(h.x - x, h.z - z) < 40)) continue;
      const count = Math.max(1, Math.round(sp.herd * rng.range(0.7, 1.2)));
      herds.push({
        id: herds.length, species, x, z, home: { x, z }, range: sp.movement === 'water' ? 22 : 34,
        count, max: Math.ceil(sp.herd * 1.4), heading: rng.next() * Math.PI * 2, vx: 0, vz: 0,
        state: HERD_GRAZE, target: { x, z }, timer: rng.range(2, 20), returnIn: 0,
      });
      n++;
    }
  };
  const meadow = (x: number, z: number) => forestAt(x, z) < 0.5 && terrain.sample(x, z) - terrain.waterLevel > 1.5;
  const edge = (x: number, z: number) => { const f = forestAt(x, z); return f > 0.4 && f < 0.75; };
  const wood = (x: number, z: number) => forestAt(x, z) > 0.6;
  place('red-deer', 2, edge, 45);
  place('wild-boar', 2, wood, 50);
  place('hare', 4, meadow, 30);
  place('wild-goat', 1, (x, z) => terrain.sample(x, z) > 26, 60);
  place('wild-fowl', 2, () => true, 25);
  place('river-fish', 5, () => true, 0);
  return herds;
}

type Watcher = { x: number; z: number; stealth: number };

/** Advance every herd. `watchers` are people nearby (hunters stalk with high stealth). */
export function stepHerds(herds: Herd[], terrain: Heightfield, watchers: Watcher[], season: number, rng: Rng, dt: number): void {
  for (const h of herds) {
    const sp = FAUNA_BY_ID.get(h.species)!;
    if (h.count < 0.5) {
      // Hunted out: in time a few animals wander back in.
      h.returnIn -= dt;
      if (h.returnIn <= 0) {
        h.count = Math.min(2, h.max);
        h.x = h.home.x;
        h.z = h.home.z;
      }
      continue;
    }
    // Breeding: spring is the main season; nothing in winter.
    const r = [1 / 900, 1 / 2400, 1 / 6000, 0][season];
    h.count = Math.min(h.max, h.count + h.count * (1 - h.count / h.max) * r * dt);

    // Notice people.
    let threat: Watcher | null = null;
    let threatD = Infinity;
    for (const w of watchers) {
      const d = Math.hypot(w.x - h.x, w.z - h.z);
      const notice = sp.wariness * (1 - w.stealth);
      if (d < notice && d < threatD) {
        threat = w;
        threatD = d;
      }
    }
    if (threat && h.state !== HERD_FLEE) {
      h.state = HERD_FLEE;
      h.timer = 6 + rng.next() * 6;
      const away = Math.atan2(h.x - threat.x, h.z - threat.z);
      let best = { x: h.x, z: h.z };
      for (let k = 0; k < 7; k++) {
        const a = away + (k - 3) * 0.35;
        const x = h.x + Math.sin(a) * sp.flee * 8;
        const z = h.z + Math.cos(a) * sp.flee * 8;
        if (okFor(sp, terrain, x, z)) {
          best = { x, z };
          break;
        }
      }
      h.target = best;
    }
    h.timer -= dt;
    if (h.state !== HERD_FLEE && h.timer <= 0) {
      if (h.state === HERD_GRAZE && rng.next() < 0.6) {
        // Wander to somewhere else in the home range.
        for (let k = 0; k < 8; k++) {
          const a = rng.next() * Math.PI * 2;
          const rad = Math.sqrt(rng.next()) * h.range;
          const x = h.home.x + Math.cos(a) * rad;
          const z = h.home.z + Math.sin(a) * rad;
          if (okFor(sp, terrain, x, z)) {
            h.target = { x, z };
            h.state = HERD_WALK;
            break;
          }
        }
        h.timer = 40;
      } else {
        h.state = HERD_GRAZE;
        h.timer = 15 + rng.next() * 40;
      }
    }
    if (h.state === HERD_GRAZE) {
      h.vx = h.vz = 0;
      continue;
    }
    const speed = h.state === HERD_FLEE ? sp.flee : sp.speed;
    const dx = h.target.x - h.x;
    const dz = h.target.z - h.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5 || (h.state === HERD_FLEE && h.timer <= 0)) {
      h.state = HERD_GRAZE;
      h.timer = 10 + rng.next() * 20;
      h.vx = h.vz = 0;
      // A herd that fled far drifts its home range a little.
      h.home.x += (h.x - h.home.x) * 0.2;
      h.home.z += (h.z - h.home.z) * 0.2;
      continue;
    }
    const step = Math.min(d, speed * dt);
    const nx = h.x + (dx / d) * step;
    const nz = h.z + (dz / d) * step;
    if (!okFor(sp, terrain, nx, nz)) {
      h.state = HERD_GRAZE;
      h.timer = 2;
      h.vx = h.vz = 0;
      continue;
    }
    h.x = nx;
    h.z = nz;
    h.heading = Math.atan2(dx, dz);
    h.vx = (dx / d) * speed;
    h.vz = (dz / d) * speed;
  }
}

/** Take one animal from a herd. */
export function takeAnimal(h: Herd): void {
  h.count = Math.max(0, h.count - 1);
  if (h.count < 0.5) h.returnIn = 2 * 1200; // about two days
}
