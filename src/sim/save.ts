// Save and load. Saves are plain JSON so they can live in a file, local storage or a server.

import { Rng } from './rng';
import { Heightfield } from './terrain';
import { GameClock } from './time';
import type { World } from './world';
import { buildWorld } from './worldgen';
import { NavGrid } from './pathfinding';

export const SAVE_VERSION = 10;

export interface SaveFile {
  version: number;
  seed: number;
  clock: { totalSeconds: number; speed: number };
  rngState: number;
  terrain: { res: number; size: number; waterLevel: number; heights: string };
  props: World['props'];
  camp: World['camp'];
  hexes: World['hexes'];
  nodes: World['nodes'];
  stockpile: World['stockpile'];
  herds: World['herds'];
  discoveries: World['discoveries'];
  discoveryLog: World['discoveryLog'];
  seen: World['seen'];
  built: World['built'];
  structures: World['structures'];
  living: World['living'];
  cleared: number[];
  streets?: World['streets'];
  plan?: World['plan'];
  voyages: World['voyages'];
  town: { nextStructureId: number; planTimer: number; lastTownDay: number; roadTimer: number };
  roads: string;
  spoilage: World['spoilage'];
  events: World['events'];
  wear: string;
  villagers: World['villagers'];
}

export function saveWorld(world: World): SaveFile {
  return {
    version: SAVE_VERSION,
    seed: world.seed,
    clock: { totalSeconds: world.clock.totalSeconds, speed: world.clock.speed },
    rngState: world.rng.getState(),
    terrain: {
      res: world.terrain.res,
      size: world.terrain.size,
      waterLevel: world.terrain.waterLevel,
      heights: encodeFloats(world.terrain.heights),
    },
    props: world.props,
    camp: world.camp,
    hexes: world.hexes,
    nodes: world.nodes,
    stockpile: world.stockpile,
    herds: world.herds,
    discoveries: world.discoveries,
    discoveryLog: world.discoveryLog,
    seen: world.seen,
    built: world.built,
    structures: world.structures,
    living: world.living,
    cleared: world.cleared,
    streets: world.streets,
    plan: world.plan,
    voyages: world.voyages,
    town: { nextStructureId: world.nextStructureId, planTimer: world.planTimer, lastTownDay: world.lastTownDay, roadTimer: world.roadTimer },
    roads: btoa(String.fromCharCode(...world.nav.road)),
    spoilage: world.spoilage,
    events: world.events,
    wear: encodeFloats(world.nav.wear),
    villagers: world.villagers,
  };
}

export function loadWorld(save: SaveFile): World {
  if (save.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${save.version}`);
  const rng = new Rng(0);
  rng.setState(save.rngState);
  const t = save.terrain;
  const terrain = new Heightfield(t.res, t.size, decodeFloats(t.heights), t.waterLevel);
  const nav = new NavGrid(terrain);
  nav.wear = decodeFloats(save.wear);
  const roads = atob(save.roads);
  for (let i = 0; i < roads.length; i++) nav.road[i] = roads.charCodeAt(i);
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  return {
    seed: save.seed,
    clock: new GameClock(save.clock.totalSeconds, save.clock.speed),
    rng,
    terrain,
    props: save.props,
    camp: save.camp,
    // The current is derived from the scene layout, so it is rebuilt rather than saved.
    ...(() => {
      const sc = buildWorld(save.seed);
      return { flow: sc.flow, river: sc.river, lake: sc.lake, biome: sc.biome };
    })(),
    hexes: clone(save.hexes),
    nodes: clone(save.nodes),
    stockpile: clone(save.stockpile),
    herds: clone(save.herds),
    discoveries: [...save.discoveries],
    discoveryLog: clone(save.discoveryLog),
    seen: [...save.seen],
    built: [...save.built],
    structures: clone(save.structures),
    living: clone(save.living ?? {}),
    cleared: [...(save.cleared ?? [])],
    streets: clone(save.streets ?? []),
    plan: clone(save.plan ?? null),
    streetDay: -1,
    streetsToday: 0,
    nextChain: (save.streets ?? []).reduce((m, s) => Math.max(m, s.chain ?? 0), 0) + 1,
    ...save.town,
    structuresVersion: 1,
    obstacleVersion: -1,
    slowTimer: 0,
    rosterVersion: 1,
    roadsVersion: 1,
    spoilage: clone(save.spoilage),
    events: clone(save.events),
    nav,
    waterNav: new NavGrid(terrain, 'water'),
    walkField: nav.distanceField(save.camp?.center?.x ?? 0, save.camp?.center?.z ?? 0),
    voyages: clone(save.voyages),
    villagers: clone(save.villagers).map((v) => ({ ...v, home: v.home ?? null, work: v.work ?? null, rest: v.rest ?? 1 })),
  };
}

function encodeFloats(a: Float32Array): string {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function decodeFloats(s: string): Float32Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
