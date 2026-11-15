// The world's resources: every hex carries an environment with surface stocks (collected,
// regrowing) and subsurface deposits (for mines and quarries later), and individual props —
// trees, bushes, rocks, reeds — are resource nodes villagers gather from directly.

import { ENVIRONMENT_BY_ID, type EnvironmentId } from './data/environments';
import { MATERIAL_BY_ID, type Rarity } from './data/materials';
import { HEX_SIZE, hexesInRadius, hexKey, hexToWorld, type Hex } from './hex';
import { hash01 } from './rng';
import type { Heightfield } from './terrain';
import type { FlowField } from './testScene';
import type { PropInstance } from './world';

export interface HexResources {
  q: number;
  r: number;
  env: EnvironmentId;
  /** Current surface stock per material. */
  surface: Record<string, number>;
  /** Stock the surface regrows toward. */
  surfaceMax: Record<string, number>;
  /** Untouched subsurface deposits (units). */
  subsurface: Record<string, number>;
}

export interface ResourceNode {
  /** Index into world.props. */
  prop: number;
  x: number;
  z: number;
  stock: Record<string, number>;
  max: Record<string, number>;
}

const RARITY_SCALE: Record<Rarity, number> = { common: 1, uncommon: 0.6, rare: 0.3, 'very-rare': 0.12 };

/** Decide a hex's environment from the ground under it. */
export function classifyHex(h: Hex, terrain: Heightfield, flow: FlowField, treeDensity: number): EnvironmentId {
  const c = hexToWorld(h);
  let water = 0;
  let wet = 0;
  let maxH = -Infinity;
  let slope = 0;
  const samples = 7;
  for (let k = 0; k < samples; k++) {
    const a = (k / samples) * Math.PI * 2;
    const rad = k === 0 ? 0 : HEX_SIZE * 0.7;
    const x = c.x + Math.cos(a) * rad;
    const z = c.z + Math.sin(a) * rad;
    const ht = terrain.sample(x, z);
    if (ht < terrain.waterLevel) water++;
    else if (ht < terrain.waterLevel + 1.0) wet++;
    maxH = Math.max(maxH, ht);
    slope += terrain.slope(x, z);
  }
  slope /= samples;
  if (water >= 4) {
    const fi = Math.round((c.x / flow.size + 0.5) * (flow.res - 1));
    const fj = Math.round((c.z / flow.size + 0.5) * (flow.res - 1));
    const k = (Math.min(flow.res - 1, Math.max(0, fj)) * flow.res + Math.min(flow.res - 1, Math.max(0, fi))) * 2;
    return Math.hypot(flow.data[k], flow.data[k + 1]) > 0.15 ? 'river' : 'lake';
  }
  if (water > 0 || wet >= 2) return 'riverbank';
  if (maxH > 32 || slope > 0.85) return maxH > 40 ? 'mountains' : 'hills';
  if (treeDensity > 2.5) return maxH > 14 ? 'conifer-forest' : 'temperate-forest';
  if (maxH > 16) return 'hills';
  return treeDensity > 0.8 ? 'temperate-forest' : 'meadow';
}

/** Build the hex resource map for the playable area. */
export function buildHexResources(seed: number, terrain: Heightfield, flow: FlowField, props: PropInstance[]): HexResources[] {
  const radius = Math.floor(terrain.size / 2 / (HEX_SIZE * 1.5));
  const half = terrain.size / 2 - HEX_SIZE;
  // Trees per hex, to tell forest from meadow.
  const trees = new Map<string, number>();
  for (const p of props) {
    if (p.kind !== 'oak' && p.kind !== 'pine' && p.kind !== 'birch') continue;
    const k = hexKey(worldHex(p.x, p.z));
    trees.set(k, (trees.get(k) ?? 0) + 1);
  }
  const out: HexResources[] = [];
  for (const h of hexesInRadius({ q: 0, r: 0 }, radius)) {
    const c = hexToWorld(h);
    if (Math.abs(c.x) > half || Math.abs(c.z) > half) continue;
    const env = classifyHex(h, terrain, flow, trees.get(hexKey(h)) ?? 0);
    const e = ENVIRONMENT_BY_ID.get(env)!;
    const surface: Record<string, number> = {};
    const subsurface: Record<string, number> = {};
    let ch = 0;
    for (const [id, abundance] of Object.entries(e.surface)) {
      ch++;
      const roll = hash01(seed, h.q * 131 + ch, h.r * 977);
      if (roll > abundance && abundance < 0.5) continue;
      const scale = RARITY_SCALE[MATERIAL_BY_ID.get(id)?.rarity ?? 'common'];
      const amount = Math.round(abundance * 30 * scale * (0.5 + hash01(seed + 7, h.q, h.r * 31 + ch)));
      if (amount > 0) surface[id] = amount;
    }
    for (const [id, abundance] of Object.entries(e.subsurface)) {
      ch++;
      const roll = hash01(seed + 3, h.q * 557 + ch, h.r * 211);
      if (roll > abundance) continue;
      const scale = RARITY_SCALE[MATERIAL_BY_ID.get(id)?.rarity ?? 'common'];
      const amount = Math.round(400 * abundance * scale * (0.4 + hash01(seed + 11, h.q * 3, h.r + ch)));
      if (amount > 0) subsurface[id] = amount;
    }
    out.push({ q: h.q, r: h.r, env, surface, surfaceMax: { ...surface }, subsurface });
  }
  return out;
}

function worldHex(x: number, z: number): Hex {
  const q = ((2 / 3) * x) / HEX_SIZE;
  const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * z) / HEX_SIZE;
  // Inline rounding to avoid a circular import.
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq + 0, r: rr + 0 };
}

/** Resource nodes from props: deadwood on trees, berries on bushes, stone on rocks, reeds. */
export function buildNodes(seed: number, props: PropInstance[]): ResourceNode[] {
  const nodes: ResourceNode[] = [];
  props.forEach((p, i) => {
    let stock: Record<string, number> | null = null;
    switch (p.kind) {
      case 'oak':
      case 'birch':
        stock = { hardwood: 3 };
        break;
      case 'pine':
        stock = { softwood: 3, resin: 2 };
        break;
      case 'bush':
        // The renderer draws berries on some bush variants; match roughly with a hash.
        stock = hash01(seed, i, 9) > 0.45 ? { berries: 6 } : { herbs: 2 };
        break;
      case 'rock':
        stock = hash01(seed, i, 5) > 0.6 ? { stone: 3, flint: 2 } : { stone: 4 };
        break;
      case 'boulder':
        stock = { stone: 10, flint: hash01(seed, i, 6) > 0.5 ? 3 : 0 };
        break;
      case 'reeds':
        stock = { reeds: 6 };
        break;
      case 'flowers':
        stock = { herbs: 2, 'dye-plants': 1 };
        break;
    }
    if (!stock) return;
    for (const k of Object.keys(stock)) if (!stock[k]) delete stock[k];
    nodes.push({ prop: i, x: p.x, z: p.z, stock, max: { ...stock } });
  });
  return nodes;
}

/** Surface stocks and nodes regrow a little each game second (fully in about two days). */
export function regrowResources(hexes: HexResources[], nodes: ResourceNode[], dt: number): void {
  const rate = dt / 2400;
  for (const h of hexes)
    for (const id in h.surfaceMax) {
      const cur = h.surface[id] ?? 0;
      if (cur < h.surfaceMax[id]) h.surface[id] = Math.min(h.surfaceMax[id], cur + h.surfaceMax[id] * rate);
    }
  for (const n of nodes)
    for (const id in n.max) {
      const cur = n.stock[id] ?? 0;
      // Stone does not grow back; plants and deadwood do.
      if (id === 'stone' || id === 'flint') continue;
      if (cur < n.max[id]) n.stock[id] = Math.min(n.max[id], cur + n.max[id] * rate);
    }
}
