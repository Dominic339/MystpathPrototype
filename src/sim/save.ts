// Save and load. Saves are plain JSON so they can live in a file, local storage or a server.

import { Rng } from './rng';
import { Heightfield } from './terrain';
import { GameClock } from './time';
import type { World } from './world';

export const SAVE_VERSION = 1;

export interface SaveFile {
  version: number;
  seed: number;
  clock: { totalSeconds: number; speed: number };
  rngState: number;
  terrain: { res: number; size: number; waterLevel: number; heights: string };
  props: World['props'];
  camp: World['camp'];
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
    villagers: world.villagers.map((v) => ({ ...v })),
  };
}

export function loadWorld(save: SaveFile): World {
  if (save.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${save.version}`);
  const rng = new Rng(0);
  rng.setState(save.rngState);
  const t = save.terrain;
  return {
    seed: save.seed,
    clock: new GameClock(save.clock.totalSeconds, save.clock.speed),
    rng,
    terrain: new Heightfield(t.res, t.size, decodeFloats(t.heights), t.waterLevel),
    props: save.props,
    camp: save.camp,
    villagers: save.villagers.map((v) => ({ ...v })),
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
