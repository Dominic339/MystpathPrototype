// Wild animals, built in code: red deer, wild boar, hares, wild goats, ducks and fish.
// The simulation moves each herd as one group; here every animal in it gets its own place
// in the herd, its own gait (legs swing with the ground covered, hares hop) and grazes with
// its head down when the herd is at rest. Animals that were hunted simply are not drawn.

import * as THREE from 'three';
import { FAUNA } from '../sim/data/fauna';
import { HERD_STRIDE } from '../sim/protocol';
import { hash01 } from '../sim/rng';
import type { Heightfield } from '../sim/terrain';
import { color, jitter, limb, merge, mix, noise3, part } from './geom';
import type { WaterSystem } from './water';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });

interface Body {
  /** Torso, tail and anything that does not move on its own. */
  body: THREE.BufferGeometry;
  /** Neck and head, pivoting at the shoulders to graze. */
  head: THREE.BufferGeometry;
  headPivot: THREE.Vector3;
  /** One leg, hanging from the origin; used four times. */
  leg?: THREE.BufferGeometry;
  /** Hip and shoulder positions (x = side, z = front/back). */
  legSockets: THREE.Vector3[];
  gait: 'walk' | 'hop' | 'swim' | 'fish';
  scale: number;
}

function fur(base: string, light: string) {
  const a = color(base);
  const b = color(light);
  return (p: THREE.Vector3, n: THREE.Vector3) => jitter(mix(a, b, Math.max(0, -n.y) * 0.8 + (noise3(p.x * 6, p.y * 6, p.z * 6) * 0.5 + 0.5) * 0.25), 0.05, p.x * 9, p.y * 9, p.z * 9);
}

function ellipsoid(rx: number, ry: number, rz: number, seg = 10): THREE.SphereGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg - 2));
  g.scale(rx, ry, rz);
  return g;
}

function deer(stag: boolean): Body {
  const coat = fur('#8a5a34', '#d9c3a0');
  const torso = part(ellipsoid(0.24, 0.27, 0.62).translate(0, 0.98, 0), coat);
  const rump = part(ellipsoid(0.16, 0.16, 0.08).translate(0, 1.0, -0.6), color('#eadcc4'));
  const tail = part(ellipsoid(0.05, 0.08, 0.05).translate(0, 1.08, -0.66), color('#5a3c24'));
  const neck = part(limb(V(0, 1.1, 0.45), V(0, 1.55, 0.72), 0.12, 0.08, 7), coat);
  const head = part(ellipsoid(0.09, 0.1, 0.2).translate(0, 1.6, 0.85), coat);
  const nose = part(ellipsoid(0.05, 0.05, 0.05).translate(0, 1.56, 1.03), color('#2a1d14'));
  const ears = [-1, 1].map((s) => part(ellipsoid(0.03, 0.09, 0.05).rotateZ(s * 0.7).translate(s * 0.11, 1.72, 0.78), coat));
  const parts = [neck, head, nose, ...ears];
  if (stag) {
    const antler = color('#cdb48a');
    for (const s of [-1, 1]) {
      const base = V(s * 0.06, 1.7, 0.8);
      const main = V(s * 0.3, 2.15, 0.62);
      parts.push(part(limb(base, main, 0.025, 0.015, 4), antler));
      parts.push(part(limb(V(s * 0.16, 1.88, 0.73), V(s * 0.24, 1.98, 0.92), 0.015, 0.01, 4), antler));
      parts.push(part(limb(V(s * 0.24, 2.04, 0.66), V(s * 0.38, 2.12, 0.78), 0.015, 0.01, 4), antler));
    }
  }
  const leg = merge([part(limb(V(0, 0, 0), V(0, -0.45, 0.03), 0.06, 0.04, 6), coat), part(limb(V(0, -0.45, 0.03), V(0, -0.86, -0.02), 0.035, 0.03, 5), color('#5a3c24'))]);
  return {
    body: merge([torso, rump, tail]),
    head: merge(parts),
    headPivot: V(0, 1.12, 0.45),
    leg,
    legSockets: [V(-0.13, 0.88, 0.42), V(0.13, 0.88, 0.42), V(-0.13, 0.88, -0.45), V(0.13, 0.88, -0.45)],
    gait: 'walk',
    scale: 1,
  };
}

function boar(): Body {
  const coat = fur('#3b2e24', '#6a5646');
  const torso = part(ellipsoid(0.3, 0.32, 0.6).translate(0, 0.58, 0), coat);
  const ridge = part(ellipsoid(0.1, 0.12, 0.5).translate(0, 0.86, 0.05), color('#2a201a'));
  const tail = part(limb(V(0, 0.62, -0.58), V(0, 0.45, -0.68), 0.02, 0.012, 4), coat);
  const head = part(ellipsoid(0.2, 0.22, 0.32).rotateX(0.35).translate(0, 0.52, 0.66), coat);
  const snout = part(limb(V(0, 0.42, 0.88), V(0, 0.36, 1.02), 0.08, 0.07, 8), color('#4a3a30'));
  const disc = part(ellipsoid(0.07, 0.06, 0.02).translate(0, 0.36, 1.03), color('#6a4a44'));
  const tusks = [-1, 1].map((s) => part(limb(V(s * 0.07, 0.36, 0.95), V(s * 0.1, 0.46, 0.98), 0.015, 0.006, 4), color('#e6dcc4')));
  const ears = [-1, 1].map((s) => part(ellipsoid(0.04, 0.08, 0.03).rotateZ(s * 0.5).translate(s * 0.13, 0.72, 0.6), coat));
  const leg = part(limb(V(0, 0, 0), V(0, -0.36, 0.02), 0.06, 0.04, 6), color('#2a201a'));
  return {
    body: merge([torso, ridge, tail]),
    head: merge([head, snout, disc, ...tusks, ...ears]),
    headPivot: V(0, 0.62, 0.45),
    leg,
    legSockets: [V(-0.15, 0.36, 0.38), V(0.15, 0.36, 0.38), V(-0.15, 0.36, -0.38), V(0.15, 0.36, -0.38)],
    gait: 'walk',
    scale: 1,
  };
}

function hare(): Body {
  const coat = fur('#8a7558', '#e0d4bc');
  const torso = part(ellipsoid(0.11, 0.12, 0.2).translate(0, 0.17, 0), coat);
  const haunch = part(ellipsoid(0.12, 0.12, 0.12).translate(0, 0.15, -0.1), coat);
  const tail = part(ellipsoid(0.04, 0.04, 0.04).translate(0, 0.2, -0.22), color('#f2ece0'));
  const head = part(ellipsoid(0.065, 0.07, 0.09).translate(0, 0.28, 0.2), coat);
  const ears = [-1, 1].map((s) => part(ellipsoid(0.022, 0.13, 0.04).rotateX(-0.4).rotateZ(-s * 0.25).translate(s * 0.035, 0.4, 0.15), coat));
  const tips = [-1, 1].map((s) => part(ellipsoid(0.02, 0.03, 0.032).rotateX(-0.4).rotateZ(-s * 0.25).translate(s * 0.066, 0.51, 0.1), color('#2a221a')));
  return { body: merge([torso, haunch, tail]), head: merge([head, ...ears, ...tips]), headPivot: V(0, 0.2, 0.15), legSockets: [], gait: 'hop', scale: 1 };
}

function goat(): Body {
  const coat = fur('#6e5e4a', '#b8a88e');
  const torso = part(ellipsoid(0.2, 0.22, 0.42).translate(0, 0.72, 0), coat);
  const tail = part(ellipsoid(0.04, 0.07, 0.03).rotateX(-0.6).translate(0, 0.82, -0.44), coat);
  const neck = part(limb(V(0, 0.8, 0.3), V(0, 1.1, 0.48), 0.09, 0.07, 6), coat);
  const head = part(ellipsoid(0.07, 0.08, 0.15).rotateX(0.4).translate(0, 1.12, 0.58), coat);
  const beard = part(ellipsoid(0.03, 0.07, 0.03).translate(0, 0.98, 0.66), color('#4a3e32'));
  const horn = color('#3a3028');
  const horns = [-1, 1].map((s) => merge([part(limb(V(s * 0.04, 1.2, 0.54), V(s * 0.08, 1.38, 0.4), 0.025, 0.015, 4), horn), part(limb(V(s * 0.08, 1.38, 0.4), V(s * 0.1, 1.36, 0.26), 0.015, 0.008, 4), horn)]));
  const leg = merge([part(limb(V(0, 0, 0), V(0, -0.3, 0.02), 0.045, 0.03, 5), coat), part(limb(V(0, -0.3, 0.02), V(0, -0.6, 0), 0.028, 0.024, 5), color('#3a3028'))]);
  return {
    body: merge([torso, tail]),
    head: merge([neck, head, beard, ...horns]),
    headPivot: V(0, 0.82, 0.3),
    leg,
    legSockets: [V(-0.1, 0.6, 0.28), V(0.1, 0.6, 0.28), V(-0.1, 0.6, -0.3), V(0.1, 0.6, -0.3)],
    gait: 'walk',
    scale: 1,
  };
}

function duck(drake: boolean): Body {
  const plum = drake ? '#8a8478' : '#5a4430';
  const body = part(ellipsoid(0.13, 0.09, 0.22).translate(0, 0.05, 0), (p) => jitter(p.z < -0.1 && drake ? color('#2a2a2a') : color(plum), 0.06, p.x * 20, p.y * 20, p.z * 20));
  const neck = part(limb(V(0, 0.08, 0.14), V(0, 0.2, 0.18), 0.04, 0.035, 6), drake ? color('#1f5a34') : color(plum));
  const head = part(ellipsoid(0.055, 0.055, 0.07).translate(0, 0.23, 0.2), drake ? color('#1f5a34') : color(plum));
  const bill = part(ellipsoid(0.03, 0.012, 0.05).translate(0, 0.21, 0.28), color('#d9a830'));
  return { body, head: merge([neck, head, bill]), headPivot: V(0, 0.08, 0.14), legSockets: [], gait: 'swim', scale: 1 };
}

function fish(): Body {
  const body = part(ellipsoid(0.05, 0.07, 0.24).translate(0, 0, 0), (p) => mix(color('#2e3a34'), color('#8a9a84'), p.y < 0 ? 0.5 : 0));
  const tail = part(ellipsoid(0.01, 0.07, 0.06).translate(0, 0, -0.27), color('#2e3a34'));
  return { body, head: tail, headPivot: V(0, 0, -0.2), legSockets: [], gait: 'fish', scale: 1 };
}

function makeBody(species: string, index: number): Body | null {
  switch (species) {
    case 'red-deer':
      return deer(index === 0);
    case 'elk':
      return { ...deer(index === 0), scale: 1.35 };
    case 'wild-boar':
      return boar();
    case 'hare':
      return hare();
    case 'wild-goat':
    case 'mouflon':
      return goat();
    case 'wild-fowl':
      return duck(index % 2 === 0);
    case 'river-fish':
    case 'sea-fish':
      return fish();
  }
  return null;
}

interface Animal {
  root: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  body: Body;
  offset: { x: number; z: number };
  x: number;
  z: number;
  heading: number;
  phase: number;
  speed: number;
  /** Personal rhythm for grazing and looking up. */
  seed: number;
  y0: number;
}

interface HerdView {
  species: string;
  animals: Animal[];
  x: number;
  z: number;
  tx: number;
  tz: number;
  vx: number;
  vz: number;
  count: number;
  state: number;
  heading: number;
  seen: boolean;
}

export interface AnimalsView {
  group: THREE.Group;
  setTargets: (buf: Float32Array) => void;
  update: (dt: number, time: number) => void;
  /** Position of a herd, for following or debugging. */
  herdPosition: (i: number) => THREE.Vector3 | null;
}

export function buildAnimals(herds: { species: string; max: number }[], terrain: Heightfield, water: WaterSystem | null): AnimalsView {
  const group = new THREE.Group();
  group.name = 'animals';
  const views: HerdView[] = herds.map((h, hi) => {
    const fishy = h.species.endsWith('fish');
    const n = fishy ? 6 : Math.ceil(h.max);
    const animals: Animal[] = [];
    for (let k = 0; k < n; k++) {
      const body = makeBody(h.species, k);
      if (!body) continue;
      const root = new THREE.Group();
      const bodyMesh = new THREE.Mesh(body.body, MAT);
      bodyMesh.castShadow = !fishy;
      root.add(bodyMesh);
      const head = new THREE.Group();
      head.position.copy(body.headPivot);
      const headMesh = new THREE.Mesh(body.head.clone().translate(-body.headPivot.x, -body.headPivot.y, -body.headPivot.z), MAT);
      headMesh.castShadow = !fishy;
      head.add(headMesh);
      root.add(head);
      const legs = body.legSockets.map((s) => {
        const g = new THREE.Group();
        g.position.copy(s);
        const m = new THREE.Mesh(body.leg!, MAT);
        m.castShadow = true;
        g.add(m);
        root.add(g);
        return g;
      });
      root.scale.setScalar(body.scale * (0.85 + hash01(hi, k, 3) * 0.3));
      group.add(root);
      const spread = fishy ? 2.5 : body.gait === 'hop' ? 4 : body.gait === 'swim' ? 3 : 2.2 + n * 0.35;
      const a = hash01(hi, k, 1) * Math.PI * 2;
      const r = Math.sqrt(hash01(hi, k, 2)) * spread;
      animals.push({ root, head, legs, body, offset: { x: Math.cos(a) * r, z: Math.sin(a) * r }, x: 0, z: 0, heading: a, phase: hash01(hi, k, 4) * 6, speed: 0, seed: hash01(hi, k, 5) * 100, y0: 0 });
    }
    return { species: h.species, animals, x: 0, z: 0, tx: 0, tz: 0, vx: 0, vz: 0, count: 0, state: 0, heading: 0, seen: false };
  });

  const groundY = (x: number, z: number) => terrain.sample(x, z);
  return {
    group,
    herdPosition: (i) => (views[i] ? new THREE.Vector3(views[i].x, groundY(views[i].x, views[i].z), views[i].z) : null),
    setTargets(buf) {
      for (let i = 0; i < views.length; i++) {
        const o = i * HERD_STRIDE;
        const v = views[i];
        v.tx = buf[o];
        v.tz = buf[o + 1];
        v.heading = buf[o + 2];
        v.count = buf[o + 3];
        v.state = buf[o + 4];
        v.vx = buf[o + 5];
        v.vz = buf[o + 6];
        if (!v.seen) {
          v.seen = true;
          v.x = v.tx;
          v.z = v.tz;
          for (const a of v.animals) {
            a.x = v.x + a.offset.x;
            a.z = v.z + a.offset.z;
          }
        }
      }
    },
    update(dt, time) {
      for (const v of views) {
        if (!v.seen) continue;
        // Follow the simulation, predicting along the herd's velocity between ticks.
        v.tx += v.vx * dt;
        v.tz += v.vz * dt;
        const k = 1 - Math.exp(-dt * 4);
        v.x += (v.tx - v.x) * k;
        v.z += (v.tz - v.z) * k;
        const fishy = v.species.endsWith('fish');
        const alive = fishy ? Math.min(v.animals.length, Math.ceil(v.count / 3)) : Math.round(v.count);
        const fleeing = v.state === 2;
        v.animals.forEach((a, idx) => {
          a.root.visible = idx < alive;
          if (!a.root.visible) return;
          // Each animal keeps its own place in the herd (closer together when fleeing).
          const tight = fleeing ? 0.6 : 1;
          const gx = v.x + a.offset.x * tight;
          const gz = v.z + a.offset.z * tight;
          const dx = gx - a.x;
          const dz = gz - a.z;
          const d = Math.hypot(dx, dz);
          const herdSpeed = Math.hypot(v.vx, v.vz);
          const want = Math.min(d * 1.5, Math.max(herdSpeed * 1.15, d > 0.3 ? 0.8 : 0));
          a.speed += (want - a.speed) * (1 - Math.exp(-dt * 5));
          if (d > 0.01) {
            const step = Math.min(d, a.speed * dt);
            a.x += (dx / d) * step;
            a.z += (dz / d) * step;
            if (a.speed > 0.15) {
              const target = Math.atan2(dx, dz);
              let diff = target - a.heading;
              diff = Math.atan2(Math.sin(diff), Math.cos(diff));
              a.heading += diff * (1 - Math.exp(-dt * 6));
            }
          }
          a.phase += a.speed * dt * (a.body.gait === 'hop' ? 5 : 3.2);
          const g = a.body.gait;
          let y: number;
          if (g === 'swim') y = (water ? water.heightAt(a.x, a.z) : terrain.waterLevel) - 0.02 + Math.sin(time * 2 + a.seed) * 0.01;
          else if (g === 'fish') y = terrain.waterLevel - 0.35 - Math.sin(a.seed) * 0.1;
          else y = groundY(a.x, a.z);
          if (g === 'hop' && a.speed > 0.2) y += Math.abs(Math.sin(a.phase)) * 0.18;
          a.root.position.set(a.x, y, a.z);
          a.root.rotation.y = a.heading;
          // Legs: diagonal pairs swing together.
          a.legs.forEach((leg, li) => {
            const s = li === 0 || li === 3 ? 1 : -1;
            leg.rotation.x = Math.sin(a.phase) * s * Math.min(0.6, a.speed * 0.5);
          });
          // Grazing: head down when the herd rests, looking up now and then.
          const grazing = v.state === 0 && a.speed < 0.2 && Math.sin(time * 0.3 + a.seed) > -0.4;
          const headAngle = g === 'fish' ? Math.sin(time * 6 + a.seed) * 0.4 : grazing ? (g === 'swim' ? 1.2 : 0.95) : fleeing ? -0.15 : 0;
          if (g === 'fish') a.head.rotation.y = headAngle;
          else a.head.rotation.x += (headAngle - a.head.rotation.x) * (1 - Math.exp(-dt * 3));
        });
      }
    },
  };
}

export { FAUNA };

/** A standing animal as one static piece (for kept animals in folds and pens). */
export function staticAnimalGeometry(species: string, index: number): THREE.BufferGeometry | null {
  const b = makeBody(species, index);
  if (!b) return null;
  const parts = [b.body.clone(), b.head.clone()];
  for (const s of b.legSockets) parts.push(b.leg!.clone().translate(s.x, s.y, s.z));
  const g = merge(parts);
  g.scale(b.scale, b.scale, b.scale);
  return g;
}

export const ANIMAL_MATERIAL = MAT;
