// Fitting a model to uneven ground. Models are built on a flat plane; real ground is not
// flat. Rather than float or bury them, each model is fitted where it stands:
//   - anything tall (walls, posts, trunks, masts) is found by looking for parts that pass
//     through waist height, and grouped into rigid clumps: a house, a shed, each tree;
//   - every clump stands level at its own spot, cut a little into the uphill side, and a
//     clump big enough to be a building gets a stone footing that fills the downhill gap;
//   - everything low (fences, plots, piles, pits, paths) follows the ground, easing into
//     the clumps it touches.
// So a farm on a hillside keeps a level farmhouse on a footing while its fence and
// furrows run with the slope.

import * as THREE from 'three';
import type { Heightfield } from '../sim/terrain';
import { jitter, noise3, part } from './geom';

interface Clump {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  round: boolean;
  /** Tall enough to be a building (only those get footings). */
  tall: boolean;
}

const BAND_LO = 1.2;
const BAND_HI = 1.4;
const analysed = new WeakMap<THREE.BufferGeometry, Clump[]>();

/** The rigid clumps of a model: connected groups of parts that pass through waist height. */
function clumps(geo: THREE.BufferGeometry): Clump[] {
  const cached = analysed.get(geo);
  if (cached) return cached;
  const pos = geo.getAttribute('position');
  const a = pos.array as Float32Array;
  const cells = new Map<number, { minX: number; maxX: number; minZ: number; maxZ: number; maxR2: number[]; top: number }>();
  const key = (i: number, j: number) => (i + 512) * 1024 + (j + 512);
  const tris: { i0: number; i1: number; j0: number; j1: number; minX: number; maxX: number; minZ: number; maxZ: number; pts: number[]; top: number }[] = [];
  for (let t = 0; t + 8 < a.length; t += 9) {
    const y0 = a[t + 1];
    const y1 = a[t + 4];
    const y2 = a[t + 7];
    if (Math.min(y0, y1, y2) > BAND_HI || Math.max(y0, y1, y2) < BAND_LO) continue;
    const minX = Math.min(a[t], a[t + 3], a[t + 6]);
    const maxX = Math.max(a[t], a[t + 3], a[t + 6]);
    const minZ = Math.min(a[t + 2], a[t + 5], a[t + 8]);
    const maxZ = Math.max(a[t + 2], a[t + 5], a[t + 8]);
    tris.push({ i0: Math.floor(minX), i1: Math.floor(maxX), j0: Math.floor(minZ), j1: Math.floor(maxZ), minX, maxX, minZ, maxZ, pts: [a[t], a[t + 2], a[t + 3], a[t + 5], a[t + 6], a[t + 8]], top: Math.max(y0, y1, y2) });
  }
  // Union cells touched by the same triangle, then neighbouring cells.
  const parent = new Map<number, number>();
  const find = (k: number): number => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(k, r);
    return r;
  };
  const union = (p: number, q: number) => {
    const rp = find(p);
    const rq = find(q);
    if (rp !== rq) parent.set(rp, rq);
  };
  for (const t of tris) {
    let first = -1;
    const big = (t.i1 - t.i0 + 1) * (t.j1 - t.j0 + 1) > 60;
    for (let i = t.i0; i <= t.i1; i++)
      for (let j = t.j0; j <= t.j1; j++) {
        if (big && i !== t.i0 && i !== t.i1 && j !== t.j0 && j !== t.j1) continue;
        const k = key(i, j);
        if (!parent.has(k)) parent.set(k, k);
        if (first < 0) first = k;
        else union(k, first);
        let c = cells.get(k);
        if (!c) cells.set(k, (c = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, maxR2: [], top: 0 }));
        c.top = Math.max(c.top, t.top);
        c.minX = Math.min(c.minX, t.minX);
        c.maxX = Math.max(c.maxX, t.maxX);
        c.minZ = Math.min(c.minZ, t.minZ);
        c.maxZ = Math.max(c.maxZ, t.maxZ);
        c.maxR2.push(...t.pts);
      }
  }
  for (const k of parent.keys()) for (const d of [1, 1024, 1025, 1023]) if (parent.has(k + d)) union(k, k + d);
  const groups = new Map<number, Clump & { pts: number[]; top: number }>();
  for (const [k, c] of cells) {
    const r = find(k);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, round: false, tall: false, pts: [], top: 0 }));
    g.top = Math.max(g.top, c.top);
    g.minX = Math.min(g.minX, c.minX);
    g.maxX = Math.max(g.maxX, c.maxX);
    g.minZ = Math.min(g.minZ, c.minZ);
    g.maxZ = Math.max(g.maxZ, c.maxZ);
    g.pts.push(...c.maxR2);
  }
  const out: Clump[] = [];
  for (const g of groups.values()) {
    const cx = (g.minX + g.maxX) / 2;
    const cz = (g.minZ + g.maxZ) / 2;
    const w = g.maxX - g.minX;
    const d = g.maxZ - g.minZ;
    let maxR = 0;
    for (let i = 0; i < g.pts.length; i += 2) maxR = Math.max(maxR, Math.hypot(g.pts[i] - cx, g.pts[i + 1] - cz));
    out.push({ tall: g.top > 1.75, minX: g.minX, maxX: g.maxX, minZ: g.minZ, maxZ: g.maxZ, round: w / d > 0.8 && w / d < 1.25 && maxR < 0.82 * Math.hypot(w, d) * 0.5 });
  }
  analysed.set(geo, out);
  return out;
}

export interface Fitted {
  geometry: THREE.BufferGeometry;
  /** Stone footings under the buildings (null when the ground is level enough). */
  footing: THREE.BufferGeometry | null;
  minY: number;
  maxY: number;
}

/**
 * A copy of a model fitted to the ground at (x, z), turned by rot. The result is in the
 * frame of an object placed at (x, 0, z) with that rotation: its heights are world heights.
 */
export function fitToGround(geo: THREE.BufferGeometry, x: number, z: number, rot: number, terrain: Heightfield, stone: THREE.Color, opts: { floor?: number; rigid?: boolean } = {}): Fitted {
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const ground = (lx: number, lz: number) => terrain.sample(x + lx * cs + lz * sn, z - lx * sn + lz * cs);
  const list = opts.rigid ? [] : clumps(geo);
  // Where each clump stands: level, cut a little into the uphill side.
  const level: number[] = [];
  const low: number[] = [];
  for (const c of list) {
    let lo = Infinity;
    let hi = -Infinity;
    const small = Math.max(c.maxX - c.minX, c.maxZ - c.minZ) < 1.5;
    const n = small ? 1 : 4;
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++) {
        const h = small ? ground((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2) : ground(c.minX + ((c.maxX - c.minX) * i) / n, c.minZ + ((c.maxZ - c.minZ) * j) / n);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    let at = lo + (hi - lo) * 0.65;
    if (opts.floor !== undefined) at = Math.max(at, opts.floor);
    level.push(at);
    low.push(lo);
  }
  const out = geo.clone();
  const pos = out.getAttribute('position');
  const a = pos.array as Float32Array;
  let minY = Infinity;
  let maxY = -Infinity;
  const whole = opts.rigid ? Math.max(ground(0, 0), opts.floor ?? -Infinity) : 0;
  for (let i = 0; i < a.length; i += 3) {
    const lx = a[i];
    const ly = a[i + 1];
    const lz = a[i + 2];
    let base: number;
    if (opts.rigid) base = whole;
    else {
      let best = -1;
      let bestD = Infinity;
      for (let k = 0; k < list.length; k++) {
        const c = list[k];
        const d = Math.hypot(Math.max(c.minX - lx, 0, lx - c.maxX), Math.max(c.minZ - lz, 0, lz - c.maxZ));
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      if (best < 0) base = ground(lx, lz);
      else if (ly >= BAND_LO || bestD === 0) base = level[best];
      else {
        const w = Math.min(1, bestD / 1.5);
        const s = w * w * (3 - 2 * w);
        base = level[best] + (ground(lx, lz) - level[best]) * s;
      }
    }
    const y = ly + base;
    a[i + 1] = y;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  pos.needsUpdate = true;
  out.computeBoundingSphere();
  out.computeBoundingBox();
  // Footings: rubble stone under any building whose downhill side would hang in the air.
  const feet: THREE.BufferGeometry[] = [];
  list.forEach((c, k) => {
    const w = c.maxX - c.minX;
    const d = c.maxZ - c.minZ;
    const drop = level[k] - low[k];
    if (!c.tall || Math.min(w, d) < 1.8 || drop < 0.12) return;
    const h = drop + 0.45;
    const g = c.round ? new THREE.CylinderGeometry(w / 2 + 0.18, w / 2 + 0.3, h, 20, 2) : new THREE.BoxGeometry(w + 0.3, h, d + 0.3, Math.ceil(w), 2, Math.ceil(d));
    g.translate((c.minX + c.maxX) / 2, level[k] + 0.03 - h / 2, (c.minZ + c.maxZ) / 2);
    feet.push(part(g, (p) => jitter(stone.clone().multiplyScalar(0.8 + (noise3(p.x * 1.8, p.y * 2.6, p.z * 1.8) * 0.5 + 0.5) * 0.3), 0.1, Math.floor(p.x * 2.5), Math.floor(p.y * 3.5), Math.floor(p.z * 2.5))));
    minY = Math.min(minY, level[k] - h);
  });
  let footing: THREE.BufferGeometry | null = null;
  if (feet.length) {
    footing = feet[0];
    if (feet.length > 1) {
      // Merge by hand: same attributes throughout.
      const total = feet.reduce((n, g) => n + g.getAttribute('position').count, 0);
      const P = new Float32Array(total * 3);
      const N = new Float32Array(total * 3);
      const C = new Float32Array(total * 3);
      let o = 0;
      for (const g of feet) {
        P.set(g.getAttribute('position').array as Float32Array, o);
        N.set(g.getAttribute('normal').array as Float32Array, o);
        C.set(g.getAttribute('color').array as Float32Array, o);
        o += g.getAttribute('position').count * 3;
      }
      footing = new THREE.BufferGeometry();
      footing.setAttribute('position', new THREE.BufferAttribute(P, 3));
      footing.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      footing.setAttribute('color', new THREE.BufferAttribute(C, 3));
    }
  }
  return { geometry: out, footing, minY, maxY };
}
