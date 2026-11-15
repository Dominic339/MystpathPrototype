// World state and the simulation tick. Plain data only — no rendering code here,
// so the same simulation can later run on a server.

import { PASSIONS, type Passion } from './data/jobs';
import { stepHerds, type Herd } from './animals';
import { DISCOVERIES } from './data/discoveries';
import { dailyTown, foundTown, growRoads, planTown, supplySites, type Structure } from './town';
import { stepVoyages, type Voyage } from './vehicles';
import { foodTotal, spoilFood } from './food';
import { NavGrid } from './pathfinding';
import { buildHexResources, buildNodes, regrowResources, type HexResources, type ResourceNode } from './resources';
import { Rng, subSeed } from './rng';
import { Heightfield } from './terrain';
import { buildWorld, type FlowField } from './worldgen';
import { calendar, GameClock, SEASONS } from './time';
import { materialNeeds, stepVillager, type Villager } from './villagerAI';

export type PropKind =
  | 'oak' | 'pine' | 'birch' | 'apple' | 'hazel' | 'bush' | 'berrybush' | 'rock' | 'boulder' | 'reeds' | 'flowers'
  | 'grain' | 'tubers' | 'mushrooms' | 'flax' | 'beehive' | 'nest' | 'shellfish'
  | 'tropical' | 'spirit' | 'bamboo' | 'cotton' | 'seaweed' | 'cactus' | 'scrub';

export interface PropInstance {
  kind: PropKind;
  x: number;
  z: number;
  scale: number;
  rot: number;
  /** The plant or animal species this prop is (when the model is shared by several). */
  species?: string;
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

export interface World {
  seed: number;
  clock: GameClock;
  terrain: Heightfield;
  props: PropInstance[];
  camp: CampLayout;
  flow: FlowField;
  /** The river's course and the lake (for boats and the renderer). */
  river: [number, number][];
  lake: { x: number; z: number; r: number };
  /** Environment map (see worldgen.ts). */
  biome: Uint8Array;
  hexes: HexResources[];
  nodes: ResourceNode[];
  stockpile: Record<string, number>;
  /** Wild herds, flocks and fish shoals. */
  herds: Herd[];
  /** Discoveries this civilization has made. */
  discoveries: string[];
  discoveryLog: { day: number; id: string; by: string | null }[];
  /** Materials and animal species the band has come across (some discoveries need them). */
  seen: string[];
  /** Food storage the band has built (preservation.ts ids). */
  built: string[];
  /** Food value lost to spoiling, today and yesterday. */
  spoilage: { day: number; today: number; yesterday: number };
  /** Everything the town has built or is building. */
  structures: Structure[];
  nextStructureId: number;
  planTimer: number;
  lastTownDay: number;
  /** Bumped when structures, the roster or the roads change, so the renderer knows to refresh. */
  structuresVersion: number;
  rosterVersion: number;
  roadsVersion: number;
  roadTimer: number;
  slowTimer: number;
  /** The chronicle: notable things that happened. */
  events: { t: number; text: string }[];
  nav: NavGrid;
  /** Open water, for boats. */
  waterNav: NavGrid;
  /** Walking cost from the town centre to every cell, refreshed daily. */
  walkField: Float32Array;
  /** Airships and ships on their voyages. */
  voyages: Voyage[];
  villagers: Villager[];
  rng: Rng;
}

export type { Villager };

const SYLLABLES = ['ka', 'ro', 'mi', 'ta', 'sen', 'lu', 'ar', 've', 'no', 'dra', 'il', 'ush', 'ba', 'tor', 'ye', 'ma'];
const START_PASSIONS: Passion[] = ['woodwork', 'hunting', 'fishing', 'stonework', 'cooking', 'herbalism', 'weaving'];

export function createWorld(seed: number): World {
  const scene = buildWorld(seed);
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
      // A mix of interests across the band; the last one is random.
      passion: id < START_PASSIONS.length - 1 ? START_PASSIONS[id] : rng.pick(PASSIONS),
      // Talent (what they are naturally good at) is independent of passion (what they love).
      talent: rng.pick(PASSIONS),
      prodigy: rng.next() < 0.12,
      insight: {},
      discoveries: [],
      inspiredUntil: 0,
      look: id % 6,
      x,
      z,
      heading: a + Math.PI,
      vx: 0,
      vz: 0,
      activity: 'resting',
      hunger: 0.2 + rng.next() * 0.3,
      skills: {},
      job: null,
      task: null,
      priorities: [],
      carrying: {},
      path: [],
      timer: rng.range(1, 6),
      tent: id,
      fulfilment: 0.5,
    });
  }
  const world: World = {
    seed,
    clock: new GameClock(),
    terrain: scene.terrain,
    props: scene.props,
    camp: scene.camp,
    flow: scene.flow,
    river: scene.river,
    lake: scene.lake,
    biome: scene.biome,
    hexes: buildHexResources(seed, scene.terrain, scene.biome),
    nodes: buildNodes(seed, scene.props),
    // What is left of the winter store: spring is lean until the berries and grain come.
    stockpile: { 'dried-meat': 14, 'dried-fruit': 8, nuts: 12, hardwood: 6, stone: 4, flint: 2 },
    herds: scene.herds,
    discoveries: [],
    discoveryLog: [],
    seen: [],
    built: [],
    spoilage: { day: 0, today: 0, yesterday: 0 },
    structures: [],
    nextStructureId: 1,
    planTimer: 30,
    lastTownDay: 0,
    structuresVersion: 0,
    rosterVersion: 0,
    roadsVersion: 0,
    roadTimer: 0,
    slowTimer: 0,
    events: [],
    nav: new NavGrid(scene.terrain),
    waterNav: new NavGrid(scene.terrain, 'water'),
    walkField: new Float32Array(0),
    voyages: [],
    villagers,
    rng,
  };
  // The camp's tents are the town's first homes.
  foundTown(world);
  world.walkField = world.nav.distanceField(world.camp.center.x, world.camp.center.z);
  return world;
}

/** Walking cost from the town centre to a point (Infinity if too far or unreachable). */
export function walkCost(world: World, x: number, z: number): number {
  return world.nav.fieldAt(world.walkField, x, z);
}

/** Grant every discovery and a canoe and airship (debug and showcase). */
export function grantAll(world: World): void {
  for (const d of DISCOVERIES) if (!world.discoveries.includes(d.id)) world.discoveries.push(d.id);
  world.stockpile['dugout-canoe'] = Math.max(1, world.stockpile['dugout-canoe'] ?? 0);
  world.stockpile.airship = Math.max(1, world.stockpile.airship ?? 0);
}

function makeName(rng: Rng): string {
  const n = rng.int(2, 3);
  let s = '';
  for (let i = 0; i < n; i++) s += rng.pick(SYLLABLES);
  return s[0].toUpperCase() + s.slice(1);
}

/** Advance the world by `dt` game seconds. */
export function tick(world: World, dt: number): void {
  world.clock.totalSeconds += dt;
  const season = SEASONS.indexOf(calendar(world.clock.totalSeconds).season);
  for (let i = 0; i < world.villagers.length; i++) stepVillager(world, world.villagers[i], dt);
  const watchers = world.villagers.filter((v) => v.activity !== 'sleeping').map((v) => ({ x: v.x, z: v.z, stealth: v.task?.kind === 'gather' && v.task.stage === 'stalking' ? 0.6 : 0 }));
  stepHerds(world.herds, world.terrain, watchers, season, world.rng, dt);
  // Slow processes (plants regrowing, paths fading) run in batches every few seconds.
  world.slowTimer += dt;
  if (world.slowTimer >= 5) {
    regrowResources(world.nodes, season, world.slowTimer);
    world.nav.regrow(world.slowTimer);
    world.slowTimer = 0;
  }
  spoilFood(world, season, dt);
  supplySites(world);
  planTown(world, materialNeeds(world), dt);
  dailyTown(world, foodTotal(world));
  stepVoyages(world, dt);
  world.roadTimer -= dt;
  if (world.roadTimer <= 0) {
    world.roadTimer = 30;
    growRoads(world);
  }
}
