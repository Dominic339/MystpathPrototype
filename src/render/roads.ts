// Planned streets as drawn: ribbons laid on the ground along each street, as wide as the
// street is important, surfaced by its tier: packed earth, gravel, cobbles, macadam,
// asphalt, and at the last a softly glowing levitation lane.

import * as THREE from 'three';
import type { Heightfield } from '../sim/terrain';
import { hash01 } from '../sim/rng';
import { natureMaterial } from './materials';

export interface StreetView {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  kind: 'main' | 'side' | 'lane';
  tier: number;
}

const WIDTH = { main: 3.4, side: 2.6, lane: 1.6 } as const;
const SURFACE = ['#8a7254', '#8a7254', '#93886f', '#8f8c86', '#75716c', '#434448', '#cdeee8'].map((c) => new THREE.Color(c));
const MATERIAL = natureMaterial({ roughness: 0.95 });
MATERIAL.polygonOffset = true;
MATERIAL.polygonOffsetFactor = -4;
MATERIAL.polygonOffsetUnits = -4;

export interface RoadsView {
  group: THREE.Group;
  set: (streets: StreetView[]) => void;
}

export function buildRoads(terrain: Heightfield): RoadsView {
  const group = new THREE.Group();
  group.name = 'roads';
  let mesh: THREE.Mesh | null = null;
  return {
    group,
    set(streets) {
      if (mesh) {
        group.remove(mesh);
        mesh.geometry.dispose();
        mesh = null;
      }
      if (!streets.length) return;
      const pos: number[] = [];
      const col: number[] = [];
      const nor: number[] = [];
      const c = new THREE.Color();
      const vert = (x: number, z: number, lift: number, base: THREE.Color, edge: number, tier: number) => {
        pos.push(x, terrain.sample(x, z) + lift, z);
        nor.push(0, 1, 0);
        // Cobbles and gravel are speckled stone by stone; edges are dustier.
        const grain = tier === 3 ? 2.2 : tier === 2 ? 3.5 : 1.2;
        const speck = (hash01(Math.floor(x * grain), Math.floor(z * grain), tier) - 0.5) * (tier === 3 ? 0.22 : tier >= 4 ? 0.05 : 0.12);
        c.copy(base).multiplyScalar(1 + speck - edge * 0.12);
        if (tier === 6 && edge) c.set('#6fe6d6');
        col.push(c.r, c.g, c.b);
      };
      const quad = (a: number[], b: number[], cc: number[], d: number[], base: THREE.Color, ea: number, eb: number, tier: number, lift: number) => {
        // a-b across at one station, d-cc across at the next.
        for (const [p, e] of [[a, ea], [b, eb], [cc, eb], [a, ea], [cc, eb], [d, ea]] as const) vert(p[0], p[1], lift, base, e, tier);
      };
      for (const s of streets) {
        const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
        if (len < 0.3) continue;
        const ux = (s.bx - s.ax) / len;
        const uz = (s.bz - s.az) / len;
        const hw = WIDTH[s.kind] / 2;
        const base = SURFACE[Math.min(SURFACE.length - 1, s.tier)];
        // Lanes lie under side streets, side streets under main streets, so junctions look right.
        const lift = s.kind === 'main' ? 0.11 : s.kind === 'side' ? 0.09 : 0.07;
        const n = Math.max(1, Math.ceil(len / 0.8));
        const at = (k: number, o: number): number[] => {
          const d = (len * k) / n;
          return [s.ax + ux * d - uz * o, s.az + uz * d + ux * o];
        };
        for (let k = 0; k < n; k++) {
          // Three strips across: edge, crown, edge.
          quad(at(k, -hw), at(k, -hw * 0.5), at(k + 1, -hw * 0.5), at(k + 1, -hw), base, 1, 0, s.tier, lift);
          quad(at(k, -hw * 0.5), at(k, hw * 0.5), at(k + 1, hw * 0.5), at(k + 1, -hw * 0.5), base, 0, 0, s.tier, lift + 0.02);
          quad(at(k, hw * 0.5), at(k, hw), at(k + 1, hw), at(k + 1, hw * 0.5), base, 0, 1, s.tier, lift);
        }
        // Round ends, so streets meeting at a bend or a junction close up.
        for (const [ex, ez] of [[s.ax, s.az], [s.bx, s.bz]]) {
          for (let k = 0; k < 10; k++) {
            const a0 = (k / 10) * Math.PI * 2;
            const a1 = ((k + 1) / 10) * Math.PI * 2;
            vert(ex, ez, lift + 0.02, base, 0, s.tier);
            vert(ex + Math.sin(a1) * hw, ez + Math.cos(a1) * hw, lift, base, 1, s.tier);
            vert(ex + Math.sin(a0) * hw, ez + Math.cos(a0) * hw, lift, base, 1, s.tier);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      mesh = new THREE.Mesh(g, MATERIAL);
      mesh.receiveShadow = true;
      group.add(mesh);
    },
  };
}
