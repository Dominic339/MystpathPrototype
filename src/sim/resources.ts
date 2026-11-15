// The world's resources. Each hex has a ground pool (non-living things collected from the
// surface; finite) and deposits below ground (for quarries and mines later). Every living
// source is an individual in the world: plants and fixed animal sources (hives, nests,
// shellfish beds) are resource nodes built from props; roaming animals are herds (animals.ts).

import { ENVIRONMENT_BY_ID, type EnvironmentId } from './data/environments';
import { FAUNA, FAUNA_BY_ID } from './data/fauna';
import { FLORA_BY_ID } from './data/flora';
import { MATERIAL_BY_ID, type Rarity } from './data/materials';
import { HEX_SIZE, hexesInRadius, hexToWorld, type Hex } from './hex';
import { hash01 } from './rng';
import type { Heightfield } from './terrain';
import { envAtPoint } from './worldgen';
import type { PropInstance, PropKind } from './world';

export interface HexResources {
  q: number;
  r: number;
  env: EnvironmentId;
  /** Ground pool: what is left to collect from the surface. */
  ground: Record<string, number>;
  /** What the ground pool started with. */
  groundMax: Record<string, number>;
  /** Untouched deposits below ground (units). */
  below: Record<string, number>;
}

export type NodeKind = 'plant' | 'fixed' | 'ground';

export interface ResourceNode {
  /** Index into world.props. */
  prop: number;
  kind: NodeKind;
  /** Plant or animal species id (none for loose rocks). */
  species?: string;
  x: number;
  z: number;
  stock: Record<string, number>;
  max: Record<string, number>;
}

const RARITY_SCALE: Record<Rarity, number> = { common: 1, uncommon: 0.6, rare: 0.3, 'very-rare': 0.12 };

/** Decide a hex's environment from the ground under it. */
/** A hex's environment: the most common one across its area. */
export function classifyHex(h: Hex, biome: Uint8Array): EnvironmentId {
  const c = hexToWorld(h);
  const votes = new Map<EnvironmentId, number>();
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const rad = k === 0 ? 0 : HEX_SIZE * 0.6;
    const e = envAtPoint(biome, c.x + Math.cos(a) * rad, c.z + Math.sin(a) * rad);
    votes.set(e, (votes.get(e) ?? 0) + (k === 0 ? 1.5 : 1));
  }
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Build the hex resource map for the playable area. */
export function buildHexResources(seed: number, terrain: Heightfield, biome: Uint8Array): HexResources[] {
  const radius = Math.floor(terrain.size / 2 / (HEX_SIZE * 1.5));
  const half = terrain.size / 2 - HEX_SIZE;
  const out: HexResources[] = [];
  for (const h of hexesInRadius({ q: 0, r: 0 }, radius)) {
    const c = hexToWorld(h);
    if (Math.abs(c.x) > half || Math.abs(c.z) > half) continue;
    const env = classifyHex(h, biome);
    const e = ENVIRONMENT_BY_ID.get(env)!;
    const ground: Record<string, number> = {};
    const below: Record<string, number> = {};
    let ch = 0;
    for (const [id, abundance] of Object.entries(e.ground)) {
      ch++;
      const roll = hash01(seed, h.q * 131 + ch, h.r * 977);
      if (roll > abundance && abundance < 0.5) continue;
      const scale = RARITY_SCALE[MATERIAL_BY_ID.get(id)?.rarity ?? 'common'];
      const amount = Math.round(abundance * 160 * scale * (0.5 + hash01(seed + 7, h.q, h.r * 31 + ch)));
      if (amount > 0) ground[id] = amount;
    }
    for (const [id, abundance] of Object.entries(e.below)) {
      ch++;
      const roll = hash01(seed + 3, h.q * 557 + ch, h.r * 211);
      if (roll > abundance) continue;
      const scale = RARITY_SCALE[MATERIAL_BY_ID.get(id)?.rarity ?? 'common'];
      const amount = Math.round(400 * abundance * scale * (0.4 + hash01(seed + 11, h.q * 3, h.r + ch)));
      if (amount > 0) below[id] = amount;
    }
    out.push({ q: h.q, r: h.r, env, ground, groundMax: { ...ground }, below });
  }
  // Every world holds at least a little of everything its environments allow: rare
  // materials that missed every roll get a few small deposits where they belong.
  for (const layer of ['ground', 'below'] as const) {
    const present = new Set(out.flatMap((h) => Object.keys(h[layer])));
    const wanted = new Map<string, { env: EnvironmentId; abundance: number }[]>();
    for (const h of out)
      for (const [id, a] of Object.entries(ENVIRONMENT_BY_ID.get(h.env)![layer]))
        if (!present.has(id)) {
          if (!wanted.has(id)) wanted.set(id, []);
          wanted.get(id)!.push({ env: h.env, abundance: a });
        }
    for (const [id] of wanted) {
      const hosts = out.filter((h) => ENVIRONMENT_BY_ID.get(h.env)![layer][id] !== undefined);
      for (let k = 0; k < Math.min(3, hosts.length); k++) {
        const h = hosts[Math.floor(hash01(seed, k * 31 + id.length, id.charCodeAt(0)) * hosts.length)];
        const scale = RARITY_SCALE[MATERIAL_BY_ID.get(id)?.rarity ?? 'common'];
        const amount = Math.max(2, Math.round((layer === 'below' ? 60 : 12) * scale));
        h[layer][id] = (h[layer][id] ?? 0) + amount;
        if (layer === 'ground') h.groundMax[id] = h.ground[id];
      }
    }
  }
  return out;
}


/** Which species each prop model stands for. Bushes are split between berry bushes and thickets. */
function speciesFor(kind: PropKind): { kind: NodeKind; species?: string } | null {
  switch (kind) {
    case 'bush':
      return { kind: 'plant', species: 'thicket' };
    case 'berrybush':
      return { kind: 'plant', species: 'berry-bush' };
    case 'flowers':
      return { kind: 'plant', species: 'wild-herbs' };
    case 'apple':
      return { kind: 'plant', species: 'wild-apple' };
    case 'grain':
      return { kind: 'plant', species: 'wild-grain' };
    case 'tubers':
      return { kind: 'plant', species: 'wild-tubers' };
    case 'flax':
      return { kind: 'plant', species: 'wild-flax' };
    case 'rock':
    case 'boulder':
      return { kind: 'ground' };
  }
  if (FLORA_BY_ID.has(kind)) return { kind: 'plant', species: kind };
  const fixed = FAUNA.find((f) => f.prop === kind);
  if (fixed) return { kind: 'fixed', species: fixed.id };
  return null;
}

/** Resource nodes from props: every plant, hive, nest, shellfish bed and loose rock. */
export function buildNodes(seed: number, props: PropInstance[]): ResourceNode[] {
  const nodes: ResourceNode[] = [];
  props.forEach((p, i) => {
    const s = p.species ? (FLORA_BY_ID.has(p.species) ? { kind: 'plant' as NodeKind, species: p.species } : { kind: 'fixed' as NodeKind, species: p.species }) : speciesFor(p.kind);
    if (!s) return;
    let stock: Record<string, number>;
    if (s.kind === 'ground') {
      stock = p.kind === 'boulder' ? { stone: 10, flint: hash01(seed, i, 6) > 0.5 ? 3 : 0 } : hash01(seed, i, 5) > 0.6 ? { stone: 3, flint: 2 } : { stone: 4 };
    } else if (s.kind === 'plant') {
      stock = { ...FLORA_BY_ID.get(s.species!)!.yields };
    } else {
      stock = { ...FAUNA_BY_ID.get(s.species!)!.yields };
    }
    for (const k of Object.keys(stock)) if (!stock[k]) delete stock[k];
    // Larger plants hold a little more.
    if (s.kind === 'plant') for (const k of Object.keys(stock)) stock[k] = Math.max(1, Math.round(stock[k] * (0.7 + p.scale * 0.3)));
    nodes.push({ prop: i, kind: s.kind, species: s.species, x: p.x, z: p.z, stock, max: { ...stock } });
  });
  return nodes;
}

/**
 * Plants and fixed sources regrow at their own pace, scaled by the season; out of season,
 * fruit, grain and other perishables left on the plant spoil. Loose rocks and the ground
 * pool never grow back.
 */
export function regrowResources(nodes: ResourceNode[], season: number, dt: number): void {
  for (const n of nodes) {
    if (n.kind === 'ground' || !n.species) continue;
    const plant = n.kind === 'plant' ? FLORA_BY_ID.get(n.species)! : null;
    const animal = plant ? null : FAUNA_BY_ID.get(n.species)!;
    for (const id in n.max) {
      // Bees and birds are quiet in winter.
      const rate = plant
        ? ((plant.itemSeasons?.[id] ?? plant.seasons)[season] * dt) / plant.regrowSeconds
        : ((season === 3 ? 0.1 : 1) * dt) / (animal!.regrowSeconds ?? 2400);
      const cur = n.stock[id] ?? 0;
      if (rate > 0) {
        if (cur < n.max[id]) n.stock[id] = Math.min(n.max[id], cur + n.max[id] * rate);
      } else if (MATERIAL_BY_ID.get(id)?.perishable && cur > 0) {
        n.stock[id] = Math.max(0, cur - n.max[id] * (dt / 1200));
      }
    }
  }
}

