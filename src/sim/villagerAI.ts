// Villager decision-making. Each villager weighs what the group is short of, what they love
// doing (their passion) and what they are good at (their skills), then picks a job, walks
// there, works, carries the result home and stores it. Every job draws on a real source in
// the world: a plant, a rock, a herd that must be stalked, a fish shoal, a hive or the river.
// Finished work builds insight toward discoveries; known inventions get built.

import { HERD_FLEE, takeAnimal } from './animals';
import { ACQUISITION, METHOD_BY_ID, type AcquisitionMethod } from './data/acquisition';
import { eraIndex } from './data/eras';
import { FAUNA_BY_ID } from './data/fauna';
import { ENVIRONMENT_BY_ID } from './data/environments';
import { JOBS, PASSION_JOBS, type JobId, type Passion } from './data/jobs';
import { MATERIAL_BY_ID } from './data/materials';
import { FOODS } from './data/preservation';
import { foodTotal } from './food';
import { itemName, RECIPES, type Recipe } from './data/processing';
import { FACILITY_BY_ID } from './data/facilities';
import { currentEra, gainInsight, knows, logEvent, noteSeen } from './discovery';
import { ROAD_TIERS } from './data/structures';
import { bedFor, buildingWants, buildWork, lineOf, providedFacilities, tierOf, underConstruction, type Structure } from './town';
import { hexToWorld } from './hex';
import { RIVER } from './testScene';
import { CYCLE_SECONDS, SEASONS } from './time';
import { calendar } from './time';
import type { World } from './world';

export const ACTIVITIES = ['resting', 'walking', 'gathering', 'fetching-water', 'crafting', 'sleeping'] as const;
export type Activity = (typeof ACTIVITIES)[number];

export type Target = { type: 'node'; index: number } | { type: 'hex'; index: number } | { type: 'herd'; index: number } | { type: 'structure'; id: number };

export type Task =
  | {
      kind: 'gather';
      method: string;
      target: Target;
      stage: 'going' | 'stalking' | 'working' | 'returning';
      spot: { x: number; z: number };
      water: boolean;
      attempts: number;
    }
  | { kind: 'process'; recipe: string; stage: 'going' | 'working'; spot: { x: number; z: number }; face: { x: number; z: number }; structure?: number }
  | { kind: 'build'; structure: number; stage: 'going' | 'working'; spot: { x: number; z: number } }
  | { kind: 'eat'; stage: 'going' | 'eating'; spot: { x: number; z: number } }
  | { kind: 'sleep'; stage: 'going' | 'sleeping'; spot: { x: number; z: number } }
  | { kind: 'idle'; stage: 'going' | 'resting'; spot: { x: number; z: number } };

export interface Villager {
  id: number;
  name: string;
  /** What they love doing. */
  passion: Passion;
  /** What they are naturally good at (may differ from passion). */
  talent: Passion;
  /** Learns and discovers far faster than others. */
  prodigy: boolean;
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
  /** Insight built toward each discovery. */
  insight: Record<string, number>;
  /** Discoveries this villager made. */
  discoveries: string[];
  /** Game time until which a god's inspiration lasts. */
  inspiredUntil: number;
}

const CAMP_FACILITIES = new Set(['campfire', 'knapping-spot', 'drying-rack', 'bone-carver']);

const WALK = 1.4;
const STALK = 0.55;
const CARRY_CAP = 8;
const HUNT_CARRY = 36;
/** One fish takes this much of a shoal's count. */
const FISH_SHARE = 0.1;
const BUILD_CHUNK = 120;
void CYCLE_SECONDS;

const DOING: Record<string, string> = {
  forage: 'foraging', 'pick-wild-herbs': 'picking herbs', 'gather-deadwood': 'gathering deadwood', 'cut-fibres': 'cutting reeds',
  'scrape-resin': 'scraping resin', hunt: 'hunting', 'hand-fishing': 'fishing', 'canoe-fishing': 'fishing from a canoe',
  'gather-shellfish': 'gathering shellfish', 'raid-wild-hive': 'raiding a wild hive', 'smoke-wild-hive': 'smoking a hive',
  'collect-eggs': 'collecting eggs', 'collect-stones': 'collecting stones', 'dig-by-hand': 'digging', beachcomb: 'combing the riverbed',
  'carry-water': 'fetching water',
};

/** Raw foods: anything edible that is a base material. */
const RAW_FOODS = Object.keys(FOODS).filter((id) => MATERIAL_BY_ID.has(id));
const isCooked = (id: string) => FOODS[id]?.class === 'cooked';

/** Methods this band can use: by hand, or at a building that provides the facility. */
function availableMethods(world: World, provided: Map<string, Structure[]>): AcquisitionMethod[] {
  return ACQUISITION.filter(
    (m) =>
      (m.facility === null || provided.has(m.facility)) &&
      m.requires.every((r) => knows(world, r)) &&
      (m.id !== 'canoe-fishing' || stock(world, 'dugout-canoe') >= 1),
  );
}

/** Recipes this band can make: at the camp's own spots or at a building that provides the facility. */
function availableRecipes(world: World, provided: Map<string, Structure[]>): Recipe[] {
  const reach = eraIndex(currentEra(world)) + 1;
  return RECIPES.filter((r) => (CAMP_FACILITIES.has(r.facility) || provided.has(r.facility)) && eraIndex(r.era) <= reach && (r.requires ?? []).every((d) => knows(world, d)));
}

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
    // A boat or two once the band can make them, and an airship eventually.
    'dugout-canoe': 2,
    'plank-boat': 2,
    'sailing-ship': 1,
    steamship: 1,
    airship: 1,
    'motor-airship': 1,
    // Building materials kept on hand once the band can make them.
    lumber: 10,
    'cut-stone': 10,
    pottery: 6,
    planks: 10,
    bricks: 10,
  };
}

export function level(xp: number): number {
  return Math.min(100, Math.floor(Math.sqrt(xp / 4)));
}

function stock(world: World, id: string): number {
  return world.stockpile[id] ?? 0;
}

export { foodTotal };

function need(have: number, want: number): number {
  return Math.max(0, Math.min(1, (want - have) / Math.max(1, want)));
}

/** How much each material is wanted right now (0..1). */
export function materialNeeds(world: World): Record<string, number> {
  const t = targets(world.villagers.length);
  const food = need(foodTotal(world), t.food);
  const wood = need(stock(world, 'hardwood') + stock(world, 'softwood'), t.wood);
  const n: Record<string, number> = {};
  for (const id of RAW_FOODS) n[id] = food;
  n.hardwood = wood;
  n.softwood = wood;
  for (const id of ['stone', 'flint', 'reeds', 'clay', 'sand', 'fresh-water', 'resin', 'herbs']) n[id] = need(stock(world, id), t[id]);
  n.hides = need(stock(world, 'hides') + stock(world, 'cured-hide'), 4);
  n.bone = need(stock(world, 'bone'), 4);
  n.sinew = need(stock(world, 'sinew'), 4);
  n.feathers = need(stock(world, 'feathers') + stock(world, 'fletching') * 3, 6);
  // Building sites waiting for materials pull them in.
  for (const [id, missing] of Object.entries(buildingWants(world))) n[id] = Math.max(n[id] ?? 0, Math.min(1, 0.5 + missing / 20));
  return n;
}

function methodNeed(m: AcquisitionMethod, needs: Record<string, number>): number {
  let best = 0;
  for (const id of Object.keys(m.yields)) best = Math.max(best, needs[id] ?? 0.02);
  return best;
}

function recipeNeed(world: World, r: Recipe, wants: Record<string, number>): number {
  for (const [id, q] of Object.entries(r.inputs)) if (stock(world, id) < q) return 0;
  const people = world.villagers.length;
  const t = targets(people);
  let best = 0;
  for (const id of Object.keys(r.outputs)) if (wants[id]) best = Math.max(best, 0.75);
  for (const id of Object.keys(r.outputs)) {
    const out = FOODS[id];
    if (out) {
      // Preserving: raw food that will spoil soon is worth turning into something that keeps.
      for (const inId of Object.keys(r.inputs)) {
        const inp = FOODS[inId];
        if (inp && inp.shelfDays <= 6 && out.shelfDays > inp.shelfDays * 4) best = Math.max(best, 0.75 * Math.min(1, stock(world, inId) / (people * 2)));
      }
      // Cooking: worth it when cooked food is short.
      if (isCooked(id)) {
        const cooked = Object.keys(FOODS).filter(isCooked).reduce((s, k) => s + stock(world, k), 0);
        best = Math.max(best, need(cooked, people * 2) * 0.9);
      }
    }
    if (t[id] !== undefined) best = Math.max(best, need(stock(world, id), t[id]));
    else best = Math.max(best, 0.03);
  }
  return best;
}

function recipeJob(r: Recipe): JobId {
  return FACILITY_BY_ID.get(r.facility)?.job ?? 'cook';
}

type Choice = { job: JobId; score: number; method?: string; recipe?: string; site?: number };

/** Villagers working at (or heading to) a building. */
function workersAt(world: World, id: number): number {
  let n = 0;
  for (const v of world.villagers) {
    const t = v.task;
    if (t && ((t.kind === 'gather' && t.target.type === 'structure' && t.target.id === id) || (t.kind === 'process' && t.structure === id))) n++;
  }
  return n;
}

/** Rank every available job for this villager. */
export function rankJobs(world: World, v: Villager): Choice[] {
  const needs = materialNeeds(world);
  const wants = buildingWants(world);
  const provided = providedFacilities(world);
  const passionJobs = PASSION_JOBS[v.passion];
  const talentJobs = PASSION_JOBS[v.talent];
  const out: Choice[] = [];
  const weigh = (job: JobId, base: number) => {
    const lv = level(v.skills[job] ?? 0);
    const passion = passionJobs.includes(job) ? 0.7 : 0;
    const talent = talentJobs.includes(job) ? 0.2 : 0;
    const habit = v.job === job ? 0.15 : 0;
    return base * (1 + passion + talent + habit) * (1 + lv * 0.04) * (0.85 + world.rng.next() * 0.3);
  };
  // With nothing pressing, people practise what they love: passion work is always a little wanted.
  const floor = (job: JobId) => (passionJobs.includes(job) ? 0.12 : 0);
  for (const m of availableMethods(world, provided)) {
    // Working at a building beats doing the same by hand.
    const base = Math.max(methodNeed(m, needs), floor(m.job)) * (m.facility ? 1.25 : 1);
    if (base <= 0) continue;
    out.push({ job: m.job, score: weigh(m.job, base), method: m.id });
  }
  for (const r of availableRecipes(world, provided)) {
    const base = recipeNeed(world, r, wants);
    if (base <= 0) continue;
    const job = recipeJob(r);
    out.push({ job, score: weigh(job, base), recipe: r.id });
  }
  // Building sites with their materials in hand need builders.
  for (const st of world.structures) {
    if (!underConstruction(st) || !st.supplied) continue;
    const l = lineOf(st);
    const fits = passionJobs.includes(l.job) || passionJobs.includes('builder') ? 0.15 : 0;
    out.push({ job: 'builder', score: weigh('builder', 0.55 + fits), site: st.id });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

function stationFor(world: World, recipe: Recipe): { spot: { x: number; z: number }; face: { x: number; z: number }; structure?: number } | null {
  const c = world.camp;
  if (!CAMP_FACILITIES.has(recipe.facility)) {
    const at = (providedFacilities(world).get(recipe.facility) ?? []).find((s) => workersAt(world, s.id) < Math.max(1, tierOf(s)?.workers ?? 1));
    if (!at) return null;
    const a = world.rng.next() * Math.PI * 2;
    const spot = world.nav.nearestPassable(at.x + Math.cos(a) * 2.5, at.z + Math.sin(a) * 2.5) ?? { x: at.x, z: at.z };
    return { spot, face: { x: at.x, z: at.z }, structure: at.id };
  }
  const target = recipe.facility === 'campfire' ? c.fire : recipe.facility === 'drying-rack' ? c.rack : c.woodpile;
  const a = world.rng.next() * Math.PI * 2;
  const r = recipe.facility === 'campfire' ? 1.9 : 1.4;
  return { spot: { x: target.x + Math.cos(a) * r, z: target.z + Math.sin(a) * r }, face: { x: target.x, z: target.z } };
}

/** The riverbank spot nearest camp, where boats are built and launched. */
export function riverbankSite(world: World): { x: number; z: number } {
  const c = world.camp.center;
  let best = { x: RIVER[0][0], z: RIVER[0][1] };
  let bestD = Infinity;
  for (let k = 0; k < RIVER.length - 1; k++)
    for (let t = 0; t <= 1; t += 0.05) {
      const x = RIVER[k][0] + (RIVER[k + 1][0] - RIVER[k][0]) * t;
      const z = RIVER[k][1] + (RIVER[k + 1][1] - RIVER[k][1]) * t;
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < bestD) {
        bestD = d;
        best = { x, z };
      }
    }
  return world.nav.nearestPassable(best.x, best.z) ?? { x: c.x, z: c.z };
}

type Found = { target: Target; spot: { x: number; z: number }; water: boolean };

/** Find where to work a method: the plant, rock, herd, shoal, hive or water it draws on. */
function chooseTarget(world: World, m: AcquisitionMethod, needs: Record<string, number>): Found | null {
  let best: Found | null = null;
  let bestScore = 0;
  const camp = world.camp.center;
  const value = (stockMap: Record<string, number>) => {
    let s = 0;
    for (const id of Object.keys(m.yields)) if ((stockMap[id] ?? 0) >= 1) s += (needs[id] ?? 0.02) + 0.05;
    return s;
  };
  const consider = (score: number, make: () => Found | null) => {
    if (score <= bestScore) return;
    const f = make();
    if (!f) return;
    bestScore = score;
    best = f;
  };
  const jitter = () => 0.8 + world.rng.next() * 0.4;

  // Facility methods are worked at the building that provides them.
  if (m.facility) {
    const at = (providedFacilities(world).get(m.facility) ?? []).find((s) => workersAt(world, s.id) < Math.max(1, tierOf(s)?.workers ?? 1));
    if (!at) return null;
    const a = world.rng.next() * Math.PI * 2;
    const spot = world.nav.nearestPassable(at.x + Math.cos(a) * 3, at.z + Math.sin(a) * 3);
    return spot ? { target: { type: 'structure', id: at.id }, spot, water: false } : null;
  }

  if (m.source === 'plant' || m.source === 'fixed' || m.source === 'ground') {
    const kind = m.source === 'plant' ? 'plant' : m.source === 'fixed' ? 'fixed' : 'ground';
    for (let i = 0; i < world.nodes.length; i++) {
      const n = world.nodes[i];
      if (n.kind !== kind) continue;
      if (m.species && !m.species.includes(n.species ?? '')) continue;
      const s = value(n.stock);
      if (!s) continue;
      const d = Math.hypot(n.x - camp.x, n.z - camp.z);
      if (d > 110) continue;
      consider((s / (1 + d / 25)) * jitter(), () => (world.nav.nearestPassable(n.x, n.z) ? { target: { type: 'node', index: i }, spot: { x: n.x, z: n.z }, water: false } : null));
    }
  }
  if (m.source === 'ground' || m.source === 'water') {
    for (let i = 0; i < world.hexes.length; i++) {
      const h = world.hexes[i];
      const envWater = ENVIRONMENT_BY_ID.get(h.env)?.water;
      const s = m.source === 'water' ? (envWater && m.yields[envWater] ? (needs[envWater] ?? 0.02) + 0.05 : 0) : value(h.ground);
      if (!s) continue;
      const c = hexToWorld(h);
      const d = Math.hypot(c.x - camp.x, c.z - camp.z);
      if (d > 120) continue;
      const waterHex = h.env === 'river' || h.env === 'lake';
      consider((s / (1 + d / 25)) * jitter(), () => {
        const j = waterHex ? 0 : 6;
        const spot = world.nav.nearestPassable(c.x + (world.rng.next() - 0.5) * j, c.z + (world.rng.next() - 0.5) * j);
        return spot ? { target: { type: 'hex', index: i }, spot, water: m.source === 'water' || waterHex || h.env === 'riverbank' } : null;
      });
    }
  }
  if (m.source === 'herd' || m.source === 'shoal') {
    for (let i = 0; i < world.herds.length; i++) {
      const h = world.herds[i];
      const sp = FAUNA_BY_ID.get(h.species)!;
      const fish = h.species.endsWith('fish');
      if (h.count < 1 || fish !== (m.source === 'shoal')) continue;
      if (sp.dangerous && !knows(world, 'organised-hunting')) continue;
      const s = value(Object.fromEntries(Object.keys(sp.yields).map((k) => [k, 9]))) * Math.min(1, h.count / sp.herd);
      if (!s) continue;
      const d = Math.hypot(h.x - camp.x, h.z - camp.z);
      if (d > 140) continue;
      consider((s / (1 + d / 35)) * jitter(), () => {
        if (fish) {
          const bank = world.nav.nearestPassable(h.x, h.z);
          // From the bank a shoal must be close; from a canoe anywhere will do.
          if (!bank || (m.id !== 'canoe-fishing' && Math.hypot(bank.x - h.x, bank.z - h.z) > 14)) return null;
          return { target: { type: 'herd', index: i }, spot: bank, water: true };
        }
        // Approach to just outside the distance the herd would notice.
        const a = Math.atan2(camp.x - h.x, camp.z - h.z);
        const r = sp.wariness * 1.2;
        const spot = world.nav.nearestPassable(h.x + Math.sin(a) * r, h.z + Math.cos(a) * r);
        return spot ? { target: { type: 'herd', index: i }, spot, water: false } : null;
      });
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
  const bedtime = !cal.isDay && cal.phaseProgress > 0.08 && cal.phaseProgress < 0.95;
  // Eat before bed if at all hungry, so nobody wakes up starving.
  if (v.hunger > (bedtime ? 0.3 : 0.55) && foodTotal(world) > 0.1) {
    const a = world.rng.next() * Math.PI * 2;
    const spot = { x: c.fire.x + Math.cos(a) * 2.6, z: c.fire.z + Math.sin(a) * 2.6 };
    v.task = { kind: 'eat', stage: 'going', spot };
    startPath(world, v, spot);
    return;
  }
  if (bedtime) {
    const spot = bedFor(world, v);
    v.task = { kind: 'sleep', stage: 'going', spot };
    v.job = null;
    startPath(world, v, spot);
    return;
  }
  const ranked = rankJobs(world, v);
  v.priorities = ranked.slice(0, 4).map(({ job, score }) => ({ job, score }));
  const needs = materialNeeds(world);
  for (const choice of ranked.slice(0, 3)) {
    if (choice.score < 0.06) break;
    if (choice.method) {
      const m = METHOD_BY_ID.get(choice.method)!;
      const t = chooseTarget(world, m, needs);
      if (!t) continue;
      v.task = { kind: 'gather', method: m.id, target: t.target, stage: 'going', spot: t.spot, water: t.water, attempts: 0 };
      v.job = m.job;
      if (!startPath(world, v, t.spot)) {
        v.task = null;
        continue;
      }
      return;
    }
    if (choice.recipe) {
      const r = RECIPES.find((x) => x.id === choice.recipe)!;
      const st = stationFor(world, r);
      if (!st) continue;
      // Reserve the inputs now so two villagers don't use the same materials.
      for (const [id, q] of Object.entries(r.inputs)) world.stockpile[id] = stock(world, id) - q;
      v.task = { kind: 'process', recipe: r.id, stage: 'going', spot: st.spot, face: st.face, structure: st.structure };
      v.job = recipeJob(r);
      startPath(world, v, st.spot);
      return;
    }
    if (choice.site !== undefined) {
      const st = world.structures.find((x) => x.id === choice.site);
      if (!st) continue;
      const a = world.rng.next() * Math.PI * 2;
      const r = 2.5 + world.rng.next() * 2;
      const spot = world.nav.nearestPassable(st.x + Math.cos(a) * r, st.z + Math.sin(a) * r) ?? { x: st.x, z: st.z };
      v.task = { kind: 'build', structure: st.id, stage: 'going', spot };
      v.job = 'builder';
      if (!startPath(world, v, spot)) {
        v.task = null;
        continue;
      }
      return;
    }
  }
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
  const speed = WALK * ROAD_TIERS[world.nav.roadAt(v.x, v.z)].speed;
  let remaining = speed * dt;
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
      v.vx = (dx / d) * speed;
      v.vz = (dz / d) * speed;
      remaining = 0;
    }
  }
  world.nav.tread(v.x, v.z, dt * 0.012);
  return v.path.length === 0;
}

function addXp(v: Villager, job: JobId, amount: number): void {
  // Talent makes skill come faster.
  const talent = PASSION_JOBS[v.talent].includes(job) ? 1.5 : 1;
  v.skills[job] = (v.skills[job] ?? 0) + amount * talent;
  const fulfilling = PASSION_JOBS[v.passion].includes(job);
  v.fulfilment = Math.max(0, Math.min(1, v.fulfilment + (fulfilling ? 0.04 : -0.01)));
}

function workSeconds(v: Villager, job: JobId, base: number): number {
  return base * (1 - Math.min(0.5, level(v.skills[job] ?? 0) * 0.025));
}

function headHome(world: World, v: Villager): void {
  const drop = { x: world.camp.woodpile.x + (world.rng.next() - 0.5) * 2, z: world.camp.woodpile.z + 1.5 + world.rng.next() };
  startPath(world, v, drop);
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
      if (calendar(world.clock.totalSeconds).isDay) {
        v.task = null;
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
      const job = recipeJob(r);
      if (task.stage === 'going') {
        task.stage = 'working';
        const at = task.structure !== undefined ? world.structures.find((x) => x.id === task.structure) : undefined;
        v.timer = workSeconds(v, job, r.seconds) / (at ? tierOf(at)?.speed ?? 1 : 1);
      }
      v.activity = 'crafting';
      face(v, task.face.x, task.face.z);
      v.timer -= dt;
      if (v.timer <= 0) {
        for (const [id, q] of Object.entries(r.outputs)) world.stockpile[id] = stock(world, id) + q;
        addXp(v, job, 10);
        const out = Object.keys(r.outputs)[0];
        gainInsight(world, v, r.id, job, level(v.skills[job] ?? 0), `making ${itemName(out, MATERIAL_BY_ID).toLowerCase()}`);
        v.task = null;
      }
      return;
    }
    case 'build': {
      const st = world.structures.find((x) => x.id === task.structure);
      if (!st || !underConstruction(st)) {
        v.task = null; // finished or gone
        return;
      }
      if (task.stage === 'going') {
        task.stage = 'working';
        v.timer = BUILD_CHUNK;
      }
      v.activity = 'crafting';
      face(v, st.x, st.z);
      const speed = 1 + level(v.skills.builder ?? 0) * 0.03;
      v.timer -= dt;
      if (buildWork(world, st, dt * speed, v)) {
        addXp(v, 'builder', 30);
        v.task = null;
      } else if (v.timer <= 0) {
        addXp(v, 'builder', 10);
        gainInsight(world, v, 'build:' + st.line, 'builder', level(v.skills.builder ?? 0), 'building');
        v.task = null; // take a break and think again; the work is kept
      }
      return;
    }
    case 'gather': {
      const m = METHOD_BY_ID.get(task.method)!;
      if (task.target.type === 'herd' && m.source === 'herd') {
        huntStep(world, v, task, m, dt);
        return;
      }
      if (task.stage === 'going') {
        task.stage = 'working';
        const at = task.target.type === 'structure' ? world.structures.find((x) => x.id === (task.target as { id: number }).id) : undefined;
        v.timer = workSeconds(v, m.job, m.seconds) / (at ? tierOf(at)?.speed ?? 1 : 1);
      }
      if (task.stage === 'working') {
        v.activity = task.water ? 'fetching-water' : 'gathering';
        const look = targetPos(world, task.target);
        face(v, look.x, look.z);
        v.timer -= dt;
        if (v.timer > 0) return;
        if (task.target.type === 'herd') fishCycle(world, v, m, world.herds[task.target.index]);
        else if (task.target.type === 'structure') {
          const at = world.structures.find((x) => x.id === (task.target as { id: number }).id);
          if (at) facilityCycle(world, v, m, at);
          // Work done at a building goes straight into the town's store.
          addXp(v, m.job, 8);
          gainInsight(world, v, m.id, m.job, level(v.skills[m.job] ?? 0), DOING[m.id] ?? `working at the ${tierOf(at!)?.name.toLowerCase() ?? 'workshop'}`);
          deliver(world, v);
          return;
        } else collect(world, v, m, task.target);
        finishCycle(world, v, m, task);
        return;
      }
      deliver(world, v);
      return;
    }
  }
}

function targetPos(world: World, t: Target): { x: number; z: number } {
  if (t.type === 'structure') return world.structures.find((s) => s.id === t.id) ?? world.camp.center;
  if (t.type === 'node') return world.nodes[t.index];
  if (t.type === 'herd') return world.herds[t.index];
  return hexToWorld(world.hexes[t.index]);
}

function finishCycle(world: World, v: Villager, m: AcquisitionMethod, task: Extract<Task, { kind: 'gather' }>): void {
  addXp(v, m.job, 8);
  if (Object.keys(v.carrying).length === 0) {
    v.task = null; // nothing there after all; think again
    return;
  }
  gainInsight(world, v, m.id, m.job, level(v.skills[m.job] ?? 0), DOING[m.id] ?? m.name.toLowerCase());
  task.stage = 'returning';
  headHome(world, v);
}

function deliver(world: World, v: Villager): void {
  for (const [id, q] of Object.entries(v.carrying)) world.stockpile[id] = stock(world, id) + q;
  v.carrying = {};
  v.task = null;
}

/** Stalk a herd, close to throwing range, and try for a kill. */
function huntStep(world: World, v: Villager, task: Extract<Task, { kind: 'gather' }>, m: AcquisitionMethod, dt: number): void {
  if (task.stage === 'returning') {
    deliver(world, v);
    return;
  }
  const h = world.herds[(task.target as { index: number }).index];
  const sp = FAUNA_BY_ID.get(h.species)!;
  noteSeen(world, h.species);
  if (task.stage === 'going') {
    task.stage = 'stalking';
    v.timer = 240; // give up after this long
  }
  if (h.count < 1 || v.timer <= 0) {
    finishCycle(world, v, m, task);
    return;
  }
  v.timer -= dt;
  v.activity = 'walking';
  const dx = h.x - v.x;
  const dz = h.z - v.z;
  const d = Math.hypot(dx, dz);
  const range = sp.herd <= 3 && sp.yields['game-meat'] <= 1 ? 6 : 10;
  if (h.state === HERD_FLEE) {
    // Wait for them to settle, then follow.
    v.activity = 'resting';
    face(v, h.x, h.z);
    if (d > sp.wariness * 2.5) {
      const spot = world.nav.nearestPassable(h.x - (dx / d) * sp.wariness * 1.2, h.z - (dz / d) * sp.wariness * 1.2);
      if (!spot || !startPath(world, v, spot)) finishCycle(world, v, m, task);
    }
    return;
  }
  if (d > range) {
    const step = Math.min(d - range * 0.8, STALK * dt);
    const nx = v.x + (dx / d) * step;
    const nz = v.z + (dz / d) * step;
    if (!world.nav.passable(nx, nz)) {
      finishCycle(world, v, m, task);
      return;
    }
    v.x = nx;
    v.z = nz;
    v.heading = Math.atan2(dx, dz);
    v.vx = (dx / d) * STALK;
    v.vz = (dz / d) * STALK;
    return;
  }
  // In range: one try.
  face(v, h.x, h.z);
  v.activity = 'gathering';
  const lv = level(v.skills[m.job] ?? 0);
  const tools = stock(world, 'stone-tools') >= 1 || stock(world, 'obsidian-blades') >= 1 ? 1.25 : 1;
  const chance = sp.catchChance * (1 + lv * 0.04) * tools;
  task.attempts++;
  if (world.rng.next() < chance) {
    let carried = 0;
    for (const [id, y] of Object.entries(sp.yields)) {
      let amount = Math.floor(y) + (world.rng.next() < y % 1 ? 1 : 0);
      amount = Math.min(amount, HUNT_CARRY - carried);
      if (amount <= 0) continue;
      v.carrying[id] = (v.carrying[id] ?? 0) + amount;
      noteSeen(world, id);
      carried += amount;
    }
    takeAnimal(h);
    if (h.count < 0.5) logEvent(world, `The ${sp.name.toLowerCase()} near camp have been hunted out.`);
    finishCycle(world, v, m, task);
    return;
  }
  // Missed: the herd bolts.
  h.state = HERD_FLEE;
  h.timer = 0;
  if (task.attempts >= 3) finishCycle(world, v, m, task);
}

/** One cycle of fishing at a shoal: a few casts, each may land a fish. */
function fishCycle(world: World, v: Villager, m: AcquisitionMethod, h: World['herds'][number]): void {
  const sp = FAUNA_BY_ID.get(h.species)!;
  const lv = level(v.skills[m.job] ?? 0);
  const density = Math.min(1, h.count / sp.herd);
  const casts = m.yields.fish ?? 1;
  for (let k = 0; k < casts && h.count >= FISH_SHARE; k++) {
    if (world.rng.next() < sp.catchChance * (1 + lv * 0.04) * (0.4 + density * 0.6)) {
      v.carrying.fish = (v.carrying.fish ?? 0) + 1;
      h.count -= FISH_SHARE;
      noteSeen(world, 'fish');
    }
  }
  noteSeen(world, h.species);
  if (Object.keys(v.carrying).length === 0) v.carrying = {};
}

/** Crops grow in the warm seasons. */
const FARM_SEASON = [0.4, 0.9, 1.3, 0.05];

/**
 * One cycle at an acquisition building. It draws on what is really around it: trees near a
 * woodcutters' camp, the deposits under a quarry, herds near a lodge, shoals by a fishing hut.
 * Farms grow their own crops with the seasons; folds and coops need their kept animals.
 */
function facilityCycle(world: World, v: Villager, m: AcquisitionMethod, at: Structure): void {
  const take = (src: Record<string, number>, id: string, want: number) => {
    const n = Math.min(want, Math.floor(src[id] ?? 0));
    if (n <= 0) return 0;
    src[id] -= n;
    v.carrying[id] = (v.carrying[id] ?? 0) + n;
    noteSeen(world, id);
    return n;
  };
  const season = SEASONS.indexOf(calendar(world.clock.totalSeconds).season);
  const roll = (y: number) => Math.floor(y) + (world.rng.next() < y % 1 ? 1 : 0);
  switch (m.source) {
    case 'plant': {
      for (const [id, y] of Object.entries(m.yields)) {
        let want = roll(y);
        for (const n of world.nodes) {
          if (want <= 0) break;
          if (n.kind !== 'plant' || Math.hypot(n.x - at.x, n.z - at.z) > 45) continue;
          if (m.species && !m.species.includes(n.species ?? '')) continue;
          want -= take(n.stock, id, want);
        }
      }
      return;
    }
    case 'ground':
    case 'below': {
      // The building's own hex first, then its neighbours.
      const near = world.hexes.filter((h) => Math.hypot(hexToWorld(h).x - at.x, hexToWorld(h).z - at.z) < 20);
      for (const [id, y] of Object.entries(m.yields)) {
        let want = roll(y);
        for (const h of near) {
          if (want <= 0) break;
          want -= take(m.source === 'below' ? h.below : h.ground, id, want);
        }
      }
      return;
    }
    case 'water':
      for (const [id, y] of Object.entries(m.yields)) if (id === 'fresh-water') v.carrying[id] = (v.carrying[id] ?? 0) + roll(y);
      return;
    case 'herd': {
      const h = world.herds.filter((x) => x.count >= 1 && !x.species.endsWith('fish') && Math.hypot(x.x - at.x, x.z - at.z) < 110).sort((a, b) => b.count - a.count)[0];
      if (!h || world.rng.next() > 0.7) return;
      const sp = FAUNA_BY_ID.get(h.species)!;
      for (const [id, y] of Object.entries(sp.yields)) v.carrying[id] = (v.carrying[id] ?? 0) + roll(y);
      takeAnimal(h);
      noteSeen(world, h.species);
      return;
    }
    case 'shoal': {
      const h = world.herds.filter((x) => x.species.endsWith('fish') && Math.hypot(x.x - at.x, x.z - at.z) < 60).sort((a, b) => b.count - a.count)[0];
      if (!h) return;
      fishCycle(world, v, m, h);
      return;
    }
    case 'farm':
      for (const [id, y] of Object.entries(m.yields)) {
        const n = roll(y * FARM_SEASON[season] * 0.4);
        if (n > 0) v.carrying[id] = (v.carrying[id] ?? 0) + n;
      }
      return;
    case 'livestock': {
      if (at.animals <= 0) return;
      const herd = Math.min(1, at.animals / 8);
      for (const [id, y] of Object.entries(m.yields)) {
        const n = roll(y * herd * 0.5);
        if (n > 0) v.carrying[id] = (v.carrying[id] ?? 0) + n;
      }
      // Some animals go for meat.
      if (m.yields['game-meat'] || m.yields.poultry) at.animals = Math.max(2, at.animals - 0.5);
      return;
    }
  }
}

function collect(world: World, v: Villager, m: AcquisitionMethod, target: Target): void {
  if (m.source === 'water' && target.type === 'hex') {
    const w = ENVIRONMENT_BY_ID.get(world.hexes[target.index].env)?.water;
    if (w && m.yields[w]) {
      v.carrying[w] = m.yields[w];
      noteSeen(world, w);
    }
    return;
  }
  if (target.type === 'structure' || target.type === 'herd') return;
  const src = target.type === 'node' ? world.nodes[target.index].stock : world.hexes[target.index].ground;
  if (target.type === 'node') {
    const n = world.nodes[target.index];
    if (n.species) noteSeen(world, n.species);
  }
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
    noteSeen(world, id);
    carried += amount;
    if (carried >= CARRY_CAP) break;
  }
}

function eat(world: World, v: Villager): void {
  // Eat what will spoil first; keep the preserved food for lean times.
  const order = Object.entries(FOODS).sort((a, b) => a[1].shelfDays - b[1].shelfDays || b[1].value - a[1].value);
  for (const [id, info] of order) {
    while (stock(world, id) >= 1 && v.hunger > 0.1) {
      world.stockpile[id] -= 1;
      v.hunger = Math.max(0, v.hunger - info.value);
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
