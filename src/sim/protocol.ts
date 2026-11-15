// Messages between the main thread (rendering, input) and the simulation worker.

import { ACTIVITIES } from './villagerAI';
import type { CampLayout, PropInstance } from './world';

export type ToSim =
  | { type: 'init'; seed: number; startSeconds?: number; speed?: number; warmup?: number }
  | { type: 'setSpeed'; speed: number }
  | { type: 'setTime'; totalSeconds: number }
  | { type: 'inspectHex'; q: number; r: number }
  | { type: 'save' };

/** Villager state packed as [x, z, heading, activity, vx, vz, carryCategory] per villager. */
export const VILLAGER_STRIDE = 7;
export const ACTIVITY_CODES = ACTIVITIES;

export interface VillagerStats {
  name: string;
  passion: string;
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
}

export interface HexInfo {
  q: number;
  r: number;
  environment: string;
  surface: { name: string; qty: number; max: number }[];
  subsurface: { name: string; qty: number }[];
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
      navSize: number;
    }
  | { type: 'tick'; totalSeconds: number; speed: number; villagers: Float32Array }
  | { type: 'stats'; stats: Stats }
  | { type: 'wear'; n: number; data: Float32Array }
  | { type: 'hexInfo'; info: HexInfo | null }
  | { type: 'saved'; json: string };
