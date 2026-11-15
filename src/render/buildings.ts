// Buildings, built in code from a small kit: daub walls, thatched cones and gables, posts,
// fences, piles of logs and stone, pits, racks and jetties. Every town has its own style
// (roof material, wall finish, cloth colour) and every building its own variant (size, door,
// porch, clutter), so no two towns, and no two huts, look quite alike.
//
// Hunter-gatherer and Stone age models are built here in full; later ages fall back to a
// generic model by kind until their own models are made.

import * as THREE from 'three';
import { hash01 } from '../sim/rng';
import { color, jitter, limb, merge, mix, noise3, part } from './geom';
import { rockShape } from './materials';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
type G = THREE.BufferGeometry;
type C = THREE.Color;

// ------------------------------------------------------------------ town styles

export interface TownStyle {
  name: string;
  roofKind: 'thatch' | 'reed' | 'turf' | 'bark';
  roof: C;
  roofDark: C;
  wallKind: 'daub' | 'wattle' | 'log';
  wall: C;
  wood: C;
  cloth: C;
  stone: C;
}

const STYLES: TownStyle[] = [
  { name: 'Golden thatch, ochre daub', roofKind: 'thatch', roof: color('#b99a58'), roofDark: color('#7d6334'), wallKind: 'daub', wall: color('#b98f5c'), wood: color('#5e4430'), cloth: color('#a8352a'), stone: color('#8f8a80') },
  { name: 'Grey reed, limewashed', roofKind: 'reed', roof: color('#8f8a72'), roofDark: color('#5f5a48'), wallKind: 'daub', wall: color('#d9d1bd'), wood: color('#4e3a2a'), cloth: color('#3a5f9a'), stone: color('#9a958a') },
  { name: 'Turf roofs, log walls', roofKind: 'turf', roof: color('#56683a'), roofDark: color('#4a3a26'), wallKind: 'log', wall: color('#7a5a3c'), wood: color('#4a3626'), cloth: color('#c9a43a'), stone: color('#7f7b72') },
  { name: 'Bark roofs, red clay', roofKind: 'bark', roof: color('#5c4632'), roofDark: color('#3a2b1e'), wallKind: 'daub', wall: color('#a2654a'), wood: color('#3e2c1e'), cloth: color('#2f7a5a'), stone: color('#8a7e72') },
  { name: 'Golden thatch, woven wattle', roofKind: 'thatch', roof: color('#c2a364'), roofDark: color('#86693a'), wallKind: 'wattle', wall: color('#7d5d3c'), wood: color('#5a4230'), cloth: color('#7a3a8a'), stone: color('#958f84') },
  { name: 'Reed roofs, red daub', roofKind: 'reed', roof: color('#9a9478'), roofDark: color('#686248'), wallKind: 'daub', wall: color('#a86e50'), wood: color('#4a3626'), cloth: color('#d6a83e'), stone: color('#8c877c') },
];

export const STYLE_COUNT = STYLES.length;

/** A town's style, chosen from the world seed (or forced, for previews). */
export function townStyle(seed: number, override?: number): TownStyle {
  const i = override !== undefined && Number.isFinite(override) ? ((override % STYLES.length) + STYLES.length) % STYLES.length : Math.floor(hash01(seed, 404) * STYLES.length);
  return STYLES[i];
}

// ------------------------------------------------------------------ kit

const DIRT = color('#5a4630');
const POT = color('#a2603c');
const POT_DARK = color('#6a3a24');
const HIDE = color('#b08a62');
const LOG = color('#6a4e34');
const LOG_END = color('#c2a070');

function wallColor(s: TownStyle) {
  return (p: THREE.Vector3) => {
    let c: C;
    if (s.wallKind === 'wattle') {
      // Woven rods: horizontal bands that weave in and out.
      const a = Math.atan2(p.z, p.x) * 6;
      const band = Math.sin(p.y * 18 + (Math.floor(a) % 2) * Math.PI) * 0.5 + 0.5;
      c = mix(s.wall, s.wood, band * 0.5);
    } else if (s.wallKind === 'log') {
      const band = Math.abs(Math.sin(p.y * 9.5));
      c = mix(s.wood, s.wall, band);
    } else {
      c = s.wall.clone();
      // Daub patches and a splash of mud at the foot.
      c = mix(c, s.wall.clone().multiplyScalar(0.82), noise3(p.x * 2.5, p.y * 2.5, p.z * 2.5) * 0.5 + 0.3);
    }
    if (p.y < 0.35) c = mix(c, DIRT, (0.35 - p.y) * 2);
    return jitter(c, 0.05, p.x * 7, p.y * 7, p.z * 7);
  };
}

function roofColor(s: TownStyle) {
  return (p: THREE.Vector3) => {
    const n = noise3(p.x * 3, p.y * 3, p.z * 3) * 0.5 + 0.5;
    let c: C;
    if (s.roofKind === 'turf') {
      // Grass on sod: patchy, with bare earth showing at the eaves.
      const patch = noise3(p.x * 7, p.y * 7, p.z * 7) * 0.5 + 0.5;
      c = mix(mix(s.roof, color('#7a8a48'), patch * 0.7), s.roofDark, Math.max(0, 0.6 - n) * 0.8);
    }
    else if (s.roofKind === 'bark') c = mix(s.roofDark, s.roof, Math.abs(Math.sin(p.y * 7 + n * 2)));
    else {
      // Thatch and reed: courses laid in bands, weathered darker toward the eaves.
      const course = Math.abs(Math.sin(p.y * 6.5));
      c = mix(s.roofDark, s.roof, 0.45 + course * 0.35 + n * 0.25);
    }
    return jitter(c, 0.07, p.x * 9, p.y * 9, p.z * 9);
  };
}

/** A round daub (or wattle, or log) wall with a doorway gap facing +z. */
function roundWall(r: number, h: number, s: TownStyle, door = 0.55): G[] {
  const half = door / 2;
  // Cylinder angles start at +z, so the gap left between the end and the start faces +z.
  const g = new THREE.CylinderGeometry(r, r * 1.03, h, 22, 3, true, half, Math.PI * 2 - door);
  g.translate(0, h / 2, 0);
  const parts = [part(g, wallColor(s))];
  // Door posts and lintel.
  for (const sgn of [-1, 1]) {
    const a = half * sgn;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    parts.push(part(limb(V(x, -0.1, z), V(x, h * 0.95, z), 0.07, 0.06, 5), s.wood));
  }
  const ax = Math.sin(half) * r;
  const az = Math.cos(half) * r;
  parts.push(part(limb(V(ax, h * 0.92, az), V(-ax, h * 0.92, az), 0.06, 0.06, 5), s.wood));
  return parts;
}

/** A shaggy conical roof. */
function coneRoof(r: number, h: number, base: number, s: TownStyle, seed: number): G[] {
  const g = new THREE.ConeGeometry(r, h, 26, 6, true);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const edge = y < -h / 2 + 0.01;
    const shag = edge ? 1 + (noise3(x * 4 + seed, 0, z * 4) - 0.2) * 0.12 : 1 + noise3(x * 2, y * 2, z * 2) * 0.03;
    pos.setX(i, x * shag);
    pos.setZ(i, z * shag);
    if (edge) pos.setY(i, y - Math.abs(noise3(x * 5, seed, z * 5)) * 0.15);
  }
  g.computeVertexNormals();
  g.translate(0, base + h / 2, 0);
  const parts = [part(g, roofColor(s))];
  // A smoke-dark cap at the apex.
  const cap = new THREE.ConeGeometry(r * 0.16, h * 0.16, 12, 1, true);
  cap.translate(0, base + h - h * 0.08 + 0.02, 0);
  parts.push(part(cap, s.roofDark.clone().multiplyScalar(0.6)));
  return parts;
}

/** A pitched roof along x (ridge along x), eaves at height `base`. */
function gableRoof(w: number, d: number, rise: number, base: number, s: TownStyle): G[] {
  const parts: G[] = [];
  const slope = Math.hypot(d / 2, rise);
  const ang = Math.atan2(rise, d / 2);
  for (const sgn of [-1, 1]) {
    const g = new THREE.BoxGeometry(w + 0.5, 0.2, slope + 0.35, 6, 1, 4);
    g.rotateX(sgn * ang);
    g.translate(0, base + rise / 2, (sgn * d) / 4);
    parts.push(part(g, roofColor(s)));
  }
  const ridge = new THREE.CylinderGeometry(0.14, 0.14, w + 0.6, 6);
  ridge.rotateZ(Math.PI / 2);
  ridge.translate(0, base + rise + 0.05, 0);
  parts.push(part(ridge, s.roofDark));
  return parts;
}

/** Gable end walls (triangles) for a closed building. */
function gableEnds(w: number, d: number, rise: number, base: number, s: TownStyle): G[] {
  const parts: G[] = [];
  for (const sgn of [-1, 1]) {
    const g = new THREE.BufferGeometry();
    const x = (sgn * w) / 2;
    const v = [x, base, -d / 2, x, base, d / 2, x, base + rise, 0];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    parts.push(part(g, wallColor(s)));
  }
  return parts;
}

/** Rectangular walls with a door in the +z side. */
function boxWalls(w: number, d: number, h: number, s: TownStyle, doorW = 1): G[] {
  const parts: G[] = [];
  const t = 0.18;
  const wall = (gw: number, gd: number, x: number, z: number) => {
    const g = new THREE.BoxGeometry(gw, h, gd, Math.max(1, Math.round(gw)), 2, Math.max(1, Math.round(gd)));
    g.translate(x, h / 2, z);
    parts.push(part(g, wallColor(s)));
  };
  wall(w, t, 0, -d / 2);
  wall(t, d, -w / 2, 0);
  wall(t, d, w / 2, 0);
  const side = (w - doorW) / 2;
  wall(side, t, -w / 2 + side / 2, d / 2);
  wall(side, t, w / 2 - side / 2, d / 2);
  // Corner posts and door frame.
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [-doorW / 2, d / 2], [doorW / 2, d / 2]])
    parts.push(part(limb(V(x, -0.1, z), V(x, h, z), 0.09, 0.08, 5), s.wood));
  return parts;
}

/** Posts holding up a roof, for open sheds. */
function posts(w: number, d: number, h: number, s: TownStyle): G[] {
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].map(([x, z]) => part(limb(V(x, -0.1, z), V(x, h, z), 0.1, 0.09, 6), s.wood));
}

function logPile(n: number, len: number, x: number, z: number, rot = 0): G[] {
  const parts: G[] = [];
  let k = 0;
  for (let row = 0; k < n; row++)
    for (let i = 0; i < 4 - row && k < n; i++, k++) {
      const r = 0.15;
      const g = new THREE.CylinderGeometry(r, r, len, 8);
      g.rotateZ(Math.PI / 2);
      g.translate(0, r + row * r * 1.7, (i - (3 - row) / 2) * r * 2.05);
      g.rotateY(rot);
      g.translate(x, 0, z);
      parts.push(part(g, (p, nrm) => (Math.abs(nrm.x * Math.cos(rot) - nrm.z * Math.sin(rot)) > 0.9 ? LOG_END : jitter(LOG, 0.1, p.x * 5, p.y * 5, p.z * 5))));
    }
  return parts;
}

function blockPile(n: number, x: number, z: number, s: TownStyle, seed: number): G[] {
  const parts: G[] = [];
  for (let k = 0; k < n; k++) {
    const g = new THREE.BoxGeometry(0.6, 0.38, 0.4);
    const row = Math.floor(k / 3);
    g.translate(((k % 3) - 1) * 0.65 + (row % 2) * 0.3, 0.19 + row * 0.39, 0);
    g.rotateY(hash01(seed, k) * 0.1);
    g.translate(x, 0, z);
    parts.push(part(g, (p) => jitter(s.stone, 0.08, p.x * 4, p.y * 4, p.z * 4)));
  }
  return parts;
}

function pots(n: number, x: number, z: number, seed: number): G[] {
  const parts: G[] = [];
  for (let k = 0; k < n; k++) {
    const g = new THREE.LatheGeometry([new THREE.Vector2(0.01, 0), new THREE.Vector2(0.16, 0.04), new THREE.Vector2(0.2, 0.18), new THREE.Vector2(0.14, 0.34), new THREE.Vector2(0.12, 0.4)], 9);
    const a = k * 2.3 + seed;
    g.translate(x + Math.cos(a) * 0.35 * (k > 0 ? 1 : 0), 0, z + Math.sin(a) * 0.35 * (k > 0 ? 1 : 0));
    parts.push(part(g, (p) => mix(POT, POT_DARK, Math.max(0, 0.4 - p.y) * 1.5)));
  }
  return parts;
}

function reedBundles(n: number, x: number, z: number, s: TownStyle): G[] {
  const parts: G[] = [];
  for (let k = 0; k < n; k++) {
    const g = new THREE.CylinderGeometry(0.16, 0.2, 1.6, 7);
    g.rotateZ(1.2);
    g.translate(x + k * 0.3, 0.25 + (k % 2) * 0.2, z + (k % 2) * 0.1);
    parts.push(part(g, (p) => jitter(s.roof, 0.1, p.x * 9, p.y * 9, p.z * 9)));
  }
  return parts;
}

/** A frame with a stretched hide (or cloth). */
function frame(x: number, z: number, rot: number, s: TownStyle, fill: C): G[] {
  const parts: G[] = [];
  const w = 1.3;
  const h = 1.6;
  const pts = [V(-w / 2, 0, 0), V(w / 2, 0, 0), V(-w / 2, h, 0), V(w / 2, h, 0)];
  const tr = (p: THREE.Vector3) => p.clone().applyAxisAngle(V(0, 1, 0), rot).add(V(x, 0, z));
  parts.push(part(limb(tr(pts[0]), tr(pts[2]), 0.04, 0.035, 4), s.wood));
  parts.push(part(limb(tr(pts[1]), tr(pts[3]), 0.04, 0.035, 4), s.wood));
  parts.push(part(limb(tr(pts[2]).add(V(0, -0.05, 0)), tr(pts[3]).add(V(0, -0.05, 0)), 0.035, 0.035, 4), s.wood));
  const hide = new THREE.PlaneGeometry(w * 0.85, h * 0.7, 2, 2);
  hide.translate(0, h * 0.5, 0.01);
  hide.rotateY(rot);
  hide.translate(x, 0, z);
  parts.push(part(hide, (p) => jitter(fill, 0.08, p.x * 6, p.y * 6, p.z * 6)));
  return parts;
}

/** A ring of posts with wattle hurdles between them, with a gap for a gate. */
function fenceRing(r: number, n: number, s: TownStyle, gate = 0.5, hurdles = true): G[] {
  const parts: G[] = [];
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2 + gate / 2;
    const a1 = ((k + 1) / n) * Math.PI * 2 + gate / 2 - (k === n - 1 ? gate : 0);
    const p0 = V(Math.sin(a0) * r, 0, Math.cos(a0) * r);
    const p1 = V(Math.sin(a1) * r, 0, Math.cos(a1) * r);
    parts.push(part(limb(p0.clone().add(V(0, -0.1, 0)), p0.clone().add(V(0, 1.05, 0)), 0.06, 0.05, 5), s.wood));
    if (hurdles) {
      const mid = p0.clone().lerp(p1, 0.5);
      const len = p0.distanceTo(p1);
      const g = new THREE.BoxGeometry(len, 0.75, 0.06, 4, 3, 1);
      g.rotateY(-Math.atan2(p1.z - p0.z, p1.x - p0.x));
      g.translate(mid.x, 0.5, mid.z);
      parts.push(part(g, (p) => mix(s.wood, color('#8a6a46'), Math.abs(Math.sin(p.y * 22 + p.x * 3)) * 0.6)));
    } else
      for (const y of [0.45, 0.85]) parts.push(part(limb(p0.clone().add(V(0, y, 0)), p1.clone().add(V(0, y, 0)), 0.035, 0.035, 4), s.wood));
  }
  if (gate > 0) {
    const a = gate / 2;
    parts.push(part(limb(V(Math.sin(-a) * r, -0.1, Math.cos(-a) * r), V(Math.sin(-a) * r, 1.05, Math.cos(-a) * r), 0.06, 0.05, 5), s.wood));
  }
  return parts;
}

/** A shallow pit: dark hollow with a raised rim. */
function pit(r: number, x: number, z: number, inside: C, rim: C): G[] {
  const parts: G[] = [];
  const floor = new THREE.CircleGeometry(r, 16);
  floor.rotateX(-Math.PI / 2);
  floor.translate(x, 0.04, z);
  parts.push(part(floor, (p) => jitter(inside, 0.08, p.x * 4, 0, p.z * 4)));
  const ring = new THREE.TorusGeometry(r, 0.18, 5, 18);
  ring.rotateX(Math.PI / 2);
  ring.scale(1, 0.6, 1);
  ring.translate(x, 0.05, z);
  parts.push(part(ring, (p) => jitter(rim, 0.1, p.x * 5, p.y * 5, p.z * 5)));
  return parts;
}

/** Rows of tilled soil with a crop. */
function plots(w: number, d: number, rows: number, crop: C, flower: C | null, seed: number): G[] {
  const parts: G[] = [];
  for (let r = 0; r < rows; r++) {
    const z = -d / 2 + (r + 0.5) * (d / rows);
    const ridge = new THREE.BoxGeometry(w, 0.18, (d / rows) * 0.55, Math.ceil(w), 1, 1);
    ridge.translate(0, 0.06, z);
    parts.push(part(ridge, (p) => jitter(color('#5e4430'), 0.12, p.x * 4, 0, p.z * 4)));
    for (let k = 0; k < w * 2.2; k++) {
      const x = -w / 2 + 0.3 + (k / (w * 2.2)) * (w - 0.6);
      const h = 0.25 + hash01(seed, r, k) * 0.25;
      parts.push(part(limb(V(x, 0.12, z), V(x + (hash01(seed, k, r) - 0.5) * 0.1, 0.12 + h, z), 0.04, 0.012, 4), crop));
      if (flower && k % 2 === 0) {
        const f = new THREE.IcosahedronGeometry(0.05, 0);
        f.translate(x, 0.14 + h, z);
        parts.push(part(f, flower));
      }
    }
  }
  return parts;
}

function smokeRack(x: number, z: number, s: TownStyle): G[] {
  const parts: G[] = [];
  for (const sx of [-0.8, 0.8]) parts.push(part(limb(V(x + sx, -0.1, z), V(x + sx, 1.5, z), 0.05, 0.04, 4), s.wood));
  parts.push(part(limb(V(x - 0.9, 1.45, z), V(x + 0.9, 1.45, z), 0.04, 0.04, 4), s.wood));
  for (let k = 0; k < 5; k++) {
    const g = new THREE.SphereGeometry(0.08, 6, 4);
    g.scale(0.7, 2.6, 0.5);
    g.translate(x - 0.6 + k * 0.3, 1.15, z);
    parts.push(part(g, color('#7a5232')));
  }
  return parts;
}

function canoe(len: number, x: number, z: number, rot: number, carved = 1): G {
  const g = new THREE.CylinderGeometry(0.32, 0.32, len, 12, 6, false, 0, Math.PI);
  g.rotateZ(Math.PI / 2);
  g.rotateX(Math.PI);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getX(i) / (len / 2);
    const taper = 1 - Math.pow(Math.abs(t), 3) * 0.75;
    pos.setY(i, pos.getY(i) * taper * (carved > 0.5 ? 1 : 0.6));
    pos.setZ(i, pos.getZ(i) * taper);
  }
  g.computeVertexNormals();
  g.translate(0, 0.35, 0);
  g.rotateY(rot);
  g.translate(x, 0, z);
  return part(g, (p, n) => (n.y > 0.5 ? color('#3a2a1c') : jitter(color('#6a4e34'), 0.08, p.x * 4, p.y * 4, p.z * 4)));
}

function pennant(x: number, z: number, h: number, s: TownStyle): G[] {
  const flag = new THREE.PlaneGeometry(0.7, 0.4);
  flag.translate(0.35, h - 0.3, 0);
  flag.translate(x, 0, z);
  return [part(limb(V(x, 0, z), V(x, h, z), 0.04, 0.03, 4), s.wood), part(flag, s.cloth)];
}

// ------------------------------------------------------------------ hunter-gatherer and stone age models

type Model = (s: TownStyle, v: number) => G;

function hut(s: TownStyle, r: number, wallH: number, roofH: number, seed: number, porch = false): G[] {
  const parts = [...roundWall(r, wallH, s), ...coneRoof(r * 1.2, roofH, wallH - 0.1, s, seed)];
  if (porch) {
    // A small porch roof over the door.
    const g = new THREE.BoxGeometry(1.4, 0.12, 1.1);
    g.rotateX(0.35);
    g.translate(0, wallH + 0.1, r + 0.55);
    parts.push(part(g, roofColor(s)));
    for (const sx of [-0.6, 0.6]) parts.push(part(limb(V(sx, -0.1, r + 1), V(sx, wallH - 0.05, r + 1), 0.05, 0.05, 4), s.wood));
  }
  return parts;
}

const MODELS: Record<string, Model> = {
  roundhouse: (s, v) => {
    const r = 2.7 + (v % 2) * 0.4;
    const parts = hut(s, r, 1.7, 2.9 + (v % 3) * 0.2, v, v % 2 === 0);
    parts.push(...logPile(5, 1.4, r + 0.8, -0.8, 0.3));
    if (v % 2) parts.push(...pots(2, -r - 0.5, 0.8, v));
    if (v === 3) parts.push(...frame(-r - 0.8, -1, 0.6, s, HIDE));
    return merge(parts);
  },
  smokehouse: (s, v) => {
    const parts = hut(s, 1.7, 1.4, 2.2, v);
    parts.push(...smokeRack(2.6, 0.4, s), ...logPile(4, 1.2, -2.4, 0.5, 1.2));
    return merge(parts);
  },
  cookhouse: (s, v) => {
    const parts = hut(s, 2.4, 1.6, 2.6, v, true);
    // A clay oven dome by the door.
    const oven = new THREE.SphereGeometry(0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    oven.translate(2.4, 0, 2);
    parts.push(part(oven, (p) => jitter(color('#a0704a'), 0.1, p.x * 4, p.y * 4, p.z * 4)));
    parts.push(...pots(4, -2.8, 1.2, v), ...logPile(3, 1.1, 3.2, -0.6, 0.8));
    return merge(parts);
  },
  'herbalist-hut': (s, v) => {
    const parts = hut(s, 2, 1.5, 2.4, v, true);
    // Herb bunches hanging under the eaves, and a small bed.
    for (let k = 0; k < 6; k++) {
      const a = 0.8 + k * 0.35;
      const g = new THREE.ConeGeometry(0.08, 0.32, 5);
      g.rotateX(Math.PI);
      g.translate(Math.sin(a) * 2.3, 1.35, Math.cos(a) * 2.3);
      parts.push(part(g, k % 2 ? color('#6a8a3a') : color('#8a7a3a')));
    }
    parts.push(...plots(2.4, 1.6, 2, color('#4f7a34'), color('#b07ad9'), v).map((g) => g.translate(-3, 0, 1)));
    return merge(parts);
  },
  'weaver-hut': (s, v) => {
    const parts = hut(s, 2.3, 1.6, 2.6, v);
    // An upright loom outside, with cloth in the town's colour.
    const lx = 2.9;
    for (const sz of [-0.7, 0.7]) parts.push(part(limb(V(lx, -0.1, sz), V(lx, 1.9, sz), 0.05, 0.05, 4), s.wood));
    parts.push(part(limb(V(lx, 1.85, -0.8), V(lx, 1.85, 0.8), 0.05, 0.05, 4), s.wood));
    const cloth = new THREE.PlaneGeometry(1.3, 1.2, 4, 4);
    cloth.rotateY(Math.PI / 2);
    cloth.translate(lx + 0.02, 1.15, 0);
    parts.push(part(cloth, (p) => (Math.floor(p.y * 6) % 2 ? s.cloth : s.cloth.clone().lerp(color('#e8dcc0'), 0.5))));
    parts.push(...reedBundles(3, -3, 0.5, s));
    return merge(parts);
  },
  butcher: (s, v) => {
    const parts = [...posts(3.2, 2.4, 2, s), ...gableRoof(3.2, 2.4, 1.1, 2, s)];
    parts.push(part(limb(V(-1.3, 1.7, 0), V(1.3, 1.7, 0), 0.05, 0.05, 4), s.wood));
    for (let k = 0; k < 3; k++) {
      const g = new THREE.SphereGeometry(0.22, 7, 5);
      g.scale(0.8, 1.9, 0.6);
      g.translate(-0.8 + k * 0.8, 1.15, 0);
      parts.push(part(g, color('#8a3a30')));
    }
    const block = new THREE.CylinderGeometry(0.35, 0.4, 0.7, 9);
    block.translate(0.6, 0.35, 1.6);
    parts.push(part(block, LOG));
    if (v % 2) parts.push(...frame(-2.2, 1, 0.4, s, HIDE));
    return merge(parts);
  },
  'log-shed': (s, v) => {
    const w = 4.2;
    const parts = [...posts(w, 2.8, 2.2, s), ...gableRoof(w, 2.8, 1.2, 2.2, s)];
    // Split planks stacked under the roof, a sawhorse and logs waiting.
    for (let k = 0; k < 6; k++) {
      const g = new THREE.BoxGeometry(3.2, 0.06, 0.3);
      g.translate(0, 0.1 + k * 0.07, -0.6 + (k % 3) * 0.32);
      parts.push(part(g, color('#b08a5a')));
    }
    const horse = [V(-0.4, 0, 1.8), V(0.4, 0, 1.8)];
    for (const h of horse) parts.push(part(limb(h.clone().add(V(0, 0, -0.3)), h.clone().add(V(0, 0.8, 0)), 0.04, 0.04, 4), s.wood), part(limb(h.clone().add(V(0, 0, 0.3)), h.clone().add(V(0, 0.8, 0)), 0.04, 0.04, 4), s.wood));
    parts.push(...logPile(6, 2.2, w / 2 + 1.2, 0.5, Math.PI / 2 + (v % 2) * 0.3));
    return merge(parts);
  },
  'woodcutters-camp': (s, v) => {
    // A lean-to shelter, log piles and a chopping block with an axe.
    const parts: G[] = [];
    const lean = new THREE.BoxGeometry(3, 0.15, 2.4);
    lean.rotateX(-0.6);
    lean.translate(0, 1.2, 0);
    parts.push(part(lean, roofColor(s)));
    for (const sx of [-1.4, 1.4]) parts.push(part(limb(V(sx, -0.1, 0.95), V(sx, 1.9, 0.75), 0.06, 0.05, 4), s.wood));
    parts.push(...logPile(10, 2.6, 2.8, 1.5, 0.2 + v * 0.2), ...logPile(6, 2.2, -2.6, 2, -0.4));
    const block = new THREE.CylinderGeometry(0.4, 0.45, 0.6, 9);
    block.translate(0.4, 0.3, 2.6);
    parts.push(part(block, LOG), part(limb(V(0.4, 0.6, 2.6), V(0.7, 1.1, 2.7), 0.025, 0.025, 4), s.wood));
    for (let k = 0; k < 10; k++) {
      const chip = new THREE.BoxGeometry(0.12, 0.03, 0.06);
      chip.rotateY(k);
      chip.translate(0.4 + Math.cos(k * 2.1) * (0.7 + (k % 3) * 0.2), 0.02, 2.6 + Math.sin(k * 2.1) * (0.7 + (k % 3) * 0.2));
      parts.push(part(chip, LOG_END));
    }
    return merge(parts);
  },
  'stone-yard': (s, v) => {
    const parts: G[] = [];
    const lean = new THREE.BoxGeometry(3.4, 0.15, 2.4);
    lean.rotateX(-0.55);
    lean.translate(0, 1.3, -1.6);
    parts.push(part(lean, roofColor(s)));
    for (const sx of [-1.6, 1.6]) parts.push(part(limb(V(sx, -0.1, -0.7), V(sx, 2, -0.9), 0.06, 0.05, 4), s.wood));
    parts.push(...blockPile(8, 2.4, 1.2, s, v), ...blockPile(5, -2.2, 1.8, s, v + 3));
    for (let k = 0; k < 3; k++) {
      const r = rockShape(0.7, v * 7 + k);
      r.translate(-1 + k * 1.3, 0.3, 0.6);
      parts.push(part(r, (p) => jitter(s.stone, 0.1, p.x * 3, p.y * 3, p.z * 3)));
    }
    return merge(parts);
  },
  quarry: (s, v) => {
    // A stepped face cut into a rock outcrop, blocks and rubble, a lifting tripod.
    const parts: G[] = [];
    for (let step = 0; step < 3; step++) {
      const g = new THREE.BoxGeometry(6 - step * 1.2, 1.1, 2.2, 3, 1, 2);
      g.translate(0, 0.55 + step * 1.1, -2 - step * 0.9);
      parts.push(part(g, (p) => jitter(mix(s.stone, color('#6f6a62'), noise3(p.x, p.y * 3, p.z) * 0.5 + 0.5), 0.08, p.x * 3, p.y * 3, p.z * 3)));
    }
    parts.push(...blockPile(9, 2.4, 2, s, v));
    for (let k = 0; k < 7; k++) {
      const r = rockShape(0.35 + hash01(v, k) * 0.3, v * 11 + k);
      r.translate(-2.5 + hash01(v, k, 2) * 2, 0.15, 0.5 + hash01(v, k, 3) * 2);
      parts.push(part(r, s.stone));
    }
    const top = V(-1.2, 3.2, 0.2);
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1;
      parts.push(part(limb(V(-1.2 + Math.cos(a) * 1.1, -0.1, 0.2 + Math.sin(a) * 1.1), top, 0.06, 0.05, 4), s.wood));
    }
    parts.push(part(limb(top, V(-1.2, 1.4, 0.2), 0.015, 0.015, 3), color('#8a7a5a')));
    return merge(parts);
  },
  'hunting-lodge': (s, v) => {
    const w = 5;
    const d = 3.4;
    const parts = [...boxWalls(w, d, 1.7, s), ...gableEnds(w, d, 1.5, 1.7, s), ...gableRoof(w, d, 1.5, 1.7, s)];
    // Antlers over the door, hide frames, a rack of spears.
    for (const sx of [-1, 1]) parts.push(part(limb(V(0, 2.9, d / 2 + 0.2), V(sx * 0.5, 3.5, d / 2 + 0.3), 0.03, 0.015, 4), color('#d0b890')));
    parts.push(...frame(w / 2 + 1, 0.8, Math.PI / 2, s, HIDE), ...frame(-w / 2 - 1, 0.5, Math.PI / 2, s, HIDE));
    for (let k = 0; k < 4; k++) parts.push(part(limb(V(-1.6 + k * 0.15, -0.05, d / 2 + 0.5), V(-1.5 + k * 0.15, 2, d / 2 + 0.7), 0.02, 0.015, 3), s.wood));
    if (v % 2) parts.push(...pennant(w / 2 + 0.4, d / 2 + 0.4, 3.2, s));
    return merge(parts);
  },
  'fishing-hut': (s) => {
    const parts = [...boxWalls(2.8, 2.4, 1.5, s, 0.9), ...gableEnds(2.8, 2.4, 1.1, 1.5, s), ...gableRoof(2.8, 2.4, 1.1, 1.5, s)];
    // A net hung to dry, a fish-drying rack and a canoe pulled up on the bank.
    for (const sx of [-1, 1]) parts.push(part(limb(V(2.4, -0.1, sx * 1.1), V(2.4, 2, sx * 1.1), 0.04, 0.04, 4), s.wood));
    const net = new THREE.PlaneGeometry(2.2, 1.6, 6, 4);
    net.rotateY(Math.PI / 2);
    net.translate(2.42, 1.1, 0);
    parts.push(part(net, (p) => (Math.abs(Math.sin(p.y * 20)) < 0.25 || Math.abs(Math.sin(p.z * 20)) < 0.25 ? color('#4a3e2c') : color('#8a7a5c'))));
    parts.push(...smokeRack(-2.2, 1.4, s), canoe(3.4, 0.5, 2.7, 0.15));
    return merge(parts);
  },
  'canoe-yard': (s, v) => {
    // Trestles with a log being hollowed, a finished canoe, chips and a lean-to for tools.
    const parts: G[] = [];
    for (const sx of [-1.4, 1.4]) {
      parts.push(part(limb(V(sx, -0.1, -0.4), V(sx, 0.7, 0), 0.05, 0.05, 4), s.wood), part(limb(V(sx, -0.1, 0.4), V(sx, 0.7, 0), 0.05, 0.05, 4), s.wood));
    }
    const log = new THREE.CylinderGeometry(0.4, 0.4, 4.2, 12);
    log.rotateZ(Math.PI / 2);
    log.translate(0, 1.05, 0);
    parts.push(part(log, (p, n) => (n.y > 0.7 && Math.abs(p.x) < 1.6 ? color('#c2a070') : jitter(LOG, 0.1, p.x * 3, p.y * 3, p.z * 3))));
    parts.push(canoe(4, 0, 2.2, 0.1));
    for (let k = 0; k < 16; k++) {
      const chip = new THREE.BoxGeometry(0.14, 0.03, 0.07);
      chip.rotateY(k * 1.3);
      chip.translate(Math.cos(k * 2.4) * (0.6 + (k % 4) * 0.4), 0.02, Math.sin(k * 2.4) * (0.6 + (k % 4) * 0.4));
      parts.push(part(chip, LOG_END));
    }
    const lean = new THREE.BoxGeometry(2.4, 0.12, 1.8);
    lean.rotateX(-0.6);
    lean.translate(-2.8, 1.1, -1.6);
    parts.push(part(lean, roofColor(s)));
    for (const sx of [-3.9, -1.7]) parts.push(part(limb(V(sx, -0.1, -0.9), V(sx, 1.6, -1.1), 0.05, 0.05, 4), s.wood));
    if (v % 2) parts.push(...pennant(2.6, -1.4, 2.8, s));
    return merge(parts);
  },
  landing: (s, v) => {
    // A plank jetty out over the water (+z) with mooring posts.
    const parts: G[] = [];
    const len = 5 + (v % 2);
    for (let k = 0; k < len * 3; k++) {
      const g = new THREE.BoxGeometry(1.8, 0.08, 0.3);
      g.translate(0, 0.45, 0.2 + k * 0.33);
      parts.push(part(g, (p) => jitter(color('#8a6a46'), 0.12, p.x * 3, k, p.z)));
    }
    for (let k = 0; k <= len; k += 1.6)
      for (const sx of [-0.85, 0.85]) parts.push(part(limb(V(sx, -1.4, k), V(sx, 0.8, k), 0.08, 0.07, 5), s.wood));
    return merge(parts);
  },
  'storage-pits': (s, v) => {
    // Wicker lids over reed-lined pits, with a small thatched cover.
    const parts: G[] = [];
    for (let k = 0; k < 4; k++) {
      const x = (k % 2) * 2 - 1;
      const z = Math.floor(k / 2) * 2 - 1;
      parts.push(...pit(0.7, x, z, color('#3a2a1c'), color('#6a5236')));
      const lid = new THREE.CylinderGeometry(0.72, 0.75, 0.12, 12);
      lid.translate(x, 0.12, z);
      parts.push(part(lid, (p) => mix(s.roof, s.roofDark, Math.abs(Math.sin(Math.atan2(p.z - z, p.x - x) * 8)) * 0.6)));
    }
    if (v % 2) parts.push(...reedBundles(3, 2, 2, s));
    return merge(parts);
  },
  'garden-plots': (s, v) => {
    const parts = [...plots(7, 6, 6, color('#5f8a34'), null, v), ...fenceRing(5.2, 12, s, 0.5, false)];
    return merge(parts);
  },
  'fibre-plots': (s, v) => merge([...plots(6, 5, 5, color('#6f8f3e'), color('#7aa0de'), v), ...fenceRing(4.6, 10, s, 0.5, false)]),
  'herb-garden': (s, v) => merge([...plots(3, 3, 3, color('#4f7a34'), color('#d9a0c8'), v), ...fenceRing(2.6, 8, s, 0.6, true)]),
  fold: (s) => {
    const parts = fenceRing(6, 14, s, 0.45, true);
    // A small shelter at the back.
    parts.push(...posts(2.4, 1.6, 1.4, s).map((g) => g.translate(0, 0, -4)), ...gableRoof(2.4, 1.6, 0.8, 1.4, s).map((g) => g.translate(0, 0, -4)));
    return merge(parts);
  },
  pigsty: (s) => {
    const parts = [...fenceRing(3.5, 10, s, 0.5, false), ...pit(2.5, 0, 0.3, color('#4a3826'), color('#5a4630'))];
    parts.push(...boxWalls(1.8, 1.4, 0.9, s, 0.7).map((g) => g.translate(0, 0, -2.3)), ...gableRoof(1.8, 1.4, 0.6, 0.9, s).map((g) => g.translate(0, 0, -2.3)));
    return merge(parts);
  },
  coop: (s) => {
    // A little hut on stilts with a ramp, inside a low fence.
    const parts: G[] = [];
    for (const [x, z] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5]]) parts.push(part(limb(V(x, -0.1, z), V(x, 0.8, z), 0.05, 0.05, 4), s.wood));
    parts.push(...boxWalls(1.4, 1.2, 0.8, s, 0.4).map((g) => g.translate(0, 0.7, 0)), ...gableRoof(1.4, 1.2, 0.6, 1.5, s));
    const ramp = new THREE.BoxGeometry(0.35, 0.05, 1.3);
    ramp.rotateX(0.6);
    ramp.translate(0, 0.4, 1.1);
    parts.push(part(ramp, color('#8a6a46')), ...fenceRing(2.6, 10, s, 0.5, false));
    return merge(parts);
  },
  well: (s) => {
    const parts: G[] = [];
    const ring = new THREE.CylinderGeometry(0.9, 1, 0.8, 14, 1, true);
    ring.translate(0, 0.4, 0);
    parts.push(part(ring, (p) => jitter(s.stone, 0.12, Math.floor(p.y * 4), Math.atan2(p.z, p.x) * 3, 0)));
    parts.push(...pit(0.8, 0, 0, color('#1a2228'), s.stone));
    for (const sx of [-1, 1]) parts.push(part(limb(V(sx, 0, 0), V(sx, 2, 0), 0.06, 0.05, 4), s.wood));
    parts.push(part(limb(V(-1.1, 1.9, 0), V(1.1, 1.9, 0), 0.07, 0.07, 6), s.wood));
    const bucket = new THREE.CylinderGeometry(0.16, 0.13, 0.26, 8);
    bucket.translate(0.3, 1.1, 0);
    parts.push(part(bucket, LOG), part(limb(V(0.3, 1.25, 0), V(0.3, 1.88, 0), 0.01, 0.01, 3), color('#8a7a5a')));
    return merge(parts);
  },
  'tapping-grove': (s, v) => {
    const parts: G[] = [...pots(5, 0, 0, v)];
    const lean = new THREE.BoxGeometry(2.2, 0.12, 1.6);
    lean.rotateX(-0.6);
    lean.translate(0, 1, -1.2);
    parts.push(part(lean, roofColor(s)));
    for (const sx of [-1, 1]) parts.push(part(limb(V(sx, -0.1, -0.6), V(sx, 1.5, -0.8), 0.05, 0.05, 4), s.wood));
    return merge(parts);
  },
  'clay-pit': (_s, v) => {
    const parts = [...pit(3, 0, 0, color('#8a6a4a'), color('#6a5236'))];
    const water = new THREE.CircleGeometry(1, 12);
    water.rotateX(-Math.PI / 2);
    water.translate(-0.8, 0.06, 0.6);
    parts.push(part(water, color('#4a5a5c')));
    for (let k = 0; k < 4; k++) {
      const mound = new THREE.SphereGeometry(0.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      mound.scale(1, 0.6, 1);
      mound.translate(3.6 + (k % 2) * 0.8, 0, -1 + k * 0.7);
      parts.push(part(mound, color('#9a7050')));
    }
    parts.push(...pots(2, -3.6, 1.5, v));
    return merge(parts);
  },
  'peat-cutting': () => {
    const parts = [...pit(2.4, 0, 0, color('#2a1e16'), color('#3a2a1c'))];
    for (let k = 0; k < 12; k++) {
      const g = new THREE.BoxGeometry(0.4, 0.2, 0.25);
      g.translate(3 + (k % 4) * 0.45, 0.1 + Math.floor(k / 4) * 0.21, (k % 2) * 0.1);
      parts.push(part(g, color('#3a2a1c')));
    }
    return merge(parts);
  },
  'tar-pit': (_s, v) => merge([...pit(2.2, 0, 0, color('#0e0c0a'), color('#3a3028')), ...pots(4, 3, 0.5, v)]),
  panning: (s) => {
    const parts: G[] = [];
    const trough = new THREE.BoxGeometry(0.5, 0.25, 3.2);
    trough.rotateX(0.12);
    trough.translate(0, 0.5, 1.5);
    parts.push(part(trough, color('#8a6a46')));
    for (let k = 0; k < 3; k++) parts.push(part(limb(V(0, -0.1, k * 1.4), V(0, 0.5 + k * 0.17, k * 1.4), 0.04, 0.04, 4), s.wood));
    parts.push(...posts(2, 1.6, 1.5, s).map((g) => g.translate(-2, 0, 0)), ...gableRoof(2, 1.6, 0.7, 1.5, s).map((g) => g.translate(-2, 0, 0)));
    return merge(parts);
  },
  'pit-kiln': (_s, v) => {
    // A domed clay kiln with a firing mouth, pots drying and firewood.
    const parts: G[] = [];
    const dome = new THREE.SphereGeometry(1.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, 1.1, 1);
    parts.push(part(dome, (p) => mix(color('#a8724a'), color('#3a2a20'), Math.max(0, p.y - 1) * 1.2 + (noise3(p.x * 3, p.y * 3, p.z * 3) * 0.5 + 0.5) * 0.2)));
    const mouth = new THREE.CircleGeometry(0.4, 10, 0, Math.PI);
    mouth.translate(0, 0.02, 1.38);
    parts.push(part(mouth, color('#1a100a')));
    parts.push(...pots(6, 2.6, 0.6, v), ...logPile(6, 1.4, -2.6, 0, 0.5));
    return merge(parts);
  },
  'tanning-pits': (s) => {
    const parts: G[] = [];
    for (let k = 0; k < 3; k++) parts.push(...pit(0.8, -1.8 + k * 1.8, 0, color('#5a3a20'), color('#6a5236')));
    parts.push(...frame(-1.5, 2.2, 0, s, HIDE), ...frame(1.2, 2.3, 0.2, s, color('#8a6440')));
    return merge(parts);
  },
  'carving-bench': (s) => {
    const parts = [...posts(2, 1.4, 1.6, s), ...gableRoof(2, 1.4, 0.7, 1.6, s)];
    const bench = new THREE.BoxGeometry(1.6, 0.1, 0.5);
    bench.translate(0, 0.75, 0);
    parts.push(part(bench, color('#8a6a46')));
    return merge(parts);
  },
};

/** Generic stand-ins for ages whose own models are still to be made. */
function fallback(kind: string, model: string, s: TownStyle, v: number): G {
  const h = hash01(model.length, model.charCodeAt(0), model.charCodeAt(model.length - 1));
  const stoneBase = (g: G[], w: number, d: number) => {
    const b = new THREE.BoxGeometry(w + 0.3, 0.6, d + 0.3);
    b.translate(0, 0.3, 0);
    g.push(part(b, (p) => jitter(s.stone, 0.1, p.x * 3, p.y * 3, p.z * 3)));
  };
  const parts: G[] = [];
  if (kind === 'port' || kind === 'civic') return MODELS.landing(s, v);
  const w = 4.5 + h * 3;
  const d = 3.5 + h * 1.5;
  const wallH = kind === 'housing' ? 2 : 2.6;
  stoneBase(parts, w, d);
  parts.push(...boxWalls(w, d, wallH, s, 1.2).map((g) => g.translate(0, 0.5, 0)), ...gableEnds(w, d, 1.8, wallH + 0.5, s), ...gableRoof(w, d, 1.8, wallH + 0.5, s));
  if (kind === 'processing' || kind === 'vehicles') {
    const chimney = new THREE.BoxGeometry(0.6, 2.2, 0.6);
    chimney.translate(w / 3, wallH + 1.6, -d / 4);
    parts.push(part(chimney, s.stone));
  }
  if (kind === 'acquisition') parts.push(...fenceRing(Math.max(w, d) * 0.9, 14, s, 0.6, false));
  return merge(parts);
}

const cache = new Map<string, G>();

/** Geometry for a model, cached by style and variant. */
export function buildingGeometry(model: string, kind: string, style: TownStyle, variant: number): G {
  const key = `${style.name}|${model}|${variant}`;
  let g = cache.get(key);
  if (!g) {
    const fn = MODELS[model];
    g = fn ? fn(style, variant) : fallback(kind, model, style, variant);
    g.computeBoundingBox();
    cache.set(key, g);
  }
  return g;
}

export function hasModel(model: string): boolean {
  return MODELS[model] !== undefined;
}

/** Stakes and scaffold poles around a building site. */
export function scaffoldGeometry(r: number, h: number, style: TownStyle): G {
  const parts: G[] = [];
  const n = 8;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    parts.push(part(limb(V(x, -0.2, z), V(x * 0.98, h, z * 0.98), 0.05, 0.04, 4), style.wood));
    const b = ((k + 1) / n) * Math.PI * 2;
    for (const y of [h * 0.35, h * 0.75]) parts.push(part(limb(V(x, y, z), V(Math.cos(b) * r, y, Math.sin(b) * r), 0.03, 0.03, 3), style.wood));
  }
  // Materials waiting on the ground.
  parts.push(...logPile(5, 1.6, r + 1, 0, 0.4), ...reedBundles(2, -r - 1.2, 0.5, style));
  return merge(parts);
}
