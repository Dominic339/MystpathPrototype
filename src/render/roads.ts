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
  chain?: number;
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
      // One smooth ribbon along a run of points: corners are rounded off, and the ribbon's
      // edges are mitred so it bends without gaps or overlaps.
      const ribbon = (raw: { x: number; z: number }[], hw: number, tier: number, lift: number, capStart: boolean, capEnd: boolean) => {
        // Round the corners (keeping both ends where they are).
        let pts = raw;
        for (let pass = 0; pass < 3 && pts.length > 2; pass++) {
          const next = [pts[0]];
          for (let k = 0; k < pts.length - 1; k++) {
            const p = pts[k];
            const q = pts[k + 1];
            if (k > 0) next.push({ x: p.x * 0.75 + q.x * 0.25, z: p.z * 0.75 + q.z * 0.25 });
            if (k < pts.length - 2) next.push({ x: p.x * 0.25 + q.x * 0.75, z: p.z * 0.25 + q.z * 0.75 });
          }
          next.push(pts[pts.length - 1]);
          pts = next;
        }
        // Stations every stride along it.
        const st: { x: number; z: number }[] = [pts[0]];
        for (let k = 0; k < pts.length - 1; k++) {
          const len = Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z);
          const n = Math.max(1, Math.ceil(len / 0.8));
          for (let i = 1; i <= n; i++) st.push({ x: pts[k].x + ((pts[k + 1].x - pts[k].x) * i) / n, z: pts[k].z + ((pts[k + 1].z - pts[k].z) * i) / n });
        }
        if (st.length < 2) return;
        const base = SURFACE[Math.min(SURFACE.length - 1, tier)];
        const across = st.map((p, k) => {
          const a = st[Math.max(0, k - 1)];
          const b = st[Math.min(st.length - 1, k + 1)];
          const d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          return { nx: -(b.z - a.z) / d, nz: (b.x - a.x) / d, p };
        });
        const at = (k: number, o: number): number[] => [across[k].p.x + across[k].nx * o, across[k].p.z + across[k].nz * o];
        for (let k = 0; k < st.length - 1; k++) {
          quad(at(k, -hw), at(k, -hw * 0.5), at(k + 1, -hw * 0.5), at(k + 1, -hw), base, 1, 0, tier, lift);
          quad(at(k, -hw * 0.5), at(k, hw * 0.5), at(k + 1, hw * 0.5), at(k + 1, -hw * 0.5), base, 0, 0, tier, lift + 0.02);
          quad(at(k, hw * 0.5), at(k, hw), at(k + 1, hw), at(k + 1, hw * 0.5), base, 0, 1, tier, lift);
        }
        const cap = (p: { x: number; z: number }, r: number) => {
          for (let k = 0; k < 12; k++) {
            const a0 = (k / 12) * Math.PI * 2;
            const a1 = ((k + 1) / 12) * Math.PI * 2;
            vert(p.x, p.z, lift + 0.02, base, 0, tier);
            vert(p.x + Math.sin(a1) * r, p.z + Math.cos(a1) * r, lift, base, 1, tier);
            vert(p.x + Math.sin(a0) * r, p.z + Math.cos(a0) * r, lift, base, 1, tier);
          }
        };
        if (capStart) cap(st[0], hw);
        if (capEnd) cap(st[st.length - 1], hw);
      };
      // Lanes: each is one path from a door to the street it joins. Streets: straight runs,
      // their ends closed with a round so corners and crossings meet cleanly.
      const chains = new Map<number, StreetView[]>();
      for (const s of streets) {
        if (Math.hypot(s.bx - s.ax, s.bz - s.az) < 0.2) continue;
        if (s.kind === 'lane' && s.chain !== undefined) {
          if (!chains.has(s.chain)) chains.set(s.chain, []);
          chains.get(s.chain)!.push(s);
        } else ribbon([{ x: s.ax, z: s.az }, { x: s.bx, z: s.bz }], WIDTH[s.kind] / 2, s.tier, s.kind === 'main' ? 0.11 : s.kind === 'side' ? 0.09 : 0.07, true, true);
      }
      for (const list of chains.values()) {
        const pts = [{ x: list[0].ax, z: list[0].az }, ...list.map((s) => ({ x: s.bx, z: s.bz }))];
        // The first run leaves the door: a short doorstep path is narrower.
        const short = list.length === 1 && Math.hypot(list[0].bx - list[0].ax, list[0].bz - list[0].az) < 9;
        ribbon(pts, short ? 0.6 : WIDTH.lane / 2, list[0].tier, 0.07, false, true);
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
