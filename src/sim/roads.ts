// Roads. A band's first paths are simply worn by feet along the routes people use. Once
// the band is a village it starts to plan: a main street is laid past the fire, side streets
// branch from it, homes and workshops stand on lots along them, and lanes run out to the
// farms, pits and mines. The street plan keeps homes and noisy work apart: workshops and
// yards on the side of town already given to work, homes on the other, stores and kitchens
// in the middle. Streets are surfaced with the best road the town knows.

import { ROAD_TIERS } from './data/structures';
import { knows } from './discovery';
import { clearProp, inAnyField } from './fields';
import { lineNoise, noiseAt, noiseOf } from './living';
import { frontOf, radiusOf, type Structure } from './town';
import { walkCost, type World } from './world';

export type Zone = 'res' | 'work' | 'centre';

export interface Street {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** A main street, a side street with lots along it, or a lane out to a farm or working. */
  kind: 'main' | 'side' | 'lane';
  /** Road surface (index into ROAD_TIERS). */
  tier: number;
  /** Segments of one lane share a chain, so it is drawn as one smooth path. */
  chain?: number;
  /** The building a lane was laid for (it goes when the building does). */
  owner?: number;
  /** A street of the town grid: the grid nodes it joins (in half-block steps from the temple). */
  g?: [number, number, number, number];
}

/** The town's grid, laid out round the temple. */
export interface Grid {
  /** The temple (the middle of the square). */
  x: number;
  z: number;
  /** One axis of the grid (unit vector); the other is at right angles. */
  ux: number;
  uz: number;
}

/** The length of a block's side: room for two rows of houses back to back. */
export const BLOCK = 28;

export interface TownPlan {
  /** Centre of the plan (beside the fire). */
  cx: number;
  cz: number;
  /** The way the working side of town lies (unit vector); homes lie the other way. */
  wx: number;
  wz: number;
  /** Once the people build real houses: the grid of streets round the temple. */
  grid?: Grid;
}

const WIDTH = { main: 3.4, side: 2.6, lane: 1.6 } as const;
export const streetWidth = (s: Street) => WIDTH[s.kind];

/** The best road surface the town knows how to lay. */
export function bestRoadTier(world: World): number {
  let tier = 0;
  ROAD_TIERS.forEach((r, i) => {
    if (r.requires && knows(world, r.requires)) tier = i;
  });
  return tier;
}

function distToSegment(px: number, pz: number, s: { ax: number; az: number; bx: number; bz: number }): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (pz - s.az) * dz) / len2));
  return Math.hypot(px - (s.ax + dx * t), pz - (s.az + dz * t));
}

/** Distance from a point to the nearest street (optionally only streets proper, not lanes). */
export function distToStreets(world: World, x: number, z: number, lanes = true): number {
  let best = Infinity;
  for (const s of world.streets) if (lanes || s.kind !== 'lane') best = Math.min(best, distToSegment(x, z, s) - streetWidth(s) / 2);
  return best;
}

/** Which side of town a spot is on. */
export function zoneAt(plan: TownPlan, x: number, z: number): Zone {
  if (plan.grid) {
    const g = plan.grid;
    const dx = x - g.x;
    const dz = z - g.z;
    if (dx * plan.wx + dz * plan.wz > BLOCK * 1.1) return 'work';
    return Math.max(Math.abs(dx * g.ux + dz * g.uz), Math.abs(-dx * g.uz + dz * g.ux)) < BLOCK * 1.5 ? 'centre' : 'res';
  }
  const along = (x - plan.cx) * plan.wx + (z - plan.cz) * plan.wz;
  return along > 10 ? 'work' : along < -4 ? 'res' : 'centre';
}

/** Can a street cross this point? Dry, not too steep, clear of buildings and fields. */
function streetable(world: World, x: number, z: number, ignore?: Structure): boolean {
  const t = world.terrain;
  const half = t.size / 2 - 6;
  if (Math.abs(x) > half || Math.abs(z) > half) return false;
  if (t.sample(x, z) < t.waterLevel + 0.3 || t.slope(x, z) > 0.42 || !world.nav.passable(x, z)) return false;
  // Only ground the town can walk to (not the far bank of the river).
  if (walkCost(world, x, z) > 200) return false;
  if (Math.hypot(world.camp.fire.x - x, world.camp.fire.z - z) < 4.5) return false;
  for (const s of world.structures) if (s !== ignore && Math.hypot(s.x - x, s.z - z) < radiusOf(s) + 1.2) return false;
  return !inAnyField(world, x, z, 1);
}

/** How far a street can run from a point in a direction (up to max). */
function run(world: World, x: number, z: number, dx: number, dz: number, max: number, spacing = 0): number {
  let ok = 0;
  for (let d = 2; d <= max; d += 2) {
    const px = x + dx * d;
    const pz = z + dz * d;
    if (!streetable(world, px, pz)) break;
    // Keep clear of other streets (except where it starts from one).
    if (spacing && d > 6 && distToStreets(world, px, pz, false) < spacing) break;
    ok = d;
  }
  return ok;
}

/** Trees, brush and rocks standing where a street runs are cleared (the timber and stone kept). */
function clearAlong(world: World, s: Street): void {
  const reach = streetWidth(s) / 2 + 0.9;
  const minX = Math.min(s.ax, s.bx) - reach;
  const maxX = Math.max(s.ax, s.bx) + reach;
  const minZ = Math.min(s.az, s.bz) - reach;
  const maxZ = Math.max(s.az, s.bz) + reach;
  world.props.forEach((p, i) => {
    if (p.x < minX || p.x > maxX || p.z < minZ || p.z > maxZ) return;
    if (p.kind === 'spirit' || p.kind === 'beehive' || p.kind === 'reeds' || p.kind === 'flowers') return;
    if (distToSegment(p.x, p.z, s) < reach) clearProp(world, i);
  });
}

/** Paint every street into the walking map. */
export function stampStreets(world: World): void {
  const nav = world.nav;
  nav.road.fill(0);
  for (const s of world.streets) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const nx = -(s.bz - s.az) / (len || 1);
    const nz = (s.bx - s.ax) / (len || 1);
    const offs = s.kind === 'main' ? [-1, 0, 1] : [0];
    for (let d = 0; d <= len; d += 1) {
      const t = len ? d / len : 0;
      for (const o of offs) {
        const { i, j } = nav.cellOf(s.ax + (s.bx - s.ax) * t + nx * o, s.az + (s.bz - s.az) * t + nz * o);
        const k = j * nav.n + i;
        if (Number.isFinite(nav.cost[k])) nav.road[k] = Math.max(nav.road[k], Math.max(1, s.tier));
      }
    }
  }
  world.roadsVersion++;
  // Cleared trees must vanish from the view too.
  world.structuresVersion++;
}

function addStreet(world: World, s: Street): void {
  world.streets.push(s);
  clearAlong(world, s);
  stampStreets(world);
}

/** The village lays out its first street: past the fire, from the working side to the homes. */
export function foundPlan(world: World): void {
  const fire = world.camp.fire;
  // The working side is where the workshops, pits and kilns already are.
  let wx = 0;
  let wz = 0;
  for (const s of world.structures) {
    const n = noiseOf(s);
    if (n < 0.3) continue;
    const d = Math.hypot(s.x - fire.x, s.z - fire.z) || 1;
    wx += ((s.x - fire.x) / d) * n;
    wz += ((s.z - fire.z) / d) * n;
  }
  const len = Math.hypot(wx, wz);
  if (len < 0.2) {
    wx = 1;
    wz = 0;
  } else {
    wx /= len;
    wz /= len;
  }
  // The old camp stays as it grew, huddled round the fire. The streets start at its edge:
  // one arm out toward the work, one the other way for homes. Try a few turns for the
  // pair that runs furthest.
  const arm = (ux: number, uz: number): { x: number; z: number; len: number } | null => {
    for (let d = 8; d <= 40; d += 2) {
      const x = fire.x + ux * d;
      const z = fire.z + uz * d;
      if (!world.nav.passable(x, z)) return null; // water or cliff in the way
      if (!streetable(world, x, z)) continue;
      const len = run(world, x, z, ux, uz, 44);
      if (len >= 14) return { x, z, len };
    }
    return null;
  };
  let best: { ux: number; uz: number; a: ReturnType<typeof arm>; b: ReturnType<typeof arm>; total: number } | null = null;
  for (const turn of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.3, -1.3]) {
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    const ux = wx * c - wz * sn;
    const uz = wx * sn + wz * c;
    const a = arm(ux, uz);
    const b = arm(-ux, -uz);
    const total = (a?.len ?? 0) + (b?.len ?? 0) - Math.abs(turn) * 6 - (a && b ? 0 : 30);
    if ((a || b) && (!best || total > best.total)) best = { ux, uz, a, b, total };
  }
  if (!best) return;
  world.plan = { cx: fire.x, cz: fire.z, wx: best.ux, wz: best.uz };
  const tier = Math.max(1, bestRoadTier(world));
  if (best.a) world.streets.push({ ax: best.a.x, az: best.a.z, bx: best.a.x + best.ux * best.a.len, bz: best.a.z + best.uz * best.a.len, kind: 'main', tier });
  if (best.b) world.streets.push({ ax: best.b.x, az: best.b.z, bx: best.b.x - best.ux * best.b.len, bz: best.b.z - best.uz * best.b.len, kind: 'main', tier });
  for (const s of world.streets) clearAlong(world, s);
  stampStreets(world);
  for (const s of world.structures) connectLane(world, s);
}

/** Lay a new side street (or lengthen one) on the wanted side of town. */
export function extendStreets(world: World, zone: Zone): boolean {
  const plan = world.plan;
  if (!plan) return false;
  let best: { s: Street; score: number } | null = null;
  const consider = (x: number, z: number, dx: number, dz: number) => {
    const len = run(world, x, z, dx, dz, 26, 9);
    if (len < 14) return;
    const mx = x + dx * len * 0.5;
    const mz = z + dz * len * 0.5;
    const zn = zoneAt(plan, mx, mz);
    if (zone !== 'centre' && zn !== zone) return;
    // Compact towns: nearer the centre is better, and so is gentler ground.
    const rise = Math.abs(world.terrain.sample(x + dx * len, z + dz * len) - world.terrain.sample(x, z));
    const score = -Math.hypot(mx - plan.cx, mz - plan.cz) - rise * 6 + len * 0.3;
    if (!best || score > best.score) best = { s: { ax: x, az: z, bx: x + dx * len, bz: z + dz * len, kind: 'side', tier: Math.max(1, bestRoadTier(world) - (bestRoadTier(world) > 1 ? 1 : 0)) }, score };
  };
  for (const s of world.streets) {
    if (s.kind === 'lane') continue;
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const ux = (s.bx - s.ax) / len;
    const uz = (s.bz - s.az) / len;
    // Carry on from either end, straight or with a slight bend.
    for (const bend of [0, 0.3, -0.3]) {
      const c = Math.cos(bend);
      const sn = Math.sin(bend);
      consider(s.bx, s.bz, ux * c - uz * sn, ux * sn + uz * c);
      consider(s.ax, s.az, -(ux * c - uz * sn), -(ux * sn + uz * c));
    }
    // Branch off at right angles.
    for (let d = 0; d <= len; d += 14) {
      const px = s.ax + ux * d;
      const pz = s.az + uz * d;
      consider(px, pz, -uz, ux);
      consider(px, pz, uz, -ux);
    }
  }
  // Or a new street out from the edge of the old camp, any way that is open.
  const fire = world.camp.fire;
  for (let k = 0; k < 12; k++) {
    const ux = Math.cos((k / 12) * Math.PI * 2);
    const uz = Math.sin((k / 12) * Math.PI * 2);
    for (let d = 8; d <= 40; d += 2) {
      const x = fire.x + ux * d;
      const z = fire.z + uz * d;
      if (!world.nav.passable(x, z)) break;
      if (!streetable(world, x, z) || distToStreets(world, x, z, false) < 9) continue;
      consider(x, z, ux, uz);
      break;
    }
  }
  if (!best) return false;
  addStreet(world, (best as { s: Street }).s);
  return true;
}

/**
 * A free lot on a street for a building of radius r, on the wanted side of town: beside the
 * street, facing it. Homes take the quietest lot; work takes the one nearest the middle.
 */
export function findLot(world: World, zone: Zone, r: number, front: number, ok: (x: number, z: number) => boolean): { x: number; z: number; rot: number } | null {
  const plan = world.plan;
  if (!plan) return null;
  if (plan.grid) return gridLot(world, plan, plan.grid, zone, r, front, ok);
  let best: { x: number; z: number; rot: number; score: number } | null = null;
  for (const s of world.streets) {
    if (s.kind === 'lane') continue;
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const ux = (s.bx - s.ax) / len;
    const uz = (s.bz - s.az) / len;
    const off = streetWidth(s) / 2 + front + 1.3;
    for (let d = Math.min(r, len / 2); d <= len - Math.min(r, len / 2); d += 1.5) {
      for (const side of [1, -1]) {
        const x = s.ax + ux * d - uz * off * side;
        const z = s.az + uz * d + ux * off * side;
        const zn = zoneAt(plan, x, z);
        if (zone === 'res' ? zn === 'work' : zone === 'work' ? zn === 'res' : false) continue;
        const centre = Math.hypot(x - plan.cx, z - plan.cz);
        const score = zone === 'res' ? -noiseAt(world, x, z) * 60 - centre * 0.5 - (zn === 'centre' ? 12 : 0) : zone === 'work' ? -centre - (zn === 'centre' ? 20 : 0) : -centre;
        if (best && score <= best.score) continue;
        if (!ok(x, z)) continue;
        // Face the street.
        best = { x, z, rot: Math.atan2(uz * side, -ux * side), score };
      }
    }
  }
  return best;
}

/** Straighten a walked route into a few straight runs a street can follow. */
function straighten(world: World, pts: { x: number; z: number }[], ignore?: Structure): { x: number; z: number }[] {
  const clear = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = 2; d < len - 1; d += 2) if (!streetable(world, a.x + ((b.x - a.x) * d) / len, a.z + ((b.z - a.z) * d) / len, ignore)) return false;
    return true;
  };
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clear(pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/** Where a building's door opens. */
export function doorOf(s: Structure): { x: number; z: number } {
  const f = frontOf(s) + 0.25;
  return { x: s.x + Math.sin(s.rot) * f, z: s.z + Math.cos(s.rot) * f };
}

/** The nearest point on any street's centre line. */
function nearestOnStreets(world: World, x: number, z: number): { x: number; z: number; d: number } | null {
  let goal: { x: number; z: number; d: number } | null = null;
  for (const st of world.streets) {
    const dx = st.bx - st.ax;
    const dz = st.bz - st.az;
    const t = Math.max(0, Math.min(1, ((x - st.ax) * dx + (z - st.az) * dz) / (dx * dx + dz * dz || 1)));
    const p = { x: st.ax + dx * t, z: st.az + dz * t };
    const d = Math.hypot(p.x - x, p.z - z);
    if (!goal || d < goal.d) goal = { ...p, d };
  }
  return goal;
}

/**
 * Join a building's door to the streets: a doorstep path straight across when it stands on
 * a street, else a lane along the way people would walk, in a few clean runs.
 */
export function connectLane(world: World, s: Structure): void {
  if (!world.plan || !world.streets.length) return;
  const door = doorOf(s);
  const goal = nearestOnStreets(world, door.x, door.z);
  if (!goal || goal.d > 260 || goal.d < 0.4) return;
  const tier = Math.max(1, Math.min(bestRoadTier(world), 2));
  const chain = world.nextChain++;
  // Step out of the door before turning, so the path meets the door square on.
  const step = { x: door.x + Math.sin(s.rot) * 1.6, z: door.z + Math.cos(s.rot) * 1.6 };
  let pts: { x: number; z: number }[];
  if (goal.d < 9) pts = [door, { x: goal.x, z: goal.z }];
  else {
    const path = world.nav.findPath(step.x, step.z, goal.x, goal.z);
    if (!path || !path.length) return;
    pts = [door, ...straighten(world, [step, ...path, { x: goal.x, z: goal.z }], s)];
  }
  for (let k = 0; k < pts.length - 1; k++) {
    if (Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z) < 0.3) continue;
    const lane: Street = { ax: pts[k].x, az: pts[k].z, bx: pts[k + 1].x, bz: pts[k + 1].z, kind: 'lane', tier, chain, owner: s.id };
    world.streets.push(lane);
    clearAlong(world, lane);
  }
  stampStreets(world);
}

// ------------------------------------------------------------------ the town grid

function gridPoint(g: Grid, i: number, j: number): { x: number; z: number } {
  return { x: g.x + (g.ux * i - g.uz * j) * BLOCK, z: g.z + (g.uz * i + g.ux * j) * BLOCK };
}

/** Good ground for a street of the grid (buildings are judged separately). */
function gridGround(world: World, x: number, z: number): boolean {
  const t = world.terrain;
  const half = t.size / 2 - 6;
  if (Math.abs(x) > half || Math.abs(z) > half) return false;
  return t.sample(x, z) > t.waterLevel + 0.3 && t.slope(x, z) < 0.4 && world.nav.passable(x, z) && walkCost(world, x, z) < 220 && !inAnyField(world, x, z, 1);
}

/**
 * Where to found the town: open, gentle ground near the old camp with room for blocks of
 * streets all round. Returns the temple's spot and the grid's turn, or null.
 */
export function pickTownSite(world: World): Grid | null {
  const fire = world.camp.fire;
  let best: (Grid & { score: number }) | null = null;
  for (let d = 30; d <= 100; d += 10)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = fire.x + Math.cos(a) * d;
      const z = fire.z + Math.sin(a) * d;
      if (!gridGround(world, x, z)) continue;
      for (const turn of [0, Math.PI / 8, Math.PI / 4, (Math.PI * 3) / 8]) {
        const g: Grid = { x, z, ux: Math.cos(turn), uz: Math.sin(turn) };
        // Count the grid nodes and street middles that fall on good ground.
        let good = 0;
        for (let i = -2.5; i <= 2.5; i++) for (let j = -2.5; j <= 2.5; j++) {
          const p = gridPoint(g, i, j);
          if (gridGround(world, p.x, p.z)) good++;
        }
        // The square itself must be good, level ground.
        let square = true;
        for (const [i, j] of [[0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5], [0, 0.5], [0.5, 0], [0, -0.5], [-0.5, 0], [0, 0]]) {
          const p = gridPoint(g, i, j);
          if (!gridGround(world, p.x, p.z) || Math.abs(world.terrain.sample(p.x, p.z) - world.terrain.sample(x, z)) > 2.2) square = false;
        }
        if (!square || good < 20) continue;
        const score = good - d * 0.12;
        if (!best || score > best.score) best = { ...g, score };
      }
    }
  return best;
}

const gKey = (g: [number, number, number, number]) => (g[0] < g[2] || (g[0] === g[2] && g[1] < g[3]) ? g.join(',') : [g[2], g[3], g[0], g[1]].join(','));

/** Lay the first streets of the grid: the square round the temple. Old streets become lanes' work. */
export function layGrid(world: World, g: Grid): void {
  const plan = world.plan ?? (world.plan = { cx: g.x, cz: g.z, wx: g.ux, wz: g.uz });
  // The working side: toward the noisy buildings there already are, along the grid.
  let wx = 0;
  let wz = 0;
  for (const s of world.structures) {
    const n = noiseOf(s);
    if (n < 0.3) continue;
    const d = Math.hypot(s.x - g.x, s.z - g.z) || 1;
    wx += ((s.x - g.x) / d) * n;
    wz += ((s.z - g.z) / d) * n;
  }
  const along = wx * g.ux + wz * g.uz;
  const across = -wx * g.uz + wz * g.ux;
  if (Math.abs(along) >= Math.abs(across)) [plan.wx, plan.wz] = along >= 0 ? [g.ux, g.uz] : [-g.ux, -g.uz];
  else [plan.wx, plan.wz] = across >= 0 ? [-g.uz, g.ux] : [g.uz, -g.ux];
  plan.cx = g.x;
  plan.cz = g.z;
  plan.grid = g;
  world.streets = [];
  const tier = Math.max(1, bestRoadTier(world));
  for (const seg of [[-0.5, -0.5, 0.5, -0.5], [0.5, -0.5, 0.5, 0.5], [0.5, 0.5, -0.5, 0.5], [-0.5, 0.5, -0.5, -0.5]] as [number, number, number, number][]) {
    const a = gridPoint(g, seg[0], seg[1]);
    const b = gridPoint(g, seg[2], seg[3]);
    const st: Street = { ax: a.x, az: a.z, bx: b.x, bz: b.z, kind: 'main', tier, g: seg };
    world.streets.push(st);
    clearAlong(world, st);
  }
  stampStreets(world);
}

/**
 * Add the next street of the grid on the wanted side of town: the free block side nearest
 * the temple. Old buildings in its way (the huts of the old camp) are pulled down.
 */
export function gridExtend(world: World, zone: Zone, isOld: (s: Structure) => boolean, demolish: (s: Structure) => void): boolean {
  const plan = world.plan;
  const g = plan?.grid;
  if (!plan || !g) return false;
  const have = new Set(world.streets.filter((s) => s.g).map((s) => gKey(s.g!)));
  const nodes = new Map<string, [number, number]>();
  for (const s of world.streets) if (s.g) for (const n of [[s.g[0], s.g[1]], [s.g[2], s.g[3]]] as [number, number][]) nodes.set(n.join(','), n);
  let best: { seg: [number, number, number, number]; score: number } | null = null;
  for (const [i, j] of nodes.values())
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const seg: [number, number, number, number] = [i, j, i + di, j + dj];
      if (have.has(gKey(seg))) continue;
      if (Math.abs(i + di) > 6 || Math.abs(j + dj) > 6) continue;
      const a = gridPoint(g, i, j);
      const b = gridPoint(g, i + di, j + dj);
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const zn = zoneAt(plan, mx, mz);
      if (zone === 'work' ? zn !== 'work' : zone === 'res' ? zn === 'work' : false) continue;
      let ok = true;
      for (let d = 0; d <= BLOCK && ok; d += 2) {
        const x = a.x + ((b.x - a.x) * d) / BLOCK;
        const z = a.z + ((b.z - a.z) * d) / BLOCK;
        if (!gridGround(world, x, z)) ok = false;
        else for (const s of world.structures) if (!isOld(s) && Math.hypot(s.x - x, s.z - z) < radiusOf(s) + 1.8) ok = false;
      }
      if (!ok) continue;
      // Nearest the temple first, and prefer finishing blocks (a street that joins two there already are).
      const score = -Math.hypot(mx - g.x, mz - g.z) + (nodes.has([i + di, j + dj].join(',')) ? 10 : 0);
      if (!best || score > best.score) best = { seg, score };
    }
  if (!best) return false;
  const seg = (best as { seg: [number, number, number, number] }).seg;
  const a = gridPoint(g, seg[0], seg[1]);
  const b = gridPoint(g, seg[2], seg[3]);
  // The two streets through the middle of the square's sides are the town's main streets.
  const st: Street = { ax: a.x, az: a.z, bx: b.x, bz: b.z, kind: Math.abs(seg[0]) === 0.5 && Math.abs(seg[2]) === 0.5 || (Math.abs(seg[1]) === 0.5 && Math.abs(seg[3]) === 0.5) ? 'main' : 'side', tier: Math.max(1, bestRoadTier(world) - 1), g: seg };
  for (const s of [...world.structures]) if (isOld(s) && distToSegment(s.x, s.z, st) < radiusOf(s) + streetWidth(st) / 2 + 0.6) demolish(s);
  // Lanes that the new street replaces or cuts are relaid from the doors they serve.
  world.streets.push(st);
  clearAlong(world, st);
  stampStreets(world);
  return true;
}

/** A free lot on the grid: houses stand in rows, two to each side of a block's street, facing it. */
function gridLot(world: World, plan: TownPlan, g: Grid, zone: Zone, r: number, front: number, ok: (x: number, z: number) => boolean): { x: number; z: number; rot: number } | null {
  let best: { x: number; z: number; rot: number; score: number } | null = null;
  const slots = r <= 6.2 ? [7.6, BLOCK - 7.6] : [BLOCK / 2];
  for (const s of world.streets) {
    if (!s.g) continue;
    const ux = (s.bx - s.ax) / BLOCK;
    const uz = (s.bz - s.az) / BLOCK;
    const off = streetWidth(s) / 2 + front + 1.3;
    for (const d of slots)
      for (const side of [1, -1]) {
        const x = s.ax + ux * d - uz * off * side;
        const z = s.az + uz * d + ux * off * side;
        // The square round the temple stays open.
        const dx = x - g.x;
        const dz = z - g.z;
        if (Math.max(Math.abs(dx * g.ux + dz * g.uz), Math.abs(-dx * g.uz + dz * g.ux)) < BLOCK / 2) continue;
        const zn = zoneAt(plan, x, z);
        if (zone === 'work' ? zn !== 'work' : zone === 'res' ? zn === 'work' : zn === 'work') continue;
        const centre = Math.hypot(dx, dz);
        const score = zone === 'res' ? -noiseAt(world, x, z) * 60 - centre * 0.5 - (zn === 'centre' ? 25 : 0) : -centre;
        if (best && score <= best.score) continue;
        if (!ok(x, z)) continue;
        best = { x, z, rot: Math.atan2(uz * side, -ux * side), score };
      }
  }
  return best;
}

/** Daily: resurface a couple of streets with the best road the town now knows, main streets first. */
export function improveStreets(world: World): void {
  const best = bestRoadTier(world);
  let done = 0;
  for (const kind of ['main', 'side', 'lane'] as const) {
    const want = kind === 'main' ? best : kind === 'side' ? Math.max(1, best - 1) : Math.max(1, Math.min(best - 1, 3));
    for (const s of world.streets) {
      if (done >= 3) break;
      if (s.kind === kind && s.tier < want) {
        s.tier++;
        done++;
      }
    }
  }
  if (done) stampStreets(world);
}

export { lineNoise };
