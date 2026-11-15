// World state and the simulation tick. Plain data only — no rendering code here,
// so the same simulation can later run on a server.

import { PASSIONS, type Passion } from './data/jobs';
import { stepHerds, type Herd } from './animals';
import { DISCOVERIES } from './data/discoveries';
import { MATERIAL_BY_ID } from './data/materials';
import { NavGrid } from './pathfinding';
import { buildHexResources, buildNodes, regrowResources, type HexResources, type ResourceNode } from './resources';
import { Rng, subSeed } from './rng';
import { Heightfield } from './terrain';
import { buildTestScene, type FlowField } from './testScene';
import { calendar, GameClock, SEASONS } from './time';
import { stepVillager, type Villager } from './villagerAI';

export type PropKind =
  | 'oak' | 'pine' | 'birch' | 'apple' | 'hazel' | 'bush' | 'berrybush' | 'rock' | 'boulder' | 'reeds' | 'flowers'
  | 'grain' | 'tubers' | 'mushrooms' | 'flax' | 'beehive' | 'nest' | 'shellfish';

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

export interface World {
  seed: number;
  clock: GameClock;
  terrain: Heightfield;
  props: PropInstance[];
  camp: CampLayout;
  flow: FlowField;
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
  /** Inventions the band has built (canoes, airships). */
  built: string[];
  /** Inventions under construction: work done so far, in game seconds. */
  projects: Record<string, number>;
  /** The chronicle: notable things that happened. */
  events: { t: number; text: string }[];
  nav: NavGrid;
  villagers: Villager[];
  rng: Rng;
}

export type { Villager };

const SYLLABLES = ['ka', 'ro', 'mi', 'ta', 'sen', 'lu', 'ar', 've', 'no', 'dra', 'il', 'ush', 'ba', 'tor', 'ye', 'ma'];
const START_PASSIONS: Passion[] = ['woodwork', 'hunting', 'fishing', 'stonework', 'cooking', 'herbalism', 'weaving'];

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
  return {
    seed,
    clock: new GameClock(),
    terrain: scene.terrain,
    props: scene.props,
    camp: scene.camp,
    flow: scene.flow,
    hexes: buildHexResources(seed, scene.terrain, scene.flow, scene.props),
    nodes: buildNodes(seed, scene.props),
    // What is left of the winter store: spring is lean until the berries and grain come.
    stockpile: { 'dried-meat': 14, 'dried-fruit': 8, nuts: 12, hardwood: 6, stone: 4, flint: 2 },
    herds: scene.herds,
    discoveries: [],
    discoveryLog: [],
    seen: [],
    built: [],
    projects: {},
    events: [],
    nav: new NavGrid(scene.terrain),
    villagers,
    rng,
  };
}

/** Grant every discovery and build every invention (debug and showcase). */
export function grantAll(world: World): void {
  for (const d of DISCOVERIES) {
    if (!world.discoveries.includes(d.id)) world.discoveries.push(d.id);
    if (d.build && !world.built.includes(d.id)) world.built.push(d.id);
  }
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
  for (const v of world.villagers) stepVillager(world, v, dt);
  const watchers = world.villagers.filter((v) => v.activity !== 'sleeping').map((v) => ({ x: v.x, z: v.z, stealth: v.task?.kind === 'gather' && v.task.stage === 'stalking' ? 0.6 : 0 }));
  stepHerds(world.herds, world.terrain, watchers, season, world.rng, dt);
  regrowResources(world.nodes, season, dt);
  // Raw food and other perishables spoil in store (about a quarter a day) unless processed.
  for (const id in world.stockpile)
    if (MATERIAL_BY_ID.get(id)?.perishable && world.stockpile[id] > 0) world.stockpile[id] -= world.stockpile[id] * (dt / 4800);
  world.nav.regrow(dt);
}
