// Geometry helpers for building models in code: colouring, displacing and merging parts.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Noise2D } from '../sim/noise';

const noise = new Noise2D(9137);
const noiseB = new Noise2D(4211);

/** Cheap 3D noise from two 2D layers; good enough for displacing models. */
export function noise3(x: number, y: number, z: number): number {
  return (noise.sample(x + z * 0.71, y - z * 0.37) + noiseB.sample(y + x * 0.53, z - x * 0.29)) * 0.5;
}

/** Prepare a part for merging: non-indexed, no UVs, with a colour attribute. */
export function part(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.Color)): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const colors = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const fixed = typeof color === 'function' ? null : new THREE.Color(color);
  for (let i = 0; i < pos.count; i++) {
    let c: THREE.Color;
    if (fixed) c = fixed;
    else {
      p.fromBufferAttribute(pos, i);
      n.fromBufferAttribute(nor, i);
      c = (color as (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color)(p, n);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('mergeGeometries failed: parts have mismatched attributes');
  g.computeBoundingSphere();
  return g;
}

/** Push vertices along their direction from `center` by noise; keeps shared vertices together. */
export function displace(geo: THREE.BufferGeometry, amount: number, freq: number, seed = 0, center = new THREE.Vector3()): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    d.copy(v).sub(center);
    const len = d.length() || 1;
    const k = 1 + noise3(v.x * freq + seed, v.y * freq - seed, v.z * freq + seed * 0.5) * amount;
    v.copy(center).addScaledVector(d.normalize(), len * k);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function color(hex: THREE.ColorRepresentation): THREE.Color {
  return new THREE.Color(hex);
}

/** Lerp two colours with optional per-call jitter of lightness. */
export function mix(a: THREE.Color, b: THREE.Color, t: number, out = new THREE.Color()): THREE.Color {
  return out.copy(a).lerp(b, Math.min(1, Math.max(0, t)));
}

export function jitter(c: THREE.Color, amount: number, x: number, y: number, z: number): THREE.Color {
  const k = 1 + noise3(x * 3.1, y * 3.1, z * 3.1) * amount;
  return c.clone().multiplyScalar(k);
}

/** A tapered, slightly bent cylinder between two points (for trunks, branches, poles). */
export function limb(from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, radial = 7, bend = 0): THREE.BufferGeometry {
  const len = from.distanceTo(to);
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 4, false);
  g.translate(0, len / 2, 0);
  if (bend) {
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / len;
      pos.setX(i, pos.getX(i) + Math.sin(y * Math.PI) * bend);
    }
    g.computeVertexNormals();
  }
  const dir = to.clone().sub(from).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyQuaternion(q);
  g.translate(from.x, from.y, from.z);
  return g;
}
