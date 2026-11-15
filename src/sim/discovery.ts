// How villagers make discoveries. Every finished piece of work builds insight toward the
// discoveries that kind of work could spark. Passion doubles it, talent adds half again, a
// prodigy learns three times as fast, and a god's inspiration multiplies it for a day.
// Only a few discoveries can happen per day across the whole civilization.

import { DISCOVERIES, DISCOVERY_BY_ID, insightNeeded, type Discovery } from './data/discoveries';
import { ERA_NAMES, ERAS, eraIndex, type EraId } from './data/eras';
import { PASSION_JOBS, type JobId } from './data/jobs';
import { MATERIAL_BY_ID } from './data/materials';
import { calendar } from './time';
import type { Villager, World } from './world';

export const DISCOVERIES_PER_DAY = 2;
/** Discoveries of an era needed to enter it. */
export const ERA_THRESHOLD = 5;
const INSPIRE_SECONDS = 1200;

export function currentEra(world: World): EraId {
  let era: EraId = 'hunter-gatherer';
  for (let i = 1; i < ERAS.length; i++) {
    const n = world.discoveries.filter((id) => DISCOVERY_BY_ID.get(id)?.era === ERAS[i]).length;
    if (n >= ERA_THRESHOLD) era = ERAS[i];
    else break;
  }
  return era;
}

export function knows(world: World, id: string): boolean {
  return world.discoveries.includes(id);
}

/**
 * Can the band recognise and work this material yet? Each material has an age (and the
 * magical ones a discovery); a civilization can work materials up to one age ahead of its own.
 */
export function workable(world: World, id: string): boolean {
  const m = MATERIAL_BY_ID.get(id);
  if (!m) return true; // products are always fine
  if (m.knowledge && !knows(world, m.knowledge)) return false;
  return eraIndex(m.era) <= eraIndex(currentEra(world)) + 1;
}

/** Can this discovery be made right now (prerequisites, era reach and things seen)? */
export function discoverable(world: World, d: Discovery): boolean {
  if (knows(world, d.id)) return false;
  // A civilization can reach one era ahead of the one it is in.
  if (eraIndex(d.era) > eraIndex(currentEra(world)) + 1) return false;
  if (!d.requires.every((r) => knows(world, r))) return false;
  if (d.needsSeen && !d.needsSeen.some((s) => world.seen.includes(s))) return false;
  return true;
}

export function logEvent(world: World, text: string): void {
  world.events.push({ t: world.clock.totalSeconds, text });
  if (world.events.length > 60) world.events.shift();
}

export function noteSeen(world: World, id: string): void {
  if (!world.seen.includes(id)) world.seen.push(id);
}

function discoveriesToday(world: World): number {
  const day = calendar(world.clock.totalSeconds).dayIndex;
  return world.discoveryLog.filter((e) => e.day === day).length;
}

export function makeDiscovery(world: World, d: Discovery, by: Villager | null, doing?: string): void {
  if (knows(world, d.id)) return;
  const before = currentEra(world);
  world.discoveries.push(d.id);
  world.discoveryLog.push({ day: calendar(world.clock.totalSeconds).dayIndex, id: d.id, by: by?.name ?? null });
  if (by) {
    by.discoveries.push(d.id);
    delete by.insight[d.id];
    logEvent(world, `${by.name} discovered ${d.name.toLowerCase()}${doing ? ` while ${doing}` : ''}.`);
  } else logEvent(world, `${d.name} became known.`);
  const after = currentEra(world);
  if (after !== before) logEvent(world, `The band has entered the ${ERA_NAMES[after]} era.`);
}

/** Called when a villager finishes a cycle of work (an acquisition method or a recipe). */
export function gainInsight(world: World, v: Villager, workId: string, job: JobId, skillLevel: number, doing: string): void {
  const passion = PASSION_JOBS[v.passion].includes(job) ? 2 : 1;
  const talent = PASSION_JOBS[v.talent].includes(job) ? 1.5 : 1;
  const prodigy = v.prodigy ? 3 : 1;
  const inspired = world.clock.totalSeconds < v.inspiredUntil ? 4 : 1;
  for (const d of DISCOVERIES) {
    if (!d.inspiredBy.includes(workId) || !discoverable(world, d)) continue;
    const gain = 7 * (1 + skillLevel * 0.05) * passion * talent * prodigy * inspired * (0.5 + world.rng.next());
    v.insight[d.id] = (v.insight[d.id] ?? 0) + gain;
    if (v.insight[d.id] >= insightNeeded(d.era) && discoveriesToday(world) < DISCOVERIES_PER_DAY) makeDiscovery(world, d, v, doing);
  }
}

/** A god inspires a villager: their insight grows four times as fast for a day. */
export function inspire(world: World, v: Villager): void {
  v.inspiredUntil = world.clock.totalSeconds + INSPIRE_SECONDS;
  logEvent(world, `${v.name} felt a spark of inspiration.`);
}

/** The discovery a villager is closest to, for the stats view. */
export function closestDiscovery(world: World, v: Villager): { name: string; progress: number } | null {
  let best: { name: string; progress: number } | null = null;
  for (const [id, x] of Object.entries(v.insight)) {
    const d = DISCOVERY_BY_ID.get(id);
    if (!d || knows(world, id)) continue;
    const progress = Math.min(1, x / insightNeeded(d.era));
    if (!best || progress > best.progress) best = { name: d.name, progress };
  }
  return best;
}
