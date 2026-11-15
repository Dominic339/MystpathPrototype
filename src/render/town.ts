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
import { natureMaterial } from './materials';

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
    const geo = buildingGeometry(model, kind, style, v.variant);
    const box = geo.boundingBox!;
    const height = box.max.y - Math.min(0, box.min.y);
    const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
    // Sit on the lowest corner of the footprint so nothing floats on a slope.
    let baseY = Infinity;
    for (const [dx, dz] of [[0, 0], [radius * 0.7, 0], [-radius * 0.7, 0], [0, radius * 0.7], [0, -radius * 0.7]]) baseY = Math.min(baseY, terrain.sample(v.x + dx, v.z + dz));
    if (kind === 'port') baseY = Math.max(baseY, terrain.waterLevel + 0.05);
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
    if (v.built < 1) {
      const sc = new THREE.Mesh(scaffoldGeometry(Math.max(2, radius * 0.9), Math.max(2.5, height * 0.9), style), MATERIAL);
      sc.castShadow = true;
      root.add(sc);
    }
    const kept = KEPT[model];
    if (kept && v.animals > 0) {
      for (let k = 0; k < Math.min(v.animals, 10); k++) {
        const g = staticAnimalGeometry(kept.species, k);
        if (!g) continue;
        const m = new THREE.Mesh(g, ANIMAL_MATERIAL);
        const a = k * 2.4 + v.variant;
        const r = kept.spread * (0.3 + ((k * 37) % 10) / 14);
        m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r * 0.8);
        m.rotation.y = a * 1.7;
        m.castShadow = true;
        root.add(m);
      }
    }
    root.position.set(v.x, baseY - 0.04, v.z);
    root.rotation.y = v.rot;
    group.add(root);
    return { key: entryKey(v), group: root, clip, height, baseY };
  };

  const entryKey = (v: StructureView) => `${v.model}|${v.previous && v.built < 0.5 ? v.previous : ''}|${v.built >= 1}|${v.variant}|${v.animals}`;

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
  });
}
