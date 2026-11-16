// Fields: farms, orchards, plantations and pastures are a farmhouse with a fenced field
// beside it. The field is as big as the town's demand calls for and the land allows. Before
// anything is planted, workers clear it: trees are felled, brush cut and rocks carried off
// (the timber and stone are kept). Fields grow when the town needs more and are left
// partly fallow when it needs less.

import type { Structure } from './town';
import type { World } from './world';

export type FieldKind = 'crops' | 'fibre' | 'orchard' | 'spice' | 'pasture';

export interface Field {
  /** Centre, size and turn of the fenced rectangle (w across, d away from the farmhouse). */
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
  kind: FieldKind;
  /** Plants and rocks still to be cleared (indices into props). */
  clear: number[];
  /** Cleared and planted: only then does the farm produce. */
  planted: boolean;
  /** No room left to grow here (the town may start another farm instead). */
  full?: boolean;
}

export const FIELD_LINES: Readonly<Record<string, { kind: FieldKind; outputs: string[]; perPerson: number; min: number; max: number }>> = {
  farm: { kind: 'crops', outputs: ['wild-grain', 'roots'], perPerson: 14, min: 64, max: 1600 },
  'fibre-farm': { kind: 'fibre', outputs: ['flax', 'cotton', 'hemp'], perPerson: 5, min: 49, max: 600 },
  orchard: { kind: 'orchard', outputs: ['wild-fruit', 'nuts', 'berries'], perPerson: 8, min: 81, max: 1000 },
  spices: { kind: 'spice', outputs: ['spices'], perPerson: 2, min: 36, max: 300 },
  pasture: { kind: 'pasture', outputs: ['wool', 'milk', 'game-meat', 'hides'], perPerson: 12, min: 100, max: 1400 },
};

/** The farmhouse's own footprint. */
export const FARMSTEAD_R = 3.6;

/** Things that cannot be cleared away: a field must go round them. */
const SACRED = new Set(['spirit', 'beehive']);
/** Small plants that are simply ploughed in. */
const PLOUGHED_IN = new Set(['flowers', 'grain', 'tubers', 'flax', 'mushrooms', 'nest']);
/** What clearing something yields, and how long it takes. */
export const CLEARING: Readonly<Record<string, { item?: string; amount?: number; seconds: number }>> = {
  oak: { item: 'hardwood', amount: 6, seconds: 45 }, apple: { item: 'hardwood', amount: 3, seconds: 35 }, birch: { item: 'hardwood', amount: 4, seconds: 35 },
  tropical: { item: 'hardwood', amount: 5, seconds: 45 }, pine: { item: 'softwood', amount: 6, seconds: 40 }, bamboo: { item: 'softwood', amount: 2, seconds: 20 },
  hazel: { item: 'softwood', amount: 1, seconds: 15 }, boulder: { item: 'stone', amount: 8, seconds: 60 }, rock: { item: 'stone', amount: 2, seconds: 20 },
};

/** How much field a line wants, from the people to feed or clothe and how short the town is. */
export function wantedArea(world: World, line: string, needs: Record<string, number>): number {
  const f = FIELD_LINES[line];
  const need = Math.max(0, ...f.outputs.map((id) => needs[id] ?? 0));
  const farms = Math.max(1, world.structures.filter((s) => s.line === line).length);
  return Math.max(f.min, Math.min(f.max, (world.villagers.length * f.perPerson * (0.6 + Math.min(1, need) * 0.9)) / farms));
}

export function fieldArea(f: Field): number {
  return f.w * f.d;
}

/** A point in the field's own frame (u across, v away from the farmhouse) as a world point. */
function toWorld(f: { x: number; z: number; rot: number }, u: number, v: number): { x: number; z: number } {
  const c = Math.cos(f.rot);
  const s = Math.sin(f.rot);
  return { x: f.x + u * c + v * s, z: f.z - u * s + v * c };
}

export function inField(f: Field, x: number, z: number, margin = 0): boolean {
  const c = Math.cos(f.rot);
  const s = Math.sin(f.rot);
  const dx = x - f.x;
  const dz = z - f.z;
  const u = dx * c - dz * s;
  const v = dx * s + dz * c;
  return Math.abs(u) <= f.w / 2 + margin && Math.abs(v) <= f.d / 2 + margin;
}

/** Is a point inside any field (but one)? */
export function inAnyField(world: World, x: number, z: number, margin = 0, but?: Structure): boolean {
  for (const s of world.structures) if (s !== but && s.field && inField(s.field, x, z, margin)) return true;
  return false;
}

/** Can a field of this shape lie here: dry, not too steep, clear of buildings, streets and other fields? */
function fits(world: World, owner: { x: number; z: number; id?: number }, f: { x: number; z: number; w: number; d: number; rot: number }, avoid: (x: number, z: number) => boolean): boolean {
  const t = world.terrain;
  const nu = Math.max(2, Math.ceil(f.w / 3));
  const nv = Math.max(2, Math.ceil(f.d / 3));
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const p = toWorld(f, -f.w / 2 + (f.w * i) / nu, -f.d / 2 + (f.d * j) / nv);
      const half = t.size / 2 - 4;
      if (Math.abs(p.x) > half || Math.abs(p.z) > half) return false;
      if (t.sample(p.x, p.z) < t.waterLevel + 0.35 || t.slope(p.x, p.z) > 0.5) return false;
      if (avoid(p.x, p.z)) return false;
      for (const s of world.structures) {
        if (s.id === owner.id) continue;
        if (Math.hypot(s.x - p.x, s.z - p.z) < 5) return false;
        if (s.field && inField(s.field, p.x, p.z, 1.5)) return false;
      }
    }
  for (const p of world.props) if (SACRED.has(p.kind) && inField({ ...f, kind: 'crops', clear: [], planted: false }, p.x, p.z, 2)) return false;
  return true;
}

/** Everything standing in a field that has to go before planting. */
function obstacles(world: World, f: Field): number[] {
  const out: number[] = [];
  const reach = Math.hypot(f.w, f.d) / 2 + 2;
  world.props.forEach((p, i) => {
    if (Math.abs(p.x - f.x) > reach || Math.abs(p.z - f.z) > reach) return;
    if (PLOUGHED_IN.has(p.kind) || world.cleared.includes(i)) return;
    // Orchards keep fruit trees that already stand there.
    if (f.kind === 'orchard' && p.kind === 'apple') return;
    if (inField(f, p.x, p.z, 0.6)) out.push(i);
  });
  return out;
}

/**
 * Lay out a field of about `area` beside a farmhouse at (x, z) facing `rot`: behind it for
 * choice, else to either side, shrinking until it fits. Null when even the smallest will not.
 */
export function layoutField(world: World, house: { x: number; z: number; rot: number; id?: number }, kind: FieldKind, area: number, min: number, avoid: (x: number, z: number) => boolean = () => false): Field | null {
  for (let a = area; a >= min * 0.98; a *= 0.82) {
    for (const aspect of [1.4, 1, 2]) {
      const w = Math.sqrt(a * aspect);
      const d = a / w;
      // Behind, right, left of the house (never in front of the door).
      for (const side of [Math.PI, Math.PI / 2, -Math.PI / 2]) {
        const dir = house.rot + side;
        const off = FARMSTEAD_R + 1.5 + d / 2;
        const f = { x: house.x + Math.sin(dir) * off, z: house.z + Math.cos(dir) * off, w, d, rot: dir };
        if (!fits(world, house, f, avoid)) continue;
        const field: Field = { ...f, kind, clear: [], planted: false };
        field.clear = obstacles(world, field);
        return field;
      }
    }
  }
  return null;
}

/** Take a cleared plant or rock out of the world, keeping what it yields. */
export function clearProp(world: World, index: number): void {
  if (world.cleared.includes(index)) return;
  world.cleared.push(index);
  const p = world.props[index];
  const y = CLEARING[p.kind];
  if (y?.item) world.stockpile[y.item] = (world.stockpile[y.item] ?? 0) + (y.amount ?? 1);
  const n = world.nodes.find((x) => x.prop === index);
  if (n) {
    n.stock = {};
    n.max = {};
  }
}

/** Mark a planted crop field in the walking map: bare soil that people keep off. */
export function stampField(world: World, f: Field): void {
  if (!f.planted || f.kind === 'pasture' || f.kind === 'orchard') return;
  const nav = world.nav;
  const nu = Math.ceil(f.w / 1.5);
  const nv = Math.ceil(f.d / 1.5);
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const p = toWorld(f, -f.w / 2 + (f.w * i) / nu, -f.d / 2 + (f.d * j) / nv);
      nav.setField(p.x, p.z);
    }
}

/**
 * Daily: fields grow toward what the town wants of them (new ground has to be cleared) and
 * shrink when much less is wanted, the rest left fallow.
 */
export function resizeFields(world: World, needs: Record<string, number>, avoid: (x: number, z: number) => boolean, log: (text: string) => void): void {
  for (const s of world.structures) {
    const f = s.field;
    if (!f || s.tier < 0 || !f.planted || f.clear.length) continue;
    const spec = FIELD_LINES[s.line];
    const want = wantedArea(world, s.line, needs);
    const area = fieldArea(f);
    if (want > area * 1.3) {
      const bigger = layoutField(world, s, f.kind, Math.min(want, area * 1.6), area * 1.15, avoid);
      if (bigger && fieldArea(bigger) > area * 1.1) {
        bigger.planted = true;
        s.field = bigger;
        world.structuresVersion++;
        log(`The ${f.kind === 'pasture' ? 'pasture' : f.kind === 'orchard' ? 'orchard' : 'fields'} ${bigger.clear.length ? 'are being cleared to grow' : 'grew'}: the town needs more.`);
      } else f.full = true;
    } else if (want < area * 0.55 && area > spec.min * 1.2) {
      const smaller = layoutField(world, s, f.kind, Math.max(spec.min, area * 0.7), spec.min, avoid);
      if (smaller) {
        smaller.planted = true;
        smaller.clear = [];
        s.field = smaller;
        world.structuresVersion++;
        log(`Part of the ${f.kind === 'pasture' ? 'pasture' : f.kind === 'orchard' ? 'orchard' : 'fields'} was left fallow: less is needed.`);
      }
    }
  }
}
