// A farm's field as drawn: a fence round a rectangle of whatever size the town needs, and
// inside it what the field is for: furrows and crops, rows of fruit trees, or grazing. A
// field still being cleared shows only its fence and marker stakes (the trees and rocks
// inside it vanish one by one as the workers clear them). Built flat here; town.ts fits it
// to the ground so fences and furrows run with the slope.

import * as THREE from 'three';
import { hash01 } from '../sim/rng';
import type { StructureView } from '../sim/protocol';
import { color, jitter, limb, merge, mix, part } from './geom';
import type { TownStyle } from './buildings';

type G = THREE.BufferGeometry;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const SOIL = color('#5e4630');
const CROPS: Record<string, { leaf: string; tip: string; h: number; gap: number }> = {
  crops: { leaf: '#8a9a3a', tip: '#d8b84a', h: 0.75, gap: 0.6 },
  fibre: { leaf: '#5f8a4a', tip: '#8fb0e0', h: 0.65, gap: 0.6 },
  spice: { leaf: '#4f7a34', tip: '#c8402a', h: 0.5, gap: 0.8 },
};

export function fieldGeometry(f: NonNullable<StructureView['field']>, style: TownStyle, seed: number): G {
  const parts: G[] = [];
  const hw = f.w / 2;
  const hd = f.d / 2;
  const wire = f.era >= 5;
  const wood = wire ? color('#6a6a66') : style.wood;

  // ---- Fence: posts round the edge with two rails, and a gate gap on the farmhouse side.
  const corners = [V(-hw, 0, -hd), V(hw, 0, -hd), V(hw, 0, hd), V(-hw, 0, hd)];
  for (let e = 0; e < 4; e++) {
    const a = corners[e];
    const b = corners[(e + 1) % 4];
    const len = a.distanceTo(b);
    const n = Math.max(2, Math.round(len / 2.2));
    for (let k = 0; k < n; k++) {
      const p = a.clone().lerp(b, k / n);
      const q = a.clone().lerp(b, (k + 1) / n);
      const lean = (hash01(seed, e, k) - 0.5) * 0.08;
      parts.push(part(limb(p, p.clone().add(V(lean, 1.02, lean)), 0.07, 0.055, 5), jitter(wood, 0.08, e, k, 1)));
      // The gate: the middle span of the side nearest the house stays open.
      if (e === 0 && k === Math.floor(n / 2)) continue;
      if (!f.planted && (k + e) % 3 === 0) continue; // still going up
      for (const y of wire ? [0.3, 0.6, 0.9] : [0.45, 0.85]) parts.push(part(limb(p.clone().setY(y), q.clone().setY(y + (hash01(seed, e, k, y * 10) - 0.5) * 0.06), wire ? 0.012 : 0.04, wire ? 0.012 : 0.035, 4), jitter(wood, 0.1, e, k, 2)));
    }
  }

  if (!f.planted) {
    // Marker stakes with a rag of cloth where the corners will be.
    for (const c of corners) {
      parts.push(part(limb(c, c.clone().add(V(0, 1.15, 0)), 0.05, 0.04, 5), style.wood));
      parts.push(part(new THREE.BoxGeometry(0.3, 0.18, 0.02).translate(c.x + 0.16, 1.05, c.z), style.cloth));
    }
    return merge(parts);
  }

  const crop = CROPS[f.kind];
  if (crop) {
    // ---- Furrows across the field, with a tuft of the crop every stride.
    const leaf = color(crop.leaf);
    const tip = color(crop.tip);
    const rows = Math.max(1, Math.floor((f.d - 1.2) / 1.1));
    const len = f.w - 1.4;
    for (let r = 0; r < rows; r++) {
      const z = -hd + 0.9 + ((f.d - 1.8) * (r + 0.5)) / rows - 0.3;
      const ridge = new THREE.BoxGeometry(len, 0.16, 0.6, Math.max(1, Math.ceil(len / 1.5)), 1, 1);
      ridge.translate(0, 0.03, z);
      parts.push(part(ridge, (p) => jitter(SOIL, 0.1, Math.floor(p.x * 2), r, 3)));
      const n = Math.floor(len / crop.gap);
      for (let k = 0; k < n; k++) {
        const x = -len / 2 + (k + 0.5) * crop.gap + (hash01(seed, r, k) - 0.5) * 0.15;
        const h = crop.h * (0.75 + hash01(seed, r, k, 2) * 0.5);
        const g = new THREE.ConeGeometry(0.16, h, 3, 1, true);
        g.rotateY(hash01(seed, r, k, 3) * 6);
        g.translate(x, 0.1 + h / 2, z + (hash01(seed, r, k, 4) - 0.5) * 0.12);
        parts.push(part(g, (p) => mix(leaf, tip, Math.max(0, (p.y - 0.1) / h - 0.45) * 1.8)));
      }
    }
  } else if (f.kind === 'orchard') {
    // ---- Rows of fruit trees.
    const sp = 3.4;
    const nx = Math.max(1, Math.floor((f.w - 2) / sp));
    const nz = Math.max(1, Math.floor((f.d - 2) / sp));
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const x = -hw + 1.6 + ((f.w - 3.2) * (i + 0.5)) / nx - (f.w - 3.2) / (2 * nx) + sp * 0.25;
        const z = -hd + 1.6 + ((f.d - 3.2) * (j + 0.5)) / nz - (f.d - 3.2) / (2 * nz) + sp * 0.25;
        const h = 1.5 + hash01(seed, i, j) * 0.5;
        parts.push(part(limb(V(x, 0, z), V(x + (hash01(seed, i, j, 2) - 0.5) * 0.2, h, z), 0.13, 0.09, 6, 0.05), color('#5a4030')));
        const crown = new THREE.IcosahedronGeometry(1, 1);
        crown.scale(1.15, 0.9, 1.15);
        crown.translate(x, h + 0.55, z);
        const fruit = [color('#c23a2a'), color('#d8a83a'), color('#8a3a5a')][(seed + i + j) % 3];
        parts.push(part(crown, (p) => (hash01(Math.round(p.x * 5), Math.round(p.y * 5), Math.round(p.z * 5)) > 0.9 ? fruit : jitter(color('#4f7a34'), 0.1, p.x * 4, p.y * 4, p.z * 4))));
      }
  } else {
    // ---- Pasture: cropped grass with tussocks, a trough and a hay rick.
    for (let k = 0; k < Math.min(90, (f.w * f.d) / 6); k++) {
      const x = (hash01(seed, k, 1) - 0.5) * (f.w - 1.5);
      const z = (hash01(seed, k, 2) - 0.5) * (f.d - 1.5);
      const g = new THREE.ConeGeometry(0.22, 0.3, 4, 1, true);
      g.translate(x, 0.15, z);
      parts.push(part(g, jitter(color('#6f8a3a'), 0.12, k, 1, 1)));
    }
    parts.push(part(new THREE.BoxGeometry(2, 0.45, 0.6).translate(-hw + 2, 0.22, -hd + 1.4), jitter(style.wood, 0.08, 1, 2, 3)), part(new THREE.BoxGeometry(1.8, 0.05, 0.4).translate(-hw + 2, 0.44, -hd + 1.4), color('#3f6f86')));
    const rick = new THREE.SphereGeometry(0.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    rick.scale(1, 1.15, 1);
    rick.translate(hw - 2, 0, -hd + 1.8);
    parts.push(part(rick, (p) => jitter(color('#c8a84a'), 0.1, p.x * 6, p.y * 9, p.z * 6)));
  }
  return merge(parts);
}
