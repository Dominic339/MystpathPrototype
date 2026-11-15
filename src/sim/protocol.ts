// Messages between the main thread (rendering, input) and the simulation worker.

import { ACTIVITIES } from './villagerAI';
import type { CampLayout, PropInstance } from './world';

export type ToSim =
  | { type: 'init'; seed: number; startSeconds?: number; speed?: number; warmup?: number }
  | { type: 'setSpeed'; speed: number }
  | { type: 'setTime'; totalSeconds: number }
  | { type: 'inspectHex'; q: number; r: number }
  | { type: 'inspire'; villager: number }
  | { type: 'grantDiscoveries'; ids: string[] | 'all' }
  | { type: 'save' };

/** Voyages (airships) packed as [x, y, z, heading, state, kind] each. */
export const VOYAGE_STRIDE = 6;

/** Herd state packed as [x, z, heading, count, state, vx, vz, species] per herd. */
export const HERD_STRIDE = 8;

/** Villager state packed as [x, z, heading, activity, vx, vz, carryCategory] per villager. */
export const VILLAGER_STRIDE = 7;
export const ACTIVITY_CODES = ACTIVITIES;

export interface VillagerStats {
  id: number;
  name: string;
  passion: string;
  talent: string;
  prodigy: boolean;
  inspired: boolean;
  /** The discovery they are closest to. */
  idea: { name: string; progress: number } | null;
  discoveries: string[];
  job: string | null;
  activity: string;
  hunger: number;
  fulfilment: number;
  priorities: string[];
  skills: { job: string; level: number }[];
  carrying: string;
}

export interface Stats {
  stockpile: { id: string; name: string; qty: number; group: string }[];
  villagers: VillagerStats[];
  food: number;
  era: string;
  discoveries: { name: string; era: string; by: string | null }[];
  /** Discoveries this era still needed to reach the next. */
  nextEra: { name: string; have: number; need: number } | null;
  events: { day: number; text: string }[];
  /** Boats and airships the band owns. */
  vehicles: { id: string; name: string; count: number }[];
  buildings: { name: string; state: string; owner: string | null; workers: number }[];
  population: number;
  housing: number;
  roads: string;
  /** Food storage in use, and food lost to spoiling yesterday (days of food for one person). */
  storage: string[];
  spoiledYesterday: number;
  /** What people use of each kind of good: the best on hand, and how many it covers. */
  goods: { category: string; name: string | null; coverage: number; quality: number; expected: number }[];
}

/** A building as the renderer needs it. */
export interface StructureView {
  id: number;
  line: string;
  /** Model of the finished tier being shown (or under construction). */
  model: string;
  /** 0..1 construction progress of the tier being built (1 = finished). */
  built: number;
  /** The previous tier's model stays up while an upgrade is built. */
  previous: string | null;
  x: number;
  z: number;
  rot: number;
  variant: number;
  animals: number;
}

export interface HexInfo {
  q: number;
  r: number;
  environment: string;
  water: string | null;
  ground: { name: string; qty: number; max: number }[];
  plants: { name: string; count: number; holds: string }[];
  animals: { name: string; count: number; holds: string }[];
  below: { name: string; qty: number }[];
  buildings: string[];
}

export type FromSim =
  | {
      type: 'world';
      terrain: { res: number; size: number; waterLevel: number; heights: Float32Array };
      props: PropInstance[];
      camp: CampLayout;
      flow: { res: number; size: number; data: Float32Array };
      /** Navigable route for boats: river centreline and the lake it feeds. */
      waterway: { river: [number, number][]; lake: { x: number; z: number; r: number } };
      /** Environment index per cell (see worldgen BIOME_RES). */
      biome: Uint8Array;
      villagers: { id: number; name: string; passion: string; look: number }[];
      herds: { species: string; max: number }[];
      navSize: number;
    }
  | { type: 'tick'; totalSeconds: number; speed: number; villagers: Float32Array; herds: Float32Array; voyages: Float32Array }
  | { type: 'stats'; stats: Stats }
  | { type: 'wear'; n: number; data: Float32Array; roads: Uint8Array }
  | { type: 'structures'; list: StructureView[]; cleared: number[] }
  | { type: 'roster'; villagers: { id: number; name: string; look: number }[] }
  | { type: 'hexInfo'; info: HexInfo | null }
  | { type: 'saved'; json: string };
