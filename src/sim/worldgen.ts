// The world generator. One region holds every environment so every resource exists
// somewhere: a mountain range to the north with snowy hills and a glacier, a volcano to the
// north-east, the sea along the east with beaches, chalk downs to the west, desert and a dry
// lake bed to the south-west, tropical lowlands to the south-east, and a temperate heartland
// with forests, meadows and plains. A river rises at the foot of the mountains, winds through
// the heartland into a lake and on to a swampy delta at the sea.
//
// Climate and region masks decide each spot's environment; plants and animals are placed
// from each environment's lists (environments.ts, flora.ts, fauna.ts).

import { spawnHerdsIn, type Herd } from './animals';
import { ENVIRONMENTS, ENVIRONMENT_BY_ID, type EnvironmentId } from './data/environments';
import { FAUNA_BY_ID } from './data/fauna';
import { FLORA_BY_ID } from './data/flora';
import { Noise2D } from './noise';
import { Rng, subSeed } from './rng';
import { Heightfield, smoothstep } from './terrain';
import type { CampLayout, PropInstance, PropKind } from './world';

export const WORLD_SIZE = 640;
export const WORLD_RES = 321;
/** Environment map resolution (cells per side). */
export const BIOME_RES = 160;

/** Surface current of the water, in metres per second, on a regular grid. */
export interface FlowField {
  res: number;
  size: number;
  /** Interleaved x, z velocity per cell, row-major (z rows). */
  data: Float32Array;
}

export interface Scene {
  terrain: Heightfield;
  props: PropInstance[];
  camp: CampLayout;
  flow: FlowField;
  herds: Herd[];
  river: [number, number][];
  lake: { x: number; z: number; r: number };
  /** Environment index (into ENVIRONMENTS) per cell of a BIOME_RES² grid. */
  biome: Uint8Array;
}

const ENV_INDEX = new Map(ENVIRONMENTS.map((e, i) => [e.id, i]));

interface Layout {
  river: [number, number][];
  lake: { x: number; z: number; r: number };
  volcano: { x: number; z: number };
  dryLake: { x: number; z: number; r: number };
  grove: { x: number; z: number };
  camp: { x: number; z: number };
}

function layout(seed: number): Layout {
  const r = new Rng(subSeed(seed, 40));
  const j = (v: number) => v + r.range(-12, 12);
  const river: [number, number][] = [
    [j(-70), -175],
    [j(-55), -120],
    [j(-62), -60],
    [j(-48), -10],
    [j(-20), 40],
    [j(15), 80],
    [40, 112],
    // Out of the lake toward the sea.
    [95, 150],
    [150, 170],
    [205, 185],
    [260, 200],
    [330, 210],
  ];
  return {
    river,
    lake: { x: 52, z: 122, r: 40 },
    volcano: { x: 175 + r.range(-10, 10), z: -175 + r.range(-10, 10) },
    dryLake: { x: -215, z: 225, r: 38 },
    grove: { x: -130 + r.range(-15, 15), z: 30 + r.range(-15, 15) },
    camp: { x: -62, z: 8 },
  };
}

/** Distance to a polyline and normalised position along it, with the segment direction. */
function distToLine(line: readonly [number, number][], x: number, z: number): { d: number; t: number; tx: number; tz: number } {
  let best = { d: Infinity, t: 0, tx: 1, tz: 0 };
  let total = 0;
  const lengths: number[] = [];
  for (let k = 0; k < line.length - 1; k++) {
    const l = Math.hypot(line[k + 1][0] - line[k][0], line[k + 1][1] - line[k][1]);
    lengths.push(l);
    total += l;
  }
  let acc = 0;
  for (let k = 0; k < line.length - 1; k++) {
    const [ax, az] = line[k];
    const [bx, bz] = line[k + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len = lengths[k];
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (len * len)));
    const d = Math.hypot(x - (ax + dx * u), z - (az + dz * u));
    if (d < best.d) best = { d, t: (acc + len * u) / total, tx: dx / len, tz: dz / len };
    acc += len;
  }
  return best;
}

/** The coastline: x position where land meets the sea, by z. */
function coastX(n: Noise2D, z: number): number {
  return 238 + n.fbm(z * 0.008 + 3, 9, 3) * 30;
}

interface Masks {
  mountain: number;
  chalk: number;
  desert: number;
  tropical: number;
  delta: number;
  volcano: number;
}

function masks(L: Layout, n: Noise2D, x: number, z: number): Masks {
  const warp = n.sample(x * 0.01, z * 0.01) * 30;
  const vd = Math.hypot(x - L.volcano.x, z - L.volcano.z);
  return {
    mountain: smoothstep(-110, -215, z + warp),
    chalk: smoothstep(-150, -200, x + warp) * smoothstep(150, 90, z + warp) * smoothstep(-110, -60, z - warp),
    desert: smoothstep(-90, -150, x + warp) * smoothstep(130, 175, z + warp),
    tropical: smoothstep(70, 120, x + warp) * smoothstep(165, 205, z + warp),
    delta: Math.max(0, 1 - Math.hypot(x - 225, z - 192) / 55),
    volcano: Math.max(0, 1 - vd / 80),
  };
}

function height(L: Layout, n: Noise2D, detail: Noise2D, x: number, z: number): number {
  const m = masks(L, n, x, z);
  const river = distToLine(L.river, x + n.sample(x * 0.02, z * 0.02) * 9, z + n.sample(x * 0.02 + 31, z * 0.02) * 9);
  // Rolling heartland.
  let h = 3 + n.fbm(x * 0.01, z * 0.01, 4) * 3 + detail.fbm(x * 0.06, z * 0.06, 3) * 0.4;
  // Valley walls rise away from the river through the heartland.
  h += smoothstep(30, 170, river.d) * (14 + n.fbm(x * 0.008 + 7, z * 0.008 - 3, 4) * 8);
  // Mountains: ridged peaks, highest in the far north.
  h += m.mountain * (36 + n.ridged(x * 0.012 + 11, z * 0.012 + 5, 5) * 60) * (0.7 + smoothstep(-220, -300, z) * 0.6);
  // Chalk downs: smooth rounded hills.
  h += m.chalk * (10 + (n.fbm(x * 0.018 - 21, z * 0.018 + 4, 3) * 0.5 + 0.5) * 16);
  // Desert: flatten into low dunes.
  if (m.desert > 0) h = h + (4 + Math.abs(n.ridged(x * 0.03, z * 0.05, 2)) * 3 - h) * m.desert;
  // Dry lake bed: a flat pale pan just above the water table.
  const dl = Math.hypot(x - L.dryLake.x, z - L.dryLake.z);
  if (dl < L.dryLake.r + 20) h = h + (0.9 - h) * (1 - smoothstep(L.dryLake.r - 10, L.dryLake.r + 20, dl));
  // Tropical lowlands: low and gently rolling.
  if (m.tropical > 0) h = h + (2.2 + n.fbm(x * 0.02, z * 0.02, 3) * 1.5 - h) * m.tropical;
  // Volcano: a cone with a crater.
  const vd = Math.hypot(x - L.volcano.x, z - L.volcano.z);
  h += 70 * Math.exp(-((vd / 58) ** 2)) - 26 * Math.exp(-((vd / 13) ** 2));
  // Delta: low, flat and wet.
  if (m.delta > 0) h = h + (0.5 + detail.fbm(x * 0.05, z * 0.05, 2) * 0.5 - h) * smoothstep(0, 0.6, m.delta);
  // Sea along the east.
  const cx = coastX(n, z);
  if (x > cx - 30) {
    const t = smoothstep(cx - 30, cx + 25, x);
    h = h + (-7 - h) * t;
  }
  // Lake basin.
  const lakeR = L.lake.r + n.sample(x * 0.03, z * 0.03) * 8;
  const ld = Math.hypot(x - L.lake.x, z - L.lake.z);
  if (ld < lakeR + 22) {
    const t = 1 - smoothstep(lakeR - 16, lakeR + 22, ld);
    h = h + (Math.min(h, -4 + detail.sample(x * 0.05, z * 0.05) * 0.8) - h) * t;
  }
  // River channel, widening downstream.
  if (z > -185) {
    const width = 4.5 + river.t * 7;
    if (river.d < width + 14) {
      const bed = -1.6 - river.t * 1.2;
      const t = 1 - smoothstep(width * 0.55, width + 14, river.d);
      h = h + (Math.min(h, bed) - h) * t * t * (3 - 2 * t);
    }
  }
  return h;
}

/** Decide the environment at a point from height, slope, water and the region masks. */
function classify(L: Layout, n: Noise2D, terrain: Heightfield, x: number, z: number): EnvironmentId {
  const h = terrain.sample(x, z);
  const above = h - terrain.waterLevel;
  const slope = terrain.slope(x, z);
  const m = masks(L, n, x, z);
  const sea = x > coastX(n, z) - 5;
  const river = distToLine(L.river, x, z);
  const lakeD = Math.hypot(x - L.lake.x, z - L.lake.z);
  if (above < 0) {
    if (sea && river.d > 20) return 'sea';
    return lakeD < L.lake.r + 12 ? 'lake' : 'river';
  }
  if (m.delta > 0.15 && above < 2.2) return 'swamp';
  if (sea || (x > coastX(n, z) - 22 && above < 3)) return 'coast';
  if (m.volcano > 0.25) return 'volcanic';
  if (Math.hypot(x - L.dryLake.x, z - L.dryLake.z) < L.dryLake.r) return 'dry-lake';
  // Banks: a band along the river and around the lake.
  const width = 4.5 + river.t * 7;
  if (above < 2.5 && (river.d < width + 12 || lakeD < L.lake.r + 14)) return 'riverbank';
  if (h > 72) return 'glacier';
  if (m.mountain > 0.3) {
    if (h > 46) return slope > 0.9 ? 'mountains' : 'snowy-hills';
    if (h > 30 || slope > 0.95) return 'mountains';
    return n.fbm(x * 0.02, z * 0.02, 2) > -0.1 ? 'conifer-forest' : 'hills';
  }
  if (m.desert > 0.5) return 'desert';
  if (m.tropical > 0.5) return 'tropical-forest';
  if (m.chalk > 0.4) return 'chalk-hills';
  if (Math.hypot(x - L.grove.x, z - L.grove.z) < 22) return 'ancient-grove';
  if (h > 24 || slope > 0.9) return 'hills';
  const forest = n.fbm(x * 0.014 + 40, z * 0.014 - 20, 3);
  if (forest > 0.12) return h > 14 ? 'conifer-forest' : 'temperate-forest';
  return n.fbm(x * 0.01 - 9, z * 0.01 + 17, 2) > 0 ? 'meadow' : 'plains';
}

/** How densely each environment is covered by plants. */
const COVER: Partial<Record<EnvironmentId, number>> = {
  'temperate-forest': 1, 'conifer-forest': 1, 'tropical-forest': 0.6, 'ancient-grove': 1.1, meadow: 0.5, plains: 0.45, hills: 0.35,
  'chalk-hills': 0.3, swamp: 0.7, riverbank: 0.8, coast: 0.25, desert: 0.06, mountains: 0.12, 'snowy-hills': 0.1, glacier: 0, volcanic: 0.02, 'dry-lake': 0,
  river: 0.2, lake: 0.15, sea: 0.15,
};

const TREE_PROPS = new Set<PropKind>(['oak', 'pine', 'birch', 'apple', 'tropical', 'spirit', 'bamboo']);

export function buildWorld(seed: number): Scene {
  const L = layout(seed);
  const n = new Noise2D(subSeed(seed, 1));
  const detail = new Noise2D(subSeed(seed, 2));
  const terrain = new Heightfield(WORLD_RES, WORLD_SIZE, undefined, 0);
  for (let j = 0; j < terrain.res; j++)
    for (let i = 0; i < terrain.res; i++) {
      const { x, z } = terrain.gridToWorld(i, j);
      terrain.set(i, j, height(L, n, detail, x, z));
    }
  // Level a meadow for the camp on the riverbank.
  const campGround = terrain.sample(L.camp.x, L.camp.z);
  terrain.flatten(L.camp.x, L.camp.z, 13, Math.max(2.2, campGround), 9);

  // Environment map.
  const biome = new Uint8Array(BIOME_RES * BIOME_RES);
  const cell = WORLD_SIZE / BIOME_RES;
  for (let j = 0; j < BIOME_RES; j++)
    for (let i = 0; i < BIOME_RES; i++) {
      const x = -WORLD_SIZE / 2 + (i + 0.5) * cell;
      const z = -WORLD_SIZE / 2 + (j + 0.5) * cell;
      biome[j * BIOME_RES + i] = ENV_INDEX.get(classify(L, n, terrain, x, z))!;
    }
  const envAt = (x: number, z: number): EnvironmentId => {
    const i = Math.min(BIOME_RES - 1, Math.max(0, Math.floor((x + WORLD_SIZE / 2) / cell)));
    const j = Math.min(BIOME_RES - 1, Math.max(0, Math.floor((z + WORLD_SIZE / 2) / cell)));
    return ENVIRONMENTS[biome[j * BIOME_RES + i]].id;
  };

  const camp = layoutCamp(terrain, L.camp);
  // Nothing but water plants stands in the water (a few guaranteed plants could land there).
  const props = scatter(seed, terrain, n, envAt, L.camp).filter((p) => p.kind === 'reeds' || p.kind === 'seaweed' || p.kind === 'shellfish' || terrain.sample(p.x, p.z) > terrain.waterLevel + 0.15);
  const herds = spawnHerdsIn(seed, terrain, L.camp, envAt);
  return { terrain, props, camp, flow: buildFlow(terrain, L), herds, river: L.river, lake: L.lake, biome };
}

function layoutCamp(terrain: Heightfield, c: { x: number; z: number }): CampLayout {
  return {
    center: { x: c.x, z: c.z, y: terrain.sample(c.x, c.z) },
    fire: { x: c.x, z: c.z },
    tents: [
      { x: c.x - 7.5, z: c.z - 3.5, rot: 0.6, scale: 1.0 },
      { x: c.x + 1.5, z: c.z - 8.5, rot: 2.1, scale: 1.12 },
      { x: c.x + 7.0, z: c.z + 2.5, rot: 3.9, scale: 0.92 },
      { x: c.x - 3.0, z: c.z + 8.0, rot: 5.2, scale: 1.05 },
    ],
    rack: { x: c.x - 9, z: c.z + 6.5, rot: 0.3 },
    woodpile: { x: c.x + 5.5, z: c.z - 3.2, rot: 1.1 },
    logs: [
      { x: c.x + 2.6, z: c.z + 1.2, rot: 0.4 },
      { x: c.x - 2.4, z: c.z + 1.6, rot: 2.6 },
      { x: c.x - 0.4, z: c.z - 2.8, rot: 1.6 },
    ],
  };
}

/** Pick a species from an environment's list, weighted by density. */
function pick(rng: Rng, list: Record<string, number>, filter: (id: string) => boolean): string | null {
  const entries = Object.entries(list).filter(([id]) => filter(id));
  const total = entries.reduce((s, [, d]) => s + d, 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const [id, d] of entries) {
    r -= d;
    if (r <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

const ROCKY = new Set<EnvironmentId>(['hills', 'mountains', 'snowy-hills', 'chalk-hills', 'volcanic', 'glacier', 'desert']);

function scatter(seed: number, terrain: Heightfield, n: Noise2D, envAt: (x: number, z: number) => EnvironmentId, campAt: { x: number; z: number }): PropInstance[] {
  const rng = new Rng(subSeed(seed, 3));
  const props: PropInstance[] = [];
  const half = terrain.size / 2 - 4;
  const add = (kind: PropKind, x: number, z: number, scale: number, species?: string) => props.push({ kind, x, z, scale, rot: rng.next() * Math.PI * 2, species });
  const attempts = 46000;
  for (let a = 0; a < attempts; a++) {
    const x = rng.range(-half, half);
    const z = rng.range(-half, half);
    if (Math.hypot(x - campAt.x, z - campAt.z) < 16) continue;
    const env = envAt(x, z);
    const e = ENVIRONMENT_BY_ID.get(env)!;
    const h = terrain.sample(x, z);
    const above = h - terrain.waterLevel;
    const slope = terrain.slope(x, z);
    // Underwater: seaweed and shellfish beds in the shallows only.
    if (above < 0) {
      if (above > -1.5 && rng.next() < 0.07) {
        const sp = pick(rng, { ...e.flora, ...e.fauna }, (id) => id === 'seaweed-bed' || id === 'shellfish-bed');
        if (sp) add(FLORA_BY_ID.get(sp)?.prop ?? FAUNA_BY_ID.get(sp)?.prop ?? 'shellfish', x, z, rng.range(0.9, 1.2), sp);
      }
      continue;
    }
    // Reeds on wet margins everywhere water meets land (except the sea's beaches).
    if (above < 0.7 && slope < 0.5 && env !== 'coast' && env !== 'dry-lake') {
      if (rng.next() < 0.5) add('reeds', x, z, rng.range(0.8, 1.3));
      continue;
    }
    // Rocks on steep and rocky ground.
    if (slope > 0.75 || (ROCKY.has(env) && rng.next() < 0.06)) {
      if (rng.next() < 0.22) add(rng.next() < 0.3 ? 'boulder' : 'rock', x, z, rng.range(0.6, 1.6));
      continue;
    }
    const cover = COVER[env] ?? 0.3;
    // Forests clump: denser where the forest noise is high.
    const clump = 0.55 + 0.45 * (n.fbm(x * 0.03 + 5, z * 0.03 - 8, 2) * 0.5 + 0.5);
    if (rng.next() > cover * clump) continue;
    // Fixed animal sources (hives, nests) now and then.
    if (rng.next() < 0.03) {
      const f = pick(rng, e.fauna, (id) => FAUNA_BY_ID.get(id)?.movement === 'fixed' && id !== 'shellfish-bed');
      if (f) {
        add(FAUNA_BY_ID.get(f)!.prop!, x, z, rng.range(0.9, 1.1), f);
        continue;
      }
    }
    const sp = pick(rng, e.flora, (id) => id !== 'seaweed-bed');
    if (!sp) continue;
    const prop = FLORA_BY_ID.get(sp)!.prop;
    // Trees thin out at altitude.
    if (TREE_PROPS.has(prop) && h > 50) continue;
    add(prop, x, z, TREE_PROPS.has(prop) ? rng.range(0.75, 1.25) : rng.range(0.8, 1.2), sp);
  }
  // A few lone meadow trees near camp for composition.
  add('oak', campAt.x + 22, campAt.z - 6, 1.35);
  add('oak', campAt.x - 24, campAt.z + 14, 1.15);
  add('birch', campAt.x - 18, campAt.z - 17, 1.0);
  return props;
}

/** River current along the channel; still water in the lake and sea. */
function buildFlow(terrain: Heightfield, L: Layout): FlowField {
  const res = 160;
  const data = new Float32Array(res * res * 2);
  const size = terrain.size;
  for (let j = 0; j < res; j++)
    for (let i = 0; i < res; i++) {
      const x = (i / (res - 1) - 0.5) * size;
      const z = (j / (res - 1) - 0.5) * size;
      const k = (j * res + i) * 2;
      if (terrain.sample(x, z) >= terrain.waterLevel) continue;
      const seg = distToLine(L.river, x, z);
      const width = 4.5 + seg.t * 7;
      const midstream = 1 - smoothstep(0, width + 6, seg.d);
      const lakeD = Math.hypot(x - L.lake.x, z - L.lake.z);
      const intoLake = smoothstep(L.lake.r * 0.2, L.lake.r * 1.1, lakeD);
      const speed = (1.6 - seg.t * 0.9) * midstream * intoLake;
      data[k] = seg.tx * speed;
      data[k + 1] = seg.tz * speed;
    }
  return { res, size, data };
}

/** The environment at a point, from a scene's biome map. */
export function envAtPoint(biome: Uint8Array, x: number, z: number): EnvironmentId {
  const cell = WORLD_SIZE / BIOME_RES;
  const i = Math.min(BIOME_RES - 1, Math.max(0, Math.floor((x + WORLD_SIZE / 2) / cell)));
  const j = Math.min(BIOME_RES - 1, Math.max(0, Math.floor((z + WORLD_SIZE / 2) / cell)));
  return ENVIRONMENTS[biome[j * BIOME_RES + i]].id;
}
