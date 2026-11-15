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
  built: string[];
  projects: { name: string; progress: number }[];
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
      villagers: { id: number; name: string; passion: string; look: number }[];
      herds: { species: string; max: number }[];
      navSize: number;
    }
  | { type: 'tick'; totalSeconds: number; speed: number; villagers: Float32Array; herds: Float32Array }
  | { type: 'stats'; stats: Stats }
  | { type: 'wear'; n: number; data: Float32Array }
  | { type: 'hexInfo'; info: HexInfo | null }
  | { type: 'saved'; json: string };
