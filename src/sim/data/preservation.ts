// Food preservation. Every food spoils at its own pace, and preserving it is its own line of
// progress, from what hunter-gatherers can do to techno-magic:
//
//   ways of preparing food so it keeps: drying, smoking, honey preserves, salting, fermenting, canning
//   ways of storing food so it keeps:  winter cold, storage pits, root cellars, ice houses,
//                                      frost boxes (cold magic), refrigeration, stasis vaults
//
// Storage is a parallel-path line like smelting: an ice house (cut ice), a frost box (bound
// frost shards) and a refrigerator (machines and fuel) all do the same job, and some need a
// steady supply to keep working.

import type { EraId } from './eras';

export type FoodClass = 'meat' | 'fish' | 'dairy' | 'produce' | 'roots' | 'grain' | 'cooked' | 'kept';

export interface FoodInfo {
  class: FoodClass;
  /** Days until about two-thirds has spoiled in the open (Infinity = keeps). */
  shelfDays: number;
  /** How filling one unit is (0..1 of a day's food). */
  value: number;
}

const f = (cls: FoodClass, shelfDays: number, value: number): FoodInfo => ({ class: cls, shelfDays, value });

/** Every food, raw and prepared. */
export const FOODS: Readonly<Record<string, FoodInfo>> = {
  // Raw
  'game-meat': f('meat', 2, 0.45),
  poultry: f('meat', 2, 0.35),
  fish: f('fish', 1.5, 0.35),
  shellfish: f('fish', 1, 0.25),
  eggs: f('dairy', 6, 0.2),
  milk: f('dairy', 1, 0.15),
  berries: f('produce', 3, 0.12),
  'wild-fruit': f('produce', 6, 0.15),
  mushrooms: f('produce', 2, 0.1),
  seaweed: f('produce', 2, 0.1),
  roots: f('roots', 15, 0.2),
  nuts: f('grain', 60, 0.2),
  'wild-grain': f('grain', 40, 0.18),
  honey: f('kept', Infinity, 0.25),
  // Cooked: better to eat, but spoils almost as fast
  'cooked-meat': f('cooked', 3, 0.55),
  'cooked-fish': f('cooked', 2, 0.45),
  'roast-poultry': f('cooked', 3, 0.5),
  'roasted-food': f('cooked', 5, 0.3),
  'egg-dishes': f('cooked', 2, 0.3),
  flatbread: f('cooked', 6, 0.35),
  bread: f('cooked', 5, 0.4),
  // Preserved: keeps for a season or more
  'dried-meat': f('kept', 90, 0.45),
  'dried-fish': f('kept', 90, 0.4),
  'dried-fruit': f('kept', 120, 0.3),
  'dried-seaweed': f('kept', 120, 0.12),
  'smoked-meat': f('kept', 45, 0.5),
  'smoked-fish': f('kept', 40, 0.45),
  preserves: f('kept', 300, 0.3),
  'salted-meat': f('kept', 200, 0.45),
  'salted-fish': f('kept', 200, 0.4),
  pickles: f('kept', 200, 0.15),
  cheese: f('kept', 60, 0.4),
  'canned-food': f('kept', Infinity, 0.45),
};

export interface Storage {
  id: string;
  name: string;
  era: EraId;
  /** How much it slows spoiling, per food class (0.25 = four times slower). */
  slows: Partial<Record<FoodClass, number>>;
  /** What it uses up per day to keep working. */
  upkeep?: Readonly<Record<string, number>>;
  description: string;
}

const COLD = (k: number): Partial<Record<FoodClass, number>> => ({ meat: k, fish: k, dairy: k, cooked: k, produce: Math.min(1, k * 1.6), roots: Math.min(1, k * 1.6), grain: Math.min(1, k * 2) });

/** Storage, in order of progress. Each is built (see discoveries) and only works when stocked with its upkeep. */
export const STORAGES: readonly Storage[] = [
  { id: 'storage-pits', name: 'Storage pits', era: 'stone', slows: { roots: 0.4, grain: 0.5, produce: 0.7, meat: 0.85, fish: 0.85 }, description: 'Reed-lined pits dug into cool earth.' },
  { id: 'root-cellar', name: 'Root cellar', era: 'iron', slows: { roots: 0.15, produce: 0.3, grain: 0.3, dairy: 0.5, meat: 0.6, fish: 0.6, cooked: 0.6 }, description: 'A cool, dark cellar for roots, fruit and cheese.' },
  { id: 'ice-house', name: 'Ice house', era: 'iron', slows: COLD(0.15), upkeep: { ice: 1 }, description: 'Ice cut in winter, packed in straw, keeps meat and milk cold through summer.' },
  { id: 'frost-box', name: 'Frost box', era: 'medieval', slows: COLD(0.05), upkeep: { 'cold-core': 0.1 }, description: 'A chest chilled by a bound frost shard.' },
  { id: 'refrigerator', name: 'Refrigeration', era: 'industrial', slows: COLD(0.03), upkeep: { fuel: 1 }, description: 'Mechanical cooling driven by an engine.' },
  { id: 'stasis-vault', name: 'Stasis vault', era: 'techno-magic', slows: { meat: 0, fish: 0, dairy: 0, produce: 0, roots: 0, grain: 0, cooked: 0 }, upkeep: { 'mana-cell': 0.1 }, description: 'Machinery and frost magic together stop time for what is stored.' },
];

export const STORAGE_BY_ID: ReadonlyMap<string, Storage> = new Map(STORAGES.map((s) => [s.id, s]));

/** Natural cold by season: spring, summer, autumn, winter. */
export function seasonSlows(season: number, cls: FoodClass): number {
  const cold = [0.9, 1.15, 0.8, 0.35][season];
  return cls === 'meat' || cls === 'fish' || cls === 'dairy' || cls === 'cooked' ? cold : Math.min(1, cold + 0.2);
}
