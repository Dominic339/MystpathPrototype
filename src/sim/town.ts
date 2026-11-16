// The town: everything villagers build. A planner decides what the town needs next (homes
// when crowded, a building for each new skill, upgrades when a better tier is known) and
// where it should go (a quarry on rocky ground, a fishing hut at the water, fields in the
// meadow). Builders gather the materials and put it up; workers then run its facilities.
// Buildings belong to the villager whose passion fits them best.
//
// Newcomers join a prosperous band with room to sleep, and roads grow out of busy footpaths.

import { ACQUISITION } from './data/acquisition';
import { BASIC_NEEDS, EXPECTED_QUALITY, GOOD_CATEGORIES, GOODS, type GoodCategory } from './data/goods';
import { eraIndex } from './data/eras';
import { FAUNA_BY_ID } from './data/fauna';
import { PASSION_JOBS, PASSIONS } from './data/jobs';
import { MATERIAL_BY_ID } from './data/materials';
import { RECIPES } from './data/processing';
import { LINE_BY_ID, LINES, ROAD_TIERS, facilitiesAt, type Line, type Site, type Tier } from './data/structures';
import { currentEra, knows, logEvent, workable } from './discovery';
import { FARMSTEAD_R, FIELD_LINES, fieldArea, inAnyField, layoutField, resizeFields, stampField, wantedArea, type Field } from './fields';
import { homeOf, lineNoise, settleHomes } from './living';
import { bestRoadTier, connectLane, distToStreets, extendStreets, findLot, foundPlan, improveStreets, type Zone } from './roads';
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

export function canSupply(world: World, t: Tier): boolean {
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
  /** What a mine, quarry or pit was sunk for (it yields mostly this, and a little of what lies with it). */
  deposit?: string;
  /** How much has been dug out of it (its spoil heaps grow). */
  worked?: number;
  /** The fenced field of a farm, orchard or pasture. */
  field?: Field;
}

/** Building sites at once: more hands, more sites. */
const maxSites = (world: World) => 2 + Math.floor(world.villagers.length / 8);
const PLAN_EVERY = 20;

export function lineOf(s: Structure): Line {
  return LINE_BY_ID.get(s.line)!;
}

/** How many can work at a building at once: a field takes more hands the bigger it is. */
export function places(s: Structure): number {
  if (s.field) return Math.max(1, Math.min(14, Math.round(fieldArea(s.field) / 45)));
  return Math.max(1, tierOf(s)?.workers ?? 1);
}

/** The ground a structure's building stands on (a farm's field is apart from this). */
export function radiusOf(s: Structure): number {
  return s.field ? FARMSTEAD_R : footprint(lineOf(s).tiers[Math.max(0, s.target)].model);
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
    // A field yields nothing until it is cleared and planted.
    if (s.field && !s.field.planted) continue;
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
  // Later ages: fields, yards, docks and factories are bigger than a house.
  longhouse: 4.6, ropewalk: 5.5, 'timber-bridge': 5, 'stone-bridge': 5.5, 'iron-bridge': 6, 'ploughed-fields': 7, 'open-fields': 8, orchard: 6, 'spice-plantation': 6,
  'cattle-pasture': 7, 'quarry-crane': 5.5, shipyard: 6, harbour: 5, terrace: 5, apartments: 4.8, plantation: 6.5, 'quarry-blast': 6, 'mech-farm': 7.5, 'dairy-farm': 7,
  'coke-ovens': 5.5, foundry: 5.5, 'textile-mill': 5.5, manufactory: 5.5, refinery: 5.5, 'steel-shipyard': 6.5, 'airship-yard': 5.5, 'airship-works': 6, docks: 6,
  'rail-station': 6.5, 'open-pit': 6, 'agri-complex': 6, 'assembly-plant': 6, 'container-port': 6.5, 'electric-station': 6.5, 'sky-dock': 5, 'sky-harbour': 6, maglev: 6.5,
};
export function footprint(model: string): number {
  return FOOTPRINT[model] ?? 4.2;
}

/** Lines sunk into a deposit: what each can dig, from its first tier's methods. */
const DEPOSIT_LINES = new Set(['mine', 'quarry', 'sand-pit', 'sulfur', 'diggings', 'clay-pit', 'oil', 'gas']);
function digs(l: Line): string[] {
  return [...new Set(ACQUISITION.filter((m) => m.facility && l.tiers.some((t) => t.facilities.includes(m.facility!))).flatMap((m) => Object.keys(m.yields)))];
}

/** What is worth digging for in a hex, for a line: the best deposit and how good the hex is. */
export function depositAt(world: World, l: Line, hexIndex: number, needs: Record<string, number>, only?: string): { score: number; deposit: string | null } {
  const h = world.hexes[hexIndex];
  let total = 0;
  let best: string | null = null;
  let bestV = 0;
  for (const id of digs(l)) {
    if (only && id !== only) continue;
    const q = (h.below[id] ?? 0) + (h.ground[id] ?? 0);
    if (q < 5 || !workable(world, id)) continue;
    total += q;
    const v = q * (0.15 + (needs[id] ?? 0));
    if (v > bestV) {
      bestV = v;
      best = id;
    }
  }
  return { score: best ? Math.min(1, 0.3 + total / 300) : 0, deposit: best };
}

/** The name people give a working: an iron mine, a marble quarry, a salt diggings. */
export function structureName(s: Structure): string {
  const t = lineOf(s).tiers[Math.max(0, s.tier >= 0 ? s.tier : s.target)];
  if (!s.deposit) return t.name;
  const what = (MATERIAL_BY_ID.get(s.deposit)?.name ?? s.deposit).replace(/ ore$/i, '').replace(/ \(.*\)$/, '');
  const kind = s.line === 'mine' ? 'mine' : s.line === 'quarry' ? 'quarry' : s.line === 'oil' || s.line === 'gas' ? 'field' : s.line === 'sulfur' ? 'works' : s.line === 'diggings' ? 'diggings' : 'pit';
  if (kind === 'pit' || kind === 'field' || s.line === 'sulfur') return t.name;
  return `${what} ${t.name.toLowerCase().replace(/^(stone|mineral) /, '')}`;
}

function siteScore(world: World, site: Site, hexIndex: number, l?: Line, needs: Record<string, number> = {}, only?: string): number {
  const h = world.hexes[hexIndex];
  const env = h.env;
  if (env === 'river' || env === 'lake' || env === 'sea') return 0;
  if (l && DEPOSIT_LINES.has(l.id)) return depositAt(world, l, hexIndex, needs, only).score;
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
    case 'sulfur':
    case 'salts':
      return 0;
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

/** How much the ground rises across a site. */
export function relief(world: World, x: number, z: number, r: number): number {
  const t = world.terrain;
  let lo = t.sample(x, z);
  let hi = lo;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const h = t.sample(x + Math.cos(a) * r * 0.75, z + Math.sin(a) * r * 0.75);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return hi - lo;
}

const blockerCache = new WeakMap<World, World['props']>();
/** The things no builder will move: great boulders, spirit trees, wild hives. */
function blockers(world: World): World['props'] {
  let b = blockerCache.get(world);
  if (!b) blockerCache.set(world, (b = world.props.filter((p) => BLOCKING.has(p.kind))));
  return b;
}

function clearAt(world: World, x: number, z: number, r: number, ignore?: Structure, near: World['props'] = blockers(world)): boolean {
  const t = world.terrain;
  if (t.sample(x, z) < t.waterLevel + 0.3) return false;
  // Buildings stand on footings on a slope, but only so steep a one: the rise across the
  // site must stay within what a footing (or a little digging in) can take up.
  if (relief(world, x, z, r) > 0.35 * r + 0.7) return false;
  for (const s of world.structures) {
    if (s === ignore) continue;
    if (Math.hypot(s.x - x, s.z - z) < r + radiusOf(s) + 1.5) return false;
  }
  if (inAnyField(world, x, z, r + 1, ignore)) return false;
  if (world.streets.length && distToStreets(world, x, z) < r + 0.6) return false;
  const c = world.camp;
  if (Math.hypot(c.fire.x - x, c.fire.z - z) < 8 + r) return false;
  // Brush and trees can be cleared; boulders, spirit trees and hives cannot. Clearing
  // costs a little, so cleaner ground is preferred.
  for (const p of near) {
    if (!BLOCKING.has(p.kind)) continue;
    if (Math.hypot(p.x - x, p.z - z) < r + (p.kind === 'boulder' ? 2.2 : 1.8)) return false;
  }
  return true;
}

const BLOCKING = new Set(['boulder', 'spirit', 'beehive']);
const KEEP = new Set(['flowers', 'grain', 'tubers', 'flax', 'mushrooms', 'nest', 'reeds', 'seaweed', 'shellfish']);
const TIMBER: Partial<Record<string, [string, number]>> = { oak: ['hardwood', 6], apple: ['hardwood', 3], birch: ['hardwood', 4], tropical: ['hardwood', 5], pine: ['softwood', 6], bamboo: ['softwood', 2], hazel: ['softwood', 1] };

/** Clear brush and fell trees where a building will stand; the timber goes to the stockpile. */
function clearSite(world: World, x: number, z: number, r: number): void {
  const nodeOf = new Map(world.nodes.map((n) => [n.prop, n]));
  world.props.forEach((p, i) => {
    if (KEEP.has(p.kind) || BLOCKING.has(p.kind) || world.cleared.includes(i)) return;
    if (Math.abs(p.x - x) > r + 2 || Math.abs(p.z - z) > r + 2 || Math.hypot(p.x - x, p.z - z) > r + 1.8) return;
    world.cleared.push(i);
    const wood = TIMBER[p.kind];
    if (wood) world.stockpile[wood[0]] = (world.stockpile[wood[0]] ?? 0) + wood[1];
    const n = nodeOf.get(i);
    if (n) {
      n.stock = {};
      n.max = {};
    }
  });
}

/** Find a spot for a building of this line: the best-suited hex nearest the town centre. */
export function findSite(world: World, l: Line, model: string, needs: Record<string, number> = {}, only?: string): { x: number; z: number; rot: number; hex: string; deposit?: string } | null {
  // A planned town builds along its streets: homes on the quiet side, noisy work on the
  // other, stores and kitchens in the middle. A new street is laid when the lots run out.
  if (world.plan && l.site === 'camp') {
    const rr = FIELD_LINES[l.id] ? FARMSTEAD_R : footprint(model);
    const zone: Zone = l.kind === 'housing' ? 'res' : lineNoise(l) >= 0.4 ? 'work' : 'centre';
    const ok = (x: number, z: number) => clearAt(world, x, z, rr) && walkCost(world, x, z) < 150;
    let lot = findLot(world, zone, rr, ok);
    if (!lot && extendStreets(world, zone)) lot = findLot(world, zone, rr, ok);
    if (lot) return { x: lot.x, z: lot.z, rot: lot.rot, hex: hexKey(worldToHexLocal(lot.x, lot.z)) };
  }
  const camp = world.camp.center;
  const r = (FIELD_LINES[l.id] ? FARMSTEAD_R : footprint(model));
  const ranked: { i: number; score: number }[] = [];
  for (let i = 0; i < world.hexes.length; i++) {
    const s = siteScore(world, l.site, i, l, needs, only);
    if (s <= 0) continue;
    const c = hexToWorld(world.hexes[i]);
    const d = Math.hypot(c.x - camp.x, c.z - camp.z);
    // The town spreads outward as it grows.
    // Workings go where the deposit is, even a long walk out.
    const maxD = l.site === 'camp' ? 50 + world.villagers.length * 1.5 : DEPOSIT_LINES.has(l.id) ? 170 + world.villagers.length * 1.5 : 125 + world.villagers.length;
    if (d > maxD) continue;
    // Farms belong on the edge of town with open land round them: not in among the
    // houses, and not crowding one another.
    if (FIELD_LINES[l.id]) {
      const edge = 45 + world.villagers.length * 0.6;
      let crowd = 0;
      for (const o of world.structures) {
        const od = Math.hypot(o.x - c.x, o.z - c.z);
        if (od < 30) crowd += o.field ? 1.5 : 0.5;
      }
      ranked.push({ i, score: s / (1 + Math.abs(d - edge) / 30) / (1 + crowd) });
      continue;
    }
    ranked.push({ i, score: s / (1 + d / (l.site === 'camp' ? 15 : 40)) });
  }
  ranked.sort((a, b) => b.score - a.score);
  let tried = 0;
  for (const { i } of ranked) {
    const c = hexToWorld(world.hexes[i]);
    const key = hexKey(world.hexes[i]);
    // One large building per hex; homes can cluster three to a hex.
    const here = world.structures.filter((s) => s.hex === key);
    if (l.kind === 'housing' ? here.some((s) => lineOf(s).kind !== 'housing') || here.length >= 3 : here.length > 0) continue;
    if (++tried > 40) break;
    // Only the plants and rocks around this hex can be in the way.
    const reach = HEX_SIZE * 1.4 + r + 16;
    const near = world.props.filter((p) => Math.abs(p.x - c.x) < reach && Math.abs(p.z - c.z) < reach);
    for (let k = 0; k < 14; k++) {
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
      if (!clearAt(world, x, z, r, undefined, near)) continue;
      // Villagers must be able to walk there from the town.
      if (walkCost(world, x, z) > (DEPOSIT_LINES.has(l.id) ? 230 : 150)) continue;
      // Face the town centre (or the water, for waterside buildings).
      const face = l.site === 'water' ? waterDirection(world, x, z) : Math.atan2(camp.x - x, camp.z - z);
      return { x, z, rot: face, hex: key, deposit: DEPOSIT_LINES.has(l.id) ? depositAt(world, l, i, needs, only).deposit ?? undefined : undefined };
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
  // A band that has grown into a village starts to plan its streets.
  if (!world.plan && world.villagers.length >= 16 && bestRoadTier(world) >= 1) {
    foundPlan(world);
    if (world.plan) logEvent(world, 'The village laid out its first street, with lanes to its workings: homes to one side, workshops to the other.');
  }
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
  const picks: { l: Line; u: number; only?: string }[] = [];
  for (const l of LINES) {
    if (l.kind === 'housing') continue;
    if (bestTier(world, l) < 0 || !canSupply(world, l.tiers[0])) continue;
    const have = world.structures.filter((s) => s.line === l.id);
    let u: number;
    let only: string | undefined;
    if (!have.length) u = usefulness(world, l, needs);
    else if (DEPOSIT_LINES.has(l.id) && !have.some(underConstruction) && have.every((s) => (s.worked ?? 0) > 20) && (only = missingDeposit(world, l, have, needs))) u = 0.7;
    else if (DEPOSIT_LINES.has(l.id)) continue;
    // A farm grows its field before the town starts another.
    else if (FIELD_LINES[l.id] && have.some((s) => !s.field?.full && fieldArea(s.field!) < FIELD_LINES[l.id].max * 0.8)) continue;
    else {
      if (l.kind !== 'acquisition' && l.kind !== 'processing') continue;
      if (have.some(underConstruction) || have.length >= 1 + Math.floor(world.villagers.length / 10)) continue;
      const room = have.reduce((n, s) => n + (s.tier >= 0 ? places(s) : 0), 0);
      const keen = world.villagers.filter((v) => PASSION_JOBS[v.passion].includes(l.job) || v.job === l.job).length;
      const wanted = l.tiers[0].facilities.some((f) => facilityOutputs(f).some((id) => (needs[id] ?? 0) > 0.6));
      if (keen + (wanted ? 2 : 0) <= room) continue;
      u = 0.45 + Math.min(0.3, (keen - room) * 0.1);
    }
    if (u > 0) picks.push({ l, u, only });
  }
  // The most useful first; if there is nowhere to put it, the next.
  picks.sort((a, b) => b.u - a.u);
  for (const { l, only } of picks.slice(0, 4)) {
    // A second building of a line starts at the best tier the town knows.
    const tier = world.structures.some((s) => s.line === l.id) ? Math.max(0, bestTier(world, l)) : 0;
    if (place(world, l, tier, needs, only)) break;
  }
}

/** Something the town badly wants that none of a line's workings sits on, but that lies within reach. */
function missingDeposit(world: World, l: Line, have: Structure[], needs: Record<string, number>): string | undefined {
  for (const id of digs(l).sort((a, b) => (needs[b] ?? 0) - (needs[a] ?? 0))) {
    if ((needs[id] ?? 0) < 0.5 || !workable(world, id)) continue;
    if (have.some((s) => s.deposit === id)) continue;
    if (world.hexes.some((h, i) => (h.below[id] ?? 0) + (h.ground[id] ?? 0) >= 5 && Math.hypot(hexToWorld(h).x - world.camp.center.x, hexToWorld(h).z - world.camp.center.z) < 170 + world.villagers.length * 1.5 && i >= 0)) return id;
  }
  return undefined;
}

function place(world: World, l: Line, tier: number, needs: Record<string, number> = {}, only?: string): boolean {
  const model = l.tiers[tier].model;
  const spec = FIELD_LINES[l.id];
  let site = findSite(world, l, model, needs, only);
  let field: Field | null = null;
  if (spec) {
    // A farm needs room for its field beside the farmhouse: try a few spots.
    for (let k = 0; k < 4 && site && !field; k++) {
      // Only where there is room to grow: twice the first field must fit.
      const first = wantedArea(world, l.id, needs);
      if (layoutField(world, site, spec.kind, first * 2.2, first * 2, onStreet(world))) field = layoutField(world, site, spec.kind, first, spec.min, onStreet(world));
      if (!field) site = findSite(world, l, model, needs, only);
    }
    if (!field) return false;
  }
  if (!site) return false;
  // A new building goes up at the first tier, then upgrades.
  clearSite(world, site.x, site.z, spec ? FARMSTEAD_R : footprint(model));
  const s: Structure = {
    id: world.nextStructureId++, line: l.id, tier: -1, target: tier, progress: 0, supplied: false,
    x: site.x, z: site.z, rot: site.rot, hex: site.hex, variant: Math.floor(world.rng.next() * 4), owner: chooseOwner(world, l), animals: 0,
    plannedAt: world.clock.totalSeconds, deposit: site.deposit, worked: 0, field: field ?? undefined,
  };
  world.structures.push(s);
  world.structuresVersion++;
  connectLane(world, s);
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
  if (s.field && !s.field.planted) {
    if (s.field.clear.length) logEvent(world, `The ${t.name.toLowerCase()} is fenced: ${s.field.clear.length} trees, bushes and rocks must be cleared before planting.`);
    else plantField(world, s);
  }
  if (lineOf(s).kind === 'acquisition' && t.facilities.some((f) => ['pasture', 'pigsty', 'chicken-coop', 'cattle-pasture'].includes(f))) startHerd(world, s);
  return true;
}

/** A cleared field is planted (or stocked) and starts to yield. */
export function plantField(world: World, s: Structure): void {
  if (!s.field || s.field.planted) return;
  s.field.planted = true;
  world.structuresVersion++;
  const what = s.field.kind === 'pasture' ? 'turned out to graze' : s.field.kind === 'orchard' ? 'planted with young trees' : 'ploughed and sown';
  logEvent(world, `The field at the ${lineOf(s).tiers[Math.max(0, s.tier)].name.toLowerCase()} is cleared and ${what}.`);
}

/** Streets are kept clear of fields. */
export function onStreet(world: World): (x: number, z: number) => boolean {
  return (x, z) => world.nav.roadAt(x, z) > 0;
}

/** Buildings and planted fields as the walking map sees them: gone round, not through. */
export function rebuildObstacles(world: World): void {
  world.nav.obstacle.fill(1);
  for (const s of world.structures) {
    const l = lineOf(s);
    if (l.kind !== 'port' && !l.id.includes('bridge')) world.nav.setBuilding(s.x, s.z, radiusOf(s) * 0.62);
    if (s.field) stampField(world, s.field);
  }
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
export function dailyTown(world: World, food: number, needs: Record<string, number> = {}): void {
  const day = calendar(world.clock.totalSeconds).dayIndex;
  if (day === world.lastTownDay) return;
  world.lastTownDay = day;
  // Roads and paths change how far things are: refresh the walking map.
  world.walkField = world.nav.distanceField(world.camp.center.x, world.camp.center.z);
  for (const s of world.structures) if (s.animals > 0 && s.animals < 12) s.animals += 1;
  // A working whose deposit is dug out is abandoned (the town may sink another elsewhere).
  for (const s of [...world.structures]) {
    if (!s.deposit || s.tier < 0 || underConstruction(s) || (s.worked ?? 0) < 50) continue;
    let left = 0;
    for (const h of world.hexes) {
      const c = hexToWorld(h);
      if (Math.hypot(c.x - s.x, c.z - s.z) < 20) left += (h.below[s.deposit] ?? 0) + (h.ground[s.deposit] ?? 0);
    }
    if (left >= 5) continue;
    logEvent(world, `The ${structureName(s).toLowerCase()} is worked out and was abandoned.`);
    world.structures.splice(world.structures.indexOf(s), 1);
    world.structuresVersion++;
  }
  improveStreets(world);
  resizeFields(world, needs, onStreet(world), (text) => logEvent(world, text));
  homeLife(world);
  goodsLife(world);
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
    activity: 'resting', hunger: 0.3, skills: {}, job: null, task: null, priorities: [], carrying: {}, path: [], timer: 2, tent: id, home: null, work: null, rest: 1,
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

/** Where a villager sleeps: just inside their home's door, or by the fire. */
export function bedFor(world: World, v: Villager): { x: number; z: number } {
  const h = homeOf(world, v);
  if (!h) return { x: world.camp.fire.x + 2, z: world.camp.fire.z + 2 };
  const out = radiusOf(h) * 0.62 + 1;
  return { x: h.x + Math.sin(h.rot) * out, z: h.z + Math.cos(h.rot) * out };
}

/**
 * Daily: a better home makes people happier and having no bed makes them miserable.
 * Spare homes, worst first, are taken down; a band that stays miserable loses people.
 */
function homeLife(world: World): void {
  settleHomes(world, (text) => logEvent(world, text));
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

/** The best good of each category the town has (and how well it covers everyone). */
export function bestGoods(world: World): Record<GoodCategory, { id: string | null; quality: number; coverage: number }> {
  const out = {} as Record<GoodCategory, { id: string | null; quality: number; coverage: number }>;
  for (const c of GOOD_CATEGORIES) out[c] = { id: null, quality: 0, coverage: 0 };
  for (const g of GOODS) {
    if ((world.stockpile[g.id] ?? 0) < 1) continue;
    if (g.quality > out[g.category].quality) out[g.category] = { id: g.id, quality: g.quality, coverage: world.living[g.category]?.coverage ?? 1 };
  }
  return out;
}

/**
 * Daily: everyone uses the best goods the town has, which slowly wear out and are used
 * up. Goods better than the age expects make people glad; missing basics (clothing, tools,
 * household wares, medicine) make them grumble once the band has left the wild behind.
 */
function goodsLife(world: World): void {
  const people = world.villagers.length;
  const era = currentEra(world);
  const expected = EXPECTED_QUALITY[era];
  let mood = 0;
  for (const c of GOOD_CATEGORIES) {
    const options = GOODS.filter((g) => g.category === c && (world.stockpile[g.id] ?? 0) > 0).sort((a, b) => b.quality - a.quality);
    let wanted = people;
    let quality = 0;
    let covered = 0;
    // Use the best first; if it runs short, the next best fills in.
    for (const g of options) {
      if (wanted <= 0) break;
      const perPerson = 1 / g.lifetimeDays;
      const have = world.stockpile[g.id];
      const users = Math.min(wanted, have / perPerson);
      world.stockpile[g.id] = Math.max(0, have - users * perPerson);
      quality += g.quality * users;
      covered += users;
      wanted -= users;
    }
    const coverage = people ? covered / people : 0;
    const avgQuality = covered ? quality / covered : 0;
    world.living[c] = { coverage, quality: avgQuality };
    if (covered) mood += (avgQuality - expected) * 0.06 * coverage;
    if (BASIC_NEEDS.includes(c) && era !== 'hunter-gatherer') mood -= 0.03 * (1 - coverage);
  }
  for (const v of world.villagers) v.fulfilment = Math.max(0, Math.min(1, v.fulfilment + mood));
}

/** How much faster good tools make work, how much better weapons make hunting, how much more carts carry. */
export function toolBonus(world: World): { work: number; hunt: number; carry: number } {
  const best = bestGoods(world);
  return { work: 1 + best.tools.quality * 0.3, hunt: 1 + best.weapons.quality * 0.5, carry: Math.round(best.transport.quality * 6) };
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
  // Roads are planned now (roads.ts); feet only wear footpaths.
  if (world.streets) return;
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

