// The town: everything villagers build. A planner decides what the town needs next (homes
// when crowded, a building for each new skill, upgrades when a better tier is known) and
// where it should go (a quarry on rocky ground, a fishing hut at the water, fields in the
// meadow). Builders gather the materials and put it up; workers then run its facilities.
// Buildings belong to the villager whose passion fits them best.
//
// Newcomers join a prosperous band with room to sleep, and roads grow out of busy footpaths.

import { ACQUISITION } from './data/acquisition';
import { eraIndex } from './data/eras';
import { FAUNA_BY_ID } from './data/fauna';
import { PASSION_JOBS, PASSIONS } from './data/jobs';
import { MATERIAL_BY_ID } from './data/materials';
import { RECIPES } from './data/processing';
import { LINE_BY_ID, LINES, ROAD_TIERS, facilitiesAt, type Line, type Site, type Tier } from './data/structures';
import { currentEra, knows, logEvent } from './discovery';
import { HEX_SIZE, hexKey, hexToWorld, worldToHex as worldToHexLocal } from './hex';
import { calendar } from './time';
import { walkCost, type Villager, type World } from './world';

/** Can the town get hold of this item: in store, gatherable, or makeable with what it has? */
export function obtainable(world: World, id: string, need = 1): boolean {
  if ((world.stockpile[id] ?? 0) >= need) return true;
  const provided = providedFacilities(world);
  const can = (fac: string | null) => fac === null || fac === 'campfire' || fac === 'knapping-spot' || fac === 'drying-rack' || fac === 'bone-carver' || provided.has(fac);
  if (ACQUISITION.some((m) => m.yields[id] && can(m.facility) && m.requires.every((r) => knows(world, r)))) return true;
  return RECIPES.some((r) => r.outputs[id] && can(r.facility) && (r.requires ?? []).every((d) => knows(world, d)));
}

function canSupply(world: World, t: Tier): boolean {
  return Object.entries(t.build).every(([id, q]) => obtainable(world, id, q));
}

export interface Structure {
  id: number;
  line: string;
  /** Completed tier (-1 while the first tier is still going up). */
  tier: number;
  /** Tier being built: equal to `tier` when nothing is under way. */
  target: number;
  /** Builder work done toward the target tier, in game seconds. */
  progress: number;
  /** Materials for the target tier have been brought. */
  supplied: boolean;
  x: number;
  z: number;
  rot: number;
  hex: string;
  /** Picks among the model's variants. */
  variant: number;
  owner: number | null;
  /** Kept animals (folds, sties, coops). */
  animals: number;
  /** Game time the current construction was planned (stalled sites are abandoned). */
  plannedAt: number;
}

/** Building sites at once: more hands, more sites. */
const maxSites = (world: World) => 2 + Math.floor(world.villagers.length / 8);
const PLAN_EVERY = 20;

export function lineOf(s: Structure): Line {
  return LINE_BY_ID.get(s.line)!;
}

export function tierOf(s: Structure): Tier | null {
  return s.tier >= 0 ? lineOf(s).tiers[s.tier] : null;
}

export function underConstruction(s: Structure): boolean {
  return s.target > s.tier;
}

/** The highest tier of a line the town knows how to build. */
export function bestTier(world: World, l: Line): number {
  let best = -1;
  const reach = eraIndex(currentEra(world)) + 1;
  l.tiers.forEach((t, i) => {
    if (eraIndex(t.era) <= reach && t.requires.every((r) => knows(world, r))) best = i;
  });
  return best;
}

/** Facilities provided by finished buildings, with the building that provides each. */
export function providedFacilities(world: World): Map<string, Structure[]> {
  const out = new Map<string, Structure[]>();
  for (const s of world.structures) {
    if (s.tier < 0) continue;
    for (const f of facilitiesAt(lineOf(s), s.tier)) {
      if (!out.has(f)) out.set(f, []);
      out.get(f)!.push(s);
    }
  }
  return out;
}

export function housingCapacity(world: World): number {
  let cap = 0;
  for (const s of world.structures) {
    const t = tierOf(s);
    if (t?.housing) cap += t.housing;
  }
  return cap;
}

/** Materials still needed for building sites that are waiting on supplies. */
export function buildingWants(world: World): Record<string, number> {
  const want: Record<string, number> = {};
  for (const s of world.structures) {
    if (!underConstruction(s) || s.supplied) continue;
    for (const [id, q] of Object.entries(lineOf(s).tiers[s.target].build)) {
      const missing = q - (world.stockpile[id] ?? 0);
      if (missing > 0) want[id] = (want[id] ?? 0) + missing;
    }
  }
  return want;
}

// ------------------------------------------------------------------ siting

const FOOTPRINT: Partial<Record<string, number>> = {
  'garden-plots': 7, 'fibre-plots': 6, fold: 7, quarry: 6, 'clay-pit': 5, 'woodcutters-camp': 5, 'hunting-lodge': 4.5, roundhouse: 3.6,
  'stone-yard': 5, 'canoe-yard': 5, landing: 3, 'storage-pits': 3, 'herb-garden': 4, pigsty: 4, coop: 3, well: 2.5,
};
export function footprint(model: string): number {
  return FOOTPRINT[model] ?? 4.2;
}

function siteScore(world: World, site: Site, hexIndex: number): number {
  const h = world.hexes[hexIndex];
  const env = h.env;
  if (env === 'river' || env === 'lake' || env === 'sea') return 0;
  switch (site) {
    case 'camp':
      return env === 'meadow' || env === 'riverbank' || env === 'plains' ? 1 : 0.6;
    case 'meadow':
      return env === 'meadow' || env === 'plains' ? 1 : env === 'riverbank' ? 0.4 : 0;
    case 'forest':
      return env === 'temperate-forest' || env === 'conifer-forest' ? 1 : 0;
    case 'rocky':
    case 'hills':
      return env === 'hills' || env === 'mountains' ? 1 : (h.ground.stone ?? 0) > 20 || (h.below.stone ?? 0) > 100 ? 0.6 : 0;
    case 'bank':
    case 'water':
      return env === 'riverbank' ? 1 : 0;
    case 'clay':
      return (h.ground.clay ?? 0) > 0 ? 1 : (h.below.clay ?? 0) > 0 ? 0.6 : 0;
    case 'sand':
      return (h.ground.sand ?? 0) > 0 ? 1 : 0;
    case 'peat':
      return (h.ground.peat ?? 0) > 0 ? 1 : 0;
    case 'tar':
      return (h.ground.bitumen ?? 0) > 0 ? 1 : 0;
    case 'below': {
      let ore = 0;
      for (const [id, q] of Object.entries(h.below)) if (MATERIAL_BY_ID.get(id)?.category === 'ore' || id === 'coal') ore += q;
      return ore > 0 ? Math.min(1, ore / 200) : 0;
    }
  }
}

function clearAt(world: World, x: number, z: number, r: number, ignore?: Structure): boolean {
  const t = world.terrain;
  if (t.slope(x, z) > 0.45 || t.sample(x, z) < t.waterLevel + 0.3) return false;
  for (const s of world.structures) {
    if (s === ignore) continue;
    const other = footprint(lineOf(s).tiers[Math.max(0, s.target)].model);
    if (Math.hypot(s.x - x, s.z - z) < r + other + 1.5) return false;
  }
  const c = world.camp;
  if (Math.hypot(c.fire.x - x, c.fire.z - z) < 8 + r) return false;
  for (const p of world.props) {
    if (p.kind === 'flowers' || p.kind === 'grain' || p.kind === 'tubers' || p.kind === 'flax' || p.kind === 'mushrooms' || p.kind === 'nest') continue;
    const pr = p.kind === 'oak' || p.kind === 'pine' || p.kind === 'birch' || p.kind === 'apple' ? 1.8 : p.kind === 'boulder' ? 2.2 : 1;
    if (Math.hypot(p.x - x, p.z - z) < r + pr) return false;
  }
  return true;
}

/** Find a spot for a building of this line: the best-suited hex nearest the town centre. */
export function findSite(world: World, l: Line, model: string): { x: number; z: number; rot: number; hex: string } | null {
  const camp = world.camp.center;
  const r = footprint(model);
  const ranked: { i: number; score: number }[] = [];
  for (let i = 0; i < world.hexes.length; i++) {
    const s = siteScore(world, l.site, i);
    if (s <= 0) continue;
    const c = hexToWorld(world.hexes[i]);
    const d = Math.hypot(c.x - camp.x, c.z - camp.z);
    // The town spreads outward as it grows.
    const maxD = l.site === 'camp' ? 50 + world.villagers.length * 1.5 : 125 + world.villagers.length;
    if (d > maxD) continue;
    ranked.push({ i, score: s / (1 + d / (l.site === 'camp' ? 15 : 40)) });
  }
  ranked.sort((a, b) => b.score - a.score);
  for (const { i } of ranked.slice(0, 14)) {
    const c = hexToWorld(world.hexes[i]);
    const key = hexKey(world.hexes[i]);
    // One large building per hex; homes can cluster three to a hex.
    const here = world.structures.filter((s) => s.hex === key);
    if (l.kind === 'housing' ? here.some((s) => lineOf(s).kind !== 'housing') || here.length >= 3 : here.length > 0) continue;
    for (let k = 0; k < 24; k++) {
      const a = world.rng.next() * Math.PI * 2;
      const rad = Math.sqrt(world.rng.next()) * HEX_SIZE * 0.75;
      let x = c.x + Math.cos(a) * rad;
      let z = c.z + Math.sin(a) * rad;
      if (l.site === 'water') {
        // Slide toward the water's edge.
        const edge = waterEdge(world, x, z);
        if (!edge) continue;
        x = edge.x;
        z = edge.z;
      }
      if (!clearAt(world, x, z, r)) continue;
      // Villagers must be able to walk there from the town.
      if (walkCost(world, x, z) > 110) continue;
      // Face the town centre (or the water, for waterside buildings).
      const face = l.site === 'water' ? waterDirection(world, x, z) : Math.atan2(camp.x - x, camp.z - z);
      return { x, z, rot: face, hex: key };
    }
  }
  return null;
}

function waterEdge(world: World, x: number, z: number): { x: number; z: number } | null {
  const t = world.terrain;
  let best: { x: number; z: number } | null = null;
  let bestD = Infinity;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    for (let r = 1; r < 14; r += 1) {
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (t.sample(px, pz) < t.waterLevel) {
        // Step back onto dry land.
        const bx = x + Math.cos(a) * (r - 2.5);
        const bz = z + Math.sin(a) * (r - 2.5);
        if (r < bestD && t.sample(bx, bz) > t.waterLevel + 0.3) {
          bestD = r;
          best = { x: bx, z: bz };
        }
        break;
      }
    }
  }
  return best;
}

function waterDirection(world: World, x: number, z: number): number {
  let best = 0;
  let deepest = Infinity;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const h = world.terrain.sample(x + Math.sin(a) * 5, z + Math.cos(a) * 5);
    if (h < deepest) {
      deepest = h;
      best = a;
    }
  }
  return best;
}

// ------------------------------------------------------------------ planning

/** Who should own a building: the villager whose passion, then skill, fits its job best. */
function chooseOwner(world: World, l: Line): number | null {
  let best: Villager | null = null;
  let bestScore = -1;
  for (const v of world.villagers) {
    const owns = world.structures.filter((s) => s.owner === v.id && lineOf(s).kind !== 'housing').length;
    const score = (PASSION_JOBS[v.passion].includes(l.job) ? 10 : 0) + (PASSION_JOBS[v.talent].includes(l.job) ? 3 : 0) + (v.skills[l.job] ?? 0) / 50 - owns * 4;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return l.kind === 'housing' || l.kind === 'port' || l.kind === 'civic' || l.kind === 'storage' ? null : best?.id ?? null;
}

function usefulness(world: World, l: Line, needs: Record<string, number>): number {
  switch (l.kind) {
    case 'storage':
      return 0.9;
    case 'vehicles':
      return 0.8;
    case 'port':
      return (world.stockpile['dugout-canoe'] ?? 0) >= 1 || (world.stockpile['plank-boat'] ?? 0) >= 1 ? 0.5 : 0;
    case 'civic':
      return 0.3;
    case 'housing':
      return 0;
  }
  // A building is wanted when what it makes is wanted, or when someone loves that work.
  let best = 0.1;
  if (world.villagers.some((v) => PASSION_JOBS[v.passion].includes(l.job))) best = 0.6;
  for (const t of l.tiers.slice(0, 1))
    for (const f of t.facilities) for (const id of facilityOutputs(f)) best = Math.max(best, (needs[id] ?? 0) + 0.3);
  return best;
}

/** What each facility can produce. */
const OUTPUTS = new Map<string, string[]>();
for (const m of ACQUISITION) if (m.facility) OUTPUTS.set(m.facility, [...(OUTPUTS.get(m.facility) ?? []), ...Object.keys(m.yields)]);
for (const r of RECIPES) OUTPUTS.set(r.facility, [...(OUTPUTS.get(r.facility) ?? []), ...Object.keys(r.outputs)]);
function facilityOutputs(f: string): string[] {
  return OUTPUTS.get(f) ?? [];
}

/** Decide what to build next. Called every few seconds of game time. */
export function planTown(world: World, needs: Record<string, number>, dt: number): void {
  world.planTimer -= dt;
  if (world.planTimer > 0) return;
  world.planTimer = PLAN_EVERY;
  const sites = world.structures.filter(underConstruction).length;
  if (sites >= maxSites(world)) return;

  // 1. Homes when the band is crowded.
  const housing = LINE_BY_ID.get('housing')!;
  const homeTier = bestTier(world, housing);
  // Build ahead of need so newcomers have somewhere to sleep.
  const homesGoingUp = world.structures.filter((s) => s.line === 'housing' && underConstruction(s) && s.tier < 0).length;
  if (homeTier >= 0 && canSupply(world, housing.tiers[homeTier]) && world.villagers.length >= housingCapacity(world) - 2 && homesGoingUp < 1 + Math.floor(world.villagers.length / 15)) {
    if (place(world, housing, homeTier)) return;
  }

  // 2. Upgrades in place when a better tier is known: homes first (they drive happiness).
  const order = [...world.structures].sort((a, b) => (a.line === 'housing' ? 0 : 1) - (b.line === 'housing' ? 0 : 1) || a.tier - b.tier);
  for (const s of order) {
    if (underConstruction(s)) continue;
    const best = bestTier(world, lineOf(s));
    if (best > s.tier && canSupply(world, lineOf(s).tiers[s.tier + 1])) {
      s.target = s.tier + 1;
      s.progress = 0;
      s.supplied = false;
      s.plannedAt = world.clock.totalSeconds;
      world.structuresVersion++;
      return;
    }
  }

  // 3. New buildings: the most useful line the town has none of yet, or another of a
  //    busy one when more people want that work than it has places for.
  let pick: Line | null = null;
  let pickScore = 0;
  for (const l of LINES) {
    if (l.kind === 'housing') continue;
    if (bestTier(world, l) < 0 || !canSupply(world, l.tiers[0])) continue;
    const have = world.structures.filter((s) => s.line === l.id);
    let u: number;
    if (!have.length) u = usefulness(world, l, needs);
    else {
      if (l.kind !== 'acquisition' && l.kind !== 'processing') continue;
      if (have.some(underConstruction) || have.length >= 1 + Math.floor(world.villagers.length / 10)) continue;
      const places = have.reduce((n, s) => n + (tierOf(s)?.workers ?? 0), 0);
      const keen = world.villagers.filter((v) => PASSION_JOBS[v.passion].includes(l.job) || v.job === l.job).length;
      const wanted = l.tiers[0].facilities.some((f) => facilityOutputs(f).some((id) => (needs[id] ?? 0) > 0.6));
      if (keen + (wanted ? 2 : 0) <= places) continue;
      u = 0.45 + Math.min(0.3, (keen - places) * 0.1);
    }
    if (u > pickScore) {
      pickScore = u;
      pick = l;
    }
  }
  if (pick) {
    // A second building of a line starts at the best tier the town knows.
    const tier = world.structures.some((s) => s.line === pick!.id) ? Math.max(0, bestTier(world, pick)) : 0;
    place(world, pick, tier);
  }
}

function place(world: World, l: Line, tier: number): boolean {
  const model = l.tiers[tier].model;
  const site = findSite(world, l, model);
  if (!site) return false;
  // A new building goes up at the first tier, then upgrades.
  const s: Structure = {
    id: world.nextStructureId++, line: l.id, tier: -1, target: tier, progress: 0, supplied: false,
    x: site.x, z: site.z, rot: site.rot, hex: site.hex, variant: Math.floor(world.rng.next() * 4), owner: chooseOwner(world, l), animals: 0,
    plannedAt: world.clock.totalSeconds,
  };
  world.structures.push(s);
  world.structuresVersion++;
  return true;
}

// ------------------------------------------------------------------ building

/** Bring materials to sites that are waiting, when the store has them. Sites stalled for days are given up. */
export function supplySites(world: World): void {
  for (const s of [...world.structures]) {
    if (!underConstruction(s) || s.supplied) continue;
    if (world.clock.totalSeconds - s.plannedAt > 3 * 1200) {
      const name = lineOf(s).tiers[s.target].name.toLowerCase();
      if (s.tier < 0) world.structures.splice(world.structures.indexOf(s), 1);
      else s.target = s.tier;
      world.structuresVersion++;
      logEvent(world, `Plans for the ${name} were set aside for lack of materials.`);
      continue;
    }
    const t = lineOf(s).tiers[s.target];
    if (!Object.entries(t.build).every(([id, q]) => (world.stockpile[id] ?? 0) >= q)) continue;
    for (const [id, q] of Object.entries(t.build)) world.stockpile[id] -= q;
    s.supplied = true;
    world.structuresVersion++;
    logEvent(world, `Work began on ${s.tier < 0 ? 'a' : 'upgrading to a'} ${t.name.toLowerCase()}.`);
  }
}

/** A builder's work on a site. Returns true when the tier is finished. */
export function buildWork(world: World, s: Structure, seconds: number, builder: Villager): boolean {
  const t = lineOf(s).tiers[s.target];
  s.progress += seconds;
  if (s.progress < t.seconds) return false;
  s.tier = s.target;
  s.progress = 0;
  s.supplied = true;
  world.structuresVersion++;
  if (t.storage && !world.built.includes(t.storage)) world.built.push(t.storage);
  const owner = world.villagers.find((v) => v.id === s.owner);
  logEvent(world, `${builder.name} finished the ${t.name.toLowerCase()}${owner ? `, run by ${owner.name}` : ''}.`);
  if (lineOf(s).kind === 'acquisition' && t.facilities.some((f) => ['pasture', 'pigsty', 'chicken-coop', 'cattle-pasture'].includes(f))) startHerd(world, s);
  return true;
}

/** Kept animals start from wild ones caught nearby. */
function startHerd(world: World, s: Structure): void {
  const species: Record<string, string[]> = { pasture: ['wild-goat', 'mouflon'], pigsty: ['wild-boar'], 'chicken-coop': ['junglefowl'], 'cattle-pasture': ['aurochs'] };
  const f = lineOf(s).tiers[s.tier].facilities.find((x) => species[x])!;
  const wild = world.herds.filter((h) => species[f].includes(h.species) && h.count >= 3).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
  if (!wild) {
    logEvent(world, `There are no wild animals nearby to stock the ${lineOf(s).tiers[s.tier].name.toLowerCase()}.`);
    return;
  }
  wild.count -= 2;
  s.animals = 2;
  logEvent(world, `Two ${FAUNA_BY_ID.get(wild.species)!.name.toLowerCase()} were caught to start a herd.`);
}

// ------------------------------------------------------------------ daily life

/** Once a day: kept herds grow, and newcomers join a prosperous band with room to sleep. */
export function dailyTown(world: World, food: number): void {
  const day = calendar(world.clock.totalSeconds).dayIndex;
  if (day === world.lastTownDay) return;
  world.lastTownDay = day;
  // Roads and paths change how far things are: refresh the walking map.
  world.walkField = world.nav.distanceField(world.camp.center.x, world.camp.center.z);
  for (const s of world.structures) if (s.animals > 0 && s.animals < 12) s.animals += 1;
  homeLife(world);
  const people = world.villagers.length;
  const happy = world.villagers.reduce((a, v) => a + v.fulfilment, 0) / Math.max(1, people);
  const room = housingCapacity(world) - people;
  if (day > 0 && room >= 1 && food / Math.max(1, people) > 1.5 && happy > 0.3 && people < 80) {
    const n = room >= 2 && world.rng.next() < 0.6 ? 2 : 1;
    const names: string[] = [];
    for (let k = 0; k < n; k++) names.push(addNewcomer(world).name);
    logEvent(world, `${names.join(' and ')}, wanderers drawn by the band's good fortune, joined.`);
  }
}

const syll = ['ka', 'ro', 'mi', 'ta', 'sen', 'lu', 'ar', 've', 'no', 'dra', 'il', 'ush', 'ba', 'tor', 'ye', 'ma', 'eth', 'ol', 'ri', 'van'];
export function addNewcomer(world: World, at?: { x: number; z: number }): Villager {
  const rng = world.rng;
  let name = '';
  for (let i = 0, n = rng.int(2, 3); i < n; i++) name += rng.pick(syll);
  name = name[0].toUpperCase() + name.slice(1);
  // They walk in from the edge of the valley.
  const half = world.terrain.size / 2 - 8;
  const a = rng.next() * Math.PI * 2;
  // They walk in from somewhere within reach of the town.
  let spot = at ?? null;
  for (let k = 0; !spot && k < 40; k++) {
    const r = 60 + rng.next() * 80;
    const b = a + k;
    const p = world.nav.nearestPassable(world.camp.center.x + Math.cos(b) * r, world.camp.center.z + Math.sin(b) * r);
    if (p && walkCost(world, p.x, p.z) < 100) spot = p;
  }
  spot ??= { x: world.camp.center.x, z: world.camp.center.z };
  void half;
  const id = world.villagers.reduce((m, v) => Math.max(m, v.id), -1) + 1;
  const v: Villager = {
    id, name, passion: rng.pick(PASSIONS), talent: rng.pick(PASSIONS), prodigy: rng.next() < 0.08, look: id % 6, x: spot.x, z: spot.z, heading: 0, vx: 0, vz: 0,
    activity: 'resting', hunger: 0.3, skills: {}, job: null, task: null, priorities: [], carrying: {}, path: [], timer: 2, tent: id,
    fulfilment: 0.5, insight: {}, discoveries: [], inspiredUntil: 0,
  };
  world.villagers.push(v);
  world.rosterVersion++;
  return v;
}

/** Homes, best first: the best homes fill first, so tents empty out as roundhouses go up. */
function homes(world: World): Structure[] {
  return world.structures.filter((s) => s.line === 'housing' && s.tier >= 0).sort((a, b) => b.tier - a.tier || a.id - b.id);
}

/** The home a villager sleeps in (null = no bed: sleeps by the fire). */
export function homeOf(world: World, v: Villager): Structure | null {
  let slot = world.villagers.indexOf(v);
  for (const h of homes(world)) {
    const cap = tierOf(h)!.housing ?? 0;
    if (slot < cap) return h;
    slot -= cap;
  }
  return null;
}

/** Where a villager sleeps: just inside their home's door, or by the fire. */
export function bedFor(world: World, v: Villager): { x: number; z: number } {
  const h = homeOf(world, v);
  if (!h) return { x: world.camp.fire.x + 2, z: world.camp.fire.z + 2 };
  return { x: h.x + Math.sin(h.rot) * 1.2, z: h.z + Math.cos(h.rot) * 1.2 };
}

/** How content a home makes people (by tier: tent, roundhouse, longhouse, …). */
const HOME_COMFORT = [0.35, 0.6, 0.68, 0.74, 0.8, 0.82, 0.86, 0.95];

/**
 * Daily: a better home makes people happier and having no bed makes them miserable.
 * Spare homes, worst first, are taken down; a band that stays miserable loses people.
 */
function homeLife(world: World): void {
  for (const v of world.villagers) {
    const h = homeOf(world, v);
    const comfort = h ? HOME_COMFORT[h.tier] : 0.1;
    v.fulfilment = Math.max(0, Math.min(1, v.fulfilment + (comfort - 0.5) * 0.12));
  }
  const people = world.villagers.length;
  const spare = housingCapacity(world) - people;
  // Only outdated homes (below the best the town can build) are taken down, and only when
  // nobody needs the beds.
  const hs = homes(world).filter((s) => !underConstruction(s));
  const worst = hs[hs.length - 1];
  const best = bestTier(world, LINE_BY_ID.get('housing')!);
  if (worst && hs.length > 1 && worst.tier < best && spare >= (tierOf(worst)!.housing ?? 0) + 2) {
    world.structures.splice(world.structures.indexOf(worst), 1);
    world.structuresVersion++;
    logEvent(world, `With room to spare, an old ${tierOf(worst)!.name.toLowerCase()} was taken down.`);
  }
  const happy = world.villagers.reduce((a, v) => a + v.fulfilment, 0) / Math.max(1, people);
  if (happy < 0.22 && people > 5) {
    const v = [...world.villagers].sort((a, b) => a.fulfilment - b.fulfilment)[0];
    world.villagers.splice(world.villagers.indexOf(v), 1);
    world.rosterVersion++;
    logEvent(world, `${v.name}, unhappy here, left the band to seek a better life.`);
  }
}

/** The camp's tents become the town's first homes. */
export function foundTown(world: World): void {
  for (const t of world.camp.tents) {
    world.structures.push({
      id: world.nextStructureId++, line: 'housing', tier: 0, target: 0, progress: 0, supplied: true,
      x: t.x, z: t.z, rot: t.rot, hex: hexKey(worldToHexLocal(t.x, t.z)), variant: world.structures.length % 4, owner: null, animals: 0, plannedAt: 0,
    });
  }
}

// ------------------------------------------------------------------ roads

/** Busy footpaths are built up into the best road surface the town knows. */
export function growRoads(world: World): void {
  let tier = 0;
  ROAD_TIERS.forEach((r, i) => {
    if (r.requires && knows(world, r.requires)) tier = i;
  });
  if (tier === 0) return;
  const nav = world.nav;
  let changed = 0;
  for (let k = 0; k < nav.wear.length && changed < 40; k++) {
    if (nav.road[k] < tier && nav.wear[k] > 0.95 && Number.isFinite(nav.cost[k])) {
      nav.road[k] = tier;
      changed++;
    }
  }
  if (changed) world.roadsVersion++;
}

export function roadName(world: World): string {
  let name = ROAD_TIERS[0].name;
  for (const r of ROAD_TIERS) if (r.requires && knows(world, r.requires)) name = r.name;
  return name;
}

