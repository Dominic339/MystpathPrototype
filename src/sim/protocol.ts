// Messages between the main thread (rendering, input) and the simulation worker.

import type { CampLayout, PropInstance } from './world';

export type ToSim =
  | { type: 'init'; seed: number; startSeconds?: number; speed?: number; warmup?: number }
  | { type: 'setSpeed'; speed: number }
  | { type: 'setTime'; totalSeconds: number }
  | { type: 'save' };

/** Villager state packed as [x, z, heading, activityCode] per villager. */
export const VILLAGER_STRIDE = 4;
export const ACTIVITY_CODES = ['resting', 'walking', 'gathering', 'fetching-water'] as const;

export type FromSim =
  | {
      type: 'world';
      terrain: { res: number; size: number; waterLevel: number; heights: Float32Array };
      props: PropInstance[];
      camp: CampLayout;
      villagers: { id: number; name: string; passion: string; look: number }[];
    }
  | { type: 'tick'; totalSeconds: number; speed: number; villagers: Float32Array }
  | { type: 'saved'; json: string };
