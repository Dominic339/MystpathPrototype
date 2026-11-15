// Food in store spoils. How fast depends on the food (fish in a day or two, dried meat in
// months), the season (winter is a natural cold store) and the best storage the band has
// built and keeps stocked (an ice house needs ice, a frost box needs cold cores).

import { FOODS, seasonSlows, STORAGES, type FoodClass, type Storage } from './data/preservation';
import { CYCLE_SECONDS, calendar } from './time';
import type { World } from './world';

/** Storage the band has built and can keep running right now. */
export function activeStorage(world: World): Storage[] {
  return STORAGES.filter((s) => world.built.includes(s.id) && Object.entries(s.upkeep ?? {}).every(([id]) => (world.stockpile[id] ?? 0) > 0));
}

/** How much slower than in the open a food class spoils right now (1 = no help). */
export function spoilFactor(active: Storage[], season: number, cls: FoodClass): number {
  let k = seasonSlows(season, cls);
  for (const s of active) k = Math.min(k, (s.slows[cls] ?? 1) * (season === 3 ? 0.8 : 1));
  return k;
}

export function spoilFood(world: World, season: number, dt: number): void {
  const active = activeStorage(world);
  for (const s of active)
    for (const [id, perDay] of Object.entries(s.upkeep ?? {})) world.stockpile[id] = Math.max(0, (world.stockpile[id] ?? 0) - (perDay * dt) / CYCLE_SECONDS);
  const day = calendar(world.clock.totalSeconds).dayIndex;
  if (world.spoilage.day !== day) world.spoilage = { day, today: 0, yesterday: world.spoilage.today };
  for (const id in world.stockpile) {
    const info = FOODS[id];
    const have = world.stockpile[id];
    if (!info || !Number.isFinite(info.shelfDays) || have <= 0) continue;
    const rate = spoilFactor(active, season, info.class) / (info.shelfDays * CYCLE_SECONDS);
    const lost = have * rate * dt;
    world.stockpile[id] = have - lost;
    world.spoilage.today += lost * info.value;
  }
}

/** Food value of everything in store. */
export function foodTotal(world: World): number {
  let t = 0;
  for (const [id, info] of Object.entries(FOODS)) t += (world.stockpile[id] ?? 0) * info.value;
  return t;
}
