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

function bush(seed: number, berries: boolean): PlantGeo {
  const parts: THREE.BufferGeometry[] = [];
  const lobes: Lobe[] = [];
  for (let k = 0; k < 4; k++) {
    const a = k * 1.9 + hash01(seed, 1, k);
    lobes.push({ center: V(Math.cos(a) * 0.45, 0.42 + hash01(seed, 3, k) * 0.2, Math.sin(a) * 0.45), radius: 0.5 + hash01(seed, 2, k) * 0.25 });
  }
  const g = canopyMass(lobes, seed, { deep: color('#22391a'), base: color('#456f2a'), sun: color('#86a83d') }, 3);
  // Squash so the bush sits low and wide.
  g.scale(1, 0.85, 1);
  // Berry bushes carry fruit; thickets do not.
  if (berries) {
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

/** A wild beehive in a fallen hollow log, with comb showing at the opening and bees about. */
function beehive(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const len = 1.8;
  const r = 0.38;
  const shell = new THREE.CylinderGeometry(r, r * 1.08, len, 12, 3, true);
  shell.rotateZ(Math.PI / 2);
  shell.translate(0, r * 0.9, 0);
  parts.push(part(shell, (p) => mix(color('#3a2a1c'), color('#6a5038'), noise3(p.x * 3, p.y * 8, p.z * 8) * 0.5 + 0.5)));
  const inner = new THREE.CylinderGeometry(r * 0.78, r * 0.82, len * 0.98, 12, 1, true);
  inner.rotateZ(Math.PI / 2);
  inner.translate(0, r * 0.9, 0);
  // Flip inner faces so the hollow reads from outside.
  inner.scale(1, 1, -1);
  parts.push(part(inner, color('#20160e')));
  // Bark rim and a broken stub of branch.
  for (const sx of [-len / 2, len / 2]) {
    const rim = new THREE.TorusGeometry(r * 0.9, r * 0.12, 6, 14);
    rim.rotateY(Math.PI / 2);
    rim.translate(sx, r * 0.9, 0);
    parts.push(part(rim, color('#4a3524')));
  }
  parts.push(part(limb(V(0.2, r * 1.6, 0), V(0.5, r * 2.6, 0.2), 0.07, 0.03, 5), color('#4a3524')));
  // Honeycomb filling the open end.
  const comb = new THREE.CircleGeometry(r * 0.76, 6);
  comb.rotateY(Math.PI / 2);
  comb.translate(len / 2 - 0.08, r * 0.9, 0);
  parts.push(part(comb, (p) => (Math.floor((p.y + p.z * 0.6) * 22) % 2 ? color('#d9a02a') : color('#b07818'))));
  // A few bees in the air near the entrance.
  for (let k = 0; k < 9; k++) {
    const b = new THREE.SphereGeometry(0.025, 5, 4);
    b.scale(1.4, 1, 1);
    b.translate(len / 2 + 0.15 + hash01(seed, 1, k) * 0.5, r * 0.6 + hash01(seed, 2, k) * 0.8, (hash01(seed, 3, k) - 0.5) * 0.8);
    parts.push(part(b, k % 2 ? color('#e0b030') : color('#2a2010')));
  }
  return merge(parts);
}

/** Ground nests of reeds and twigs along the bank, with eggs and a few feathers. */
function nest(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let n = 0; n < 2; n++) {
    const cx = n === 0 ? 0 : 0.7;
    const cz = n === 0 ? 0 : 0.45;
    const R = n === 0 ? 0.28 : 0.22;
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2 + hash01(seed, n, k);
      const b = a + 1.1 + hash01(seed, n + 3, k) * 0.6;
      const h = 0.05 + hash01(seed, n + 5, k) * 0.08;
      parts.push(part(limb(V(cx + Math.cos(a) * R, h, cz + Math.sin(a) * R), V(cx + Math.cos(b) * R * 1.05, h + 0.03, cz + Math.sin(b) * R * 1.05), 0.012, 0.01, 3), k % 3 ? color('#8a7448') : color('#5e4a2c')));
    }
    const bowl = new THREE.SphereGeometry(R * 0.85, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    bowl.scale(1, 0.35, 1);
    bowl.translate(cx, 0.1, cz);
    parts.push(part(bowl, color('#6e5a36')));
    const eggs = n === 0 ? 3 : 2;
    for (let e = 0; e < eggs; e++) {
      const egg = new THREE.SphereGeometry(0.045, 8, 6);
      egg.scale(1, 1.25, 1);
      egg.rotateZ(1.2);
      egg.translate(cx + Math.cos(e * 2.1) * 0.07, 0.1, cz + Math.sin(e * 2.1) * 0.07);
      parts.push(part(egg, n === 0 ? color('#cfe0e0') : color('#e8dcc4')));
    }
  }
  // Loose feathers on the ground.
  for (let k = 0; k < 3; k++) {
    const fth = new THREE.PlaneGeometry(0.05, 0.18);
    fth.rotateX(-Math.PI / 2 + 0.1);
    fth.rotateY(hash01(seed, 9, k) * Math.PI * 2);
    fth.translate(0.35 + k * 0.2, 0.02, -0.3 + k * 0.15);
    parts.push(part(fth, color('#d8d4cc')));
  }
  return merge(parts);
}

/** A small wild apple tree: short leaning trunk, round crown, red and yellow fruit. */
function apple(seed: number): PlantGeo {
  const parts: THREE.BufferGeometry[] = [];
  const h = rand(seed, 1, 1.9, 2.4);
  const a = rand(seed, 2, 0, 6.28);
  const top = V(Math.cos(a) * 0.35, h, Math.sin(a) * 0.35);
  parts.push(limbTube({ points: [V(0, -0.3, 0), V(top.x * 0.4, h * 0.5, top.z * 0.4), top], r0: 0.2, r1: 0.1, flare: 0.5, knots: [{ t: 0.5, angle: a, size: 0.06 }] }, OAK_BARK, 8, 10));
  const lobes: Lobe[] = [];
  for (let k = 0; k < 4; k++) {
    const ba = a + k * 1.6 + rand(seed, 3, -0.3, 0.3, k);
    const end = V(top.x + Math.cos(ba) * 1.1, h + 0.8, top.z + Math.sin(ba) * 1.1);
    parts.push(limbTube({ points: [top, end], r0: 0.08, r1: 0.03 }, OAK_BARK, 5, 5));
    lobes.push({ center: end.clone().add(V(0, 0.3, 0)), radius: rand(seed, 4, 0.9, 1.2, k) });
  }
  lobes.push({ center: top.clone().add(V(0, 1.4, 0)), radius: 1.3 });
  const fruit = [color('#b8262b'), color('#d6492a'), color('#d9b531')];
  for (let k = 0; k < 16; k++) {
    const lb = lobes[k % lobes.length];
    const u = hash01(seed, 5, k) * Math.PI * 2;
    const v = 0.4 + hash01(seed, 6, k) * 0.9;
    const g = new THREE.SphereGeometry(0.075, 6, 5);
    g.translate(lb.center.x + Math.cos(u) * Math.sin(v) * lb.radius * 0.95, lb.center.y - Math.cos(v) * lb.radius * 0.8, lb.center.z + Math.sin(u) * Math.sin(v) * lb.radius * 0.95);
    parts.push(part(g, fruit[k % 3]));
  }
  return { wood: merge(parts), leaves: canopyMass(lobes, seed, { deep: color('#25421c'), base: color('#4a7330'), sun: color('#8fae48') }, 4) };
}

/** Hazel: a many-stemmed shrub, stems fanning out, clusters of nuts in their husks. */
function hazel(seed: number): PlantGeo {
  const parts: THREE.BufferGeometry[] = [];
  const lobes: Lobe[] = [];
  const bark: BarkPalette = { dark: color('#4a3a2c'), light: color('#8a7058'), knot: color('#2a2018') };
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + hash01(seed, 1, k);
    const lean = 0.5 + hash01(seed, 2, k) * 0.6;
    const h = 2.2 + hash01(seed, 3, k) * 0.9;
    const end = V(Math.cos(a) * lean, h, Math.sin(a) * lean);
    parts.push(limbTube({ points: [V(Math.cos(a) * 0.1, -0.2, Math.sin(a) * 0.1), V(end.x * 0.5, h * 0.55, end.z * 0.5), end], r0: 0.05, r1: 0.025 }, bark, 5, 6));
    lobes.push({ center: end.clone().add(V(Math.cos(a) * 0.2, 0.1, Math.sin(a) * 0.2)), radius: 0.7 + hash01(seed, 4, k) * 0.25 });
  }
  lobes.push({ center: V(0, 2.0, 0), radius: 0.9 });
  const nut = color('#8a5a2a');
  const husk = color('#9fb04a');
  for (let k = 0; k < 10; k++) {
    const lb = lobes[k % lobes.length];
    const u = hash01(seed, 5, k) * Math.PI * 2;
    const x = lb.center.x + Math.cos(u) * lb.radius * 0.95;
    const z = lb.center.z + Math.sin(u) * lb.radius * 0.95;
    const y = lb.center.y - lb.radius * 0.3;
    for (let n = 0; n < 3; n++) {
      const g = new THREE.SphereGeometry(0.04, 5, 4);
      g.scale(1, 1.2, 1);
      g.translate(x + (n - 1) * 0.05, y, z);
      parts.push(part(g, n === 1 ? husk : nut));
    }
  }
  const leaves = canopyMass(lobes, seed, { deep: color('#29431d'), base: color('#557a2e'), sun: color('#9bb24a') }, 3);
  return { wood: merge(parts), leaves };
}

/** A stand of wild grain: stalks with drooping golden seed heads. */
function grain(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = color('#8a9a48');
  const ripe = color('#d8b85a');
  // Low leafy base so the stand reads from a distance.
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const blade = new THREE.PlaneGeometry(0.06, 0.45);
    blade.translate(0, 0.22, 0);
    blade.rotateX(0.5);
    blade.rotateY(-a);
    blade.translate(Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15);
    parts.push(part(blade, (p) => mix(color('#5f7a34'), stem, p.y * 2)));
  }
  for (let k = 0; k < 48; k++) {
    const a = hash01(seed, 1, k) * Math.PI * 2;
    const r = Math.sqrt(hash01(seed, 2, k)) * 0.75;
    const h = 0.85 + hash01(seed, 3, k) * 0.4;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const bend = 0.12 + hash01(seed, 4, k) * 0.15;
    const tip = V(x + Math.cos(a) * bend, h, z + Math.sin(a) * bend);
    parts.push(part(limb(V(x, -0.05, z), tip, 0.018, 0.01, 3), (p) => mix(stem, ripe, Math.min(1, p.y / h))));
    const head = new THREE.CapsuleGeometry(0.035, 0.2, 2, 5);
    head.rotateZ(0.55);
    head.rotateY(-a);
    head.translate(tip.x + Math.cos(a) * 0.05, h - 0.04, tip.z + Math.sin(a) * 0.05);
    parts.push(part(head, (p) => jitter(ripe, 0.1, p.x * 9, p.y * 9, p.z * 9)));
  }
  return merge(parts);
}

/** Wild tubers above ground: a rosette of broad leaves and white umbel flowers. */
function tubers(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const leaf = color('#4f7a30');
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + hash01(seed, 1, k) * 0.4;
    const g = new THREE.SphereGeometry(0.16, 6, 4);
    g.scale(1.6, 0.18, 0.7);
    g.rotateZ(-0.35);
    g.translate(0.22, 0.1, 0);
    g.rotateY(-a);
    parts.push(part(g, (p) => jitter(leaf, 0.12, p.x * 5, p.y * 5, p.z * 5)));
  }
  for (let k = 0; k < 3; k++) {
    const a = hash01(seed, 2, k) * 6.28;
    const top = V(Math.cos(a) * 0.12, 0.55 + hash01(seed, 3, k) * 0.2, Math.sin(a) * 0.12);
    parts.push(part(limb(V(0, 0, 0), top, 0.012, 0.01, 3), color('#5f7d34')));
    const umbel = new THREE.SphereGeometry(0.09, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);
    umbel.scale(1, 0.4, 1);
    umbel.translate(top.x, top.y, top.z);
    parts.push(part(umbel, color('#eeeadc')));
  }
  return merge(parts);
}

/** A ring of mushrooms on a mossy patch. */
function mushrooms(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const moss = new THREE.CircleGeometry(0.8, 10);
  moss.rotateX(-Math.PI / 2);
  moss.translate(0, 0.03, 0);
  parts.push(part(moss, (p) => jitter(color('#4f6a2a'), 0.15, p.x * 4, 0, p.z * 4)));
  const red = hash01(seed, 9) > 0.6;
  const cap = red ? color('#b8352a') : color('#9a6a3e');
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + hash01(seed, 1, k) * 0.5;
    const r = 0.45 + hash01(seed, 2, k) * 0.2;
    const h = 0.1 + hash01(seed, 3, k) * 0.1;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    parts.push(part(limb(V(x, 0, z), V(x, h, z), 0.02, 0.016, 5), color('#e8e0cc')));
    const c = new THREE.SphereGeometry(0.06 + hash01(seed, 4, k) * 0.04, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    c.scale(1, 0.6, 1);
    c.translate(x, h, z);
    parts.push(part(c, (p) => (red && noise3(p.x * 40, p.y * 40, p.z * 40) > 0.45 ? color('#f2ead8') : cap)));
  }
  return merge(parts);
}

/** Wild flax: slender stalks with small sky-blue flowers. */
function flax(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = color('#6f8f3e');
  const bloom = color('#7aa0de');
  for (let k = 0; k < 18; k++) {
    const a = hash01(seed, 1, k) * Math.PI * 2;
    const r = Math.sqrt(hash01(seed, 2, k)) * 0.5;
    const h = 0.6 + hash01(seed, 3, k) * 0.3;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    parts.push(part(limb(V(x, -0.05, z), V(x * 1.1, h, z * 1.1), 0.008, 0.006, 3), stem));
    if (k % 2 === 0) {
      const f = new THREE.CircleGeometry(0.045, 5);
      f.rotateX(-Math.PI / 2 + 0.3);
      f.translate(x * 1.1, h, z * 1.1);
      parts.push(part(f, bloom));
    }
  }
  return merge(parts);
}

/** A shellfish bed: mussels clustered on stones in the shallows. */
function shellfish(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const g = rockShape(0.35, seed + k);
    g.translate((hash01(seed, 1, k) - 0.5) * 1.2, 0, (hash01(seed, 2, k) - 0.5) * 1.2);
    parts.push(part(g, (p) => jitter(color('#6a665c'), 0.1, p.x * 3, p.y * 3, p.z * 3)));
  }
  for (let k = 0; k < 22; k++) {
    const sh = new THREE.SphereGeometry(0.06, 6, 4);
    sh.scale(1.8, 0.6, 0.9);
    sh.rotateY(hash01(seed, 3, k) * 6.28);
    sh.translate((hash01(seed, 4, k) - 0.5) * 1.3, 0.15 + hash01(seed, 5, k) * 0.12, (hash01(seed, 6, k) - 0.5) * 1.3);
    parts.push(part(sh, k % 4 ? color('#1f2230') : color('#4a3a5a')));
  }
  return merge(parts);
}

/** A tall rainforest tree: buttress roots, a straight trunk and a broad, flat crown. */
function tropical(seed: number): PlantGeo {
  const parts: THREE.BufferGeometry[] = [];
  const h = rand(seed, 1, 8, 11);
  const bark: BarkPalette = { dark: color('#5a5040'), light: color('#9a8e74'), knot: color('#3a3226') };
  parts.push(limbTube({ points: [V(0, -0.4, 0), V(0.2, h * 0.5, 0.1), V(0, h, 0)], r0: 0.4, r1: 0.22, flare: 1.2 }, bark, 10, 10));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + rand(seed, 2, 0, 1);
    const g = new THREE.BoxGeometry(0.12, 1.4, 1.2);
    g.translate(0, 0.5, 0.75);
    g.rotateY(a);
    parts.push(part(g, bark.dark));
  }
  const lobes: Lobe[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + rand(seed, 3, 0, 1);
    const end = V(Math.cos(a) * 2.6, h + rand(seed, 4, 0.2, 1.0, k), Math.sin(a) * 2.6);
    parts.push(limbTube({ points: [V(0, h - 0.5, 0), end], r0: 0.14, r1: 0.05 }, bark, 5, 5));
    lobes.push({ center: end.clone().add(V(0, 0.4, 0)), radius: rand(seed, 5, 1.4, 1.9, k) });
  }
  lobes.push({ center: V(0, h + 0.9, 0), radius: 2.1 });
  const leaves = canopyMass(lobes.map((l) => ({ ...l, center: l.center.clone().multiply(V(1, 1, 1)) })), seed, { deep: color('#1c3a18'), base: color('#2f6a26'), sun: color('#6fa83c') }, 4);
  leaves.scale(1, 0.6, 1);
  leaves.translate(0, h * 0.4, 0);
  return { wood: merge(parts), leaves };
}

/** A spirit tree: pale silver bark and a crown of faintly glowing blue-white leaves. */
function spiritTree(seed: number): PlantGeo {
  const parts: THREE.BufferGeometry[] = [];
  const bark: BarkPalette = { dark: color('#8a8e98'), light: color('#e2e4ea'), knot: color('#5a5e6a') };
  const h = rand(seed, 1, 5, 6.5);
  parts.push(limbTube({ points: [V(0, -0.3, 0), V(0.5, h * 0.4, -0.2), V(-0.3, h * 0.75, 0.2), V(0, h, 0)], r0: 0.45, r1: 0.18, flare: 1.4, knots: [{ t: 0.4, angle: 1, size: 0.12 }] }, bark, 9, 12));
  const lobes: Lobe[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const end = V(Math.cos(a) * 2.2, h + 0.4, Math.sin(a) * 2.2);
    parts.push(limbTube({ points: [V(0, h * 0.75, 0), end], r0: 0.14, r1: 0.05 }, bark, 5, 6));
    lobes.push({ center: end.clone().add(V(0, 0.4, 0)), radius: 1.3 });
  }
  lobes.push({ center: V(0, h + 1.2, 0), radius: 1.6 });
  return { wood: merge(parts), leaves: canopyMass(lobes, seed, { deep: color('#4a5a8a'), base: color('#8aa4d8'), sun: color('#d6e6ff') }, 4) };
}

/** A clump of bamboo: segmented green culms with feathery leaves. */
function bamboo(seed: number): PlantGeo {
  const parts: THREE.BufferGeometry[] = [];
  const lobes: Lobe[] = [];
  for (let k = 0; k < 9; k++) {
    const a = hash01(seed, 1, k) * Math.PI * 2;
    const r = Math.sqrt(hash01(seed, 2, k)) * 0.8;
    const h = 4 + hash01(seed, 3, k) * 3;
    const base = V(Math.cos(a) * r, -0.1, Math.sin(a) * r);
    const top = V(Math.cos(a) * (r + 0.5), h, Math.sin(a) * (r + 0.5));
    parts.push(part(limb(base, top, 0.07, 0.05, 6), (p) => (Math.abs(Math.sin(p.y * 6)) < 0.08 ? color('#7a8a3a') : color('#5f8a34'))));
    lobes.push({ center: top.clone().add(V(0, -0.6, 0)), radius: 0.7 });
  }
  return { wood: merge(parts), leaves: canopyMass(lobes, seed, { deep: color('#2a4a1c'), base: color('#4f7f2c'), sun: color('#9aba52') }, 3) };
}

/** Wild cotton: a low bush dotted with white bolls. */
function cotton(seed: number): PlantGeo {
  const b = bush(seed, false);
  const parts: THREE.BufferGeometry[] = b.wood ? [b.wood] : [];
  for (let k = 0; k < 18; k++) {
    const a = hash01(seed, 1, k) * Math.PI * 2;
    const g = new THREE.IcosahedronGeometry(0.08, 0);
    g.translate(Math.cos(a) * (0.5 + hash01(seed, 2, k) * 0.4), 0.6 + hash01(seed, 3, k) * 0.6, Math.sin(a) * (0.5 + hash01(seed, 2, k) * 0.4));
    parts.push(part(g, color('#f2efe6')));
  }
  return { wood: merge(parts), leaves: b.leaves };
}

/** Kelp and seaweed swaying in the shallows. */
function seaweed(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 10; k++) {
    const a = hash01(seed, 1, k) * Math.PI * 2;
    const r = hash01(seed, 2, k) * 0.8;
    const h = 0.6 + hash01(seed, 3, k) * 0.8;
    const blade = new THREE.PlaneGeometry(0.12, h, 1, 4);
    blade.translate(0, h / 2, 0);
    blade.rotateY(a);
    blade.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    parts.push(part(blade, (p) => mix(color('#3a4a1c'), color('#7a7a2a'), p.y / 1.4)));
  }
  return merge(parts);
}

/** Prickly pear: flat green pads with red fruit. */
function cactus(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const pad = (x: number, y: number, z: number, rot: number, tilt: number, s: number) => {
    const g = new THREE.SphereGeometry(0.32 * s, 9, 7);
    g.scale(1, 1.25, 0.28);
    g.rotateZ(tilt);
    g.rotateY(rot);
    g.translate(x, y, z);
    parts.push(part(g, (p) => jitter(color('#5a7a3a'), 0.08, p.x * 9, p.y * 9, p.z * 9)));
    return V(x + Math.sin(tilt) * -0.3 * s, y + Math.cos(tilt) * 0.38 * s, z);
  };
  const top = pad(0, 0.35, 0, hash01(seed, 1) * 3, 0, 1);
  for (let k = 0; k < 3; k++) {
    const t = pad(top.x + (k - 1) * 0.25, top.y + 0.2, top.z, hash01(seed, 2, k) * 3, (k - 1) * 0.5, 0.8);
    const f = new THREE.SphereGeometry(0.06, 6, 4);
    f.translate(t.x, t.y + 0.05, t.z);
    parts.push(part(f, color('#b8303a')));
  }
  return merge(parts);
}

/** Dry desert scrub: low, twiggy and grey-green. */
function scrub(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 14; k++) {
    const a = hash01(seed, 1, k) * Math.PI * 2;
    const len = 0.4 + hash01(seed, 2, k) * 0.4;
    parts.push(part(limb(V(0, 0, 0), V(Math.cos(a) * len, 0.3 + hash01(seed, 3, k) * 0.4, Math.sin(a) * len), 0.025, 0.01, 3), color('#6a5a44')));
    const tuft = new THREE.IcosahedronGeometry(0.14, 0);
    tuft.translate(Math.cos(a) * len, 0.35 + hash01(seed, 3, k) * 0.4, Math.sin(a) * len);
    parts.push(part(tuft, (p) => jitter(color('#8a9070'), 0.12, p.x * 7, p.y * 7, p.z * 7)));
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
    case 'bush': return { geo: bush(seed, false), sway: 0.02, flat: false, shadow: true, density: 1.1 };
    case 'berrybush': return { geo: bush(seed, true), sway: 0.02, flat: false, shadow: true, density: 1.1 };
    case 'apple': return { geo: apple(seed), sway: 0.002, flat: false, shadow: true, density: 1 };
    case 'hazel': return { geo: hazel(seed), sway: 0.006, flat: false, shadow: true, density: 1 };
    case 'grain': return { geo: { wood: grain(seed) }, sway: 0.12, flat: false, shadow: true, density: 1 };
    case 'tubers': return { geo: { wood: tubers(seed) }, sway: 0.08, flat: false, shadow: false, density: 1 };
    case 'mushrooms': return { geo: { wood: mushrooms(seed) }, sway: 0, flat: false, shadow: false, density: 1 };
    case 'flax': return { geo: { wood: flax(seed) }, sway: 0.2, flat: false, shadow: false, density: 1 };
    case 'shellfish': return { geo: { wood: shellfish(seed) }, sway: 0, flat: true, shadow: false, density: 1 };
    case 'rock': return { geo: { wood: rock(seed, 0.8) }, sway: 0, flat: true, shadow: true, density: 1 };
    case 'boulder': return { geo: { wood: rock(seed + 5, 2.2) }, sway: 0, flat: true, shadow: true, density: 1 };
    case 'reeds': return { geo: { wood: reeds(seed) }, sway: 0.05, flat: false, shadow: false, density: 1 };
    case 'flowers': return { geo: { wood: flowers(seed) }, sway: 0.25, flat: false, shadow: false, density: 1 };
    case 'beehive': return { geo: { wood: beehive(seed) }, sway: 0, flat: false, shadow: true, density: 1 };
    case 'nest': return { geo: { wood: nest(seed) }, sway: 0, flat: false, shadow: false, density: 1 };
    case 'tropical': return { geo: tropical(seed), sway: 0.0012, flat: false, shadow: true, density: 1.05 };
    case 'spirit': return { geo: spiritTree(seed), sway: 0.0015, flat: false, shadow: true, density: 0.95 };
    case 'bamboo': return { geo: bamboo(seed), sway: 0.006, flat: false, shadow: true, density: 0.9 };
    case 'cotton': return { geo: cotton(seed), sway: 0.02, flat: false, shadow: true, density: 1.1 };
    case 'seaweed': return { geo: { wood: seaweed(seed) }, sway: 0.15, flat: false, shadow: false, density: 1 };
    case 'cactus': return { geo: { wood: cactus(seed) }, sway: 0, flat: false, shadow: true, density: 1 };
    case 'scrub': return { geo: { wood: scrub(seed) }, sway: 0.03, flat: false, shadow: false, density: 1 };
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
        side: ['reeds', 'flax', 'mushrooms', 'grain', 'seaweed'].includes(kind) ? THREE.DoubleSide : THREE.FrontSide,
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
      const y = terrain.sample(p.x, p.z) - (kind === 'boulder' ? 0.6 : kind === 'shellfish' ? 0.15 : 0.05);
      q.setFromAxisAngle(up, p.rot);
      s.setScalar(p.scale);
      t.set(p.x, y, p.z);
      m.compose(t, q, s);
      // Each plant gets its own tint: some greener, some more olive or autumn-touched.
      const r = hash01(31, i, kind.length);
      const leafy = ['oak', 'birch', 'pine', 'bush', 'berrybush', 'apple', 'hazel', 'tropical', 'spirit', 'bamboo', 'cotton'].includes(kind);
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
