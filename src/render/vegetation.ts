// Nature models built in code: trees, bushes, rocks, reeds and flowers.
// Each kind has a few variants; instances pick one and get their own scale and rotation.

import * as THREE from 'three';
import type { PropInstance, PropKind } from '../sim/world';
import type { Heightfield } from '../sim/terrain';
import { hash01 } from '../sim/rng';
import { color, jitter, limb, merge, mix, noise3, part } from './geom';
import { leafMaterial, natureMaterial, rockShape } from './materials';
import { canopyMass, limbTube, rand, type BarkPalette, type Knot, type Lobe } from './trees';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const BARK_DARK = color('#3b2a1d');
const LEAF_DEEP = color('#1f3a1a');
const LEAF = color('#3f6526');
const LEAF_SUN = color('#7d9a3a');
const PINE_DEEP = color('#1d3b26');
const PINE = color('#2f5634');
const PINE_TIP = color('#5a7c3e');

function barkColor(dark: THREE.Color, light: THREE.Color) {
  return (p: THREE.Vector3) => {
    const streak = noise3(p.x * 9, p.y * 1.6, p.z * 9) * 0.5 + 0.5;
    return mix(dark, light, streak * 0.8 + Math.min(1, p.y * 0.25) * 0.2);
  };
}

const OAK_BARK: BarkPalette = { dark: color('#33251a'), light: color('#6e5440'), knot: color('#1e150f') };

/**
 * Broadleaf oak. Variants differ in form: a leaning single trunk that forks into the crown,
 * or a twin trunk split from the base. Visible limbs run up into one solid canopy.
 */
interface PlantGeo {
  wood?: THREE.BufferGeometry;
  leaves?: THREE.BufferGeometry;
}

function oak(seed: number): PlantGeo {
  const parts: THREE.BufferGeometry[] = [];
  const twin = seed % 3 === 1;
  const h = rand(seed, 1, 3.6, 4.6);
  const leanA = rand(seed, 2, 0, Math.PI * 2);
  const lean = rand(seed, 3, 0.25, 0.75);
  const lx = Math.cos(leanA) * lean;
  const lz = Math.sin(leanA) * lean;
  const lobes: Lobe[] = [];
  const knots = (n: number, s: number): Knot[] =>
    Array.from({ length: n }, (_, k) => ({ t: rand(s, 10, 0.25, 0.8, k), angle: rand(s, 11, 0, 6.28, k), size: rand(s, 12, 0.07, 0.13, k) }));

  const stems = twin ? 2 : 1;
  for (let st = 0; st < stems; st++) {
    const off = twin ? (st === 0 ? -1 : 1) : 0;
    const sx = twin ? Math.cos(leanA + 1.6) * 0.35 * off : 0;
    const sz = twin ? Math.sin(leanA + 1.6) * 0.35 * off : 0;
    const spread = twin ? 0.9 * off : 0;
    const top = V(sx + lx + Math.cos(leanA + 1.6) * spread, h * (twin ? 0.95 : 1), sz + lz + Math.sin(leanA + 1.6) * spread);
    const trunkPts = [V(sx * 0.6, -0.35, sz * 0.6), V(sx * 0.8 + lx * 0.25, h * 0.35, sz * 0.8 + lz * 0.25), V(sx + lx * 0.7 + (top.x - lx) * 0.5, h * 0.7, sz + lz * 0.7 + (top.z - lz) * 0.5), top];
    const r0 = twin ? 0.3 : 0.42;
    parts.push(limbTube({ points: trunkPts, r0, r1: r0 * 0.6, flare: twin ? 0.5 : 0.8, knots: knots(3, seed + st * 17) }, OAK_BARK, 10, 16));

    // Main limbs fork from the top of each trunk and reach into the crown.
    const limbs = twin ? 3 : 4;
    for (let b = 0; b < limbs; b++) {
      const a = leanA + (b / limbs) * Math.PI * 2 + rand(seed, 20 + st, -0.5, 0.5, b);
      const reach = rand(seed, 21 + st, 1.6, 2.6, b);
      const rise = rand(seed, 22 + st, 1.8, 2.8, b);
      const end = V(top.x + Math.cos(a) * reach, top.y + rise, top.z + Math.sin(a) * reach);
      const mid = V(top.x + Math.cos(a) * reach * 0.45, top.y + rise * 0.35, top.z + Math.sin(a) * reach * 0.45);
      parts.push(limbTube({ points: [top.clone().add(V(0, -0.3, 0)), mid, end], r0: r0 * 0.5, r1: 0.06, knots: b % 2 ? knots(1, seed + b) : [] }, OAK_BARK, 7, 9));
      lobes.push({ center: end.clone().add(V(Math.cos(a) * 0.4, 0.7, Math.sin(a) * 0.4)), radius: rand(seed, 23 + st, 1.3, 1.8, b) });
    }
    // A low side branch below the crown.
    if (!twin || st === 0) {
      const a = leanA + Math.PI + rand(seed, 30, -0.6, 0.6);
      const y = h * rand(seed, 31, 0.45, 0.6);
      const base = V(sx + lx * 0.5, y, sz + lz * 0.5);
      const end = V(base.x + Math.cos(a) * 2.4, y + 1.3, base.z + Math.sin(a) * 2.4);
      parts.push(limbTube({ points: [base, V(base.x + Math.cos(a) * 1.2, y + 0.4, base.z + Math.sin(a) * 1.2), end], r0: 0.13, r1: 0.04 }, OAK_BARK, 6, 8));
      lobes.push({ center: end.clone().add(V(0, 0.4, 0)), radius: 1.3 });
    }
    lobes.push({ center: top.clone().add(V(0, 2.7, 0)), radius: twin ? 1.7 : 2.1 });
  }
  return { wood: merge(parts), leaves: canopyMass(lobes, seed, { deep: LEAF_DEEP, base: LEAF, sun: LEAF_SUN }, 4) };
}

const BIRCH_BARK: BarkPalette = {
  dark: color('#cfc8b8'),
  light: color('#ece7da'),
  knot: color('#2b2622'),
  paint: (p, t, a) => {
    const m = noise3(Math.cos(a) * 3.5, p.y * 6, Math.sin(a) * 3.5);
    if (m > 0.36 || (t < 0.12 && m > 0.05)) return color('#2b2622');
    return jitter(color('#e6e1d4'), 0.06, p.x, p.y, p.z);
  },
};

/** Slender birch: thin pale trunk (sometimes a pair), gentle lean, tall narrow crown. */
function birch(seed: number): PlantGeo {
  const parts: THREE.BufferGeometry[] = [];
  const h = rand(seed, 1, 5.4, 6.8);
  const pair = seed % 2 === 0;
  const lobes: Lobe[] = [];
  for (let st = 0; st < (pair ? 2 : 1); st++) {
    const a = rand(seed, 2, 0, 6.28) + st * 2.6;
    const lean = rand(seed, 3, 0.2, 0.6, st) + (pair ? 0.5 : 0);
    const top = V(Math.cos(a) * lean, h - st * 0.8, Math.sin(a) * lean);
    parts.push(
      limbTube(
        { points: [V(0, -0.3, 0), V(top.x * 0.3, h * 0.4, top.z * 0.3), V(top.x * 0.75, h * 0.75, top.z * 0.75), top], r0: 0.19, r1: 0.07, flare: 0.4, knots: [{ t: 0.5, angle: a, size: 0.06 }] },
        BIRCH_BARK,
        9,
        14,
      ),
    );
    for (let k = 0; k < 3; k++) {
      const ba = a + k * 2.1;
      const y = h * (0.62 + k * 0.1);
      const base = V(top.x * (y / h), y, top.z * (y / h));
      const end = V(base.x + Math.cos(ba) * 1.1, y + 1.0, base.z + Math.sin(ba) * 1.1);
      parts.push(limbTube({ points: [base, end], r0: 0.05, r1: 0.02 }, BIRCH_BARK, 5, 4));
      lobes.push({ center: end, radius: 1.1 });
    }
    lobes.push({ center: top.clone().add(V(0, 1.2, 0)), radius: 1.4 }, { center: top.clone().add(V(0, -0.2, 0)), radius: 1.2 });
  }
  return { wood: merge(parts), leaves: canopyMass(lobes, seed + 3, { deep: color('#3d5d26'), base: color('#6f9437'), sun: color('#b8c25a') }, 4) };
}

function pine(seed: number): PlantGeo {
  const parts: THREE.BufferGeometry[] = [];
  const boughs: THREE.BufferGeometry[] = [];
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
    boughs.push(
      part(cone, (p, n) => {
        const tip = Math.max(0, Math.hypot(p.x, p.z) / r);
        const c = mix(PINE_DEEP, PINE, tip * 0.8 + n.y * 0.2);
        mix(c, PINE_TIP, Math.max(0, tip - 0.7) * 1.2, c);
        return jitter(c, 0.12, p.x, p.y, p.z);
      }),
    );
  }
  return { wood: merge(parts), leaves: merge(boughs) };
}

function bush(seed: number): PlantGeo {
  const parts: THREE.BufferGeometry[] = [];
  const lobes: Lobe[] = [];
  for (let k = 0; k < 4; k++) {
    const a = k * 1.9 + hash01(seed, 1, k);
    lobes.push({ center: V(Math.cos(a) * 0.45, 0.42 + hash01(seed, 3, k) * 0.2, Math.sin(a) * 0.45), radius: 0.5 + hash01(seed, 2, k) * 0.25 });
  }
  const g = canopyMass(lobes, seed, { deep: color('#22391a'), base: color('#456f2a'), sun: color('#86a83d') }, 3);
  // Squash so the bush sits low and wide.
  g.scale(1, 0.85, 1);
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
  return { wood: parts.length ? merge(parts) : undefined, leaves: g };
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

interface BuiltKind {
  geo: PlantGeo;
  sway: number;
  flat: boolean;
  shadow: boolean;
  /** Foliage density: higher means fewer gaps (needles are denser than broad leaves). */
  density: number;
}

function buildKind(kind: PropKind, v: number): BuiltKind {
  const seed = 101 + v * 37;
  switch (kind) {
    case 'oak': return { geo: oak(seed), sway: 0.0016, flat: false, shadow: true, density: 1 };
    case 'birch': return { geo: birch(seed), sway: 0.002, flat: false, shadow: true, density: 0.92 };
    case 'pine': return { geo: pine(seed), sway: 0.0009, flat: false, shadow: true, density: 1.12 };
    case 'bush': return { geo: bush(seed), sway: 0.02, flat: false, shadow: true, density: 1.1 };
    case 'rock': return { geo: { wood: rock(seed, 0.8) }, sway: 0, flat: true, shadow: true, density: 1 };
    case 'boulder': return { geo: { wood: rock(seed + 5, 2.2) }, sway: 0, flat: true, shadow: true, density: 1 };
    case 'reeds': return { geo: { wood: reeds(seed) }, sway: 0.05, flat: false, shadow: false, density: 1 };
    case 'flowers': return { geo: { wood: flowers(seed) }, sway: 0.25, flat: false, shadow: false, density: 1 };
  }
}

/** Build InstancedMeshes per kind × variant (wood and foliage separately), placed on the terrain. */
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
    const meshes: THREE.InstancedMesh[] = [];
    if (built.geo.wood) {
      const mat = natureMaterial({
        sway: built.sway,
        flat: built.flat,
        side: kind === 'reeds' ? THREE.DoubleSide : THREE.FrontSide,
        grain: built.flat ? 0.18 : 0.12,
        grainScale: 1.6,
      });
      const mesh = new THREE.InstancedMesh(built.geo.wood, mat, list.length);
      mesh.castShadow = built.shadow;
      meshes.push(mesh);
    }
    if (built.geo.leaves) {
      const leaf = leafMaterial(built.sway, built.density);
      const mesh = new THREE.InstancedMesh(built.geo.leaves, leaf.material, list.length);
      mesh.customDepthMaterial = leaf.depth;
      mesh.castShadow = built.shadow;
      mesh.userData.noAO = true;
      meshes.push(mesh);
    }
    list.forEach((p, i) => {
      // Sink slightly so bases never float on slopes.
      const y = terrain.sample(p.x, p.z) - (kind === 'boulder' ? 0.6 : 0.05);
      q.setFromAxisAngle(up, p.rot);
      s.setScalar(p.scale);
      t.set(p.x, y, p.z);
      m.compose(t, q, s);
      // Each plant gets its own tint: some greener, some more olive or autumn-touched.
      const r = hash01(31, i, kind.length);
      const leafy = kind === 'oak' || kind === 'birch' || kind === 'pine' || kind === 'bush';
      const tint = leafy
        ? new THREE.Color(1, 1, 1).multiplyScalar(0.82 + r * 0.32).lerp(new THREE.Color(1.15, 1.05, 0.7), hash01(32, i) * 0.35)
        : new THREE.Color(1, 1, 1).multiplyScalar(0.85 + r * 0.25);
      for (const mesh of meshes) {
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, tint);
      }
    });
    for (const mesh of meshes) {
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  return group;
}
