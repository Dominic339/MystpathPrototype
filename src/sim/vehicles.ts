// Long-distance vehicles. An airship is not a toy that circles the town: it docks at its
// mooring mast (or over the town square), loads up, flies out past the edge of the valley to
// distant lands, and comes back days later with goods the town cannot get at home and,
// sometimes, people who want to settle. Ships will work the same way along rivers and coasts.

import { logEvent } from './discovery';
import { itemName, PRODUCTS } from './data/processing';
import { MATERIAL_BY_ID } from './data/materials';
import { FOODS } from './data/preservation';
import { addNewcomer, housingCapacity, obtainable } from './town';
import type { World } from './world';

export type VoyageState = 'docked' | 'outbound' | 'away' | 'inbound';

export interface Voyage {
  id: number;
  kind: 'airship';
  state: VoyageState;
  x: number;
  y: number;
  z: number;
  heading: number;
  timer: number;
  /** Where it leaves the valley and comes back in. */
  far: { x: number; z: number };
}

const DOCK_SECONDS = 240;
const AWAY_SECONDS = 900;
const CRUISE = 9;
const DOCK_HEIGHT = 16;
const CRUISE_HEIGHT = 55;

export const VOYAGE_STATES: readonly VoyageState[] = ['docked', 'outbound', 'away', 'inbound'];

/** Where airships moor: the mooring mast if there is one, else over the town square. */
function dock(world: World): { x: number; z: number } {
  const mast = world.structures.find((s) => s.line === 'skyport' && s.tier >= 0);
  return mast ? { x: mast.x, z: mast.z } : { x: world.camp.center.x + 12, z: world.camp.center.z - 10 };
}

/** Goods only trade can bring: things wanted here that the town cannot gather or make. */
const EXOTIC = ['salt', 'spices', 'glass', 'iron-ingot', 'canvas', 'dyed-cloth', 'jewellery', 'copper-ingot', 'paper'];

function trade(world: World, v: Voyage): void {
  const brought: string[] = [];
  const candidates = EXOTIC.filter((id) => (PRODUCTS[id] || MATERIAL_BY_ID.has(id)) && !obtainable(world, id, 5));
  for (let k = 0; k < 3 && candidates.length; k++) {
    const id = candidates.splice(Math.floor(world.rng.next() * candidates.length), 1)[0];
    world.stockpile[id] = (world.stockpile[id] ?? 0) + 15;
    brought.push(itemName(id, MATERIAL_BY_ID).toLowerCase());
  }
  // In return it carried away some of what the town has most of.
  const surplus = Object.entries(world.stockpile)
    .filter(([id, q]) => q > 40 && !FOODS[id])
    .sort((a, b) => b[1] - a[1])[0];
  if (surplus) world.stockpile[surplus[0]] -= Math.floor(surplus[1] * 0.2);
  // Sometimes it brings people who want to settle.
  const room = housingCapacity(world) - world.villagers.length;
  const people: string[] = [];
  for (let k = 0; k < Math.min(2, room); k++) if (world.rng.next() < 0.5) people.push(addNewcomer(world, world.nav.nearestPassable(v.x, v.z) ?? undefined).name);
  const goods = brought.length ? `with ${brought.join(', ')}` : 'with trade goods';
  logEvent(world, `The airship returned from distant lands ${goods}${people.length ? `, carrying ${people.join(' and ')} who came to settle` : ''}.`);
}

export function stepVoyages(world: World, dt: number): void {
  const owned = Math.floor(world.stockpile.airship ?? 0) + Math.floor(world.stockpile['motor-airship'] ?? 0);
  while (world.voyages.length < owned) {
    const d = dock(world);
    world.voyages.push({ id: world.voyages.length, kind: 'airship', state: 'docked', x: d.x, y: DOCK_HEIGHT, z: d.z, heading: 0, timer: DOCK_SECONDS * (0.5 + world.rng.next()), far: { x: 0, z: 0 } });
    logEvent(world, 'The first airship rose from its yard and moored over the town.');
  }
  if (world.voyages.length > owned) world.voyages.length = owned;
  const edge = world.terrain.size / 2 + 80;
  for (const v of world.voyages) {
    const home = dock(world);
    const toward = (tx: number, tz: number, ty: number) => {
      const dx = tx - v.x;
      const dz = tz - v.z;
      const d = Math.hypot(dx, dz);
      v.heading = Math.atan2(dx, dz);
      const step = Math.min(d, CRUISE * dt);
      if (d > 0.01) {
        v.x += (dx / d) * step;
        v.z += (dz / d) * step;
      }
      v.y += (ty - v.y) * Math.min(1, dt * 0.15);
      return d - step;
    };
    switch (v.state) {
      case 'docked':
        v.x += (home.x - v.x) * Math.min(1, dt * 0.2);
        v.z += (home.z - v.z) * Math.min(1, dt * 0.2);
        v.y += (DOCK_HEIGHT - v.y) * Math.min(1, dt * 0.2);
        v.timer -= dt;
        if (v.timer <= 0) {
          const a = world.rng.next() * Math.PI * 2;
          v.far = { x: Math.cos(a) * edge, z: Math.sin(a) * edge };
          v.state = 'outbound';
        }
        break;
      case 'outbound':
        if (toward(v.far.x, v.far.z, CRUISE_HEIGHT) < 1) {
          v.state = 'away';
          v.timer = AWAY_SECONDS * (0.8 + world.rng.next() * 0.4);
        }
        break;
      case 'away':
        v.timer -= dt;
        if (v.timer <= 0) v.state = 'inbound';
        break;
      case 'inbound':
        if (toward(home.x, home.z, DOCK_HEIGHT + 4) < 2) {
          v.state = 'docked';
          v.timer = DOCK_SECONDS;
          trade(world, v);
        }
        break;
    }
  }
}
