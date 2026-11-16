// Architecture of the later ages, built in code at the same scale and hand-made look as the
// tents and roundhouses. Each age has its own kit:
//   Iron         timber longhouses, daub and thatch, clay furnaces
//   Medieval     half-timbered plaster over stone footings, steep roofs, chimneys, water wheels
//   Renaissance  brick and render, tiled roofs, glazed windows, two storeys
//   Industrial   red brick and iron: sawtooth roofs, tall stacks, cranes and gantries
//   Modern       concrete and glass: flat roofs, window bands, steel frames
//   Techno-magic white stone and floating crystal, with glowing seams
// Every town style tints the materials (brick, render, roofs, cloth) and every building's
// variant changes its proportions, roof shape and clutter, so towns keep their personality
// through the ages.

import * as THREE from 'three';
import { hash01 } from '../sim/rng';
import { color, jitter, limb, merge, mix, noise3, part } from './geom';
import {
  basket, blockPile, boxWalls, canoe, fenceRing, frame, hut, gableEnds, gableRoof, logPile, pennant, pit, plots, pole, posts, pots, reedBundles, roofColor, smokeRack, wallColor,
  type Model, type TownStyle,
} from './buildings';

type G = THREE.BufferGeometry;
type C = THREE.Color;
type Paint = C | ((p: THREE.Vector3, n: THREE.Vector3) => C);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ palette

const STEEL = color('#596068');
const IRON = color('#3c3f44');
const GLASS = color('#3a4e5e');
const GLASS_LIT = color('#7d9cb2');
const CONCRETE = color('#b7b2a6');
const SLATE = color('#4b5159');
const TILE = color('#a2523a');
const TIMBER = color('#3a2a1e');
const CRYSTAL = color('#6fe6d6');
const TECHNO = color('#e9e5dc');
const GOLD = color('#cdb064');
const WATER = color('#3f6f86');
const SOOT = color('#2a2624');

/** A town's own brick, render and roof tones, from its style. */
function tones(s: TownStyle) {
  const h = hash01(s.name.length, s.name.charCodeAt(0), s.name.charCodeAt(5));
  const bricks = ['#9c4a33', '#a85f3e', '#86402f', '#b07048'];
  const renders = ['#e4dcc8', '#d9c8a4', '#e8d6c0', '#cfd3cc'];
  const roofs = [TILE, SLATE, color('#7a4a32'), color('#5a5f5a')];
  const i = Math.floor(h * 4);
  return {
    brick: color(bricks[i]),
    render: mix(color(renders[i]), s.wall, 0.15),
    roof: roofs[(i + (s.roofKind === 'reed' ? 1 : 0)) % 4],
    stone: s.stone,
    timber: mix(TIMBER, s.wood, 0.4),
    trim: mix(color('#efe8da'), s.cloth, 0.12),
  };
}

// ------------------------------------------------------------------ primitives

function box(w: number, h: number, d: number, x: number, y: number, z: number, c: Paint, seg = 1): G {
  const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.round(w * seg)), Math.max(1, Math.round(h * seg)), Math.max(1, Math.round(d * seg)));
  g.translate(x, y + h / 2, z);
  return part(g, c);
}

function cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, c: Paint, seg = 12, open = false): G {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, Math.max(1, Math.round(h)), open);
  g.translate(x, y + h / 2, z);
  return part(g, c);
}

function beam(a: THREE.Vector3, b: THREE.Vector3, t: number, c: Paint): G {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(t, t, len);
  g.lookAt(b.clone().sub(a));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return part(g, c);
}

const rough = (c: C, amt = 0.06, f = 5) => (p: THREE.Vector3) => jitter(c, amt, p.x * f, p.y * f, p.z * f);
const brickPaint = (c: C) => (p: THREE.Vector3) => {
  // Courses picked out by mortar shading, with odd bricks darker or lighter.
  const course = Math.abs(Math.sin(p.y * 13));
  return jitter(mix(c.clone().multiplyScalar(0.8), c, 0.55 + course * 0.45), 0.09, Math.floor(p.x * 4), Math.floor(p.y * 7), Math.floor(p.z * 4));
};
const stonePaint = (c: C) => (p: THREE.Vector3) => jitter(mix(c, c.clone().multiplyScalar(0.78), noise3(p.x * 1.6, p.y * 2.4, p.z * 1.6) * 0.5 + 0.4), 0.1, Math.floor(p.x * 2.2), Math.floor(p.y * 3), Math.floor(p.z * 2.2));
const roofPaint = (c: C) => (p: THREE.Vector3) => jitter(mix(c.clone().multiplyScalar(0.72), c, 0.55 + Math.abs(Math.sin(p.y * 15)) * 0.45), 0.06, Math.floor(p.x * 3), p.y * 6, Math.floor(p.z * 3));

/** A closed triangular gable (ridge along x). */
function gableTri(w: number, d: number, rise: number, base: number, c: Paint): G {
  const sh = new THREE.Shape();
  sh.moveTo(-d / 2, 0);
  sh.lineTo(d / 2, 0);
  sh.lineTo(0, rise);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  g.translate(0, base, 0);
  return part(g, c);
}

/** A pitched roof built simply: two slabs hinged at the ridge. */
function roofSlabs(w: number, d: number, rise: number, base: number, c: C, over = 0.35): G[] {
  const parts: G[] = [];
  const half = Math.hypot(d / 2, rise) + over;
  const ang = Math.atan2(rise, d / 2);
  for (const sgn of [-1, 1]) {
    const g = new THREE.BoxGeometry(w + over * 2, 0.14, half, 1, 1, 10);
    // Hinge at the ridge: the slab runs from z=0 out to z=±half.
    g.translate(0, 0.07, (sgn * half) / 2);
    g.rotateX(sgn * ang);
    g.translate(0, base + rise, 0);
    parts.push(part(g, roofPaint(c)));
  }
  parts.push(box(w + over * 2 + 0.05, 0.16, 0.24, 0, base + rise - 0.03, 0, c.clone().multiplyScalar(0.65)));
  return parts;
}

/** A hipped roof: a four-sided pyramid stretched over the walls. */
function hipped(w: number, d: number, rise: number, base: number, c: C, over = 0.35): G[] {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 3);
  g.rotateY(Math.PI / 4);
  g.scale(w + over * 2, rise, d + over * 2);
  g.translate(0, base + rise / 2, 0);
  const ridge = w > d ? box(w - d + 0.2, 0.16, 0.24, 0, base + rise * 0.98, 0, c.clone().multiplyScalar(0.65)) : null;
  // A longer house gets a ridge: stretch the top by merging with a short gable.
  return ridge ? [part(g, roofPaint(c)), ...roofSlabs(Math.max(0.1, w - d), d, rise, base, c, over), ridge] : [part(g, roofPaint(c))];
}

/** A flat roof with a parapet and a few roof boxes. */
function flatRoof(w: number, d: number, base: number, c: C, seed: number): G[] {
  const parts = [box(w + 0.1, 0.2, d + 0.1, 0, base, 0, c.clone().multiplyScalar(0.85))];
  for (const [pw, pd, px, pz] of [[w + 0.1, 0.15, 0, d / 2], [w + 0.1, 0.15, 0, -d / 2], [0.15, d, w / 2, 0], [0.15, d, -w / 2, 0]]) parts.push(box(pw, 0.35, pd, px, base + 0.2, pz, c));
  for (let k = 0; k < 2; k++) parts.push(box(0.9, 0.6, 0.7, (hash01(seed, k) - 0.5) * (w - 1.5), base + 0.2, (hash01(seed, k, 2) - 0.5) * (d - 1.5), STEEL));
  return parts;
}

/** Windows on all four walls: recessed panes in frames, with sills. Skips the door. */
function windows(w: number, d: number, y0: number, storeys: number, storeyH: number, frame: C, opts: { spacing?: number; tall?: number; skipDoor?: number; lit?: number } = {}): G[] {
  const parts: G[] = [];
  const sp = opts.spacing ?? 1.6;
  const wh = (opts.tall ?? 0.55) * storeyH;
  const ww = 0.55;
  for (let f = 0; f < storeys; f++) {
    const y = y0 + f * storeyH + storeyH * 0.32;
    for (const [len, face] of [[w, 'z'], [d, 'x']] as const) {
      const n = Math.max(1, Math.floor((len - 0.6) / sp));
      for (let k = 0; k < n; k++) {
        const t = -len / 2 + (len / n) * (k + 0.5);
        for (const sgn of [-1, 1]) {
          if (f === 0 && face === 'z' && sgn === 1 && Math.abs(t) < (opts.skipDoor ?? 0.8)) continue;
          const off = (face === 'z' ? d : w) / 2 + 0.02;
          const [px, pz] = face === 'z' ? [t, sgn * off] : [sgn * off, t];
          const [bw, bd] = face === 'z' ? [ww, 0.06] : [0.06, ww];
          const lit = hash01(Math.round(t * 10), f, sgn) < (opts.lit ?? 0.15);
          parts.push(box(bw, wh, bd, px, y, pz, (p) => mix(lit ? color('#e8c47a') : GLASS, GLASS_LIT, Math.max(0, (p.y - y) / wh - 0.4))));
          const [fw, fd] = face === 'z' ? [ww + 0.16, 0.05] : [0.05, ww + 0.16];
          const fo = face === 'z' ? [0, sgn * 0.03] : [sgn * 0.03, 0];
          parts.push(box(fw, 0.08, fd, px + fo[0], y - 0.08, pz + fo[1], frame), box(fw, 0.08, fd, px + fo[0], y + wh, pz + fo[1], frame));
        }
      }
    }
  }
  return parts;
}

/** A door on the +z face. */
function door(x: number, z: number, w: number, h: number, c: C, frame: C): G[] {
  return [box(w, h, 0.08, x, 0, z + 0.03, rough(c, 0.08, 6)), box(w + 0.2, 0.12, 0.1, x, h, z + 0.04, frame), box(0.1, h, 0.1, x - w / 2 - 0.05, 0, z + 0.04, frame), box(0.1, h, 0.1, x + w / 2 + 0.05, 0, z + 0.04, frame)];
}

function chimney(x: number, z: number, h: number, base: number, c: Paint): G[] {
  return [box(0.6, h, 0.6, x, base, z, c), box(0.75, 0.15, 0.75, x, base + h, z, SOOT)];
}

/** A tall factory stack, brick with dark bands and a sooty lip. */
function stack(x: number, z: number, h: number, r: number, c: C): G[] {
  const parts = [cyl(r * 0.7, r, h, x, 0, z, brickPaint(c), 12)];
  for (const t of [0.35, 0.7]) parts.push(cyl(r * (1 - t * 0.3) + 0.06, r * (1 - t * 0.3) + 0.06, 0.25, x, h * t, z, SOOT, 12));
  parts.push(cyl(r * 0.8, r * 0.75, 0.4, x, h, z, SOOT, 12));
  return parts;
}

/** Half-timbered walls: plaster panels between dark posts, rails and braces. */
function halfTimber(w: number, d: number, h: number, y0: number, render: C, timber: C): G[] {
  const parts = [box(w, h, d, 0, y0, 0, rough(render, 0.05, 3))];
  const t = 0.14;
  for (const [len, face] of [[w, 'z'], [d, 'x']] as const) {
    const n = Math.max(2, Math.round(len / 1.1));
    for (const sgn of [-1, 1]) {
      const off = (face === 'z' ? d : w) / 2 + 0.03;
      const at = (u: number, y: number) => (face === 'z' ? V(u, y, sgn * off) : V(sgn * off, y, u));
      for (let k = 0; k <= n; k++) {
        const u = -len / 2 + (len / n) * k;
        parts.push(beam(at(u, y0), at(u, y0 + h), t, timber));
      }
      for (const y of [y0 + 0.05, y0 + h * 0.5, y0 + h - 0.05]) parts.push(beam(at(-len / 2, y), at(len / 2, y), t, timber));
      // Braces in the end bays.
      const bay = len / n;
      parts.push(beam(at(-len / 2, y0 + h * 0.5), at(-len / 2 + bay, y0 + h - 0.05), t * 0.85, timber), beam(at(len / 2, y0 + h * 0.5), at(len / 2 - bay, y0 + h - 0.05), t * 0.85, timber));
    }
  }
  return parts;
}

/** Stone or brick corners (quoins) up a wall. */
function quoins(w: number, d: number, h: number, y0: number, c: Paint): G[] {
  const parts: G[] = [];
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]])
    for (let y = y0; y < y0 + h - 0.2; y += 0.5) {
      const big = Math.round((y - y0) / 0.5) % 2 === 0;
      parts.push(box(big ? 0.55 : 0.35, 0.24, big ? 0.35 : 0.55, x, y, z, c));
    }
  return parts;
}

/** A floating crystal with a glowing core. */
function crystal(x: number, y: number, z: number, h: number): G[] {
  const g = new THREE.OctahedronGeometry(1, 0);
  g.scale(h * 0.28, h * 0.5, h * 0.28);
  g.translate(x, y + h * 0.5, z);
  return [part(g, (p) => mix(CRYSTAL, color('#e8fffb'), Math.max(0, (p.y - y) / h - 0.3)))];
}

function ring(r: number, y: number, x = 0, z = 0, t = 0.08, c: C = GOLD): G {
  const g = new THREE.TorusGeometry(r, t, 6, 32);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return part(g, c);
}

/** Glowing seams on techno-magic walls. */
function seams(r: number, h: number, y0: number, n: number): G[] {
  const parts: G[] = [];
  for (let k = 0; k < n; k++) parts.push(ring(r + 0.02, y0 + (h / (n + 1)) * (k + 1), 0, 0, 0.04, CRYSTAL));
  return parts;
}

function waterwheel(x: number, z: number, r: number, wood: C): G[] {
  const parts: G[] = [];
  const rim = new THREE.TorusGeometry(r, 0.07, 5, 20);
  rim.rotateY(Math.PI / 2);
  for (const dx of [-0.3, 0.3]) parts.push(part(rim.clone().translate(x + dx, r * 0.85, z), wood));
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    parts.push(beam(V(x, r * 0.85, z), V(x, r * 0.85 + Math.sin(a) * r, z + Math.cos(a) * r), 0.07, wood));
    parts.push(box(0.7, 0.05, 0.36, x, r * 0.85 + Math.sin(a) * r - 0.02, z + Math.cos(a) * r, wood));
  }
  parts.push(beam(V(x - 0.6, r * 0.85, z), V(x + 0.6, r * 0.85, z), 0.14, IRON));
  return parts;
}

/** A timber or iron crane with a jib and a hanging hook. */
function crane(x: number, z: number, h: number, jib: number, c: C, rot = 0): G[] {
  const parts: G[] = [];
  const end = V(x + Math.cos(rot) * jib, h * 0.9, z + Math.sin(rot) * jib);
  parts.push(beam(V(x, 0, z), V(x, h, z), 0.2, c), beam(V(x, h * 0.35, z), end, 0.14, c), beam(V(x, h, z), end, 0.06, c));
  parts.push(beam(end, end.clone().add(V(0, -h * 0.45, 0)), 0.03, IRON), box(0.3, 0.3, 0.3, end.x, end.y - h * 0.5, end.z, IRON));
  return parts;
}

/** A lattice tower (derricks, headframes, masts). */
function lattice(x: number, z: number, h: number, base: number, top: number, c: C, levels = 5): G[] {
  const parts: G[] = [];
  const corners = (y: number) => {
    const r = base + (top - base) * (y / h);
    return [V(x - r, y, z - r), V(x + r, y, z - r), V(x + r, y, z + r), V(x - r, y, z + r)];
  };
  const lo = corners(0);
  const hi = corners(h);
  for (let k = 0; k < 4; k++) parts.push(beam(lo[k], hi[k], 0.1, c));
  for (let l = 1; l <= levels; l++) {
    const a = corners((h / levels) * (l - 1));
    const b = corners((h / levels) * l);
    for (let k = 0; k < 4; k++) {
      parts.push(beam(b[k], b[(k + 1) % 4], 0.06, c));
      parts.push(beam(a[k], b[(k + 1) % 4], 0.04, c));
    }
  }
  return parts;
}

function rails(len: number, x: number, z: number, rot: number): G[] {
  const parts: G[] = [];
  const dir = V(Math.cos(rot), 0, Math.sin(rot));
  const side = V(-dir.z, 0, dir.x);
  for (let k = 0; k < len / 0.6; k++) {
    const c = V(x, 0.02, z).add(dir.clone().multiplyScalar(-len / 2 + k * 0.6));
    parts.push(beam(c.clone().add(side.clone().multiplyScalar(-0.7)), c.clone().add(side.clone().multiplyScalar(0.7)), 0.1, TIMBER));
  }
  for (const s of [-0.45, 0.45]) {
    const o = side.clone().multiplyScalar(s);
    parts.push(beam(V(x, 0.1, z).add(o).add(dir.clone().multiplyScalar(-len / 2)), V(x, 0.1, z).add(o).add(dir.clone().multiplyScalar(len / 2)), 0.06, IRON));
  }
  return parts;
}

/** A boat hull on stocks (or the bare ribs of one being built). */
function hull(len: number, beamW: number, depth: number, x: number, z: number, c: Paint, ribs = false, y = 0.5): G[] {
  if (ribs) {
    const parts: G[] = [beam(V(x - len / 2, y, z), V(x + len / 2, y, z), 0.18, TIMBER)];
    for (let k = 0; k <= 8; k++) {
      const t = -len / 2 + (len / 8) * k;
      const w = beamW * Math.sqrt(Math.max(0.05, 1 - (2 * t / len) ** 2));
      for (const sgn of [-1, 1]) parts.push(beam(V(x + t, y, z), V(x + t, y + depth, z + sgn * w / 2), 0.08, TIMBER));
    }
    return parts;
  }
  const g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  g.scale(len / 2, depth, beamW / 2);
  g.translate(x, y + depth, z);
  const deck = box(len * 0.82, 0.08, beamW * 0.8, x, y + depth - 0.02, z, rough(color('#9a7a54'), 0.06, 4));
  const stocks = [-len / 3, 0, len / 3].map((t) => box(0.3, y + 0.2, beamW * 0.6, x + t, 0, z, TIMBER));
  return [part(g, c), deck, ...stocks];
}

/** An airship envelope with ribs and a gondola. */
function envelope(len: number, r: number, x: number, y: number, z: number, cloth: C): G[] {
  const g = new THREE.SphereGeometry(1, 20, 12);
  g.scale(len / 2, r, r);
  g.translate(x, y, z);
  const parts = [part(g, (p) => mix(cloth, cloth.clone().multiplyScalar(0.75), Math.abs(Math.sin((p.x - x) * 2.2)) * 0.4))];
  parts.push(box(len * 0.3, 0.6, 0.9, x, y - r - 0.9, z, rough(color('#6a4e34'), 0.06, 4)));
  for (const sx of [-len * 0.12, len * 0.12]) parts.push(beam(V(x + sx, y - r * 0.9, z), V(x + sx, y - r - 0.3, z), 0.04, IRON));
  return parts;
}

function crates(n: number, x: number, z: number, seed: number): G[] {
  const parts: G[] = [];
  for (let k = 0; k < n; k++) {
    const s = 0.45 + hash01(seed, k) * 0.25;
    parts.push(box(s, s, s, x + (k % 3) * 0.6 - 0.6, Math.floor(k / 3) * s, z + (hash01(seed, k, 3) - 0.5) * 0.5, rough(color('#8a6a44'), 0.1, 6)));
  }
  return parts;
}

function barrels(n: number, x: number, z: number): G[] {
  const parts: G[] = [];
  for (let k = 0; k < n; k++) parts.push(cyl(0.26, 0.26, 0.7, x + (k % 3) * 0.55, 0, z + Math.floor(k / 3) * 0.55, (p) => (Math.abs(Math.sin(p.y * 9)) > 0.92 ? IRON : color('#7a5636')), 9));
  return parts;
}

function tank(r: number, h: number, x: number, z: number, c: C): G[] {
  return [cyl(r, r, h, x, 0, z, rough(c, 0.04, 2), 16), cyl(r * 0.2, r, 0.5, x, h, z, c.clone().multiplyScalar(0.9), 16), ...[0.33, 0.66].map((t) => cyl(r + 0.03, r + 0.03, 0.08, x, h * t, z, IRON, 16))];
}

function jetty(len: number, w: number, z0: number, c: C): G[] {
  const parts = [box(w, 0.15, len, 0, 0.35, z0 + len / 2, rough(c, 0.08, 4))];
  for (let k = 0; k <= len / 1.6; k++) for (const sx of [-w / 2, w / 2]) parts.push(cyl(0.1, 0.12, 1.6, sx, -1.2, z0 + k * 1.6, TIMBER, 6));
  return parts;
}

function stoneQuay(w: number, len: number, z0: number, c: C): G[] {
  const parts = [box(w, 1.3, len, 0, -0.8, z0 + len / 2, stonePaint(c))];
  for (let k = 0; k < 4; k++) parts.push(cyl(0.12, 0.15, 0.4, w / 2 - 0.3, 0.5, z0 + 0.8 + k * (len / 4), IRON, 8));
  return parts;
}

function mound(r: number, h: number, x: number, z: number, c: Paint): G {
  const g = new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, h / r, 1);
  g.translate(x, -0.05, z);
  return part(g, c);
}

const TURF = (p: THREE.Vector3) => jitter(mix(color('#5d7038'), color('#6f6a3a'), noise3(p.x * 2, p.y * 2, p.z * 2) * 0.5 + 0.5), 0.06, p.x * 4, p.y * 4, p.z * 4);
const SPOIL = (p: THREE.Vector3) => jitter(mix(color('#6a5a48'), color('#867a68'), noise3(p.x * 3, p.y * 3, p.z * 3) * 0.5 + 0.5), 0.08, p.x * 5, p.y * 5, p.z * 5);

// ------------------------------------------------------------------ era bodies

type Body = { w: number; d: number; storeys?: number; roof?: 'gable' | 'hip' | 'flat' | 'thatch'; chimneys?: number; doorW?: number };

/** Iron age: timber and daub walls on a stone footing under thatch (the roundhouse's cousin). */
function ironBody(s: TownStyle, b: Body): G[] {
  const h = 1.9;
  const rise = Math.min(2.6, b.d * 0.62);
  return [...boxWalls(b.w, b.d, h, s, b.doorW ?? 1), ...gableEnds(b.w, b.d, rise, h, s), ...gableRoof(b.w, b.d, rise, h - 0.05, s)];
}

/** Medieval: stone ground floor or footing, half-timbered plaster above, a steep roof. */
function medievalBody(s: TownStyle, b: Body, v: number): G[] {
  const t = tones(s);
  const storeys = b.storeys ?? 1;
  const sh = 2.1;
  const parts: G[] = [box(b.w + 0.2, 0.5, b.d + 0.2, 0, -0.1, 0, stonePaint(t.stone))];
  if (storeys > 1) {
    parts.push(box(b.w, sh, b.d, 0, 0.4, 0, stonePaint(t.stone)), ...quoins(b.w, b.d, sh, 0.4, stonePaint(t.stone.clone().multiplyScalar(1.1))));
    // The upper floor jetties out over the street.
    parts.push(...halfTimber(b.w + 0.4, b.d + 0.4, sh * (storeys - 1), 0.4 + sh, t.render, t.timber));
  } else parts.push(...halfTimber(b.w, b.d, sh, 0.4, t.render, t.timber));
  const top = 0.4 + sh * storeys;
  const rw = b.w + (storeys > 1 ? 0.4 : 0);
  const rd = b.d + (storeys > 1 ? 0.4 : 0);
  const rise = rd * 0.75;
  if (b.roof === 'thatch' || (b.roof !== 'hip' && s.roofKind === 'thatch' && v % 2 === 0)) parts.push(...gableEnds(rw, rd, rise, top, s), ...gableRoof(rw, rd, rise, top - 0.05, s));
  else if (b.roof === 'hip') parts.push(...hipped(rw, rd, rise * 0.8, top, t.roof));
  else parts.push(gableTri(rw, rd, rise, top, rough(t.render, 0.05, 3)), ...roofSlabs(rw, rd, rise, top, t.roof));
  parts.push(...windows(b.w, b.d, 0.4, storeys, sh, t.timber, { spacing: 1.8, tall: 0.45 }));
  parts.push(...door(0, b.d / 2 + (storeys > 1 ? 0 : 0), b.doorW ?? 0.9, 1.7, t.timber, t.timber.clone().multiplyScalar(0.7)).map((g) => g.translate(0, 0.4, 0)));
  for (let k = 0; k < (b.chimneys ?? 1); k++) parts.push(...chimney((k ? -1 : 1) * rw * 0.3, -rd * 0.15, rise * 0.9 + 0.6, top, stonePaint(t.stone)));
  return parts;
}

/** Renaissance: brick or rendered walls, stone quoins and string courses, a tiled roof. */
function renaissanceBody(s: TownStyle, b: Body, v: number): G[] {
  const t = tones(s);
  const storeys = b.storeys ?? 2;
  const sh = 2.2;
  const rendered = v % 2 === 1;
  const wallPaint = rendered ? rough(t.render, 0.04, 2) : brickPaint(t.brick);
  const parts: G[] = [box(b.w + 0.2, 0.45, b.d + 0.2, 0, -0.1, 0, stonePaint(t.stone)), box(b.w, sh * storeys, b.d, 0, 0.35, 0, wallPaint, 2)];
  parts.push(...quoins(b.w, b.d, sh * storeys, 0.35, stonePaint(color('#d8cfbc'))));
  for (let f = 1; f < storeys; f++) parts.push(box(b.w + 0.12, 0.14, b.d + 0.12, 0, 0.35 + f * sh - 0.07, 0, color('#d8cfbc')));
  const top = 0.35 + sh * storeys;
  parts.push(box(b.w + 0.3, 0.2, b.d + 0.3, 0, top - 0.1, 0, color('#d8cfbc')));
  const rise = b.d * 0.5;
  if (b.roof === 'hip' || v % 3 === 2) parts.push(...hipped(b.w, b.d, rise, top + 0.1, t.roof, 0.3));
  else parts.push(gableTri(b.w, b.d, rise, top + 0.1, wallPaint), ...roofSlabs(b.w, b.d, rise, top + 0.1, t.roof, 0.3));
  parts.push(...windows(b.w, b.d, 0.35, storeys, sh, color('#efe8da'), { spacing: 1.3, tall: 0.6, lit: 0.2 }));
  parts.push(...door(0, b.d / 2, b.doorW ?? 1, 1.9, color('#4a3a5a').lerp(s.cloth, 0.4), color('#d8cfbc')).map((g) => g.translate(0, 0.35, 0)));
  for (let k = 0; k < (b.chimneys ?? 2); k++) parts.push(...chimney((k % 2 ? -1 : 1) * b.w * 0.35, 0, rise + 0.7, top, brickPaint(t.brick)));
  return parts;
}

/** Industrial: red brick shed or mill with big arched windows, slate roof or sawtooth. */
function industrialBody(s: TownStyle, b: Body, v: number, sawtooth = false): G[] {
  const t = tones(s);
  const storeys = b.storeys ?? 1;
  const sh = 2.8;
  const brick = brickPaint(t.brick.clone().multiplyScalar(0.92));
  const parts: G[] = [box(b.w + 0.2, 0.35, b.d + 0.2, 0, -0.1, 0, stonePaint(t.stone)), box(b.w, sh * storeys, b.d, 0, 0.25, 0, brick, 2)];
  // Brick piers between the bays.
  const bays = Math.max(2, Math.round(b.w / 1.8));
  for (let k = 0; k <= bays; k++) for (const sgn of [-1, 1]) parts.push(box(0.3, sh * storeys, 0.15, -b.w / 2 + (b.w / bays) * k, 0.25, sgn * (b.d / 2 + 0.05), brick));
  parts.push(...windows(b.w, b.d, 0.25, storeys, sh, IRON, { spacing: b.w / bays, tall: 0.62, skipDoor: 1.2, lit: 0.3 }));
  const top = 0.25 + sh * storeys;
  if (sawtooth) {
    const n = Math.max(2, Math.round(b.d / 2.4));
    const step = b.d / n;
    for (let k = 0; k < n; k++) {
      const z = -b.d / 2 + step * (k + 0.5);
      parts.push(gableTri(b.w, step, 1.3, top, SLATE).translate(0, 0, z));
      // The steep glazed face of each tooth.
      parts.push(box(b.w - 0.2, 1.15, 0.06, 0, top + 0.05, z + step / 2 - 0.05, GLASS));
    }
  } else if (b.roof === 'flat') parts.push(...flatRoof(b.w, b.d, top, t.brick, v));
  else parts.push(gableTri(b.w, b.d, b.d * 0.35, top, brick), ...roofSlabs(b.w, b.d, b.d * 0.35, top, SLATE, 0.25));
  // Big loading doors.
  parts.push(...door(0, b.d / 2, b.doorW ?? 1.8, 2.3, color('#3e4a3e'), IRON).map((g) => g.translate(0, 0.25, 0)));
  return parts;
}

/** Modern: a concrete frame with window bands and a flat roof. */
function modernBody(s: TownStyle, b: Body, v: number): G[] {
  void s;
  const storeys = b.storeys ?? 2;
  const sh = 3;
  const parts: G[] = [box(b.w, sh * storeys, b.d, 0, 0, 0, rough(CONCRETE, 0.03, 2), 1)];
  for (let f = 0; f < storeys; f++) {
    const y = f * sh + sh * 0.3;
    // Continuous glazing bands, with mullions.
    parts.push(box(b.w + 0.04, sh * 0.5, b.d + 0.04, 0, y, 0, (p) => mix(GLASS, GLASS_LIT, Math.max(0, (p.y - y) / (sh * 0.5) - 0.3) + (Math.abs(Math.sin(p.x * 3 + p.z * 3)) > 0.97 ? 0.5 : 0))));
    parts.push(box(b.w + 0.1, 0.12, b.d + 0.1, 0, y + sh * 0.5, 0, CONCRETE));
  }
  parts.push(...flatRoof(b.w, b.d, sh * storeys, CONCRETE, v));
  parts.push(box(b.doorW ?? 1.6, 2.2, 0.1, 0, 0, b.d / 2 + 0.05, GLASS_LIT), box((b.doorW ?? 1.6) + 1, 0.15, 1.2, 0, 2.4, b.d / 2 + 0.6, STEEL));
  return parts;
}

/** Techno-magic: a white stone drum with glowing seams, a crystal crown and a floating ring. */
function technoBody(r: number, h: number, v: number, crown = true): G[] {
  const parts: G[] = [cyl(r * 1.08, r * 1.15, 0.4, 0, -0.1, 0, TECHNO, 24), cyl(r * 0.85, r, h, 0, 0.3, 0, rough(TECHNO, 0.03, 2), 24), ...seams(r * 0.93, h, 0.3, 2)];
  // Tall slit windows that glow.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + v;
    const rr = r * 0.93 + 0.02;
    parts.push(box(0.18, h * 0.55, 0.18, Math.sin(a) * rr, 0.3 + h * 0.2, Math.cos(a) * rr, CRYSTAL));
  }
  parts.push(cyl(r * 0.2, r * 0.88, 0.8, 0, h + 0.3, 0, GOLD, 24));
  if (crown) parts.push(...crystal(0, h + 1.6, 0, 1.6 + (v % 2) * 0.6), ring(r * 0.55, h + 2.1, 0, 0, 0.06));
  parts.push(box(1, 2, 0.2, 0, 0.3, r * 0.95, CRYSTAL));
  return parts;
}

// ------------------------------------------------------------------ models

const m = (fn: Model): Model => fn;

/** A farmhouse of each age: the building a farm, orchard or pasture is run from. */
function farmstead(era: string): Model {
  return (s, v) => {
    switch (era) {
      case 'stone':
      case 'hunter-gatherer':
        return merge([...hut(s, 1.7, 1.5, 1.8, v), basket(2.2, 1, s), basket(2.5, 0.4, s, 0.22), ...reedBundles(2, -2.3, 0.6, s)]);
      case 'iron':
        return merge([...ironBody(s, { w: 4, d: 3 }), basket(2.6, 1.2, s), ...logPile(3, 1, -2.7, 0.6, 1.4), ...pots(2, 2.4, -1, v)]);
      case 'medieval':
        return merge([...medievalBody(s, { w: 4.4, d: 3.2, roof: v % 2 ? 'thatch' : undefined }, v), ...barrels(2, 2.8, 1), basket(-2.8, 1.2, s)]);
      case 'renaissance':
        return merge([...renaissanceBody(s, { w: 4.2, d: 3.4, storeys: 1, chimneys: 1 }, v), ...barrels(3, 2.8, 0.6)]);
      case 'industrial':
        return merge([...industrialBody(s, { w: 4.2, d: 3.2 }, v), ...tank(0.7, 3.6, 2.4, -2.2, color('#9aa0a6'))]);
      case 'modern':
        return merge([...modernBody(s, { w: 4.2, d: 3.2, storeys: 1 }, v), ...tank(0.8, 4.4, 2.4, -2.4, color('#c8ccd0'))]);
      default:
        return merge(technoBody(1.7, 2.2, v));
    }
  };
}

export const LATER_MODELS: Record<string, Model> = {
  ...Object.fromEntries(['stone', 'iron', 'medieval', 'renaissance', 'industrial', 'modern', 'techno-magic'].map((e) => [`farmstead-${e}`, farmstead(e)])),
  // ================================================================ Stone (late)
  'craft-workshop': m((s, v) => {
    const parts = [...posts(4, 3, 2, s), ...gableRoof(4, 3, 1.3, 2, s)];
    parts.push(box(2.4, 0.08, 0.8, 0, 0.8, -0.5, rough(color('#9a7a54'), 0.06)), ...[-1, 1].flatMap((x) => [box(0.1, 0.8, 0.1, x, 0, -0.8, s.wood), box(0.1, 0.8, 0.1, x, 0, -0.2, s.wood)]));
    parts.push(basket(1.6, 1.4, s), ...pots(2, -1.8, 1.2, v), ...logPile(3, 1.2, 2.7, 0.4, 1.4), ...reedBundles(2, -2.6, -0.6, s));
    return merge(parts);
  }),

  'sand-pit': m((s, v) => {
    const sand = color('#d8c690');
    const parts = [...pit(3, 0, 0, sand, color('#b8a878')), mound(1.3, 0.9, 3.6, 1.6, rough(sand, 0.06)), mound(1, 0.7, -3.4, 2, rough(color('#9a948a'), 0.1)), ...posts(2.6, 2, 1.8, s).map((g) => g.translate(-3, 0, -2.6)), ...gableRoof(2.6, 2, 0.9, 1.8, s).map((g) => g.translate(-3, 0, -2.6))];
    parts.push(basket(2.2, -2.6, s), basket(2.7, -2.2, s, 0.22), beam(V(1, 0.1, -1), V(2.6, 0.5, -2.4), 0.25, s.wood));
    void v;
    return merge(parts);
  }),

  // ================================================================ Temples
  'temple-timber': m((s, v) => {
    // A great thatched hall on a stone platform, carved posts before its door.
    const parts: G[] = [box(9.6, 0.7, 7.6, 0, -0.1, 0, stonePaint(s.stone)), box(3, 0.35, 1.2, 0, -0.1, 4.2, stonePaint(s.stone)), box(2.4, 0.2, 0.8, 0, -0.1, 5, stonePaint(s.stone))];
    const lift = (g: G) => g.translate(0, 0.6, 0);
    parts.push(...boxWalls(8, 6, 2.8, s, 1.6).map(lift), ...gableEnds(8, 6, 4.4, 2.8, s).map(lift), ...gableRoof(8, 6, 4.4, 2.75, s).map(lift));
    for (const x of [-2.4, -1.1, 1.1, 2.4]) {
      parts.push(part(limb(V(x, 0.6, 3.6), V(x, 4.2, 3.6), 0.18, 0.14, 7), s.wood), box(0.5, 0.3, 0.5, x, 4.2, 3.6, s.cloth));
    }
    parts.push(beam(V(-2.6, 4.3, 3.6), V(2.6, 4.3, 3.6), 0.22, s.wood), ...pennant(-4.2, 4.4, 5, s), ...pennant(4.2, 4.4, 5, s));
    // A fire bowl before the steps.
    parts.push(cyl(0.5, 0.35, 0.5, 0, 0, 6.2, stonePaint(s.stone), 10), cyl(0.38, 0.38, 0.12, 0, 0.45, 6.2, color('#e8902a'), 10));
    void v;
    return merge(parts);
  }),
  'temple-stone': m((s, v) => {
    const t = tones(s);
    const st = stonePaint(t.stone);
    // A stone nave with a slate roof and a tower over the door.
    const parts: G[] = [box(8, 0.5, 13, 0, -0.1, -1, st), box(6.4, 5, 10, 0, 0.4, -1.5, st, 1), ...roofSlabs(10, 6.4, 3.2, 5.4, t.roof, 0.3).map((g) => g.rotateY(Math.PI / 2).translate(0, 0, -1.5))];
    parts.push(gableTri(6.4, 0.3, 0.01, 5.4, st), box(3.6, 9, 3.6, 0, 0.4, 4.4, st, 1), ...hipped(3.8, 3.8, 3.2, 9.4, t.roof, 0.2).map((g) => g.translate(0, 0, 4.4)), ...crystal(0, 12.6, 4.4, 1.2));
    // Buttresses and tall windows down the sides.
    for (let k = 0; k < 4; k++) for (const sx of [-1, 1]) {
      parts.push(box(0.5, 3.6, 0.7, sx * 3.4, 0.4, -5.4 + k * 2.6, st), box(0.08, 2.4, 0.8, sx * 3.22, 1.8, -4.1 + k * 2.6, (p) => mix(color('#3a5a8a'), s.cloth, Math.abs(Math.sin(p.y * 3 + k)))));
    }
    parts.push(...door(0, 6.2, 1.5, 2.6, t.timber, t.stone).map((g) => g.translate(0, 0.4, 0)), box(3, 0.3, 1.4, 0, 0, 7, st));
    void v;
    return merge(parts);
  }),
  'temple-great': m((s, v) => {
    const t = tones(s);
    const pale = stonePaint(color('#ddd5c2'));
    // A domed temple behind a columned porch, on broad steps.
    const parts: G[] = [box(12, 0.4, 13, 0, -0.1, 0, pale), box(10.6, 0.4, 11.6, 0, 0.3, 0, pale), box(9, 5.6, 8, 0, 0.7, -1, rough(t.render, 0.04, 2), 1), box(9.4, 0.4, 8.4, 0, 6.3, -1, pale)];
    parts.push(cyl(3, 3, 2, 0, 6.7, -1, pale, 20));
    const dome = new THREE.SphereGeometry(3.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.translate(0, 8.7, -1);
    parts.push(part(dome, roofPaint(color('#5f8a7a'))), ...crystal(0, 11.8, -1, 1.4));
    for (let k = 0; k < 6; k++) parts.push(cyl(0.38, 0.44, 5.2, -4 + k * 1.6, 0.7, 4.2, pale, 12));
    parts.push(box(9.6, 0.7, 2.4, 0, 5.9, 4.2, pale), gableTri(9.6, 2.4, 1.6, 6.6, pale).translate(0, 0, 4.2), ...door(0, 3, 1.8, 3.2, color('#5a3a2a'), color('#ddd5c2')).map((g) => g.translate(0, 0.7, 0)));
    parts.push(...windows(9, 8, 0.7, 1, 5.6, color('#efe8da'), { spacing: 2.2, tall: 0.5, skipDoor: 9 }).map((g) => g.translate(0, 0, -1)));
    void v;
    return merge(parts);
  }),
  'temple-spire': m((s, v) => {
    const parts = technoBody(4.2, 6, v, false);
    parts.push(cyl(0.3, 2.6, 12, 0, 7, 0, rough(TECHNO, 0.03, 2), 20), ...seams(1.6, 10, 7, 4), ...crystal(0, 19.4, 0, 3), ring(3, 12, 0, 0, 0.1), ring(2, 16, 0, 0, 0.08), ring(4.8, 5, 0, 0, 0.08, CRYSTAL));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      parts.push(...crystal(Math.cos(a) * 5.6, 0.4 + (k % 2) * 0.5, Math.sin(a) * 5.6, 1.4));
    }
    void s;
    return merge(parts);
  }),

  // ================================================================ Iron
  'sulfur-diggings': m((s, v) => {
    const y = color('#d8c23a');
    const parts = [...pit(2.4, 0, 0, y, color('#8a7a52')), mound(1.2, 0.8, 3, 1, rough(y, 0.08)), mound(0.8, 0.5, 2.2, 2.4, rough(y, 0.08)), ...posts(2.6, 2, 1.8, s).map((g) => g.translate(-3.2, 0, -1)), ...gableRoof(2.6, 2, 0.9, 1.8, s).map((g) => g.translate(-3.2, 0, -1))];
    parts.push(...pots(3, -3.2, 1.6, v), basket(1.2, -2.8, s));
    return merge(parts);
  }),
  'mineral-diggings': m((s, v) => {
    const w = color('#e6e2d6');
    const parts = [...pit(1.8, -1.4, 0.6, w, color('#a89e8a')), ...pit(1.4, 1.8, -0.8, color('#d8d0c0'), color('#a89e8a')), mound(1.1, 0.7, 3.4, 1.6, rough(w, 0.05)), ...posts(2.6, 2, 1.8, s).map((g) => g.translate(-3.4, 0, -2.4)), ...gableRoof(2.6, 2, 0.9, 1.8, s).map((g) => g.translate(-3.4, 0, -2.4))];
    parts.push(basket(0.4, 2.8, s), ...pots(2, 3, -2.6, v));
    return merge(parts);
  }),
  longhouse: m((s, v) => {
    const w = 7 + (v % 2) * 0.8;
    const parts = ironBody(s, { w, d: 4 });
    parts.push(...logPile(5, 1.4, w / 2 + 0.9, 0.4, 1.4), basket(-1.2, 2.6, s), basket(1.3, 2.5, s, 0.22), ...pots(2, -w / 2 - 0.6, 1, v));
    if (v % 2) parts.push(...smokeRack(-w / 2 - 1, -0.8, s));
    return merge(parts);
  }),
  'root-cellar': m((s, v) => {
    const parts = [mound(2.6, 1.6, 0, -0.5, TURF), box(1.6, 1.5, 0.3, 0, 0, 1.75, stonePaint(s.stone)), box(0.9, 1.15, 0.06, 0, 0, 1.92, rough(s.wood, 0.08, 6))];
    parts.push(box(1.9, 0.2, 0.4, 0, 1.5, 1.75, stonePaint(s.stone)), ...pots(3, 1.6, 2, v), basket(-1.4, 2.1, s));
    return merge(parts);
  }),
  'ice-house': m((s, v) => {
    const t = tones(s);
    const parts = [cyl(2, 2.2, 1.8, 0, 0, 0, stonePaint(t.stone), 16), mound(2.4, 1.8, 0, 0, TURF).translate(0, 1.8, 0)];
    parts.push(box(1.4, 1.5, 0.6, 0, 0, 2.1, stonePaint(t.stone)), box(0.8, 1.2, 0.06, 0, 0, 2.42, rough(s.wood, 0.08, 6)));
    for (let k = 0; k < 4; k++) parts.push(box(0.6, 0.45, 0.6, 2.6 + (k % 2) * 0.7, Math.floor(k / 2) * 0.45, -0.5, color('#cfe6ee')));
    void v;
    return merge(parts);
  }),
  'quarry-crane': m((s, v) => {
    const parts = [...pit(3.4, 0, 0, color('#8a857a'), s.stone), ...crane(3.8, -1.5, 5, 3.5, s.wood, Math.PI * 0.9), ...blockPile(6, -3.6, 2, s, v), ...blockPile(4, 3.2, 3, s, v + 1)];
    return merge(parts);
  }),
  adit: m((_s, v) => {
    const parts = [mound(4, 2.6, 0, -2, SPOIL), box(2.4, 2.4, 0.5, 0, 0, 1.2, color('#141210'))];
    parts.push(beam(V(-1.2, 0, 1.6), V(-1.1, 2.4, 1.6), 0.25, TIMBER), beam(V(1.2, 0, 1.6), V(1.1, 2.4, 1.6), 0.25, TIMBER), beam(V(-1.5, 2.45, 1.6), V(1.5, 2.45, 1.6), 0.28, TIMBER));
    parts.push(...rails(5, 0, 4, Math.PI / 2), mound(1.4, 0.9, 2.8, 3.4, SPOIL), box(1, 0.6, 0.7, 0, 0.15, 4.4, IRON));
    void v;
    return merge(parts);
  }),
  'brine-pans': m((s, v) => {
    const parts: G[] = [];
    for (let k = 0; k < 6; k++) {
      const x = (k % 3) * 2.6 - 2.6;
      const z = Math.floor(k / 3) * 2.6 - 1.3;
      parts.push(box(2.3, 0.2, 2.3, x, 0, z, s.stone), box(2, 0.05, 2, x, 0.16, z, k % 2 ? color('#e8ecee') : WATER));
    }
    parts.push(...pots(3, 4.4, 0, v), ...reedBundles(2, -4.4, 1, s));
    return merge(parts);
  }),
  'ice-camp': m((s, v) => {
    const parts = [...posts(3, 2.4, 1.8, s), ...gableRoof(3, 2.4, 1, 1.8, s)];
    for (let k = 0; k < 9; k++) parts.push(box(0.65, 0.5, 0.65, 2.6 + (k % 3) * 0.7, Math.floor(k / 3) * 0.5, -1 + (k % 2) * 0.1, color('#d4ecf2')));
    parts.push(box(1.2, 0.12, 2.4, -2.6, 0.1, 0, s.wood), ...logPile(3, 1.2, -2.6, 2.2, 0));
    void v;
    return merge(parts);
  }),
  'ploughed-fields': m((s, v) => merge([...plots(9, 7, 7, color('#c2a24a'), null, v), ...fenceRing(6, 18, s, 0.5, false), box(1.6, 0.4, 0.4, 3, 0, 4.5, IRON), beam(V(2.2, 0.3, 4.5), V(1, 0.9, 4.5), 0.08, s.wood)])),
  orchard: m((s, v) => {
    const parts: G[] = [...fenceRing(5.4, 16, s, 0.5, false)];
    for (let k = 0; k < 9; k++) {
      const x = (k % 3) * 3 - 3;
      const z = Math.floor(k / 3) * 3 - 3;
      parts.push(part(limb(V(x, 0, z), V(x, 1.4, z), 0.12, 0.09, 6), color('#5a4030')));
      const crown = new THREE.IcosahedronGeometry(1, 1);
      crown.scale(1.1, 0.9, 1.1);
      crown.translate(x, 2, z);
      parts.push(part(crown, (p) => (hash01(Math.round(p.x * 5), Math.round(p.y * 5), Math.round(p.z * 5)) > 0.9 ? color('#c23a2a') : jitter(color('#4f7a34'), 0.1, p.x * 4, p.y * 4, p.z * 4))));
    }
    parts.push(basket(4.2, 3.6, s), basket(3.7, 4, s));
    void v;
    return merge(parts);
  }),
  'spice-plantation': m((s, v) => merge([...plots(8, 6, 6, color('#6a8a2e'), color('#c84a2a'), v), ...fenceRing(5.4, 16, s, 0.4, true), ...posts(2.4, 2, 1.8, s).map((g) => g.translate(4.6, 0, -2.6)), ...gableRoof(2.4, 2, 0.9, 1.8, s).map((g) => g.translate(4.6, 0, -2.6))])),
  'mushroom-cellar': m((s, v) => {
    const parts = [mound(2.8, 1.5, 0, -0.4, TURF), box(1.8, 1.5, 0.4, 0, 0, 2, stonePaint(s.stone)), box(1, 1.2, 0.06, 0, 0, 2.22, rough(s.wood, 0.08, 6))];
    for (let k = 0; k < 4; k++) parts.push(box(1.2, 0.08, 0.4, 2.6, 0.3 + k * 0.4, -0.5 + (k % 2) * 0.3, color('#7a5a3a')), cyl(0.18, 0.04, 0.14, 2.4 + k * 0.1, 0.38 + k * 0.4, -0.4, color('#c8b090'), 6));
    void v;
    return merge(parts);
  }),
  'cattle-pasture': m((s, v) => merge([...fenceRing(6.5, 20, s, 0.5, false), ...ironBody(s, { w: 4, d: 3 }).map((g) => g.translate(-3.4, 0, -3.2)), box(2, 0.5, 0.6, 2.5, 0, 3, rough(s.wood, 0.08)), box(1.8, 0.05, 0.4, 2.5, 0.45, 3, WATER), ...reedBundles(3, 4, -3, s)].concat(v % 2 ? pots(2, -1, 4, v) : []))),
  apiary: m((s, v) => {
    const parts: G[] = [...fenceRing(3.2, 10, s, 0.5, true)];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const g = new THREE.SphereGeometry(0.42, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(1, 1.5, 1);
      g.translate(Math.cos(a) * 1.8, 0.35, Math.sin(a) * 1.8);
      parts.push(part(g, (p) => mix(s.roofDark, s.roof, Math.abs(Math.sin(p.y * 22)))), box(0.5, 0.35, 0.5, Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8, s.wood));
    }
    parts.push(...pots(3, 0, 0, v));
    return merge(parts);
  }),
  bakehouse: m((s, v) => {
    const parts = ironBody(s, { w: 4.4, d: 3.4 });
    const oven = new THREE.SphereGeometry(1.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    oven.translate(3.4, 0, 0.4);
    parts.push(part(oven, rough(color('#a0704a'), 0.1, 4)), box(0.5, 0.5, 0.2, 3.4, 0, 1.5, SOOT), ...logPile(4, 1.1, 3.6, -1.8, 0.3), basket(-1, 2.3, s));
    void v;
    return merge(parts);
  }),
  'updraft-kiln': m((s, v) => {
    const t = tones(s);
    const parts = [cyl(1.2, 1.6, 2.4, 1.8, 0, 0, rough(color('#9a6a48'), 0.1, 4), 14), cyl(0.5, 1.2, 0.8, 1.8, 2.4, 0, color('#7a4a30'), 14), box(0.6, 0.6, 0.3, 1.8, 0, 1.6, SOOT)];
    parts.push(...posts(3, 2.4, 1.8, s).map((g) => g.translate(-2, 0, 0)), ...gableRoof(3, 2.4, 1, 1.8, s).map((g) => g.translate(-2, 0, 0)), ...pots(5, -2.4, 0, v), ...logPile(4, 1.1, 1.8, -2.2, 0));
    void t;
    return merge(parts);
  }),
  'charcoal-clamp': m((s, v) => {
    const parts = [mound(2.2, 1.4, 0, 0, (p) => jitter(mix(color('#2a2420'), color('#5a4a38'), noise3(p.x * 3, p.y * 3, p.z * 3) * 0.5 + 0.5), 0.08, p.x * 5, p.y * 5, p.z * 5))];
    parts.push(cyl(0.12, 0.18, 0.3, 0, 1.35, 0, SOOT, 6), ...logPile(8, 1.6, 3.4, 0, 0.2), ...logPile(6, 1.4, -3.2, 0.6, 1.2), basket(2, 2.6, s));
    void v;
    return merge(parts);
  }),
  bloomery: m((s, v) => {
    const parts = [cyl(0.55, 0.9, 1.9, 1.2, 0, 0, rough(color('#8a5a3c'), 0.12, 4), 12), cyl(0.3, 0.55, 0.3, 1.2, 1.9, 0, SOOT, 12), box(0.4, 0.4, 0.2, 1.2, 0.1, 0.85, SOOT)];
    // Bellows of hide on a frame.
    const bel = new THREE.SphereGeometry(0.4, 8, 6);
    bel.scale(1.3, 0.5, 0.8);
    bel.translate(2.3, 0.45, 0);
    parts.push(part(bel, color('#8a6a48')), ...posts(2.6, 2.2, 1.7, s).map((g) => g.translate(-1.6, 0, 0)), ...gableRoof(2.6, 2.2, 0.9, 1.7, s).map((g) => g.translate(-1.6, 0, 0)));
    parts.push(...blockPile(3, -1.8, 1.8, s, v), ...logPile(3, 1, 2.6, -1.6, 0.4));
    return merge(parts);
  }),
  'glass-furnace': m((s, v) => {
    const parts = ironBody(s, { w: 4.4, d: 3.6 });
    const dome = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.translate(3.6, 0, 0);
    parts.push(part(dome, rough(color('#9a7a5a'), 0.1, 4)), cyl(0.25, 0.3, 1.5, 3.6, 0.8, 0, SOOT, 8), box(0.3, 0.3, 0.1, 3.6, 0.3, 0.98, color('#f0a040')));
    for (let k = 0; k < 4; k++) parts.push(cyl(0.12, 0.08, 0.3, -1 + k * 0.5, 0, 2.5, (p) => mix(color('#7ab0a0'), color('#c8e8e0'), p.y * 2), 8));
    void v;
    return merge(parts);
  }),
  ropewalk: m((s, v) => {
    const parts = [...posts(9, 1.6, 1.6, s), ...gableRoof(9, 1.6, 0.7, 1.6, s)];
    for (let k = 0; k < 3; k++) parts.push(beam(V(-4.4, 0.9, -0.4 + k * 0.4), V(4.4, 0.9, -0.4 + k * 0.4), 0.04, color('#b09a6a')));
    parts.push(box(0.6, 1, 0.8, -4.8, 0, 0, s.wood), box(0.6, 1, 0.8, 4.8, 0, 0, s.wood), ...reedBundles(3, 0, 1.6, s));
    void v;
    return merge(parts);
  }),
  'dye-works': m((s, v) => {
    const parts = ironBody(s, { w: 4, d: 3 }).map((g) => g.translate(-1.5, 0, -1));
    const vats = [color('#3a4a8a'), color('#a83a2a'), color('#c8a83a'), s.cloth];
    vats.forEach((c, k) => parts.push(cyl(0.55, 0.5, 0.7, -1.8 + k * 1.3, 0, 2, rough(s.wood, 0.08), 10), cyl(0.48, 0.48, 0.05, -1.8 + k * 1.3, 0.62, 2, c, 10)));
    parts.push(...frame(2.6, -0.8, 0.3, s, s.cloth));
    void v;
    return merge(parts);
  }),
  chandlery: m((s, v) => {
    const parts = ironBody(s, { w: 4.2, d: 3.2 });
    for (let k = 0; k < 6; k++) parts.push(cyl(0.05, 0.05, 0.5, 2.6, 1.3 - 0.5, -0.8 + k * 0.3, color('#efe4c0'), 5));
    parts.push(beam(V(2.6, 1.35, -1), V(2.6, 1.35, 1), 0.06, s.wood), ...[-1, 1].map((z) => beam(V(2.6, 0, z), V(2.6, 1.4, z), 0.07, s.wood)), ...pots(3, -2.8, 1, v));
    return merge(parts);
  }),
  saltworks: m((s, v) => {
    const parts = ironBody(s, { w: 4.6, d: 3.4 });
    parts.push(box(2.4, 0.6, 1.6, 3.6, 0, 0, s.stone), box(2.2, 0.08, 1.4, 3.6, 0.6, 0, IRON), ...chimney(3.6, -0.6, 1.4, 0.6, stonePaint(s.stone)), box(1.2, 0.5, 0.8, -3.2, 0, 1.4, color('#ecebe6')));
    void v;
    return merge(parts);
  }),
  'quern-house': m((s, v) => {
    const parts = ironBody(s, { w: 3.8, d: 3.2 });
    parts.push(cyl(0.5, 0.5, 0.25, 2.6, 0, 1, s.stone, 12), cyl(0.5, 0.5, 0.2, 2.6, 0.27, 1, s.stone, 12), beam(V(2.6, 0.55, 1), V(3, 0.95, 1), 0.05, s.wood), basket(-2.4, 1.2, s), basket(-2.2, 1.7, s, 0.22));
    void v;
    return merge(parts);
  }),
  'carpenter-workshop': m((s, v) => {
    const parts = ironBody(s, { w: 5, d: 3.6, doorW: 1.6 });
    parts.push(...logPile(5, 2.2, 0, -3, 0), box(2, 0.08, 0.7, 3.4, 0.8, 1, rough(color('#9a7a54'), 0.06)), ...[-1, 1].map((d) => box(0.1, 0.8, 0.5, 3.4 + d * 0.8, 0, 1, s.wood)));
    for (let k = 0; k < 5; k++) parts.push(box(2.6, 0.05, 0.25, -3.4, 0.1 + k * 0.06, 0.6 + (k % 2) * 0.3, color('#b08a5a')));
    void v;
    return merge(parts);
  }),
  smithy: m((s, v) => {
    const parts = [...posts(4, 3.2, 2.1, s), ...gableRoof(4, 3.2, 1.3, 2.1, s)];
    parts.push(box(1.4, 0.9, 1, -0.8, 0, -0.8, stonePaint(s.stone)), box(0.8, 0.1, 0.6, -0.8, 0.9, -0.8, color('#e07030')), ...chimney(-0.8, -1.2, 3.2, 0.9, stonePaint(s.stone)));
    parts.push(cyl(0.25, 0.3, 0.6, 1, 0, 0.6, TIMBER, 8), box(0.6, 0.25, 0.25, 1, 0.6, 0.6, IRON), ...barrels(2, 1.6, -1));
    parts.push(...logPile(3, 1.1, 2.8, 1.6, 0.4));
    void v;
    return merge(parts);
  }),
  boatwright: m((s, v) => {
    const parts = [...posts(6, 3.4, 2.4, s), ...gableRoof(6, 3.4, 1.4, 2.4, s)];
    parts.push(...hull(4.6, 1.3, 0.6, 0, 0, rough(color('#7a5a3a'), 0.08, 4), false, 0.4), canoe(3.6, 0, 2.6, 0, 1), ...logPile(4, 2.2, -4.2, 0, Math.PI / 2));
    void v;
    return merge(parts);
  }),
  wharf: m((s, v) => {
    const parts = [...jetty(6, 2.2, 0, color('#8a6a48')), ...crates(5, -0.4, 2, v), ...barrels(3, 0.4, 3.6), ...crane(0.8, 5.2, 3.2, 1.6, s.wood, Math.PI / 2)];
    parts.push(...posts(3, 2.4, 2, s).map((g) => g.translate(0, 0, -2.4)), ...gableRoof(3, 2.4, 1, 2, s).map((g) => g.translate(0, 0, -2.4)));
    return merge(parts);
  }),
  'timber-bridge': m((s, v) => {
    const parts = [box(2.4, 0.18, 9, 0, 0.9, 0, rough(color('#8a6a48'), 0.08, 4))];
    for (let k = -2; k <= 2; k++) for (const x of [-1.1, 1.1]) parts.push(cyl(0.12, 0.14, 2.2, x, -1.2, k * 2, TIMBER, 6), beam(V(x, 1.1, k * 2 - 1), V(x, 1.1, k * 2 + 1), 0.07, s.wood), beam(V(x, 1.1, k * 2), V(x, 1.9, k * 2), 0.07, s.wood));
    for (const x of [-1.1, 1.1]) parts.push(beam(V(x, 1.85, -4.5), V(x, 1.85, 4.5), 0.07, s.wood));
    void v;
    return merge(parts);
  }),

  // ================================================================ Medieval
  cottage: m((s, v) => {
    const parts = medievalBody(s, { w: 4.8 + (v % 2) * 0.6, d: 3.6, storeys: v % 3 === 2 ? 2 : 1 }, v);
    parts.push(...plots(2, 1.4, 2, color('#4f7a34'), color('#d9a0c8'), v).map((g) => g.translate(-3.6, 0, 1.4)), ...logPile(4, 1, 3.4, -0.8, 1.4));
    return merge(parts);
  }),
  'frost-room': m((s, v) => {
    const parts = medievalBody(s, { w: 4, d: 3.4, chimneys: 0, roof: 'hip' }, v);
    parts.push(...crystal(2.7, 0.2, 1.6, 0.9), ...crystal(-2.6, 0.2, 1.4, 0.7), ring(0.6, 0.15, 2.7, 1.6, 0.04, CRYSTAL));
    return merge(parts);
  }),
  'logging-yard': m((s, v) => {
    const parts = [...posts(4, 3, 2.2, s), ...gableRoof(4, 3, 1.2, 2.2, s), ...logPile(8, 3, -3.6, 1.6, 0.1), ...logPile(6, 3, 3.6, -1.6, 0.2), ...crane(0, 3.4, 3.6, 2.2, s.wood, 0)];
    void v;
    return merge(parts);
  }),
  'well-house': m((s, v) => {
    const t = tones(s);
    const parts = [cyl(1, 1.05, 0.8, 0, 0, 0, stonePaint(t.stone), 14), cyl(0.85, 0.85, 0.05, 0, 0.75, 0, WATER, 14)];
    for (const x of [-1.1, 1.1]) parts.push(beam(V(x, 0, 0), V(x, 2.3, 0), 0.14, t.timber));
    parts.push(beam(V(-1.2, 1.7, 0), V(1.2, 1.7, 0), 0.1, t.timber), ...roofSlabs(2.8, 2.2, 0.9, 2.2, t.roof, 0.2), cyl(0.2, 0.2, 0.35, 0.3, 1.2, 0, rough(s.wood, 0.08), 8));
    void v;
    return merge(parts);
  }),
  'shaft-mine': m((s, v) => {
    const t = tones(s);
    const parts = [mound(3.6, 1.8, -2, -2.4, SPOIL), box(2.2, 0.4, 2.2, 0, 0, 0, stonePaint(t.stone)), box(1.6, 0.42, 1.6, 0, 0, 0, color('#141210'))];
    // Headframe with windlass.
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(beam(V(x, 0, z), V(x * 0.3, 3.6, z * 0.3), 0.14, t.timber));
    parts.push(...waterwheel(0, 0, 0.9, t.timber).map((g) => g.translate(0, 2.6, 0)), ...medievalBody(s, { w: 3, d: 2.6, chimneys: 0 }, v).map((g) => g.translate(3.4, 0, 1)), ...rails(4, -1, 3.2, 0));
    return merge(parts);
  }),
  'hunting-hall': m((s, v) => {
    const parts = medievalBody(s, { w: 6, d: 4, roof: 'thatch' }, v);
    parts.push(...frame(-4, 1, 0.3, s, color('#b08a62')), ...frame(4, 1, -0.3, s, color('#8a6a48')));
    // Antlers over the door.
    for (const sgn of [-1, 1]) parts.push(beam(V(0, 2.9, 2.05), V(sgn * 0.6, 3.5, 2.1), 0.05, color('#d8c8a8')));
    return merge(parts);
  }),
  'fishing-quay': m((s, v) => {
    const t = tones(s);
    const parts = [...stoneQuay(3, 5, 0, t.stone), ...medievalBody(s, { w: 3.6, d: 3, chimneys: 0 }, v).map((g) => g.translate(0, 0, -2.4))];
    parts.push(...frame(1.2, 2, Math.PI / 2, s, color('#5a5040')), ...barrels(3, -1, 3), canoe(3, 2.4, 3.4, Math.PI / 2, 1).translate(0, -0.4, 0));
    return merge(parts);
  }),
  'open-fields': m((s, v) => merge([...plots(10, 8, 8, color('#c8a84a'), null, v), ...plots(3, 8, 3, color('#5a7a34'), null, v + 1).map((g) => g.translate(-6.8, 0, 0)), ...fenceRing(7, 22, s, 0.5, false)])),
  'grove-shrine': m((s, v) => {
    const t = tones(s);
    const parts: G[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      parts.push(box(0.5, 2 + hash01(v, k) * 0.6, 0.35, Math.cos(a) * 3, 0, Math.sin(a) * 3, stonePaint(t.stone)));
    }
    parts.push(box(1.4, 0.7, 0.9, 0, 0, 0, stonePaint(t.stone)), ...crystal(0, 0.8, 0, 0.7), ...pennant(1.2, 1.4, 2.4, s));
    return merge(parts);
  }),
  'water-sawmill': m((s, v) => {
    const parts = medievalBody(s, { w: 5, d: 3.6, chimneys: 0 }, v);
    parts.push(...waterwheel(3.1, 0, 1.4, tones(s).timber), ...logPile(6, 2.4, -4, 0.8, Math.PI / 2));
    for (let k = 0; k < 6; k++) parts.push(box(2.6, 0.05, 0.3, 0, 0.1 + k * 0.06, 3, color('#b08a5a')));
    return merge(parts);
  }),
  'masons-lodge': m((s, v) => {
    const parts = medievalBody(s, { w: 5, d: 3.6, chimneys: 1 }, v);
    parts.push(...blockPile(8, 4, 1, s, v), ...blockPile(6, -4, 1.4, s, v + 2), box(1.2, 0.7, 0.7, 0, 0, 3, stonePaint(s.stone)));
    return merge(parts);
  }),
  'blast-furnace': m((s, v) => {
    const t = tones(s);
    const parts = [cyl(1.1, 1.8, 4.2, 1.4, 0, 0, stonePaint(t.stone), 8), cyl(0.9, 1.1, 0.6, 1.4, 4.2, 0, SOOT, 8), box(0.7, 0.8, 0.3, 1.4, 0, 1.6, color('#e0702a'))];
    parts.push(...waterwheel(3.6, 0, 1.2, t.timber), ...medievalBody(s, { w: 3, d: 2.8, chimneys: 0 }, v).map((g) => g.translate(-2.4, 0, 0)), ...blockPile(4, -1, 3, s, v));
    return merge(parts);
  }),
  'mana-forge': m((s, v) => {
    const parts = medievalBody(s, { w: 4.6, d: 3.6, roof: 'hip', chimneys: 0 }, v);
    parts.push(box(1.2, 1, 1, 3.4, 0, 0.6, stonePaint(s.stone)), ...crystal(3.4, 1.2, 0.6, 1.1), ring(0.7, 1.4, 3.4, 0.6, 0.05, CRYSTAL));
    return merge(parts);
  }),
  tannery: m((s, v) => {
    const parts = medievalBody(s, { w: 4.4, d: 3.4, chimneys: 0 }, v).map((g) => g.translate(-1, 0, -1.2));
    for (let k = 0; k < 4; k++) parts.push(...pit(0.6, -2 + k * 1.3, 2.4, k % 2 ? color('#6a4a2a') : color('#8a7a4a'), s.stone));
    parts.push(...frame(3, -0.6, 0.4, s, color('#b08a62')), ...frame(3.2, 1.4, 0.2, s, color('#9a7650')));
    return merge(parts);
  }),
  'weaving-house': m((s, v) => {
    const parts = medievalBody(s, { w: 5.4, d: 3.8, storeys: 2 }, v);
    parts.push(...frame(-4, 1, 0.2, s, s.cloth), ...reedBundles(2, 3.8, 1.4, s));
    return merge(parts);
  }),
  watermill: m((s, v) => {
    const parts = medievalBody(s, { w: 4.6, d: 3.8, storeys: 2, chimneys: 0 }, v);
    parts.push(...waterwheel(3, 0, 1.6, tones(s).timber), basket(-2.8, 2.4, s), basket(-3.2, 2, s));
    return merge(parts);
  }),
  attuner: m((s, v) => {
    const t = tones(s);
    const parts = [cyl(1.6, 1.8, 3.4, 0, 0, 0, stonePaint(t.stone), 12), ...hipped(3.6, 3.6, 2.4, 3.4, t.roof, 0.2).map((g) => g.rotateY(Math.PI / 4))];
    parts.push(...crystal(2.4, 0, 1, 1.2), ...crystal(-2.3, 0, 0.8, 0.9), ...crystal(0, 5.8, 0, 0.8), box(0.9, 1.7, 0.1, 0, 0, 1.76, t.timber));
    void v;
    return merge(parts);
  }),
  'guild-workshop': m((s, v) => {
    const parts = medievalBody(s, { w: 5.6, d: 4, storeys: 2, chimneys: 2 }, v);
    parts.push(...crates(4, 3.8, 1.6, v), ...pennant(-3.4, 2.4, 3, s));
    return merge(parts);
  }),
  forge: m((s, v) => {
    const parts = medievalBody(s, { w: 4.6, d: 3.6, chimneys: 2 }, v);
    parts.push(cyl(0.25, 0.3, 0.6, 3.2, 0, 1.6, TIMBER, 8), box(0.6, 0.25, 0.25, 3.2, 0.6, 1.6, IRON), ...barrels(3, -3.6, 0.6), box(0.5, 0.3, 0.6, 3.4, 0, -0.6, color('#e07030')));
    return merge(parts);
  }),
  shipyard: m((s, v) => {
    const parts = [box(4.4, 0.2, 9, 0, -0.1, 0, rough(color('#8a6a48'), 0.08, 4)), ...hull(7, 2.2, 1.2, 0, 0, TIMBER, true, 0.4).map((g) => g.rotateY(Math.PI / 2))];
    parts.push(...crane(2.6, -3, 5, 2.6, tones(s).timber, Math.PI), ...logPile(6, 3, -3, 3, 0), ...medievalBody(s, { w: 3, d: 2.6, chimneys: 0 }, v).map((g) => g.translate(-3.8, 0, -2.4)));
    return merge(parts);
  }),
  harbour: m((s, v) => {
    const t = tones(s);
    const parts = [...stoneQuay(4.4, 6, 0, t.stone), ...medievalBody(s, { w: 5, d: 3.4, storeys: 2 }, v).map((g) => g.translate(0, 0, -2.6)), ...crates(6, -1.2, 2.4, v), ...barrels(3, 0.8, 4), ...crane(1.6, 5.4, 4, 2, t.timber, Math.PI / 2)];
    return merge(parts);
  }),
  'stone-bridge': m((s, v) => {
    const t = tones(s);
    const parts = [box(2.6, 0.5, 10, 0, 0.9, 0, stonePaint(t.stone)), box(0.25, 0.6, 10, -1.2, 1.4, 0, stonePaint(t.stone)), box(0.25, 0.6, 10, 1.2, 1.4, 0, stonePaint(t.stone))];
    for (const z of [-2.5, 2.5]) {
      const arch = new THREE.TorusGeometry(1.6, 0.35, 6, 12, Math.PI);
      arch.rotateY(Math.PI / 2);
      arch.scale(1, 0.7, 1);
      arch.translate(0, -0.3, z);
      parts.push(part(arch, stonePaint(t.stone)), box(2.6, 2.2, 0.8, 0, -1.4, z + 2.4 * Math.sign(z), stonePaint(t.stone)));
    }
    parts.push(box(2.6, 2.2, 1, 0, -1.4, 0, stonePaint(t.stone)));
    void v;
    return merge(parts);
  }),

  // ================================================================ Renaissance
  townhouse: m((s, v) => {
    const parts = renaissanceBody(s, { w: 4.4 + (v % 2) * 0.6, d: 4, storeys: v === 3 ? 3 : 2 }, v);
    parts.push(box(1.6, 0.1, 0.8, 0, 0, 2.4, stonePaint(s.stone)), ...plots(1.4, 1, 1, color('#4f7a34'), color('#e07aa0'), v).map((g) => g.translate(2.6, 0, 2.4)));
    return merge(parts);
  }),
  'grow-house': m((s, v) => {
    const parts = renaissanceBody(s, { w: 3, d: 3, storeys: 1, chimneys: 1 }, v).map((g) => g.translate(-3, 0, 0));
    // A glasshouse with an iron frame.
    parts.push(box(5, 0.4, 3.4, 1.6, 0, 0, brickPaint(tones(s).brick)), box(4.8, 2, 3.2, 1.6, 0.4, 0, (p) => mix(color('#a8c8c0'), color('#d8ece6'), (p.y - 0.4) / 2)), gableTri(4.8, 3.2, 1.2, 2.4, color('#c8e0da')).translate(1.6, 0, 0));
    for (let k = 0; k <= 6; k++) parts.push(beam(V(-0.8 + k * 0.8, 0.4, 1.62), V(-0.8 + k * 0.8, 2.4, 1.62), 0.05, IRON), beam(V(-0.8 + k * 0.8, 2.4, 1.62), V(-0.8 + k * 0.8, 3.6, 0), 0.05, IRON));
    return merge(parts);
  }),
  jeweller: m((s, v) => {
    const parts = renaissanceBody(s, { w: 3.8, d: 3.6, storeys: 2 }, v);
    // A striped awning over the shop window.
    const aw = new THREE.BoxGeometry(2.8, 0.06, 1, 8, 1, 1);
    aw.rotateX(0.35);
    aw.translate(0, 2.3, 2.3);
    parts.push(part(aw, (p) => (Math.floor(p.x * 3) % 2 ? s.cloth : color('#efe8da'))), ...pennant(2.2, 2.4, 3, s));
    return merge(parts);
  }),
  'powder-mill': m((s, v) => {
    const parts = renaissanceBody(s, { w: 4, d: 3.4, storeys: 1, chimneys: 0 }, v);
    parts.push(...waterwheel(2.6, 0, 1.4, tones(s).timber), ...barrels(6, -4, -0.6), box(0.6, 3, 0.6, -2.8, 0, -2.6, brickPaint(tones(s).brick)));
    return merge(parts);
  }),
  'levitation-workshop': m((s, v) => {
    const parts = renaissanceBody(s, { w: 4.6, d: 3.8, storeys: 2, chimneys: 1 }, v);
    for (let k = 0; k < 3; k++) {
      const g = new THREE.DodecahedronGeometry(0.35 + k * 0.1, 0);
      g.translate(3.4 + k * 0.4, 1.6 + k * 0.9, 1 - k * 0.6);
      parts.push(part(g, rough(color('#8a8aa8'), 0.1, 4)), ring(0.6, 1.4 + k * 0.9, 3.4 + k * 0.4, 1 - k * 0.6, 0.04, CRYSTAL));
    }
    return merge(parts);
  }),
  'printing-house': m((s, v) => {
    const parts = renaissanceBody(s, { w: 5.4, d: 4, storeys: 2, chimneys: 2 }, v);
    parts.push(...crates(4, -3.8, 1, v), ...pennant(3.2, 2.4, 3.2, s));
    return merge(parts);
  }),
  'airship-yard': m((s, v) => {
    const t = tones(s);
    const parts: G[] = [];
    // A tall open timber frame with the airship's envelope taking shape inside.
    for (let k = 0; k < 5; k++) {
      const x = -4 + k * 2;
      for (const z of [-3, 3]) parts.push(beam(V(x, 0, z), V(x, 7, z * 0.85), 0.2, t.timber));
      parts.push(beam(V(x, 7, -2.6), V(x, 7, 2.6), 0.16, t.timber));
    }
    for (const z of [-2.8, 2.8]) parts.push(beam(V(-4, 6.8, z), V(4, 6.8, z), 0.14, t.timber));
    parts.push(...envelope(6.5, 1.8, 0, 4, 0, mix(color('#d8cfb8'), s.cloth, 0.2)), ...crates(5, 4.8, 2, v), box(3, 0.08, 6.8, 0, 0, 0, rough(color('#8a6a48'), 0.06)));
    return merge(parts);
  }),
  'mooring-mast': m((s, v) => {
    const t = tones(s);
    const parts = [...lattice(0, 0, 10, 0.9, 0.35, t.timber, 6), cyl(0.5, 0.5, 0.5, 0, 10, 0, IRON, 10), ring(0.6, 10.3, 0, 0, 0.06, IRON), ...renaissanceBody(s, { w: 3, d: 2.6, storeys: 1, chimneys: 0 }, v).map((g) => g.translate(3.4, 0, 1))];
    parts.push(...pennant(0, 0, 0, s).map((g) => g.translate(0, 10.5, 0)));
    return merge(parts);
  }),

  // ================================================================ Industrial
  terrace: m((s, v) => {
    const t = tones(s);
    const parts = renaissanceBody(s, { w: 9, d: 3.8, storeys: 2, chimneys: 0 }, 0);
    for (let k = -1; k <= 1; k++) parts.push(...chimney(k * 3, 0, 2.6, 4.8, brickPaint(t.brick)), ...door(k * 3 - 0.9, 1.9, 0.8, 1.8, s.cloth.clone().multiplyScalar(0.6), color('#d8cfbc')).map((g) => g.translate(0, 0.35, 0)));
    void v;
    return merge(parts);
  }),
  'refrigerated-store': m((s, v) => {
    const parts = industrialBody(s, { w: 6, d: 4.4, roof: 'flat' }, v);
    for (let k = 0; k < 3; k++) parts.push(beam(V(-2 + k * 1.6, 0.3, -2.4), V(-2 + k * 1.6, 3.4, -2.4), 0.14, STEEL), box(1, 0.8, 0.8, -2 + k * 1.6, 3.2, -1.6, STEEL));
    parts.push(...tank(0.6, 1.6, 3.8, -1.6, STEEL));
    return merge(parts);
  }),
  'steam-lumber': m((s, v) => {
    const parts = industrialBody(s, { w: 4.4, d: 3.4 }, v);
    parts.push(...stack(2.8, -1.2, 5, 0.35, tones(s).brick), ...logPile(10, 3.2, -4, 0.2, 0.1), ...rails(8, 0, 3.6, 0), box(1.6, 0.9, 1, -1.2, 0.2, 3.6, IRON));
    return merge(parts);
  }),
  plantation: m((s, v) => {
    const parts: G[] = [...fenceRing(6, 18, s, 0.5, false)];
    for (let k = 0; k < 12; k++) {
      const x = (k % 4) * 2.4 - 3.6;
      const z = Math.floor(k / 4) * 2.6 - 2.6;
      parts.push(part(limb(V(x, 0, z), V(x, 2.2, z), 0.14, 0.1, 6), color('#6a5a44')), part(new THREE.IcosahedronGeometry(1, 1).scale(0.9, 0.7, 0.9).translate(x, 2.6, z), rough(color('#3f6a2e'), 0.1, 3)), cyl(0.12, 0.12, 0.2, x + 0.15, 1, z, color('#e8e0c8'), 6));
    }
    void v;
    return merge(parts);
  }),
  'quarry-blast': m((s, v) => {
    const parts = [...pit(4.4, 0, 0, color('#8a857a'), s.stone), ...pit(2.6, 0, 0, color('#6f6a60'), color('#8a857a')), ...crane(4.6, 0, 6, 3.6, IRON, Math.PI), ...rails(7, -3, 4.4, 0), ...blockPile(8, -4.4, -2, s, v)];
    return merge(parts);
  }),
  'clay-works': m((s, v) => {
    const parts = [...pit(3, -1.6, 0, color('#9a6a48'), color('#7a5a40')), ...industrialBody(s, { w: 3.6, d: 3 }, v).map((g) => g.translate(3, 0, -1)), ...rails(5, 0, 3, 0)];
    return merge(parts);
  }),
  dredge: m((_s, v) => {
    const parts = [box(4, 1, 2.4, 0, -0.4, 0, rough(color('#5a4a3a'), 0.06)), box(2.4, 2, 2, 0.4, 0.6, 0, rough(color('#7a6a52'), 0.06)), ...roofSlabs(2.4, 2, 0.6, 2.6, SLATE, 0.15), ...stack(-0.6, 0, 3.6, 0.2, IRON)];
    parts.push(beam(V(2, 0.6, 0), V(4.6, -0.6, 0), 0.25, IRON), ...[0, 1, 2, 3].map((k) => box(0.35, 0.3, 0.4, 2.3 + k * 0.6, 0.4 - k * 0.3, 0, IRON)));
    void v;
    return merge(parts);
  }),
  'pump-station': m((s, v) => {
    const parts = industrialBody(s, { w: 4.4, d: 3.6, storeys: 2 }, v);
    parts.push(...stack(-3, -1, 8, 0.4, tones(s).brick), cyl(0.4, 0.4, 1.4, 3, 0, 1.6, IRON, 10), ...tank(0.9, 2.6, 3.2, -1.2, IRON));
    return merge(parts);
  }),
  'deep-mine': m((s, v) => {
    const parts = [mound(4, 2.2, -3.4, -3, SPOIL), ...lattice(0, 0, 8, 1.2, 0.5, IRON, 5), ...waterwheel(0, 0, 0.9, IRON).map((g) => g.translate(0, 7.3, 0))];
    parts.push(...industrialBody(s, { w: 3.6, d: 3 }, v).map((g) => g.translate(4, 0, 1.4)), ...stack(5.4, -1, 7, 0.35, tones(s).brick), beam(V(0, 7.7, 0), V(3.4, 3.4, 1.4), 0.03, IRON), ...rails(6, -1, 4, 0));
    return merge(parts);
  }),
  derrick: m((s, v) => {
    const parts = [...lattice(0, 0, 9, 1.2, 0.25, TIMBER, 6), box(2.8, 0.3, 2.8, 0, 0, 0, TIMBER), ...tank(1, 2, 3.4, 1.6, IRON), ...barrels(4, -3, 2)];
    parts.push(...industrialBody(s, { w: 2.6, d: 2.2 }, v).map((g) => g.translate(-3, 0, -2.4)));
    return merge(parts);
  }),
  'gas-well': m((s, v) => {
    const parts = [cyl(0.25, 0.25, 1.4, 0, 0, 0, IRON, 8), box(0.8, 0.3, 0.8, 0, 1.1, 0, color('#a83a2a')), cyl(0.12, 0.15, 6, 3, 0, -2, STEEL, 8), cyl(0.25, 0.12, 0.4, 3, 6, -2, color('#e07a2a'), 8)];
    parts.push(...tank(1.2, 2.4, -2.6, -1, color('#9aa0a6')), beam(V(0, 0.8, 0), V(-1.6, 0.8, -1), 0.12, IRON), beam(V(0, 0.6, 0), V(3, 0.6, -2), 0.1, IRON), ...fenceRing(4.4, 14, s, 0.5, false));
    void v;
    return merge(parts);
  }),
  'trawler-wharf': m((s, v) => {
    const t = tones(s);
    const parts = [...stoneQuay(4.4, 7, 0, t.stone), ...industrialBody(s, { w: 5, d: 3.4 }, v).map((g) => g.translate(0, 0, -2.6)), ...hull(5, 1.6, 0.8, 0, 0, rough(color('#2f4a5a'), 0.06), false, -0.6).map((g) => g.rotateY(Math.PI / 2).translate(3.4, 0, 4)), ...barrels(4, -1.4, 3)];
    return merge(parts);
  }),
  'mech-farm': m((s, v) => {
    const parts = [...plots(10, 8, 8, color('#c8a84a'), null, v), ...industrialBody(s, { w: 3.6, d: 3 }, v).map((g) => g.translate(-6.6, 0, -3)), ...tank(0.9, 4, -6.6, 1.2, color('#9aa0a6'))];
    // A steam tractor.
    parts.push(box(1.6, 0.8, 0.9, 4, 0.5, 4.6, color('#3a5a3a')), cyl(0.5, 0.5, 0.3, 3.4, 0, 5.2, IRON, 12).rotateX(0), ...stack(4.6, 4.6, 1.6, 0.12, IRON));
    return merge(parts);
  }),
  'dairy-farm': m((s, v) => {
    const parts = [...fenceRing(6.5, 20, s, 0.5, false), ...industrialBody(s, { w: 5, d: 3.4 }, v).map((g) => g.translate(-2.4, 0, -3)), ...tank(0.8, 4, 1.6, -3.4, color('#c8ccd0')), ...barrels(3, 3, 2)];
    return merge(parts);
  }),
  'poultry-barn': m((s, v) => {
    const parts = industrialBody(s, { w: 7, d: 3.4 }, v);
    parts.push(...fenceRing(3, 10, s, 0.5, true).map((g) => g.translate(0, 0, 4)));
    return merge(parts);
  }),
  'gravel-works': m((s, v) => {
    const sand = color('#d8c690');
    return merge([...pit(3.6, -1, 1, sand, color('#b8a878')), ...industrialBody(s, { w: 3.6, d: 3 }, v).map((g) => g.translate(4, 0, -2)), beam(V(0, 0.3, 0.5), V(3, 3, -1.4), 0.4, IRON), mound(1.6, 1.3, 3.4, 2.6, rough(sand, 0.06)), mound(1.4, 1.1, 0.6, -3.4, rough(color('#9a948a'), 0.1)), ...rails(6, -1, 5, 0)]);
  }),
  'sulfur-works': m((s, v) => {
    const y = color('#d8c23a');
    return merge([...industrialBody(s, { w: 4.4, d: 3.4 }, v), ...stack(3, -1.2, 6, 0.35, tones(s).brick), ...tank(0.8, 2, -3.4, -0.6, IRON), mound(1.6, 1.2, 3.6, 2.4, rough(y, 0.08)), mound(1.1, 0.8, -3, 2.6, rough(y, 0.08))]);
  }),
  'mineral-works': m((s, v) => {
    const parts = [...industrialBody(s, { w: 4.4, d: 3.4 }, v).map((g) => g.translate(-2.6, 0, -1.6)), mound(1.4, 1, 3.6, -2.4, rough(color('#e6e2d6'), 0.05))];
    for (let k = 0; k < 4; k++) parts.push(box(2, 0.2, 2, 1 + (k % 2) * 2.3, 0, 1 + Math.floor(k / 2) * 2.3, s.stone), box(1.8, 0.05, 1.8, 1 + (k % 2) * 2.3, 0.16, 1 + Math.floor(k / 2) * 2.3, k % 2 ? color('#ecebe6') : WATER));
    return merge(parts);
  }),
  cannery: m((s, v) => merge([...industrialBody(s, { w: 6.4, d: 4.6 }, v, true), ...stack(4, -1.8, 7, 0.38, tones(s).brick), ...crates(6, -4.4, 2, v)])),
  'steam-sawmill': m((s, v) => merge([...industrialBody(s, { w: 6, d: 4 }, v), ...stack(-3.6, -1.6, 7, 0.38, tones(s).brick), ...logPile(10, 3.2, 0, 3.6, 0), ...rails(8, 0, 5.2, 0)])),
  'stone-works': m((s, v) => merge([...industrialBody(s, { w: 5.6, d: 4 }, v), ...blockPile(10, -4.6, 1, s, v), ...crane(4.2, 2.6, 5, 2.6, IRON, 0)])),
  brickworks: m((s, v) => {
    const t = tones(s);
    const parts = [...industrialBody(s, { w: 6, d: 4.4, roof: 'flat' }, v), ...stack(0, -3.2, 10, 0.55, t.brick)];
    for (let k = 0; k < 6; k++) parts.push(box(1, 0.6, 0.6, -4.6 + (k % 2) * 1.1, Math.floor(k / 2) * 0.6, 3, brickPaint(t.brick)));
    return merge(parts);
  }),
  'coke-ovens': m((s, v) => {
    const t = tones(s);
    const parts: G[] = [box(9, 1.6, 2.6, 0, 0, 0, brickPaint(t.brick))];
    for (let k = 0; k < 7; k++) {
      const dome = new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.translate(-3.6 + k * 1.2, 1.6, 0);
      parts.push(part(dome, brickPaint(t.brick)), box(0.5, 0.6, 0.1, -3.6 + k * 1.2, 0.2, 1.32, SOOT));
    }
    parts.push(...stack(4.8, -2, 9, 0.5, t.brick), ...rails(9, 0, 2.6, 0));
    void v;
    return merge(parts);
  }),
  foundry: m((s, v) => merge([...industrialBody(s, { w: 7, d: 5 }, v, true), ...stack(-3.8, -2, 10, 0.55, tones(s).brick), ...stack(3.8, -2, 8, 0.45, tones(s).brick), ...blockPile(4, 4.4, 3, s, v)])),
  glassworks: m((s, v) => {
    const t = tones(s);
    const cone = new THREE.CylinderGeometry(0.8, 2.4, 7, 14);
    cone.translate(2.6, 3.5, 0);
    return merge([...industrialBody(s, { w: 4.4, d: 4 }, v).map((g) => g.translate(-2.4, 0, 0)), part(cone, brickPaint(t.brick)), cyl(0.8, 0.85, 0.3, 2.6, 7, 0, SOOT, 14)]);
  }),
  'leather-works': m((s, v) => merge([...industrialBody(s, { w: 6, d: 4 }, v), ...stack(3.4, -1.6, 6, 0.35, tones(s).brick), ...frame(-4, 2.6, 0.2, s, color('#9a7650'))])),
  'textile-mill': m((s, v) => {
    const parts = industrialBody(s, { w: 7, d: 4.4, storeys: 3, roof: 'flat' }, v);
    parts.push(...stack(-4.6, -1, 13, 0.55, tones(s).brick), box(1.6, 10, 1.6, 4.2, 0, -1.2, brickPaint(tones(s).brick)), ...hipped(1.8, 1.8, 1.2, 10, SLATE, 0.1).map((g) => g.translate(4.2, 0, -1.2)));
    return merge(parts);
  }),
  'roller-mill': m((s, v) => merge([...industrialBody(s, { w: 5, d: 4, storeys: 3 }, v), ...tank(1.1, 6, 4.2, -1, color('#b0a898')), ...tank(1.1, 6, 4.2, 1.6, color('#b0a898'))])),
  'chemical-works': m((s, v) => merge([...industrialBody(s, { w: 5.4, d: 4 }, v), ...tank(1.2, 3.4, 4.6, -1.2, color('#c8c0a8')), ...tank(0.9, 2.6, 4.6, 1.8, color('#a8b0a0')), ...stack(-3.4, -1.6, 8, 0.4, tones(s).brick), beam(V(2.7, 2.2, -1.2), V(3.5, 2.2, -1.2), 0.15, IRON)])),
  refinery: m((s, v) => {
    const parts: G[] = [...tank(1.6, 3, -3, -2, color('#c8ccd0')), ...tank(1.6, 3, 0.6, -2.6, color('#c8ccd0'))];
    parts.push(...lattice(3.6, 1, 8, 0.8, 0.5, STEEL, 5), cyl(0.5, 0.5, 8, 3.6, 0, 1, STEEL, 10), ...stack(-3.8, 2.6, 9, 0.35, STEEL), cyl(0.2, 0.25, 0.5, -3.8, 9, 2.6, color('#e07a2a'), 8));
    parts.push(...industrialBody(s, { w: 3.4, d: 2.6, roof: 'flat' }, v).map((g) => g.translate(-0.6, 0, 2.4)), beam(V(-1.4, 2, -2), V(3.6, 2, 1), 0.15, IRON));
    return merge(parts);
  }),
  manufactory: m((s, v) => merge([...industrialBody(s, { w: 7.4, d: 5, storeys: 2 }, v), ...stack(-4.4, -2, 11, 0.5, tones(s).brick), ...crates(6, 4.4, 3, v)])),
  'machine-shop': m((s, v) => merge([...industrialBody(s, { w: 6.4, d: 4.6 }, v, true), ...stack(3.8, -2, 8, 0.4, tones(s).brick), ...barrels(4, -4.6, 1.4), ...crane(-3.6, -3, 4, 2.4, IRON, 0)])),
  'steel-shipyard': m((s, v) => {
    const parts = [box(6, 0.2, 11, 0, -0.1, 0, rough(CONCRETE, 0.04, 2)), ...hull(9, 2.6, 1.6, 0, 0, rough(color('#3a4a54'), 0.05, 3), false, 0.5).map((g) => g.rotateY(Math.PI / 2))];
    // A gantry crane straddling the slip.
    for (const x of [-3, 3]) parts.push(...lattice(x, 3.6, 8, 0.4, 0.3, color('#c8902a'), 5));
    parts.push(beam(V(-3, 8, 3.6), V(3, 8, 3.6), 0.4, color('#c8902a')), ...industrialBody(s, { w: 4, d: 3 }, v).map((g) => g.translate(-5.4, 0, -3.6)));
    return merge(parts);
  }),
  'airship-works': m((s, v) => {
    // A great arched iron hangar, open at one end, with a ship inside.
    const parts: G[] = [];
    for (let k = 0; k <= 5; k++) {
      const arch = new THREE.TorusGeometry(4, 0.12, 5, 16, Math.PI);
      arch.scale(1, 1.6, 1);
      arch.translate(0, 0, -5 + k * 2);
      parts.push(part(arch, IRON));
    }
    const shell = new THREE.CylinderGeometry(4, 4, 8, 16, 1, true, -Math.PI / 2, Math.PI);
    shell.rotateX(Math.PI / 2);
    shell.rotateZ(Math.PI / 2);
    shell.scale(1, 1.6, 1);
    shell.translate(0, 0, -1);
    parts.push(part(shell, (p) => (Math.abs(Math.sin(p.z * 1.6)) > 0.9 ? IRON : mix(SLATE, GLASS, 0.3))), ...envelope(7, 2, 0, 3.4, 0, mix(color('#c8c0a8'), s.cloth, 0.2)).map((g) => g.rotateY(Math.PI / 2)));
    void v;
    return merge(parts);
  }),
  docks: m((s, v) => {
    const t = tones(s);
    const parts = [...stoneQuay(6, 7, 0, t.stone), ...industrialBody(s, { w: 6.4, d: 3.8, storeys: 2 }, v).map((g) => g.translate(0, 0, -2.8))];
    for (const x of [-2.4, 2.4]) parts.push(...lattice(x, 4.8, 5, 0.4, 0.3, IRON, 3));
    parts.push(beam(V(-2.4, 5, 4.8), V(2.4, 5, 4.8), 0.3, IRON), beam(V(0, 5, 4.8), V(0, 5, 8), 0.2, IRON), ...crates(6, -1.6, 2.2, v), ...barrels(4, 1.6, 3));
    return merge(parts);
  }),
  'airship-terminal': m((s, v) => {
    const parts = [...lattice(0, -1, 14, 1.2, 0.4, IRON, 7), cyl(0.6, 0.6, 0.6, 0, 14, -1, IRON, 10), ring(0.8, 14.4, 0, -1, 0.07, IRON), ...renaissanceBody(s, { w: 6, d: 3.6, storeys: 2, roof: 'hip' }, v).map((g) => g.translate(0, 0, 4))];
    parts.push(...pennant(0, -1, 0, s).map((g) => g.translate(0, 14.8, 0)));
    return merge(parts);
  }),
  'rail-station': m((s, v) => {
    const parts = [...renaissanceBody(s, { w: 6, d: 3.6, storeys: 1, roof: 'hip', chimneys: 2 }, v).map((g) => g.translate(0, 0, -2.4)), box(9, 0.6, 2, 0, 0, 0.6, stonePaint(s.stone)), ...rails(12, 0, 2.6, 0)];
    for (let k = -3; k <= 3; k += 2) parts.push(beam(V(k, 0.6, 1.4), V(k, 3, 1.4), 0.1, IRON));
    parts.push(box(9, 0.1, 2, 0, 3, 0.8, SLATE), cyl(0.3, 0.3, 0.1, 2.6, 2.6, -0.58, color('#efe8da'), 12).rotateX(0));
    return merge(parts);
  }),
  'iron-bridge': m((s, v) => {
    const parts = [box(2.6, 0.25, 11, 0, 1, 0, rough(color('#8a7a6a'), 0.05, 3))];
    const arch = new THREE.TorusGeometry(5.4, 0.12, 5, 20, Math.PI);
    arch.rotateY(Math.PI / 2);
    arch.scale(1, 0.45, 1);
    for (const x of [-1.2, 1.2]) {
      parts.push(part(arch.clone().translate(x, -1.2, 0), IRON), beam(V(x, 1.9, -5.5), V(x, 1.9, 5.5), 0.06, IRON));
      for (let k = -4; k <= 4; k++) parts.push(beam(V(x, -1.2 + Math.sqrt(Math.max(0, 1 - (k / 5.4) ** 2)) * 5.4 * 0.45, k), V(x, 1, k), 0.06, IRON), beam(V(x, 1.1, k), V(x, 1.9, k), 0.05, IRON));
    }
    void v;
    void s;
    return merge(parts);
  }),

  // ================================================================ Modern
  apartments: m((s, v) => {
    const parts = modernBody(s, { w: 7, d: 5.4, storeys: 4 + (v % 2) }, v);
    for (let f = 1; f < 4; f++) parts.push(box(1.4, 0.1, 0.8, -2, f * 3, 3.1, CONCRETE), box(1.4, 0.8, 0.05, -2, f * 3 + 0.1, 3.5, STEEL));
    return merge(parts);
  }),
  forestry: m((s, v) => merge([...modernBody(s, { w: 4.4, d: 3.4, storeys: 1 }, v), ...logPile(12, 3.6, -4.4, 1, 0.05), ...logPile(10, 3.6, 4.4, 2, 0.1), box(2, 1.2, 1.2, 0, 0, 4.4, color('#d8a830')), box(0.8, 0.8, 1, 0.6, 1.2, 4.4, GLASS)])),
  waterworks: m((s, v) => {
    const parts = modernBody(s, { w: 4.4, d: 3.6, storeys: 1 }, v).map((g) => g.translate(-3.4, 0, -2.4));
    for (const [x, z] of [[2.4, -2], [2.4, 2.4], [-2.4, 3]]) parts.push(cyl(1.7, 1.7, 0.9, x, 0, z, CONCRETE, 20), cyl(1.55, 1.55, 0.05, x, 0.85, z, WATER, 20), beam(V(x - 1.6, 1.1, z), V(x + 1.6, 1.1, z), 0.12, STEEL));
    return merge(parts);
  }),
  'open-pit': m((s, v) => {
    const parts: G[] = [];
    for (let k = 0; k < 4; k++) parts.push(...pit(5.4 - k * 1.2, 0, 0, k % 2 ? color('#8a7a62') : color('#9a8a72'), color('#a89a82')));
    parts.push(box(1.8, 1.2, 1.2, 3.6, 0, -2.6, color('#d8a830')), box(1.8, 0.6, 1.4, 3.6, 1.2, -2.2, color('#8a7a62')));
    void s;
    void v;
    return merge(parts);
  }),
  pumpjacks: m((s, v) => {
    const parts: G[] = [];
    for (const [x, z] of [[-2.6, -2], [2.4, -1.6], [0, 2.6]]) {
      parts.push(box(1.6, 0.3, 0.8, x, 0, z, CONCRETE), beam(V(x - 0.3, 0.3, z), V(x, 2, z), 0.12, STEEL), beam(V(x + 0.3, 0.3, z), V(x, 2, z), 0.12, STEEL));
      parts.push(beam(V(x - 1.4, 2.4, z), V(x + 1.2, 1.8, z), 0.22, color('#c8902a')), box(0.5, 0.8, 0.3, x - 1.5, 1.6, z, color('#c8902a')), cyl(0.12, 0.12, 1.2, x + 1.2, 0, z, IRON, 8));
    }
    parts.push(...tank(1, 2.4, 4, 2.4, color('#c8ccd0')), ...fenceRing(5.4, 16, s, 0.5, false));
    void v;
    return merge(parts);
  }),
  'agri-complex': m((s, v) => {
    const parts = [...modernBody(s, { w: 4, d: 3.4, storeys: 1 }, v).map((g) => g.translate(-4.4, 0, -3))];
    for (let k = 0; k < 3; k++) {
      const vault = new THREE.CylinderGeometry(1.5, 1.5, 8, 14, 1, true, -Math.PI / 2, Math.PI);
      vault.rotateZ(Math.PI / 2);
      vault.translate(0.6, 0, -2.4 + k * 3.2);
      parts.push(part(vault, (p) => mix(color('#b8d4cc'), color('#e8f4f0'), p.y / 1.5)), box(7.6, 0.05, 2.6, 0.6, 0.02, -2.4 + k * 3.2, color('#4f7a34')));
    }
    parts.push(...tank(1, 5, -4.6, 2.4, color('#c8ccd0')));
    return merge(parts);
  }),
  'timber-factory': m((s, v) => merge([...modernBody(s, { w: 7, d: 5, storeys: 2 }, v), ...logPile(10, 3.6, -5, 2, 0.05), box(3, 0.08, 1.2, 4, 0, 3.4, color('#c8a878'))])),
  'arc-works': m((s, v) => merge([...modernBody(s, { w: 7, d: 5, storeys: 2 }, v), ...stack(4.4, -2, 10, 0.5, color('#8a8a88')), ...lattice(-4.6, -2.4, 6, 0.5, 0.3, STEEL, 3), beam(V(-4.6, 6, -2.4), V(-1, 6, -1), 0.04, IRON)])),
  'textile-factory': m((s, v) => merge([...modernBody(s, { w: 8, d: 5, storeys: 2 }, v), ...crates(6, 5, 2, v)])),
  enrichment: m((s, v) => {
    const parts = modernBody(s, { w: 5, d: 4, storeys: 2 }, v);
    const tower = new THREE.CylinderGeometry(1.4, 2, 6, 18, 1, true);
    tower.translate(4.4, 3, -1);
    parts.push(part(tower, rough(CONCRETE, 0.03, 2)), ...fenceRing(6.4, 20, s, 0.5, false));
    return merge(parts);
  }),
  'assembly-plant': m((s, v) => merge([...modernBody(s, { w: 9, d: 6, storeys: 2 }, v), box(2.4, 1.2, 1.2, 5.8, 0, 2, color('#3a5a8a')), box(2.4, 1.2, 1.2, 5.8, 0, -0.2, color('#a83a2a'))])),
  'container-port': m((_s, v) => {
    const parts = [box(8, 1.3, 7, 0, -0.8, 2, rough(CONCRETE, 0.04, 2))];
    const cols = [color('#a83a2a'), color('#3a5a8a'), color('#c8902a'), color('#3a7a5a')];
    for (let k = 0; k < 12; k++) parts.push(box(2.4, 1, 1, -2.6 + (k % 3) * 2.6, 0.5 + Math.floor(k / 6) * 1, -0.4 + (Math.floor(k / 3) % 2) * 1.1, rough(cols[(k + v) % 4], 0.05, 3)));
    for (const x of [-3.4, 3.4]) parts.push(...lattice(x, 4.6, 7, 0.4, 0.3, color('#c8902a'), 4));
    parts.push(beam(V(-3.4, 7, 4.6), V(3.4, 7, 4.6), 0.4, color('#c8902a')), beam(V(0, 7, 4.6), V(0, 7, 8.6), 0.3, color('#c8902a')));
    return merge(parts);
  }),
  'electric-station': m((s, v) => {
    const parts = [...modernBody(s, { w: 7, d: 3.6, storeys: 1 }, v).map((g) => g.translate(0, 0, -3)), box(11, 0.8, 2.4, 0, 0, 0.6, CONCRETE), ...rails(13, 0, 3, 0)];
    for (let k = -5; k <= 5; k += 2.5) parts.push(beam(V(k, 0, 4), V(k, 4, 4), 0.12, STEEL), beam(V(k, 3.8, 4), V(k, 3.8, 2.6), 0.08, STEEL));
    parts.push(beam(V(-5.5, 3.6, 3), V(5.5, 3.6, 3), 0.03, IRON), box(11, 0.12, 2.6, 0, 3.4, 0.6, STEEL));
    return merge(parts);
  }),

  // ================================================================ Techno-magic
  arcology: m((_s, v) => {
    const parts = technoBody(3.4, 4, v, false);
    parts.push(cyl(1.6, 2.6, 6, 0, 4.3, 0, rough(TECHNO, 0.03, 2), 20), ...seams(2.2, 6, 4.3, 3), cyl(0.4, 1.6, 3, 0, 10.3, 0, TECHNO, 20), ...crystal(0, 13, 0, 2.4), ring(2.6, 11, 0, 0, 0.08), ring(3.4, 6, 0, 0, 0.06, CRYSTAL));
    // Hanging gardens on terraces.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      parts.push(part(new THREE.IcosahedronGeometry(0.5, 0).translate(Math.cos(a) * 2.9, 4.6, Math.sin(a) * 2.9), rough(color('#4f8a44'), 0.1, 4)));
    }
    return merge(parts);
  }),
  'stasis-vault': m((_s, v) => {
    const dome = new THREE.SphereGeometry(2.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    return merge([part(dome, rough(TECHNO, 0.03, 2)), ...seams(2.2, 1.6, 0.4, 2), ...crystal(0, 2.7, 0, 1.2), box(1, 1.8, 0.3, 0, 0, 2.5, CRYSTAL), ...crystal(3, 0, 1, 0.8 + (v % 2) * 0.3)]);
  }),
  'grove-lodge': m((s, v) => {
    const parts = technoBody(2.2, 2.4, v);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const x = Math.cos(a) * 4.4;
      const z = Math.sin(a) * 4.4;
      parts.push(part(limb(V(x, 0, z), V(x, 2.6, z), 0.2, 0.14, 6), color('#8a7a9a')), part(new THREE.IcosahedronGeometry(1.2, 1).translate(x, 3.4, z), (p) => mix(color('#7ab8a8'), color('#c8e8c0'), noise3(p.x, p.y, p.z) * 0.5 + 0.5)));
    }
    void s;
    return merge(parts);
  }),
  'mana-bore': m((_s, v) => {
    const parts = [...lattice(0, 0, 9, 1.2, 0.4, TECHNO, 5), cyl(0.3, 0.3, 9, 0, 0, 0, GOLD, 10), ...crystal(0, 9, 0, 2), ring(1.4, 2, 0, 0, 0.08, CRYSTAL), ring(1, 5, 0, 0, 0.07, CRYSTAL)];
    parts.push(...technoBody(1.6, 2, v, false).map((g) => g.translate(4, 0, 2)));
    return merge(parts);
  }),
  'hydro-farm': m((_s, v) => {
    const parts: G[] = [];
    for (let k = 0; k < 3; k++) {
      const y = k * 2.2;
      parts.push(cyl(3.6 - k * 0.8, 3.6 - k * 0.8, 0.3, 0, y, 0, TECHNO, 24), cyl(3.4 - k * 0.8, 3.4 - k * 0.8, 0.12, 0, y + 0.3, 0, rough(color('#4f8a44'), 0.1, 3), 24));
      if (k < 2) for (let j = 0; j < 6; j++) {
        const a = (j / 6) * Math.PI * 2;
        parts.push(beam(V(Math.cos(a) * (2.4 - k * 0.8), y, Math.sin(a) * (2.4 - k * 0.8)), V(Math.cos(a) * (2.4 - k * 0.8), y + 2.2, Math.sin(a) * (2.4 - k * 0.8)), 0.1, GOLD));
      }
    }
    parts.push(...crystal(0, 6.8, 0, 1.4), ring(2, 7.4, 0, 0, 0.05, CRYSTAL));
    void v;
    return merge(parts);
  }),
  'mana-arc': m((_s, v) => merge([...technoBody(3, 4, v), ...technoBody(1.4, 6, v + 1, true).map((g) => g.translate(4.4, 0, -1.6)), beam(V(0, 5, 0), V(4.4, 7, -1.6), 0.06, CRYSTAL)])),
  fabricator: m((_s, v) => {
    const parts = technoBody(3.2, 3.4, v);
    for (let k = 0; k < 3; k++) parts.push(...crystal(4 + (k % 2) * 0.6, 0.8 + k * 0.6, -1.6 + k * 1.4, 0.6), ring(0.5, 0.6 + k * 0.6, 4 + (k % 2) * 0.6, -1.6 + k * 1.4, 0.03, CRYSTAL));
    return merge(parts);
  }),
  'sky-dock': m((s, v) => {
    const parts = [cyl(4.4, 4.6, 0.5, 0, 0, 0, TECHNO, 28), ...seams(4.45, 0.5, 0, 1), ...envelope(6, 1.6, 0, 4, 0, mix(TECHNO, s.cloth, 0.25)), ring(2.4, 2.4, 0, 0, 0.08), ring(2.4, 5.6, 0, 0, 0.08)];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      parts.push(...crystal(Math.cos(a) * 3.8, 0.5, Math.sin(a) * 3.8, 1));
    }
    void v;
    return merge(parts);
  }),
  'sky-harbour': m((_s, v) => {
    const parts = [...technoBody(2.2, 6, v, false), cyl(4, 3.6, 0.4, 0, 6.3, 0, TECHNO, 28), ...seams(3.8, 0.4, 6.3, 1), ...crystal(0, 7, 0, 1.8)];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      parts.push(beam(V(Math.cos(a) * 3.6, 6.5, Math.sin(a) * 3.6), V(Math.cos(a) * 5.4, 7.6, Math.sin(a) * 5.4), 0.12, GOLD), ring(0.5, 7.6, Math.cos(a) * 5.4, Math.sin(a) * 5.4, 0.05, CRYSTAL));
    }
    return merge(parts);
  }),
  maglev: m((_s, v) => {
    const parts = [...technoBody(2.4, 3, v, true).map((g) => g.translate(0, 0, -3)), box(12, 0.5, 1.4, 0, 3.4, 2, TECHNO)];
    for (let k = -5; k <= 5; k += 2.5) parts.push(cyl(0.3, 0.4, 3.4, k, 0, 2, TECHNO, 10), ring(0.45, 2.8, k, 2, 0.04, CRYSTAL));
    parts.push(box(12, 0.06, 0.3, 0, 3.92, 2, CRYSTAL), box(4, 0.9, 1.2, 1.6, 4.1, 2, (p) => mix(TECHNO, GLASS_LIT, p.y > 4.5 ? 0.6 : 0)));
    return merge(parts);
  }),
};

// The plainer kit pieces some models use only now and then.
void wallColor;
void roofColor;
void pole;
