// Nature models built in code: trees, bushes, rocks, reeds and flowers.
// Each kind has a few variants; instances pick one and get their own scale and rotation.

import * as THREE from 'three';
import type { PropInstance, PropKind } from '../sim/world';
import type { Heightfield } from '../sim/terrain';
import { hash01 } from '../sim/rng';
import { color, jitter, limb, merge, mix, noise3, part } from './geom';
import { blob, natureMaterial, rockShape } from './materials';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const BARK = color('#5b4330');
const BARK_DARK = color('#3b2a1d');
const LEAF_DEEP = color('#1f3a1a');
const LEAF = color('#3f6526');
const LEAF_SUN = color('#7d9a3a');
const PINE_DEEP = color('#1d3b26');
const PINE = color('#2f5634');
const PINE_TIP = color('#5a7c3e');

function canopyColor(base: THREE.Color, deep: THREE.Color, sun: THREE.Color, center: THREE.Vector3, r: number) {
  return (p: THREE.Vector3, n: THREE.Vector3) => {
    // Darker underneath and inside, warmer and lighter where the sun hits the top.
    const up = n.y * 0.5 + 0.5;
    const outward = Math.min(1, p.distanceTo(center) / r);
    const c = mix(deep, base, up * 0.9 + outward * 0.3);
    mix(c, sun, Math.max(0, n.y - 0.45) * 0.4 * outward, c);
    return jitter(c, 0.14, p.x, p.y, p.z);
  };
}

function barkColor(dark: THREE.Color, light: THREE.Color) {
  return (p: THREE.Vector3) => {
    const streak = noise3(p.x * 9, p.y * 1.6, p.z * 9) * 0.5 + 0.5;
    return mix(dark, light, streak * 0.8 + Math.min(1, p.y * 0.25) * 0.2);
  };
}

function oak(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = 4.2 + hash01(seed, 1) * 1.4;
  parts.push(part(limb(V(0, -0.3, 0), V(0.25, h, 0.1), 0.42, 0.24, 8, 0.25), barkColor(BARK_DARK, BARK)));
  // Main branches.
  for (let b = 0; b < 4; b++) {
    const a = (b / 4) * Math.PI * 2 + hash01(seed, 2, b) * 0.9;
    const y0 = h * (0.55 + hash01(seed, 3, b) * 0.25);
    const end = V(Math.cos(a) * 2.1, y0 + 1.6, Math.sin(a) * 2.1);
    parts.push(part(limb(V(0.15, y0, 0.05), end, 0.17, 0.07, 6), barkColor(BARK_DARK, BARK)));
  }
  // Canopy: a dark inner mass plus many smaller clumps scattered over an irregular crown,
  // so the silhouette breaks up instead of reading as a few big balls.
  const crownY = h + 1.6;
  const core = blob(2.5, 2, 0.25, 0.7, seed * 0.37);
  core.scale(1.15, 0.8, 1.1);
  core.translate(0.2, crownY, 0);
  parts.push(part(core, canopyColor(LEAF_DEEP, LEAF_DEEP, LEAF, V(0, crownY, 0), 5)));
  const clumps = 16 + Math.floor(hash01(seed, 4) * 6);
  for (let k = 0; k < clumps; k++) {
    // Points on a squashed, lopsided ellipsoid shell.
    const u = hash01(seed, 5, k) * Math.PI * 2;
    const v = Math.acos(1 - hash01(seed, 6, k) * 1.55); // favour the upper half
    const shell = 2.6 + hash01(seed, 7, k) * 0.9;
    const lopsided = 1 + 0.25 * Math.cos(u - seed);
    const c = V(Math.sin(v) * Math.cos(u) * shell * 1.15 * lopsided, crownY + Math.cos(v) * shell * 0.72, Math.sin(v) * Math.sin(u) * shell * 1.1);
    const r = 0.85 + hash01(seed, 8, k) * 0.65;
    const g = blob(r, 2, 0.34, 1.4, seed + k * 7.3);
    g.translate(c.x, c.y, c.z);
    parts.push(part(g, canopyColor(LEAF, LEAF_DEEP, LEAF_SUN, V(0, crownY, 0), 3.6)));
  }
  return merge(parts);
}

function birch(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = 5.5 + hash01(seed, 1) * 1.5;
  const white = color('#e6e1d4');
  const mark = color('#2b2622');
  parts.push(
    part(limb(V(0, -0.3, 0), V(-0.2, h + 1.5, 0.15), 0.2, 0.09, 8, 0.18), (p) => {
      const m = noise3(p.x * 14, p.y * 5.5, p.z * 14);
      return m > 0.38 ? mark : jitter(white, 0.06, p.x, p.y, p.z);
    }),
  );
  const leaf = color('#7fa23a');
  const leafDeep = color('#46692a');
  const leafSun = color('#c3c95a');
  for (let k = 0; k < 6; k++) {
    const a = k * 2.3 + hash01(seed, 2, k);
    const ring = k === 0 ? 0 : 0.9 + hash01(seed, 3, k) * 0.6;
    const g = blob(1.05 + hash01(seed, 4, k) * 0.4, 2, 0.3, 1.2, seed * 1.7 + k);
    g.scale(1, 1.25, 1);
    g.translate(Math.cos(a) * ring - 0.15, h + 0.4 + k * 0.38, Math.sin(a) * ring);
    parts.push(part(g, canopyColor(leaf, leafDeep, leafSun, V(0, h + 1.5, 0), 2.6)));
  }
  return merge(parts);
}

function pine(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = 7 + hash01(seed, 1) * 2.5;
  parts.push(part(limb(V(0, -0.3, 0), V(0, h, 0), 0.3, 0.08, 7), barkColor(BARK_DARK, color('#6a4b33'))));
  const tiers = 6;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const r = 2.5 * (1 - f * 0.8) + 0.25;
    const y = 1.6 + f * (h - 1.2);
    const cone = new THREE.ConeGeometry(r, 2.4 - f * 0.6, 12, 2, true);
    const pos = cone.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const vy = pos.getY(i);
      if (vy < 0) {
        // Jagged, drooping bough tips.
        const ang = Math.atan2(pos.getZ(i), pos.getX(i));
        const jag = 1 + 0.18 * Math.sin(ang * 6 + seed + t) + noise3(pos.getX(i), t, pos.getZ(i)) * 0.15;
        pos.setX(i, pos.getX(i) * jag);
        pos.setZ(i, pos.getZ(i) * jag);
        pos.setY(i, vy - 0.25 * jag);
      }
    }
    cone.computeVertexNormals();
    cone.translate(0, y, 0);
    parts.push(
      part(cone, (p, n) => {
        const tip = Math.max(0, Math.hypot(p.x, p.z) / r);
        const c = mix(PINE_DEEP, PINE, tip * 0.8 + n.y * 0.2);
        mix(c, PINE_TIP, Math.max(0, tip - 0.7) * 1.2, c);
        return jitter(c, 0.12, p.x, p.y, p.z);
      }),
    );
  }
  return merge(parts);
}

function bush(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const base = color('#456f2a');
  const deep = color('#26421c');
  const sun = color('#86a83d');
  for (let k = 0; k < 4; k++) {
    const a = k * 1.9 + hash01(seed, 1, k);
    const g = blob(0.55 + hash01(seed, 2, k) * 0.3, 2, 0.3, 1.6, seed + k);
    g.scale(1, 0.8, 1);
    g.translate(Math.cos(a) * 0.45, 0.45 + hash01(seed, 3, k) * 0.2, Math.sin(a) * 0.45);
    parts.push(part(g, canopyColor(base, deep, sun, V(0, 0.5, 0), 1.1)));
  }
  // Occasional berries.
  if (hash01(seed, 9) > 0.4) {
    const berry = color('#9a1f2c');
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4;
      const g = new THREE.IcosahedronGeometry(0.06, 0);
      g.translate(Math.cos(a) * 0.8, 0.5 + (k % 3) * 0.2, Math.sin(a) * 0.8);
      parts.push(part(g, berry));
    }
  }
  return merge(parts);
}

const ROCK_DARK = color('#5d5a55');
const ROCK_LIGHT = color('#b3ada2');
const MOSS = color('#5e7a33');

function rock(seed: number, size: number): THREE.BufferGeometry {
  const g = rockShape(size, seed);
  return part(g, (p, n) => {
    const strata = noise3(p.x * 1.5, p.y * 6, p.z * 1.5) * 0.5 + 0.5;
    const c = mix(ROCK_DARK, ROCK_LIGHT, strata * 0.7 + n.y * 0.25);
    if (n.y > 0.55) mix(c, MOSS, (n.y - 0.55) * 1.4 * (noise3(p.x * 2, p.y, p.z * 2) * 0.5 + 0.6), c);
    return jitter(c, 0.08, p.x, p.y, p.z);
  });
}

function reeds(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = color('#6f8a3a');
  const dry = color('#a99a5a');
  const head = color('#5a3a22');
  for (let k = 0; k < 14; k++) {
    const a = hash01(seed, 1, k) * Math.PI * 2;
    const r = hash01(seed, 2, k) * 0.6;
    const h = 1.1 + hash01(seed, 3, k) * 0.9;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const lean = V(x * 0.5 + (hash01(seed, 4, k) - 0.5) * 0.4, h, z * 0.5);
    parts.push(part(limb(V(x, -0.1, z), V(x + lean.x, h, z + lean.z), 0.025, 0.012, 3), (p) => mix(stem, dry, p.y / h * 0.5)));
    if (k % 3 === 0) {
      const g = new THREE.CapsuleGeometry(0.045, 0.22, 2, 5);
      g.translate(x + lean.x * 0.95, h * 0.95, z + lean.z * 0.95);
      parts.push(part(g, head));
    }
  }
  return merge(parts);
}

function flowers(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const palettes = ['#e8d34a', '#f2f0ea', '#b07ad9', '#e6735c'];
  const petal = color(palettes[Math.floor(hash01(seed, 1) * palettes.length)]);
  const stem = color('#557a2c');
  for (let k = 0; k < 9; k++) {
    const a = hash01(seed, 2, k) * Math.PI * 2;
    const r = hash01(seed, 3, k) * 0.7;
    const h = 0.25 + hash01(seed, 4, k) * 0.25;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    parts.push(part(limb(V(x, -0.05, z), V(x, h, z), 0.012, 0.01, 3), stem));
    const g = new THREE.IcosahedronGeometry(0.07, 0);
    g.scale(1, 0.5, 1);
    g.translate(x, h, z);
    parts.push(part(g, petal));
  }
  return merge(parts);
}

const VARIANTS = 3;

function buildKind(kind: PropKind, v: number): { geo: THREE.BufferGeometry; sway: number; flat: boolean; shadow: boolean } {
  const seed = 101 + v * 37;
  switch (kind) {
    case 'oak': return { geo: oak(seed), sway: 0.0016, flat: false, shadow: true };
    case 'birch': return { geo: birch(seed), sway: 0.002, flat: false, shadow: true };
    case 'pine': return { geo: pine(seed), sway: 0.0009, flat: false, shadow: true };
    case 'bush': return { geo: bush(seed), sway: 0.02, flat: false, shadow: true };
    case 'rock': return { geo: rock(seed, 0.8), sway: 0, flat: true, shadow: true };
    case 'boulder': return { geo: rock(seed + 5, 2.2), sway: 0, flat: true, shadow: true };
    case 'reeds': return { geo: reeds(seed), sway: 0.05, flat: false, shadow: false };
    case 'flowers': return { geo: flowers(seed), sway: 0.25, flat: false, shadow: false };
  }
}

/** Build one InstancedMesh per kind × variant, placed on the terrain. */
export function buildVegetation(props: PropInstance[], terrain: Heightfield): THREE.Group {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const buckets = new Map<string, PropInstance[]>();
  props.forEach((p, i) => {
    const v = Math.floor(hash01(77, i) * VARIANTS);
    const key = `${p.kind}:${v}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(p);
  });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const t = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [key, list] of buckets) {
    const [kind, v] = key.split(':');
    const built = buildKind(kind as PropKind, Number(v));
    const leafy = kind === 'oak' || kind === 'birch' || kind === 'pine' || kind === 'bush';
    const mat = natureMaterial({
      sway: built.sway,
      flat: built.flat,
      side: kind === 'reeds' ? THREE.DoubleSide : THREE.FrontSide,
      grain: leafy ? 0.38 : built.flat ? 0.18 : 0.12,
      grainScale: leafy ? 3.2 : 1.6,
    });
    const mesh = new THREE.InstancedMesh(built.geo, mat, list.length);
    list.forEach((p, i) => {
      // Sink slightly so bases never float on slopes.
      const y = terrain.sample(p.x, p.z) - (kind === 'boulder' ? 0.6 : 0.05);
      q.setFromAxisAngle(up, p.rot);
      s.setScalar(p.scale);
      t.set(p.x, y, p.z);
      m.compose(t, q, s);
      mesh.setMatrixAt(i, m);
      // Each plant gets its own tint: some greener, some more olive or autumn-touched.
      const r = hash01(31, i, kind.length);
      const tint = leafy
        ? new THREE.Color().setHSL(0.0, 0, 1).multiplyScalar(0.82 + r * 0.32).lerp(new THREE.Color(1.15, 1.05, 0.7), hash01(32, i) * 0.35)
        : new THREE.Color(1, 1, 1).multiplyScalar(0.85 + r * 0.25);
      mesh.setColorAt(i, tint);
    });
    mesh.castShadow = built.shadow;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
