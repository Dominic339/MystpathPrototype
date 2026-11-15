// World state and the simulation tick. Plain data only — no rendering code here,
// so the same simulation can later run on a server.

import { PASSIONS, type Passion } from './data/jobs';
import { NavGrid } from './pathfinding';
import { buildHexResources, buildNodes, regrowResources, type HexResources, type ResourceNode } from './resources';
import { Rng, subSeed } from './rng';
import { Heightfield } from './terrain';
import { buildTestScene, type FlowField } from './testScene';
import { GameClock } from './time';
import { stepVillager, type Villager } from './villagerAI';

export type PropKind = 'oak' | 'pine' | 'birch' | 'bush' | 'rock' | 'boulder' | 'reeds' | 'flowers' | 'beehive' | 'nest';

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
  /** Discoveries this civilization has made. */
  discoveries: string[];
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
    // A small starting store so the band is not starving on day one.
    stockpile: { berries: 10, 'dried-meat': 4, hardwood: 6, stone: 4, flint: 2 },
    discoveries: [],
    nav: new NavGrid(scene.terrain),
    villagers,
    rng,
  };
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
  for (const v of world.villagers) stepVillager(world, v, dt);
  regrowResources(world.hexes, world.nodes, dt);
  world.nav.regrow(dt);
}
