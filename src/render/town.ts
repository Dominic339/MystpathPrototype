// The town as drawn: every building the simulation reports, placed on the terrain in the
// town's style. Buildings under construction rise out of the ground behind scaffolding (a
// clipping plane follows the construction progress); an upgrade keeps the old building up
// until the new one is half done. Kept animals stand in their folds and pens.

import * as THREE from 'three';
import { LINE_BY_ID } from '../sim/data/structures';
import type { StructureView } from '../sim/protocol';
import type { Heightfield } from '../sim/terrain';
import { ANIMAL_MATERIAL, staticAnimalGeometry } from './animals';
import { buildingGeometry, scaffoldGeometry, type TownStyle } from './buildings';
import { natureMaterial, rockShape } from './materials';
import { color, jitter, merge, part } from './geom';
import { fitToGround } from './siting';
import { fieldGeometry } from './fields';

// The same grained material as the tents and the rest of the camp.
const newMaterial = () => natureMaterial({ roughness: 0.92, side: THREE.DoubleSide });
const MATERIAL = newMaterial();

interface Entry {
  key: string;
  group: THREE.Group;
  clip: THREE.Plane | null;
  height: number;
  baseY: number;
}

const KEPT: Record<string, { species: string; spread: number }> = {
  fold: { species: 'wild-goat', spread: 4.2 },
  pigsty: { species: 'wild-boar', spread: 2 },
  coop: { species: 'wild-fowl', spread: 1.8 },
  'cattle-pasture': { species: 'aurochs', spread: 4.5 },
};

/** What each kind of deposit looks like piled up. */
const HEAP_COLOURS: Record<string, string> = {
  'iron-ore': '#7a4a3a', 'copper-ore': '#5a8a72', 'tin-ore': '#6a6a70', 'lead-ore': '#5a5e6a', 'zinc-ore': '#8a8a7a', 'silver-ore': '#b8bcc4', gold: '#c8a83a', coal: '#22201e', lignite: '#3a2e26',
  limestone: '#d8d2c0', sandstone: '#c8a878', marble: '#ecebe6', slate: '#4b5159', basalt: '#3e4046', chalk: '#f0eee6', 'rock-salt': '#e8dcd8', sulfur: '#d8c23a', saltpeter: '#e6e2d6', borax: '#e8e8e0',
  potash: '#d8b8a8', clay: '#9a6a48', kaolin: '#e8e2d8', sand: '#d8c690', gravel: '#9a948a', quartz: '#e0e4ea', graphite: '#3a3c40', 'mana-crystal': '#6fe6d6', bauxite: '#a8573a', cinnabar: '#b83a2a',
};
function heapGeometry(deposit: string, size: number, seed: number): THREE.BufferGeometry {
  const c = color(HEAP_COLOURS[deposit] ?? '#8a8478');
  const parts: THREE.BufferGeometry[] = [];
  // The yield, in a neat pile, and the grey spoil tipped beside it.
  for (const [dx, dz, r, col] of [[4.6, 2.2, size, c], [5.4, -1.2, size * 1.25, color('#6f675c')]] as const) {
    const g = new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1, 0.62, 1);
    g.translate(dx, -0.05, dz);
    parts.push(part(g, (p) => jitter(col, 0.1, p.x * 5, p.y * 5, p.z * 5)));
  }
  for (let k = 0; k < 5; k++) {
    const st = rockShape(0.16 + ((seed * 7 + k * 13) % 10) / 80, seed * 17 + k);
    st.translate(4.6 + Math.cos(k * 1.9) * size * 0.9, 0.08, 2.2 + Math.sin(k * 1.9) * size * 0.9);
    parts.push(part(st, (p) => jitter(c, 0.12, p.x * 6, p.y * 6, p.z * 6)));
  }
  return merge(parts);
}

export interface TownView {
  group: THREE.Group;
  setStructures: (list: StructureView[]) => void;
  /** Names of buildings near a point, for the hex card. */
  count: () => number;
}

export function buildTown(terrain: Heightfield, style: TownStyle): TownView {
  const group = new THREE.Group();
  group.name = 'town';
  const entries = new Map<number, Entry>();

  const make = (v: StructureView): Entry => {
    const kind = LINE_BY_ID.get(v.line)?.kind ?? 'processing';
    const root = new THREE.Group();
    const showOld = v.previous && v.built < 0.5;
    const model = showOld ? v.previous! : v.model;
    const base = buildingGeometry(model, kind, style, v.variant);
    const box = base.boundingBox!;
    const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
    // Fit the model to the ground it stands on (ports stand level at the waterline).
    const fit = fitToGround(base, v.x, v.z, v.rot, terrain, style.stone, kind === 'port' ? { rigid: true, floor: terrain.waterLevel + 0.05 } : {});
    const geo = fit.geometry;
    geo.userData.own = true;
    if (fit.footing) fit.footing.userData.own = true;
    const baseY = fit.minY;
    const height = fit.maxY - fit.minY;
    const here = terrain.sample(v.x, v.z);
    const cs = Math.cos(v.rot);
    const sn = Math.sin(v.rot);
    const groundAt = (lx: number, lz: number) => terrain.sample(v.x + lx * cs + lz * sn, v.z - lx * sn + lz * cs);
    let clip: THREE.Plane | null = null;
    let mat: THREE.Material = MATERIAL;
    const rising = v.built < 1 && !showOld;
    if (rising) {
      clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), baseY + 0.05 + height * v.built);
      const m = newMaterial();
      m.clippingPlanes = [clip];
      m.clipShadows = true;
      mat = m;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    if (fit.footing) {
      const f = new THREE.Mesh(fit.footing, MATERIAL);
      f.castShadow = true;
      f.receiveShadow = true;
      root.add(f);
    }
    if (v.built < 1) {
      const sc = new THREE.Mesh(scaffoldGeometry(Math.max(2, radius * 0.9), Math.max(2.5, (box.max.y - Math.min(0, box.min.y)) * 0.9), style), MATERIAL);
      sc.castShadow = true;
      sc.position.y = here - 0.04;
      root.add(sc);
    }
    // A working's heaps grow as it is dug: spoil, and a pile of what it yields.
    if (v.deposit && (v.heap ?? 0) > 0 && v.built >= 1) {
      const size = 0.7 + (v.heap ?? 0) * 0.35;
      const heap = fitToGround(heapGeometry(v.deposit, size, v.id), v.x, v.z, v.rot, terrain, style.stone);
      heap.geometry.userData.own = true;
      const hm = new THREE.Mesh(heap.geometry, MATERIAL);
      hm.castShadow = true;
      hm.receiveShadow = true;
      root.add(hm);
    }
    // The field: its own piece of ground beside the farmhouse, fitted to the slope.
    if (v.field) {
      const fg = fitToGround(fieldGeometry(v.field, style, v.id), v.field.x, v.field.z, v.field.rot, terrain, style.stone);
      fg.geometry.userData.own = true;
      const fm = new THREE.Mesh(fg.geometry, MATERIAL);
      fm.castShadow = true;
      fm.receiveShadow = true;
      // The field has its own place and turn: undo the farmhouse's.
      const holder = new THREE.Group();
      holder.add(fm);
      holder.position.set(v.field.x - v.x, 0, v.field.z - v.z);
      holder.rotation.y = v.field.rot;
      const un = new THREE.Group();
      un.rotation.y = -v.rot;
      // Rotate the offset into the farmhouse's frame by parenting through an un-turned group.
      un.add(holder);
      root.add(un);
      if (v.field.species && v.field.planted && v.animals > 0) {
        for (let k = 0; k < Math.min(v.animals, 12); k++) {
          const g = staticAnimalGeometry(v.field.species, k);
          if (!g) continue;
          const m = new THREE.Mesh(g, ANIMAL_MATERIAL);
          const lx = (((k * 37 + v.id * 11) % 100) / 100 - 0.5) * (v.field.w - 3);
          const lz = (((k * 53 + v.id * 7) % 100) / 100 - 0.5) * (v.field.d - 3);
          const fc = Math.cos(v.field.rot);
          const fs = Math.sin(v.field.rot);
          m.position.set(lx, terrain.sample(v.field.x + lx * fc + lz * fs, v.field.z - lx * fs + lz * fc), lz);
          m.rotation.y = k * 1.7;
          m.castShadow = true;
          holder.add(m);
        }
      }
    }
    const kept = KEPT[model];
    if (kept && v.animals > 0) {
      for (let k = 0; k < Math.min(v.animals, 10); k++) {
        const g = staticAnimalGeometry(kept.species, k);
        if (!g) continue;
        const m = new THREE.Mesh(g, ANIMAL_MATERIAL);
        const a = k * 2.4 + v.variant;
        const r = kept.spread * (0.3 + ((k * 37) % 10) / 14);
        m.position.set(Math.cos(a) * r, groundAt(Math.cos(a) * r, Math.sin(a) * r * 0.8), Math.sin(a) * r * 0.8);
        m.rotation.y = a * 1.7;
        m.castShadow = true;
        root.add(m);
      }
    }
    root.position.set(v.x, 0, v.z);
    root.rotation.y = v.rot;
    group.add(root);
    return { key: entryKey(v), group: root, clip, height, baseY };
  };

  const entryKey = (v: StructureView) => `${v.field ? `${v.field.w.toFixed(1)}x${v.field.d.toFixed(1)}@${v.field.x.toFixed(0)},${v.field.z.toFixed(0)}${v.field.planted}` : ''}|${v.deposit ?? ''}${v.heap ?? 0}|${v.model}|${v.previous && v.built < 0.5 ? v.previous : ''}|${v.built >= 1}|${v.variant}|${v.animals}`;

  return {
    group,
    count: () => entries.size,
    setStructures(list) {
      const seen = new Set<number>();
      for (const v of list) {
        seen.add(v.id);
        const e = entries.get(v.id);
        if (e && e.key === entryKey(v)) {
          // Same building, still going up: raise the clip.
          if (e.clip) e.clip.constant = e.baseY + 0.05 + e.height * v.built;
          continue;
        }
        if (e) {
          group.remove(e.group);
          disposeGroup(e.group);
        }
        entries.set(v.id, make(v));
      }
      for (const [id, e] of entries)
        if (!seen.has(id)) {
          group.remove(e.group);
          disposeGroup(e.group);
          entries.delete(id);
        }
    },
  };
}

function disposeGroup(g: THREE.Group): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.material && m.material !== MATERIAL && m.material !== ANIMAL_MATERIAL) (m.material as THREE.Material).dispose();
    if (m.geometry?.userData.own) m.geometry.dispose();
  });
}
