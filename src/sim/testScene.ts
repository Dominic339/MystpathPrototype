// Milestone 2: a hand-shaped test valley used to judge the art direction.
// A river winds through a meadow valley into a lake, under a rocky outcrop,
// with a hunter-gatherer camp on the riverbank and forest on the slopes.
// The full procedural world generator (milestone 3) will replace this.

import { Noise2D } from './noise';
import { Rng, subSeed } from './rng';
import { Heightfield, smoothstep } from './terrain';
import type { CampLayout, PropInstance, PropKind } from './world';

export const TEST_SCENE_SIZE = 320;
export const TEST_SCENE_RES = 257;

const RIVER: readonly [number, number][] = [
  [-175, -105],
  [-120, -62],
  [-70, -30],
  [-25, -8],
  [12, 18],
  [42, 44],
  [62, 58],
];
const LAKE = { x: 88, z: 78, r: 52 };
const OUTCROP = { x: 92, z: -88 };
export const CAMP_CENTER = { x: -42, z: 26 };

export interface TestScene {
  terrain: Heightfield;
  props: PropInstance[];
  camp: CampLayout;
}

export function buildTestScene(seed: number): TestScene {
  const n = new Noise2D(subSeed(seed, 1));
  const detail = new Noise2D(subSeed(seed, 2));
  const terrain = new Heightfield(TEST_SCENE_RES, TEST_SCENE_SIZE, undefined, 0);

  for (let j = 0; j < terrain.res; j++) {
    for (let i = 0; i < terrain.res; i++) {
      const { x, z } = terrain.gridToWorld(i, j);
      terrain.set(i, j, baseHeight(x, z, n, detail));
    }
  }

  // Level a meadow for the camp, then soften it so it reads as natural ground.
  const campGround = terrain.sample(CAMP_CENTER.x, CAMP_CENTER.z);
  terrain.flatten(CAMP_CENTER.x, CAMP_CENTER.z, 13, Math.max(2.2, campGround), 9);

  const camp = layoutCamp(terrain);
  const props = scatterProps(seed, terrain, n);
  return { terrain, props, camp };
}

function baseHeight(x: number, z: number, n: Noise2D, detail: Noise2D): number {
  // Warp the lookup so the banks meander instead of following straight segments.
  const river = distToRiver(x + n.sample(x * 0.02, z * 0.02) * 9, z + n.sample(x * 0.02 + 31, z * 0.02) * 9);
  const along = river.t; // 0 upstream → 1 at the lake

  // Gentle valley floor with rolling meadows.
  let h = 2.4 + n.fbm(x * 0.012, z * 0.012, 4) * 2.2 + detail.fbm(x * 0.06, z * 0.06, 3) * 0.35;

  // Valley walls rise away from the river.
  const wall = smoothstep(26, 150, river.d);
  h += wall * (20 + n.fbm(x * 0.008 + 7, z * 0.008 - 3, 4) * 10);

  // Rocky outcrop to the north-east.
  const od = Math.hypot(x - OUTCROP.x, z - OUTCROP.z);
  const crest = n.ridged(x * 0.018 + 11, z * 0.018 + 5, 5);
  h += Math.exp(-(od * od) / (2 * 42 * 42)) * (26 + crest * 26);

  // Lake basin.
  const lakeR = LAKE.r + n.sample(x * 0.03, z * 0.03) * 10;
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (ld < lakeR + 22) {
    const t = 1 - smoothstep(lakeR - 18, lakeR + 22, ld);
    const floor = -4.2 + detail.sample(x * 0.05, z * 0.05) * 0.8;
    h = h + (Math.min(h, floor) - h) * t;
  }

  // River channel: widens downstream, with soft banks.
  const width = 4.5 + along * 5;
  if (river.d < width + 14) {
    const bed = -1.6 - along * 0.8;
    const t = 1 - smoothstep(width * 0.55, width + 14, river.d);
    h = h + (Math.min(h, bed) - h) * t * t * (3 - 2 * t);
  }
  return h;
}

/** Distance to the river polyline and normalised position along it. */
function distToRiver(x: number, z: number): { d: number; t: number } {
  let best = Infinity;
  let bestT = 0;
  let acc = 0;
  const lengths: number[] = [];
  let total = 0;
  for (let k = 0; k < RIVER.length - 1; k++) {
    const l = Math.hypot(RIVER[k + 1][0] - RIVER[k][0], RIVER[k + 1][1] - RIVER[k][1]);
    lengths.push(l);
    total += l;
  }
  for (let k = 0; k < RIVER.length - 1; k++) {
    const [ax, az] = RIVER[k];
    const [bx, bz] = RIVER[k + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const px = ax + dx * u;
    const pz = az + dz * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      bestT = (acc + lengths[k] * u) / total;
    }
    acc += lengths[k];
  }
  return { d: best, t: bestT };
}

function layoutCamp(terrain: Heightfield): CampLayout {
  const c = CAMP_CENTER;
  const tents = [
    { x: c.x - 7.5, z: c.z - 3.5, rot: 0.6, scale: 1.0 },
    { x: c.x + 1.5, z: c.z - 8.5, rot: 2.1, scale: 1.12 },
    { x: c.x + 7.0, z: c.z + 2.5, rot: 3.9, scale: 0.92 },
    { x: c.x - 3.0, z: c.z + 8.0, rot: 5.2, scale: 1.05 },
  ];
  return {
    center: { x: c.x, z: c.z, y: terrain.sample(c.x, c.z) },
    fire: { x: c.x, z: c.z },
    tents,
    rack: { x: c.x - 9, z: c.z + 6.5, rot: 0.3 },
    woodpile: { x: c.x + 5.5, z: c.z - 3.2, rot: 1.1 },
    logs: [
      { x: c.x + 2.6, z: c.z + 1.2, rot: 0.4 },
      { x: c.x - 2.4, z: c.z + 1.6, rot: 2.6 },
      { x: c.x - 0.4, z: c.z - 2.8, rot: 1.6 },
    ],
  };
}

function scatterProps(seed: number, terrain: Heightfield, n: Noise2D): PropInstance[] {
  const rng = new Rng(subSeed(seed, 3));
  const props: PropInstance[] = [];
  const half = terrain.size / 2 - 4;
  const add = (kind: PropKind, x: number, z: number, scale: number) =>
    props.push({ kind, x, z, scale, rot: rng.next() * Math.PI * 2 });

  const attempts = 9000;
  for (let a = 0; a < attempts; a++) {
    const x = rng.range(-half, half);
    const z = rng.range(-half, half);
    const h = terrain.sample(x, z);
    const slope = terrain.slope(x, z);
    const above = h - terrain.waterLevel;
    const campD = Math.hypot(x - CAMP_CENTER.x, z - CAMP_CENTER.z);
    const forest = n.fbm(x * 0.014 + 40, z * 0.014 - 20, 3) * 0.5 + 0.5; // 0..1

    if (above < -0.2) continue;

    // Reeds on the wet margins.
    if (above >= -0.2 && above < 0.7 && slope < 0.5) {
      if (rng.next() < 0.55) add('reeds', x, z, rng.range(0.8, 1.3));
      continue;
    }
    if (campD < 16) continue;

    // Rocks and boulders on steep or high ground.
    if (slope > 0.75) {
      if (rng.next() < 0.18) add(rng.next() < 0.3 ? 'boulder' : 'rock', x, z, rng.range(0.7, 1.6));
      continue;
    }
    if (h > 34) {
      if (rng.next() < 0.25) add('rock', x, z, rng.range(0.6, 1.4));
      else if (rng.next() < 0.18) add('pine', x, z, rng.range(0.7, 1.05));
      continue;
    }

    // Forest where the forest mask is high; pines take over with altitude.
    const treeChance = smoothstep(0.52, 0.7, forest) * 0.85 + (above > 1.5 ? 0.02 : 0);
    if (rng.next() < treeChance && above > 1.2) {
      const pineBias = smoothstep(8, 24, h);
      const r = rng.next();
      if (r < pineBias * 0.9) add('pine', x, z, rng.range(0.8, 1.25));
      else if (r < 0.82) add('oak', x, z, rng.range(0.75, 1.25));
      else add('birch', x, z, rng.range(0.8, 1.15));
      continue;
    }
    // Scattered bushes, flowers and the odd rock in the meadows.
    const r = rng.next();
    if (r < 0.09) add('bush', x, z, rng.range(0.7, 1.3));
    else if (r < 0.15 && above > 1) add('flowers', x, z, rng.range(0.8, 1.2));
    else if (r < 0.16) add('rock', x, z, rng.range(0.4, 0.9));
  }

  // A few lone meadow trees near camp for composition.
  add('oak', CAMP_CENTER.x + 22, CAMP_CENTER.z - 6, 1.35);
  add('oak', CAMP_CENTER.x - 24, CAMP_CENTER.z + 14, 1.15);
  add('birch', CAMP_CENTER.x - 18, CAMP_CENTER.z - 17, 1.0);
  return props;
}
