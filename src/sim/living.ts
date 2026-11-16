// Where people live. Work is noisy (and smoky, and smelly): every building has a noise it
// gives off, falling away with distance. People want a good home that is quiet and still
// within a sensible walk of their work, and move when a better one stands free. So a town
// sorts itself into quiet streets and workers' rows by the mills. A noisy home means poor
// rest and slower work; a long walk to work is time not spent working.

import { eraIndex } from './data/eras';
import { LINE_BY_ID, type Line } from './data/structures';
import type { Structure } from './town';
import type { Villager, World } from './world';

const NOISE: Readonly<Record<string, number>> = {
  housing: 0, 'food-store': 0.05, 'cold-store': 0.05, logging: 0.5, tapping: 0.1, quarry: 0.8, 'sand-pit': 0.5, sulfur: 0.6, diggings: 0.5, 'clay-pit': 0.3, peat: 0.2, tar: 0.3,
  panning: 0.1, well: 0.05, mine: 0.8, oil: 0.8, gas: 0.7, brine: 0.1, ice: 0.2, hunting: 0.15, fishing: 0.1, farm: 0.1, 'fibre-farm': 0.1, 'herb-garden': 0, orchard: 0.05, spices: 0.05,
  mushrooms: 0, pasture: 0.25, pigsty: 0.35, coop: 0.25, apiary: 0.05, grove: 0, hearth: 0.1, smokehouse: 0.25, butcher: 0.3, woodwork: 0.5, masonry: 0.6, pottery: 0.35, charcoal: 0.5,
  smelting: 0.8, 'mana-forge': 0.5, glass: 0.5, tanning: 0.6, weaving: 0.2, ropewalk: 0.2, dye: 0.4, herbalist: 0, chandlery: 0.2, saltworks: 0.3, mill: 0.4, gems: 0.15, chemistry: 0.7,
  refinery: 0.9, arcane: 0.2, workshop: 0.4, smithy: 0.7, boatyard: 0.5, 'airship-yard': 0.6, port: 0.5, skyport: 0.6, railway: 0.7, bridge: 0,
};

/** How noisy a line of work is at its first tier. */
export function lineNoise(l: Line): number {
  return NOISE[l.id] ?? 0.3;
}

/** How noisy a building is: steam and factories are louder, arcane works quieter. */
export function noiseOf(s: Structure): number {
  const l = LINE_BY_ID.get(s.line)!;
  const era = eraIndex(l.tiers[Math.max(0, s.tier)].era);
  // Hand work is quiet; water wheels and hammers louder; steam and factories loudest.
  const f = era >= 7 ? 0.6 : era >= 6 ? 1.2 : era >= 5 ? 1.35 : era >= 3 ? 1 : era >= 2 ? 0.8 : 0.55;
  return Math.min(1, lineNoise(l) * f);
}

/** Noise reaching a spot (0 = peaceful, 1 = deafening). */
export function noiseAt(world: World, x: number, z: number): number {
  // Each source adds to what is already heard, less and less: two smithies are not twice one.
  let quiet = 1;
  for (const s of world.structures) {
    if (s.tier < 0) continue;
    const loud = noiseOf(s);
    if (loud <= 0.05) continue;
    const reach = 8 + 50 * loud;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < reach) quiet *= 1 - loud * (1 - d / reach) ** 2;
  }
  return 1 - quiet;
}

/** How content a home makes people (by tier: tent, roundhouse, longhouse, …). */
export const HOME_COMFORT = [0.35, 0.6, 0.68, 0.74, 0.8, 0.82, 0.86, 0.95];

function isHome(s: Structure | undefined): s is Structure {
  return !!s && s.line === 'housing' && s.tier >= 0;
}

export function homeOf(world: World, v: Villager): Structure | null {
  if (v.home === null) return null;
  const h = world.structures.find((s) => s.id === v.home);
  return isHome(h) ? h : null;
}

export function workOf(world: World, v: Villager): Structure | null {
  return v.work === null ? null : world.structures.find((s) => s.id === v.work) ?? null;
}

function beds(s: Structure): number {
  return LINE_BY_ID.get(s.line)!.tiers[s.tier].housing ?? 0;
}

/** The walk from a home to a workplace, in metres (as the crow flies, plus a little). */
export function commute(h: Structure, w: Structure | null): number {
  return w ? Math.hypot(h.x - w.x, h.z - w.z) * 1.2 : 0;
}

/** How good a home is for one villager: comfort, less the noise, less a long walk to work. */
export function desirability(world: World, v: Villager, h: Structure, noise = noiseAt(world, h.x, h.z)): number {
  const walk = commute(h, workOf(world, v));
  return HOME_COMFORT[Math.min(h.tier, HOME_COMFORT.length - 1)] - 0.35 * noise - Math.max(0, Math.min(0.35, (walk - 50) / 250));
}

/**
 * Daily: the homeless take the best free bed, and some of the housed look round for
 * something better (quieter, finer or nearer their work) and move. Returns how many moved.
 */
export function settleHomes(world: World, log: (text: string) => void): void {
  const homes = world.structures.filter(isHome);
  const noise = new Map(homes.map((h) => [h.id, noiseAt(world, h.x, h.z)]));
  const free = new Map(homes.map((h) => [h.id, beds(h)]));
  for (const v of world.villagers) {
    if (v.home !== null && (free.get(v.home) ?? 0) > 0) free.set(v.home, free.get(v.home)! - 1);
    else v.home = null; // home gone, or overfull after a change
  }
  let told = false;
  for (const v of world.villagers) {
    const cur = homeOf(world, v);
    if (cur && world.rng.next() > 0.3) continue;
    const curScore = cur ? desirability(world, v, cur, noise.get(cur.id)) : -1;
    let best: Structure | null = null;
    let bestScore = cur ? curScore + 0.07 : -1;
    for (const h of homes) {
      if ((free.get(h.id) ?? 0) <= 0) continue;
      const sc = desirability(world, v, h, noise.get(h.id));
      if (sc > bestScore) {
        bestScore = sc;
        best = h;
      }
    }
    if (!best) continue;
    if (cur) {
      free.set(cur.id, free.get(cur.id)! + 1);
      if (!told) {
        const why = (noise.get(best.id) ?? 0) < (noise.get(cur.id) ?? 0) - 0.1 ? 'a quieter home' : best.tier > cur.tier ? 'a better home' : 'a home nearer work';
        log(`${v.name} moved to ${why}.`);
        told = true;
      }
    }
    free.set(best.id, free.get(best.id)! - 1);
    v.home = best.id;
  }
  // How well each sleeps tonight, and how they feel about where they live.
  for (const v of world.villagers) {
    const h = homeOf(world, v);
    v.rest = h ? 1 - (noise.get(h.id) ?? 0) : 0.6;
    const d = h ? desirability(world, v, h, noise.get(h.id)) : 0.1;
    v.fulfilment = Math.max(0, Math.min(1, v.fulfilment + (d - 0.5) * 0.12));
  }
}

/** Town-wide figures for the panel. */
export function livingStats(world: World): { noise: number; walk: number; housed: number } {
  let noise = 0;
  let walk = 0;
  let housed = 0;
  let workers = 0;
  for (const v of world.villagers) {
    const h = homeOf(world, v);
    if (!h) continue;
    housed++;
    noise += noiseAt(world, h.x, h.z);
    const w = workOf(world, v);
    if (w) {
      walk += commute(h, w);
      workers++;
    }
  }
  return { noise: housed ? noise / housed : 0, walk: workers ? walk / workers : 0, housed };
}
