// World state and the simulation tick. Plain data only — no rendering code here,
// so the same simulation can later run on a server.

import { Rng, subSeed } from './rng';
import { Heightfield } from './terrain';
import { GameClock } from './time';
import { buildTestScene } from './testScene';

export type PropKind = 'oak' | 'pine' | 'birch' | 'bush' | 'rock' | 'boulder' | 'reeds' | 'flowers';

export interface PropInstance {
  kind: PropKind;
  x: number;
  z: number;
  scale: number;
  rot: number;
}

export interface Placement {
  x: number;
  z: number;
  rot: number;
  scale?: number;
}

export interface CampLayout {
  center: { x: number; z: number; y: number };
  fire: { x: number; z: number };
  tents: Placement[];
  rack: Placement;
  woodpile: Placement;
  logs: Placement[];
}

export type VillagerActivity = 'resting' | 'walking' | 'gathering' | 'fetching-water';

export interface Villager {
  id: number;
  name: string;
  passion: string;
  /** Index into the renderer's outfit palettes. */
  look: number;
  x: number;
  z: number;
  heading: number;
  activity: VillagerActivity;
  targetX: number;
  targetZ: number;
  /** Seconds left in the current activity. */
  timer: number;
  /** What to do on arrival. */
  next: VillagerActivity;
}

export interface World {
  seed: number;
  clock: GameClock;
  terrain: Heightfield;
  props: PropInstance[];
  camp: CampLayout;
  villagers: Villager[];
  rng: Rng;
}

const SYLLABLES = ['ka', 'ro', 'mi', 'ta', 'sen', 'lu', 'ar', 've', 'no', 'dra', 'il', 'ush', 'ba', 'tor', 'ye', 'ma'];
const PASSIONS = ['woodwork', 'hunting', 'fishing', 'stonework', 'cooking', 'storytelling', 'herbalism', 'weaving'];

export function createWorld(seed: number): World {
  const scene = buildTestScene(seed);
  const rng = new Rng(subSeed(seed, 10));
  const villagers: Villager[] = [];
  const c = scene.camp.center;
  for (let id = 0; id < 7; id++) {
    const a = (id / 7) * Math.PI * 2;
    const x = c.x + Math.cos(a) * 4.2;
    const z = c.z + Math.sin(a) * 4.2;
    villagers.push({
      id,
      name: makeName(rng),
      passion: rng.pick(PASSIONS),
      look: id % 6,
      x,
      z,
      heading: a + Math.PI,
      activity: 'resting',
      targetX: x,
      targetZ: z,
      timer: rng.range(2, 12),
      next: 'resting',
    });
  }
  return { seed, clock: new GameClock(), terrain: scene.terrain, props: scene.props, camp: scene.camp, villagers, rng };
}

function makeName(rng: Rng): string {
  const n = rng.int(2, 3);
  let s = '';
  for (let i = 0; i < n; i++) s += rng.pick(SYLLABLES);
  return s[0].toUpperCase() + s.slice(1);
}

const WALK_SPEED = 1.4; // metres per game second

/** Advance the world by `dt` game seconds. */
export function tick(world: World, dt: number): void {
  world.clock.totalSeconds += dt;
  for (const v of world.villagers) stepVillager(world, v, dt);
}

function stepVillager(world: World, v: Villager, dt: number): void {
  const { rng, camp, terrain } = world;
  if (v.activity === 'walking') {
    const dx = v.targetX - v.x;
    const dz = v.targetZ - v.z;
    const d = Math.hypot(dx, dz);
    const step = WALK_SPEED * dt;
    if (d <= step) {
      v.x = v.targetX;
      v.z = v.targetZ;
      v.activity = v.next;
      v.timer = v.next === 'resting' ? rng.range(8, 30) : rng.range(6, 16);
    } else {
      v.x += (dx / d) * step;
      v.z += (dz / d) * step;
      v.heading = Math.atan2(dx, dz);
    }
    return;
  }

  v.timer -= dt;
  if (v.timer > 0) return;

  // Choose what to do next. Hunter-gatherer placeholder behaviour until the real
  // needs and gathering systems arrive in milestone 7.
  const roll = rng.next();
  let tx: number;
  let tz: number;
  let next: VillagerActivity;
  if (v.activity !== 'resting') {
    // Head home to the fire after any errand.
    const a = rng.next() * Math.PI * 2;
    tx = camp.fire.x + Math.cos(a) * rng.range(2.8, 5.5);
    tz = camp.fire.z + Math.sin(a) * rng.range(2.8, 5.5);
    next = 'resting';
  } else if (roll < 0.35) {
    const spot = findSpot(world, (h) => h > terrain.waterLevel + 0.25 && h < terrain.waterLevel + 0.9, 30);
    tx = spot.x;
    tz = spot.z;
    next = 'fetching-water';
  } else if (roll < 0.75) {
    const spot = findSpot(world, (h) => h > 1.5 && h < 12, 45);
    tx = spot.x;
    tz = spot.z;
    next = 'gathering';
  } else {
    const a = rng.next() * Math.PI * 2;
    tx = camp.fire.x + Math.cos(a) * rng.range(3, 9);
    tz = camp.fire.z + Math.sin(a) * rng.range(3, 9);
    next = 'resting';
  }
  v.targetX = tx;
  v.targetZ = tz;
  v.next = next;
  v.activity = 'walking';
}

function findSpot(world: World, ok: (h: number) => boolean, radius: number): { x: number; z: number } {
  const { rng, camp, terrain } = world;
  for (let i = 0; i < 40; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = rng.range(8, radius);
    const x = camp.center.x + Math.cos(a) * r;
    const z = camp.center.z + Math.sin(a) * r;
    if (ok(terrain.sample(x, z)) && terrain.slope(x, z) < 0.6) return { x, z };
  }
  return { x: camp.center.x + rng.range(-6, 6), z: camp.center.z + rng.range(-6, 6) };
}
