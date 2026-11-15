// Tree building blocks: bark-covered trunks and limbs grown along curves (root flare,
// lean, forks, knots), and canopies built as one continuous leaf mass wrapped around
// the branch ends rather than a pile of separate balls.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash01 } from '../sim/rng';
import { jitter, mix, noise3, part } from './geom';

export interface Knot {
  t: number; // 0..1 along the limb
  angle: number; // around the limb
  size: number; // metres
}

export interface LimbSpec {
  points: THREE.Vector3[];
  r0: number;
  r1: number;
  flare?: number; // root flare strength (trunk base only)
  knots?: Knot[];
}

export interface BarkPalette {
  dark: THREE.Color;
  light: THREE.Color;
  knot: THREE.Color;
  /** Optional custom colouring (e.g. birch markings). */
  paint?: (p: THREE.Vector3, along: number, angle: number) => THREE.Color | null;
}

/** A tapered tube along a smooth curve, with root flare lobes and knot bumps. */
export function limbTube(spec: LimbSpec, bark: BarkPalette, radial = 9, segments = 14): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(spec.points);
  const frames = curve.computeFrenetFrames(segments, false);
  const rings: THREE.Vector3[][] = [];
  const meta: { t: number; a: number; knot: number }[][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const c = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const ring: THREE.Vector3[] = [];
    const m: { t: number; a: number; knot: number }[] = [];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      let r = spec.r0 + (spec.r1 - spec.r0) * Math.pow(t, 0.85);
      // Root flare: wide, lobed base that grips the ground.
      if (spec.flare && t < 0.16) {
        const f = Math.pow(1 - t / 0.16, 2.2);
        r *= 1 + spec.flare * f * (0.75 + 0.35 * Math.sin(a * 5 + spec.r0 * 40));
      }
      // Bark furrows.
      r *= 1 + 0.05 * noise3(Math.cos(a) * 3, t * 9, Math.sin(a) * 3);
      let knot = 0;
      for (const k of spec.knots ?? []) {
        const dt = (t - k.t) * curve.getLength();
        const da = Math.atan2(Math.sin(a - k.angle), Math.cos(a - k.angle)) * r;
        const d2 = (dt * dt + da * da) / (k.size * k.size);
        const bump = Math.exp(-d2 * 2.5);
        knot = Math.max(knot, bump);
        r += bump * k.size * 0.55;
      }
      const dir = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      ring.push(c.clone().addScaledVector(dir, r));
      m.push({ t, a, knot });
    }
    rings.push(ring);
    meta.push(m);
  }
  const positions: number[] = [];
  const colors: number[] = [];
  const push = (i: number, j: number) => {
    const p = rings[i][j];
    const { t, a, knot } = meta[i][j];
    positions.push(p.x, p.y, p.z);
    let col = bark.paint?.(p, t, a) ?? null;
    if (!col) {
      const streak = noise3(Math.cos(a) * 2.2, p.y * 2.4, Math.sin(a) * 2.2) * 0.5 + 0.5;
      col = mix(bark.dark, bark.light, streak * 0.85);
      // Moss creeping up one side of the base.
      if (p.y < 1.4 && Math.sin(a + 1.2) > 0.4) mix(col, new THREE.Color('#4e6a2c'), (1 - p.y / 1.4) * 0.45, col);
    }
    if (knot > 0.2) {
      // Dark ring around a pale knot heart.
      mix(col, knot > 0.75 ? bark.light.clone().multiplyScalar(1.1) : bark.knot, Math.min(1, (knot - 0.2) * 2), col);
    }
    colors.push(col.r, col.g, col.b);
  };
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < radial; j++) {
      push(i, j);
      push(i + 1, j);
      push(i + 1, j + 1);
      push(i, j);
      push(i + 1, j + 1);
      push(i, j + 1);
    }
  // Limb ends finish inside the canopy or as tapered tips, so the tube is left open.
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export interface Lobe {
  center: THREE.Vector3;
  radius: number;
}

/** Polynomial smooth minimum: blends lobes into one surface. */
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * One continuous canopy: a sphere whose surface is pushed out to the smooth union of
 * lobes along each ray from the crown centre, then roughened with leafy clumping.
 */
export function canopyMass(lobes: Lobe[], seed: number, palette: { deep: THREE.Color; base: THREE.Color; sun: THREE.Color }, detail = 4): THREE.BufferGeometry {
  const center = new THREE.Vector3();
  let wsum = 0;
  for (const l of lobes) {
    center.addScaledVector(l.center, l.radius);
    wsum += l.radius;
  }
  center.multiplyScalar(1 / wsum);
  const sdf = (p: THREE.Vector3) => {
    let d = Infinity;
    for (const l of lobes) d = smin(d === Infinity ? 1e3 : d, p.distanceTo(l.center) - l.radius, 1.6);
    return d;
  };
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.getAttribute('position');
  const dir = new THREE.Vector3();
  const p = new THREE.Vector3();
  let maxR = 0;
  for (const l of lobes) maxR = Math.max(maxR, l.center.distanceTo(center) + l.radius + 1.5);
  for (let i = 0; i < pos.count; i++) {
    dir.fromBufferAttribute(pos, i).normalize();
    // Binary search along the ray for the surface.
    let lo = 0;
    let hi = maxR;
    for (let s = 0; s < 22; s++) {
      const mid = (lo + hi) / 2;
      p.copy(center).addScaledVector(dir, mid);
      if (sdf(p) < 0) lo = mid;
      else hi = mid;
    }
    let r = (lo + hi) / 2;
    // Leafy clumping at two scales; flatter, slightly sagging underside.
    const n1 = noise3(dir.x * 2.6 + seed, dir.y * 2.6, dir.z * 2.6 - seed);
    const n2 = noise3(dir.x * 7.5 - seed, dir.y * 7.5 + seed, dir.z * 7.5);
    const n3 = noise3(dir.x * 17 + seed * 2, dir.y * 17, dir.z * 17 - seed);
    // Ridged small-scale term makes distinct leaf clusters rather than smooth bumps.
    r *= 1 + n1 * 0.14 + Math.abs(n2) * 0.16 - 0.05 + n3 * 0.05;
    p.copy(center).addScaledVector(dir, r);
    if (dir.y < -0.2) p.y += (dir.y + 0.2) * -0.35 * r * 0.25;
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  const top = center.y + maxR * 0.5;
  return part(g, (pt, n) => {
    const up = n.y * 0.5 + 0.5;
    const height = THREE.MathUtils.clamp((pt.y - center.y) / (top - center.y) * 0.5 + 0.5, 0, 1);
    const c = mix(palette.deep, palette.base, up * 0.75 + height * 0.35);
    mix(c, palette.sun, Math.max(0, n.y - 0.5) * 0.5 * height, c);
    // Self-shadowed hollows between clumps.
    const hollow = noise3(pt.x * 1.3 + seed, pt.y * 1.3, pt.z * 1.3);
    c.multiplyScalar(0.88 + hollow * 0.18);
    return jitter(c, 0.1, pt.x, pt.y, pt.z);
  });
}

/** Deterministic random in [a, b) from a seed and channel. */
export function rand(seed: number, ch: number, a = 0, b = 1, k = 0): number {
  return a + (b - a) * hash01(seed, ch, k);
}
