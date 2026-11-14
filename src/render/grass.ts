// Grass tufts scattered over the meadows. Blade normals point up so tufts light
// like the ground they grow from, and each tuft is tinted to match the terrain under it.

import * as THREE from 'three';
import type { Heightfield } from '../sim/terrain';
import { Rng } from '../sim/rng';
import { natureMaterial } from './materials';

function tuftGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const normals: number[] = [];
  // Multipliers on the terrain tint: darker at the root, sunlit and yellower at the tip.
  const base = new THREE.Color().setRGB(0.5, 0.56, 0.45, THREE.LinearSRGBColorSpace);
  const tip = new THREE.Color().setRGB(1.45, 1.4, 0.95, THREE.LinearSRGBColorSpace);
  const rng = new Rng(55);
  const blades = 6;
  for (let b = 0; b < blades; b++) {
    const a = rng.next() * Math.PI * 2;
    const r = rng.next() * 0.18;
    const ox = Math.cos(a) * r;
    const oz = Math.sin(a) * r;
    const h = 0.28 + rng.next() * 0.3;
    const w = 0.035 + rng.next() * 0.02;
    const lean = 0.12 + rng.next() * 0.2;
    const dir = rng.next() * Math.PI * 2;
    const lx = Math.cos(dir);
    const lz = Math.sin(dir);
    const px = -lz;
    const pz = lx;
    const segs = 3;
    const pts: [number, number, number, number][] = []; // x, y, z, halfWidth
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const bend = lean * t * t;
      pts.push([ox + lx * bend, h * t, oz + lz * bend, w * (1 - t * 0.9)]);
    }
    for (let s = 0; s < segs; s++) {
      const [x0, y0, z0, w0] = pts[s];
      const [x1, y1, z1, w1] = pts[s + 1];
      const quad = [
        [x0 - px * w0, y0, z0 - pz * w0, s / segs],
        [x0 + px * w0, y0, z0 + pz * w0, s / segs],
        [x1 + px * w1, y1, z1 + pz * w1, (s + 1) / segs],
        [x1 - px * w1, y1, z1 - pz * w1, (s + 1) / segs],
      ];
      for (const idx of [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]) {
        const [x, y, z, t] = quad[idx];
        positions.push(x, y, z);
        const c = base.clone().lerp(tip, t * t);
        colors.push(c.r, c.g, c.b);
        normals.push(0, 1, 0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

export function buildGrass(field: Heightfield, terrainMesh: THREE.Mesh, grassWeight: Float32Array, count = 48000): THREE.InstancedMesh {
  const geo = tuftGeometry();
  const mat = natureMaterial({ sway: 0.35, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const rng = new Rng(808);
  const half = field.size / 2 - 2;
  const res = field.res;
  const colors = terrainMesh.geometry.getAttribute('color');
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const t = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  let placed = 0;
  for (let attempt = 0; attempt < count * 6 && placed < count; attempt++) {
    const x = rng.range(-half, half);
    const z = rng.range(-half, half);
    // Nearest terrain vertex for weight and colour.
    const i = Math.round(((x + field.size / 2) / field.size) * (res - 1));
    const j = Math.round(((z + field.size / 2) / field.size) * (res - 1));
    const k = j * res + i;
    if (rng.next() > grassWeight[k]) continue;
    q.setFromAxisAngle(up, rng.next() * Math.PI * 2);
    s.setScalar(0.7 + rng.next() * 0.7);
    t.set(x, field.sample(x, z) - 0.02, z);
    m.compose(t, q, s);
    mesh.setMatrixAt(placed, m);
    tint.setRGB(colors.getX(k), colors.getY(k), colors.getZ(k)).multiplyScalar(1.05);
    mesh.setColorAt(placed, tint);
    placed++;
  }
  mesh.count = placed;
  mesh.receiveShadow = true;
  mesh.name = 'grass';
  mesh.computeBoundingSphere();
  return mesh;
}
