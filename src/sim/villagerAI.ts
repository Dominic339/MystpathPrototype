// Villager decision-making. Each villager weighs what the group is short of, what they love
// doing (their passion) and what they are good at (their skills), then picks a job, walks
// there, works, carries the result home and stores it. They eat when hungry and sleep at night.
// Hunter-gatherer era: only by-hand gathering and the camp's own crafting spots.

import { ACQUISITION, type AcquisitionMethod } from './data/acquisition';
import { JOBS, PASSION_JOBS, type JobId, type Passion } from './data/jobs';
import { FOOD_VALUE, MATERIAL_BY_ID } from './data/materials';
import { RECIPES, type Recipe } from './data/processing';
import { hexToWorld } from './hex';
import { calendar } from './time';
import type { World } from './world';

export const ACTIVITIES = ['resting', 'walking', 'gathering', 'fetching-water', 'crafting', 'sleeping'] as const;
export type Activity = (typeof ACTIVITIES)[number];

export type Target = { type: 'node'; index: number } | { type: 'hex'; index: number };

export type Task =
  | { kind: 'gather'; method: string; target: Target; stage: 'going' | 'working' | 'returning'; spot: { x: number; z: number }; water: boolean }
  | { kind: 'process'; recipe: string; stage: 'going' | 'working'; spot: { x: number; z: number }; face: { x: number; z: number } }
  | { kind: 'eat'; stage: 'going' | 'eating'; spot: { x: number; z: number } }
  | { kind: 'sleep'; stage: 'going' | 'sleeping'; spot: { x: number; z: number } }
  | { kind: 'idle'; stage: 'going' | 'resting'; spot: { x: number; z: number } };

export interface Villager {
  id: number;
  name: string;
  passion: Passion;
  look: number;
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  activity: Activity;
  /** 0 = full, 1 = starving. */
  hunger: number;
  /** Experience per job. */
  skills: Partial<Record<JobId, number>>;
  job: JobId | null;
  task: Task | null;
  /** The villager's own ranking of jobs right now. */
  priorities: { job: JobId; score: number }[];
  carrying: Record<string, number>;
  path: { x: number; z: number }[];
  timer: number;
  tent: number;
  /** Happiness 0..1, rising when doing work that matches their passion. */
  fulfilment: number;
}

/** By-hand methods this band can use: no facility needed, and any required discoveries made. */
function availableMethods(world: World): AcquisitionMethod[] {
  return ACQUISITION.filter((m) => m.facility === null && m.requires.every((r) => world.discoveries.includes(r)));
}
const CAMP_FACILITIES = new Set(['campfire', 'knapping-spot', 'drying-rack', 'bone-carver']);
const AVAILABLE_RECIPES = RECIPES.filter((r) => CAMP_FACILITIES.has(r.facility));
const WALK = 1.4;
const CARRY_CAP = 8;

/** Food value of processed foods. */
const COOKED_VALUE: Record<string, number> = {
  'cooked-meat': 0.55, 'cooked-fish': 0.45, 'roasted-food': 0.3, flatbread: 0.35, 'dried-meat': 0.45,
  'dried-fish': 0.4, 'dried-fruit': 0.3, 'egg-dishes': 0.3, 'dried-seaweed': 0.12,
};

/** Stock the group wants on hand, per villager where noted. */
function targets(people: number): Record<string, number> {
  return {
    food: people * 2.5,
    wood: 24,
    stone: 12,
    flint: 8,
    reeds: 10,
    clay: 8,
    sand: 6,
    'fresh-water': 10,
    resin: 4,
    herbs: 6,
    'stone-tools': people,
    'cured-hide': 4,
    cordage: 4,
    'bone-tools': 3,
    'resin-glue': 2,
    'dried-herbs': 3,
    'drinking-water': people,
    tallow: 4,
    'dried-fruit': people,
  };
}

export function level(xp: number): number {
  return Math.min(100, Math.floor(Math.sqrt(xp / 4)));
}

function stock(world: World, id: string): number {
  return world.stockpile[id] ?? 0;
}

export function foodTotal(world: World): number {
  let t = 0;
  for (const [id, v] of Object.entries(FOOD_VALUE)) t += stock(world, id) * v;
  for (const [id, v] of Object.entries(COOKED_VALUE)) t += stock(world, id) * v;
  return t;
}

function need(have: number, want: number): number {
  return Math.max(0, Math.min(1, (want - have) / Math.max(1, want)));
}

/** How much each material is wanted right now (0..1). */
function materialNeeds(world: World): Record<string, number> {
  const t = targets(world.villagers.length);
  const food = need(foodTotal(world), t.food);
  const wood = need(stock(world, 'hardwood') + stock(world, 'softwood'), t.wood);
  const n: Record<string, number> = {};
  for (const id of Object.keys(FOOD_VALUE)) n[id] = food;
  n.hardwood = wood;
  n.softwood = wood;
  for (const id of ['stone', 'flint', 'reeds', 'clay', 'sand', 'fresh-water', 'resin', 'herbs']) n[id] = need(stock(world, id), t[id]);
  // Hides and bone come with hunting; a little general interest in everything else.
  n.hides = need(stock(world, 'hides') + stock(world, 'cured-hide'), 4);
  n.bone = need(stock(world, 'bone'), 4);
  n.sinew = need(stock(world, 'sinew'), 4);
  n.feathers = need(stock(world, 'feathers') + stock(world, 'fletching') * 3, 6);
  return n;
}

function methodNeed(m: AcquisitionMethod, needs: Record<string, number>): number {
  let best = 0;
  for (const id of Object.keys(m.yields)) best = Math.max(best, needs[id] ?? 0.02);
  return best;
}

function recipeNeed(world: World, r: Recipe): number {
  // Can it run?
  for (const [id, q] of Object.entries(r.inputs)) if (stock(world, id) < q) return 0;
  const t = targets(world.villagers.length);
  let best = 0;
  for (const id of Object.keys(r.outputs)) {
    if (COOKED_VALUE[id] !== undefined) {
      // Cooking is worth it when raw food piles up and cooked food is short.
      const cooked = Object.keys(COOKED_VALUE).reduce((s, k) => s + stock(world, k), 0);
      best = Math.max(best, need(cooked, world.villagers.length * 2) * 0.9);
    } else if (t[id] !== undefined) best = Math.max(best, need(stock(world, id), t[id]));
    else best = Math.max(best, 0.03);
  }
  return best;
}

function jobFor(method: string | null, recipe: string | null): JobId {
  if (method) return ACQUISITION.find((m) => m.id === method)!.job;
  const r = RECIPES.find((x) => x.id === recipe)!;
  const fac: Record<string, JobId> = { campfire: 'cook', 'knapping-spot': 'knapper', 'drying-rack': 'tanner', 'bone-carver': 'knapper' };
  return fac[r.facility] ?? 'cook';
}

/** Rank every available job for this villager. */
export function rankJobs(world: World, v: Villager): { job: JobId; score: number; method?: string; recipe?: string }[] {
  const needs = materialNeeds(world);
  const passionJobs = PASSION_JOBS[v.passion];
  const out: { job: JobId; score: number; method?: string; recipe?: string }[] = [];
  const weigh = (job: JobId, base: number) => {
    const lv = level(v.skills[job] ?? 0);
    const passion = passionJobs.includes(job) ? 0.7 : 0;
    const habit = v.job === job ? 0.15 : 0;
    return base * (1 + passion + habit) * (1 + lv * 0.04) * (0.85 + world.rng.next() * 0.3);
  };
  for (const m of availableMethods(world)) {
    if (m.id === 'collect-ice' || m.id === 'beachcomb') continue; // nothing to collect here
    const base = methodNeed(m, needs);
    if (base <= 0) continue;
    out.push({ job: m.job, score: weigh(m.job, base), method: m.id });
  }
  for (const r of AVAILABLE_RECIPES) {
    const base = recipeNeed(world, r);
    if (base <= 0) continue;
    const job = jobFor(null, r.id);
    out.push({ job, score: weigh(job, base), recipe: r.id });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

function stationFor(world: World, recipe: Recipe): { spot: { x: number; z: number }; face: { x: number; z: number } } {
  const c = world.camp;
  const target = recipe.facility === 'campfire' ? c.fire : recipe.facility === 'drying-rack' ? c.rack : c.woodpile;
  const a = world.rng.next() * Math.PI * 2;
  const r = recipe.facility === 'campfire' ? 1.9 : 1.4;
  return { spot: { x: target.x + Math.cos(a) * r, z: target.z + Math.sin(a) * r }, face: { x: target.x, z: target.z } };
}

/** Find where to gather for a method: a node or a hex that still holds what is needed. */
function chooseTarget(world: World, m: AcquisitionMethod, needs: Record<string, number>): { target: Target; spot: { x: number; z: number }; water: boolean } | null {
  let best: { target: Target; spot: { x: number; z: number }; water: boolean } | null = null;
  let bestScore = 0;
  const value = (stockMap: Record<string, number>) => {
    let s = 0;
    for (const id of Object.keys(m.yields)) if ((stockMap[id] ?? 0) >= 1) s += (needs[id] ?? 0.02) + 0.05;
    return s;
  };
  const camp = world.camp.center;
  for (let i = 0; i < world.nodes.length; i++) {
    const n = world.nodes[i];
    // Feature methods (hives, nests) only work at their feature; other methods skip features.
    if ((m.feature ?? null) !== (n.feature ?? null)) continue;
    const s = value(n.stock);
    if (!s) continue;
    const d = Math.hypot(n.x - camp.x, n.z - camp.z);
    if (d > 110) continue;
    const score = (s / (1 + d / 25)) * (0.8 + world.rng.next() * 0.4);
    if (score > bestScore && world.nav.nearestPassable(n.x, n.z)) {
      bestScore = score;
      best = { target: { type: 'node', index: i }, spot: { x: n.x, z: n.z }, water: false };
    }
  }
  for (let i = 0; i < world.hexes.length && !m.feature; i++) {
    const h = world.hexes[i];
    const s = value(h.surface);
    if (!s) continue;
    const c = hexToWorld(h);
    const d = Math.hypot(c.x - camp.x, c.z - camp.z);
    if (d > 120) continue;
    // Water hexes are worked from the bank.
    const waterHex = h.env === 'river' || h.env === 'lake';
    const score = (s / (1 + d / 25)) * (0.8 + world.rng.next() * 0.4) * (m.id === 'hunt' ? Math.min(1.5, d / 40) : 1);
    if (score > bestScore) {
      const jitter = waterHex ? 0 : 6;
      const spot = world.nav.nearestPassable(c.x + (world.rng.next() - 0.5) * jitter, c.z + (world.rng.next() - 0.5) * jitter);
      if (!spot) continue;
      bestScore = score;
      best = { target: { type: 'hex', index: i }, spot, water: waterHex || h.env === 'riverbank' };
    }
  }
  return best;
}

function startPath(world: World, v: Villager, to: { x: number; z: number }): boolean {
  const p = world.nav.findPath(v.x, v.z, to.x, to.z);
  if (!p) return false;
  v.path = p;
  v.activity = 'walking';
  return true;
}

/** Choose what to do next. */
function decide(world: World, v: Villager): void {
  const cal = calendar(world.clock.totalSeconds);
  const c = world.camp;
  // Night: head to bed once the evening winds down.
  if (!cal.isDay && cal.phaseProgress > 0.08 && cal.phaseProgress < 0.95) {
    const t = c.tents[v.tent % c.tents.length];
    const spot = { x: t.x, z: t.z };
    v.task = { kind: 'sleep', stage: 'going', spot };
    v.job = null;
    startPath(world, v, spot);
    return;
  }
  // Hungry and there is food: eat by the fire.
  if (v.hunger > 0.55 && foodTotal(world) > 0.1) {
    const a = world.rng.next() * Math.PI * 2;
    const spot = { x: c.fire.x + Math.cos(a) * 2.6, z: c.fire.z + Math.sin(a) * 2.6 };
    v.task = { kind: 'eat', stage: 'going', spot };
    startPath(world, v, spot);
    return;
  }
  const ranked = rankJobs(world, v);
  v.priorities = ranked.slice(0, 4).map(({ job, score }) => ({ job, score }));
  const needs = materialNeeds(world);
  for (const choice of ranked.slice(0, 3)) {
    if (choice.score < 0.06) break;
    if (choice.method) {
      const m = ACQUISITION.find((x) => x.id === choice.method)!;
      const t = chooseTarget(world, m, needs);
      if (!t) continue;
      v.task = { kind: 'gather', method: m.id, target: t.target, stage: 'going', spot: t.spot, water: t.water };
      v.job = m.job;
      if (!startPath(world, v, t.spot)) {
        v.task = null;
        continue;
      }
      return;
    }
    if (choice.recipe) {
      const r = RECIPES.find((x) => x.id === choice.recipe)!;
      // Reserve the inputs now so two villagers don't use the same materials.
      for (const [id, q] of Object.entries(r.inputs)) world.stockpile[id] = stock(world, id) - q;
      const st = stationFor(world, r);
      v.task = { kind: 'process', recipe: r.id, stage: 'going', spot: st.spot, face: st.face };
      v.job = jobFor(null, r.id);
      startPath(world, v, st.spot);
      return;
    }
  }
  // Nothing pressing: rest by the fire.
  const a = world.rng.next() * Math.PI * 2;
  const spot = { x: c.fire.x + Math.cos(a) * (2.6 + world.rng.next() * 2), z: c.fire.z + Math.sin(a) * (2.6 + world.rng.next() * 2) };
  v.task = { kind: 'idle', stage: 'going', spot };
  v.job = null;
  startPath(world, v, spot);
  v.timer = 6 + world.rng.next() * 10;
}

function face(v: Villager, x: number, z: number): void {
  if (Math.hypot(x - v.x, z - v.z) > 0.05) v.heading = Math.atan2(x - v.x, z - v.z);
}

/** Walk along the current path. Returns true on arrival. */
function walk(world: World, v: Villager, dt: number): boolean {
  let remaining = WALK * dt;
  v.vx = 0;
  v.vz = 0;
  while (remaining > 0 && v.path.length) {
    const p = v.path[0];
    const dx = p.x - v.x;
    const dz = p.z - v.z;
    const d = Math.hypot(dx, dz);
    if (d <= remaining) {
      v.x = p.x;
      v.z = p.z;
      remaining -= d;
      v.path.shift();
    } else {
      v.x += (dx / d) * remaining;
      v.z += (dz / d) * remaining;
      v.heading = Math.atan2(dx, dz);
      v.vx = (dx / d) * WALK;
      v.vz = (dz / d) * WALK;
      remaining = 0;
    }
  }
  world.nav.tread(v.x, v.z, dt * 0.012);
  return v.path.length === 0;
}

function addXp(v: Villager, job: JobId, amount: number): void {
  v.skills[job] = (v.skills[job] ?? 0) + amount;
  const fulfilling = PASSION_JOBS[v.passion].includes(job);
  v.fulfilment = Math.max(0, Math.min(1, v.fulfilment + (fulfilling ? 0.04 : -0.01)));
}

function workSeconds(v: Villager, job: JobId, base: number): number {
  return base * (1 - Math.min(0.5, level(v.skills[job] ?? 0) * 0.025));
}

/** Advance one villager by dt game seconds. */
export function stepVillager(world: World, v: Villager, dt: number): void {
  v.hunger = Math.min(1, v.hunger + dt / 1200);
  if (!v.task) decide(world, v);
  const task = v.task!;

  if (v.path.length) {
    v.activity = 'walking';
    if (!walk(world, v, dt)) return;
  }
  v.vx = 0;
  v.vz = 0;

  switch (task.kind) {
    case 'sleep': {
      if (task.stage === 'going') task.stage = 'sleeping';
      v.activity = 'sleeping';
      const cal = calendar(world.clock.totalSeconds);
      if (cal.isDay) {
        v.task = null; // morning
        v.activity = 'resting';
      }
      return;
    }
    case 'idle': {
      task.stage = 'resting';
      v.activity = 'resting';
      face(v, world.camp.fire.x, world.camp.fire.z);
      v.timer -= dt;
      if (v.timer <= 0) {
        v.timer = 6 + world.rng.next() * 10;
        v.task = null;
      }
      return;
    }
    case 'eat': {
      if (task.stage === 'going') {
        task.stage = 'eating';
        v.timer = 12;
      }
      v.activity = 'crafting';
      face(v, world.camp.fire.x, world.camp.fire.z);
      v.timer -= dt;
      if (v.timer <= 0) {
        eat(world, v);
        v.task = null;
      }
      return;
    }
    case 'process': {
      const r = RECIPES.find((x) => x.id === task.recipe)!;
      const job = jobFor(null, r.id);
      if (task.stage === 'going') {
        task.stage = 'working';
        v.timer = workSeconds(v, job, r.seconds);
      }
      v.activity = 'crafting';
      face(v, task.face.x, task.face.z);
      v.timer -= dt;
      if (v.timer <= 0) {
        for (const [id, q] of Object.entries(r.outputs)) world.stockpile[id] = stock(world, id) + q;
        addXp(v, job, 10);
        v.task = null;
      }
      return;
    }
    case 'gather': {
      const m = ACQUISITION.find((x) => x.id === task.method)!;
      if (task.stage === 'going') {
        task.stage = 'working';
        v.timer = workSeconds(v, m.job, m.seconds);
      }
      if (task.stage === 'working') {
        v.activity = task.water ? 'fetching-water' : 'gathering';
        const look = task.target.type === 'node' ? world.nodes[task.target.index] : hexToWorld(world.hexes[task.target.index]);
        face(v, look.x, look.z);
        v.timer -= dt;
        if (v.timer > 0) return;
        collect(world, v, m, task.target);
        addXp(v, m.job, 8);
        if (Object.keys(v.carrying).length === 0) {
          v.task = null; // the spot was empty; think again
          return;
        }
        task.stage = 'returning';
        const drop = { x: world.camp.woodpile.x + (world.rng.next() - 0.5) * 2, z: world.camp.woodpile.z + 1.5 + world.rng.next() };
        startPath(world, v, drop);
        return;
      }
      // Returned: store what was carried.
      for (const [id, q] of Object.entries(v.carrying)) world.stockpile[id] = stock(world, id) + q;
      v.carrying = {};
      v.task = null;
      return;
    }
  }
}

function collect(world: World, v: Villager, m: AcquisitionMethod, target: Target): void {
  const src = target.type === 'node' ? world.nodes[target.index].stock : world.hexes[target.index].surface;
  const lv = level(v.skills[m.job] ?? 0);
  let carried = 0;
  for (const [id, y] of Object.entries(m.yields)) {
    const have = src[id] ?? 0;
    if (have < 1) continue;
    // Fractional yields (rare finds) succeed by chance.
    let amount = y * (1 + lv * 0.03);
    amount = Math.floor(amount) + (world.rng.next() < amount % 1 ? 1 : 0);
    amount = Math.min(amount, Math.floor(have), CARRY_CAP - carried);
    if (amount <= 0) continue;
    src[id] = have - amount;
    v.carrying[id] = (v.carrying[id] ?? 0) + amount;
    carried += amount;
    if (carried >= CARRY_CAP) break;
  }
}

function eat(world: World, v: Villager): void {
  // Prefer cooked food, then raw.
  const order = [...Object.entries(COOKED_VALUE), ...Object.entries(FOOD_VALUE)].sort((a, b) => b[1] - a[1]);
  for (const [id, value] of order) {
    while (stock(world, id) >= 1 && v.hunger > 0.1) {
      world.stockpile[id] -= 1;
      v.hunger = Math.max(0, v.hunger - value);
    }
    if (v.hunger <= 0.1) break;
  }
}

/** Category of what a villager carries, for the renderer (-1 = nothing). */
export function carryCategory(v: Villager): number {
  const ids = Object.keys(v.carrying);
  if (!ids.length) return -1;
  const cat = MATERIAL_BY_ID.get(ids[0])?.category;
  return ['stone-earth', 'ore', 'fuel-mineral', 'gem', 'water', 'plant', 'animal', 'magic'].indexOf(cat ?? 'plant');
}

export { JOBS };
