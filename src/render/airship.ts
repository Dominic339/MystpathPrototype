// An airship — far beyond the camp's era, included in the test scene to judge
// how well a complex, hero-quality model reads in this art style.

import * as THREE from 'three';
import { color, jitter, limb, merge, mix, part } from './geom';
import { natureMaterial } from './materials';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const CREAM = color('#e9dcc0');
const CLARET = color('#7e2430');
const WOOD = color('#6b4a2e');
const WOOD_DARK = color('#3e2a1a');
const WOOD_LIGHT = color('#9b7148');
const BRASS = color('#b8914b');

const ENV_LEN = 15;
const ENV_R = 4.6;

/** Envelope radius at a fraction along its length (-1 tail … 1 nose). */
function envR(f: number): number {
  const taper = f < 0 ? 1 - 0.38 * f * f : 1 - 0.08 * f * f;
  return ENV_R * taper * Math.sqrt(Math.max(0, 1 - f * f));
}

/** A point on the envelope surface at length fraction f and angle a around the axis (0 = top). */
function onEnvelope(f: number, a: number, lift = 0): THREE.Vector3 {
  const r = envR(f) + lift;
  return V(f * ENV_LEN, Math.cos(a) * r, Math.sin(a) * r);
}

function envelope(): THREE.BufferGeometry {
  const lon = 96; // divisible by 12 so gore boundaries fall on vertex meridians
  const lat = 48;
  const positions: number[] = [];
  const colors: number[] = [];
  const pt = (i: number, j: number) => {
    const f = -1 + (2 * i) / lat;
    const a = (j / lon) * Math.PI * 2;
    // Slight bulge between gore seams.
    const scallop = 1 + 0.014 * Math.abs(Math.sin(a * 6));
    const r = envR(f) * scallop;
    return V(f * ENV_LEN, Math.cos(a) * r, Math.sin(a) * r);
  };
  const seam = color('#5a1c24');
  for (let i = 0; i < lat; i++)
    for (let j = 0; j < lon; j++) {
      const a = pt(i, j);
      const b = pt(i + 1, j);
      const c = pt(i + 1, j + 1);
      const d = pt(i, j + 1);
      // Colour per gore panel (face), so stripes have crisp edges along the seams.
      const gore = Math.floor((j / lon) * 12);
      const atSeam = j % (lon / 12) === 0;
      const base = (gore % 2 === 0 ? CREAM : CLARET).clone();
      if (atSeam) base.lerp(seam, 0.5);
      const fmid = -1 + (2 * (i + 0.5)) / lat;
      const angMid = ((j + 0.5) / lon) * Math.PI * 2;
      // Weather-stained underside and a slightly sun-faded top.
      const down = Math.max(0, -Math.cos(angMid));
      base.lerp(color('#5c5048'), down * down * 0.3);
      base.multiplyScalar(0.92 + 0.08 * Math.cos(angMid) + 0.04 * Math.sin(fmid * 9));
      for (const q of [a, c, b, a, d, c]) {
        positions.push(q.x, q.y, q.z);
        const jit = jitter(base, 0.025, q.x * 0.3, q.y, q.z);
        colors.push(jit.r, jit.g, jit.b);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // Smooth normals: derive from the analytic shape rather than flat faces.
  const nrm = new Float32Array(positions.length);
  for (let k = 0; k < positions.length; k += 3) {
    const x = positions[k];
    const y = positions[k + 1];
    const z = positions[k + 2];
    const f = x / ENV_LEN;
    const e = 0.002;
    const dr = (envR(Math.min(1, f + e)) - envR(Math.max(-1, f - e))) / (2 * e * ENV_LEN);
    const rr = Math.hypot(y, z) || 1;
    const n = V(-dr, y / rr, z / rr).normalize();
    nrm[k] = n.x;
    nrm[k + 1] = n.y;
    nrm[k + 2] = n.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

function bands(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Brass hoops that sit snugly on the envelope.
  for (const f of [-0.62, -0.2, 0.25, 0.62]) {
    const t = new THREE.TorusGeometry(envR(f) * 1.016 + 0.02, 0.07, 8, 72);
    t.rotateY(Math.PI / 2);
    t.translate(f * ENV_LEN, 0, 0);
    parts.push(part(t, BRASS));
  }
  // A keel spine following the curve of the top, ending in finials.
  const spinePts: THREE.Vector3[] = [];
  for (let k = 0; k <= 24; k++) spinePts.push(onEnvelope(-0.86 + (k / 24) * 1.74, 0, 0.09));
  const spine = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spinePts), 96, 0.075, 8, false);
  parts.push(part(spine, BRASS));
  for (const end of [spinePts[0], spinePts[spinePts.length - 1]]) {
    const ball = new THREE.SphereGeometry(0.13, 10, 8);
    ball.translate(end.x, end.y, end.z);
    parts.push(part(ball, BRASS));
  }
  // Nose cap and tail cone.
  const nose = new THREE.SphereGeometry(0.75, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  nose.rotateZ(-Math.PI / 2);
  nose.scale(0.55, 1, 1);
  nose.translate(ENV_LEN - 0.32, 0, 0);
  parts.push(part(nose, BRASS));
  const tail = new THREE.ConeGeometry(0.42, 1.2, 14);
  tail.rotateZ(Math.PI / 2);
  tail.translate(-ENV_LEN - 0.35, 0, 0);
  parts.push(part(tail, BRASS));
  return merge(parts);
}

function fins(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Root edge follows the envelope's curve so each fin sits flush on the tail.
  const f0 = -0.52;
  const f1 = -0.93;
  const shape = new THREE.Shape();
  const steps = 8;
  for (let k = 0; k <= steps; k++) {
    const f = f0 + (f1 - f0) * (k / steps);
    const r = envR(f) - 0.25;
    if (k === 0) shape.moveTo(f * ENV_LEN, r);
    else shape.lineTo(f * ENV_LEN, r);
  }
  shape.lineTo(f1 * ENV_LEN - 0.9, envR(f1) + 2.7);
  shape.lineTo(f0 * ENV_LEN - 3.0, envR(f0) + 1.7);
  shape.closePath();
  for (let k = 0; k < 4; k++) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
    g.translate(0, 0, -0.07);
    g.rotateX((k / 4) * Math.PI * 2 + Math.PI / 4);
    parts.push(
      part(g, (p) => {
        const radial = Math.hypot(p.y, p.z);
        const f = p.x / ENV_LEN;
        const out = radial - envR(Math.max(-0.99, Math.min(0.99, f)));
        if (out > 1.9) return CLARET; // painted tip
        if (Math.abs(p.x - (f1 * ENV_LEN + 1.6)) < 0.05) return WOOD_DARK; // control-surface hinge line
        return CREAM.clone().multiplyScalar(0.95);
      }),
    );
  }
  return merge(parts);
}

/** Wooden gondola hull: a lofted boat shape with planking. */
function hull(): THREE.BufferGeometry {
  const L = 12;
  const B = 1.5; // half beam
  const D = 1.7; // depth
  const segL = 28;
  const segV = 14;
  const pts: THREE.Vector3[][] = [];
  for (let i = 0; i <= segL; i++) {
    const u = i / segL; // 0 stern → 1 bow
    const x = (u - 0.5) * L;
    const width = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08 + 0.02)), 0.6) * (u > 0.85 ? 1 - (u - 0.85) * 2.2 : 1);
    const sheer = 0.35 * (u - 0.5) * (u - 0.5) * 4 + (u > 0.9 ? (u - 0.9) * 5 : 0); // rising bow and stern
    const row: THREE.Vector3[] = [];
    for (let j = 0; j <= segV; j++) {
      const v = j / segV; // 0 port rail → 1 starboard rail, through the keel
      const a = Math.PI * v;
      const y = -Math.sin(a) * D * (0.55 + 0.45 * width) + sheer;
      const z = -Math.cos(a) * B * Math.max(0.05, width) * (0.85 + 0.15 * Math.sin(a));
      row.push(V(x, y, z));
    }
    pts.push(row);
  }
  const positions: number[] = [];
  for (let i = 0; i < segL; i++)
    for (let j = 0; j < segV; j++) {
      const a = pts[i][j];
      const b = pts[i + 1][j];
      const c = pts[i + 1][j + 1];
      const d = pts[i][j + 1];
      for (const q of [a, b, c, a, c, d]) positions.push(q.x, q.y, q.z);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  const hullPart = part(g, (p) => {
    // Brass-rimmed portholes along both sides.
    const px = ((p.x + 100) % 1.5) - 0.75;
    const pd = Math.hypot(px, p.y + 0.55);
    if (Math.abs(p.x) < 4.6 && pd < 0.2) return pd < 0.14 ? color('#1d2a33') : BRASS;
    const plank = Math.floor((p.y + 3) * 5.5);
    const c = mix(WOOD_DARK, WOOD_LIGHT, ((plank * 7) % 5) / 5 * 0.6 + 0.2);
    if (Math.abs(p.y - 0.05) < 0.08) c.copy(CLARET); // painted strake
    return jitter(c, 0.08, p.x * 0.3, p.y * 6, p.z);
  });
  // Deck.
  const deck = new THREE.BoxGeometry(L * 0.86, 0.1, B * 1.75);
  deck.translate(0, 0.08, 0);
  const deckPart = part(deck, (p) => mix(WOOD, WOOD_LIGHT, (Math.floor(p.z * 7 + 10) % 3) / 3));
  // Cabin aft.
  const cabin = new THREE.BoxGeometry(3.2, 1.5, 2.1);
  cabin.translate(-2.6, 0.85, 0);
  const cabinPart = part(cabin, (p) => (Math.abs(p.y - 1.0) < 0.25 && Math.abs(p.z) > 1.0 && Math.abs((p.x + 2.6) % 0.8) > 0.25 ? color('#2a1d12') : WOOD_LIGHT));
  const roof = new THREE.CylinderGeometry(1.25, 1.25, 3.5, 10, 1, false, 0, Math.PI);
  roof.rotateZ(Math.PI / 2);
  roof.rotateX(Math.PI / 2);
  roof.scale(1, 0.45, 1);
  roof.translate(-2.6, 1.6, 0);
  const roofPart = part(roof, CLARET);
  // Rails.
  const rails: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    rails.push(part(limb(V(-L * 0.42, 0.75, side * B * 0.85), V(L * 0.4, 0.75, side * B * 0.8), 0.04, 0.04, 5), WOOD_DARK));
    for (let k = 0; k <= 8; k++) {
      const x = -L * 0.42 + (k / 8) * L * 0.82;
      rails.push(part(limb(V(x, 0.1, side * B * 0.85), V(x, 0.76, side * B * 0.85), 0.03, 0.03, 4), WOOD_DARK));
    }
  }
  // Rudder at the stern.
  const rudder = new THREE.BoxGeometry(1.1, 1.5, 0.08);
  rudder.translate(-L / 2 - 0.35, -0.3, 0);
  const rudderPart = part(rudder, (p) => (p.y < -0.6 ? CLARET : WOOD));
  // Cabin door and window frames.
  const door = new THREE.BoxGeometry(0.06, 1.0, 0.6);
  door.translate(-1.0 + 0.02, 0.6, 0);
  // Deck cargo: crates, barrels and a coiled rope.
  const cargo: THREE.BufferGeometry[] = [];
  const crate = (x: number, z: number, sz: number, rot: number) => {
    const c = new THREE.BoxGeometry(sz, sz, sz);
    c.rotateY(rot);
    c.translate(x, 0.13 + sz / 2, z);
    cargo.push(part(c, (p) => (Math.abs(((p.x + p.z) * 4) % 1) < 0.12 || Math.abs((p.y * 4) % 1) < 0.1 ? WOOD_DARK : WOOD_LIGHT)));
  };
  crate(1.2, 0.55, 0.6, 0.2);
  crate(1.9, 0.5, 0.5, -0.3);
  crate(1.55, 0.6, 0.42, 0.6);
  for (const [x, z] of [[2.9, -0.6], [3.4, -0.5]]) {
    const b = new THREE.CylinderGeometry(0.26, 0.26, 0.62, 12);
    b.translate(x, 0.44, z);
    cargo.push(part(b, (p) => (Math.abs(p.y - 0.25) < 0.04 || Math.abs(p.y - 0.63) < 0.04 ? color('#4a4540') : color('#7a5534'))));
  }
  const rope = new THREE.TorusGeometry(0.28, 0.07, 6, 16);
  rope.rotateX(Math.PI / 2);
  rope.translate(0.3, 0.18, -0.6);
  cargo.push(part(rope, color('#a89068')));
  // Bow mast with a pennant.
  const mast = limb(V(L * 0.38, 0.1, 0), V(L * 0.38, 2.3, 0), 0.05, 0.035, 6);
  const pennant = new THREE.BufferGeometry();
  pennant.setAttribute('position', new THREE.Float32BufferAttribute([L * 0.38, 2.25, 0, L * 0.38, 1.85, 0, L * 0.38 + 1.1, 2.0, 0.05, L * 0.38, 2.25, 0, L * 0.38 + 1.1, 2.0, 0.05, L * 0.38, 1.85, 0], 3));
  pennant.computeVertexNormals();
  return merge([hullPart, deckPart, cabinPart, roofPart, rudderPart, part(door, WOOD_DARK), part(mast, WOOD_DARK), part(pennant, CLARET), ...cargo, ...rails]);
}

function propeller(): THREE.Group {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: BRASS, metalness: 0.75, roughness: 0.35 });
  const wood = new THREE.MeshStandardMaterial({ color: WOOD_LIGHT, roughness: 0.6 });
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 10), brass);
  hub.rotation.z = -Math.PI / 2;
  g.add(hub);
  for (let k = 0; k < 3; k++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.28), wood);
    blade.position.y = 0.75;
    const holder = new THREE.Group();
    holder.rotation.x = (k / 3) * Math.PI * 2;
    blade.rotation.y = 0.35;
    holder.add(blade);
    g.add(holder);
  }
  return g;
}

export interface AirshipBuild {
  group: THREE.Group;
  update: (time: number, night: number) => void;
}

export function buildAirship(): AirshipBuild {
  const group = new THREE.Group();
  group.name = 'airship';
  const ship = new THREE.Group();
  group.add(ship);
  const mat = natureMaterial({ roughness: 0.8 });
  const mk = (geo: THREE.BufferGeometry) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    ship.add(m);
    return m;
  };
  mk(envelope());
  const brassMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.7, roughness: 0.35 });
  const b = new THREE.Mesh(bands(), brassMat);
  b.castShadow = true;
  ship.add(b);
  mk(fins());
  const h = mk(hull());
  h.position.y = -ENV_R - 3.4;

  // Struts and rigging between gondola and envelope.
  const hullTop = -ENV_R - 3.4 + 0.75;
  const struts: THREE.BufferGeometry[] = [];
  for (const x of [-4.2, 4.0])
    for (const side of [-1, 1]) {
      const top = onEnvelope((x * 1.1) / ENV_LEN, Math.PI - side * 0.35, -0.05);
      struts.push(part(limb(V(x, hullTop, side * 1.2), top, 0.07, 0.06, 6), WOOD_DARK));
    }
  mk(merge(struts));
  const rigPts: number[] = [];
  for (let k = 0; k <= 10; k++) {
    const x = -5 + k;
    for (const side of [-1, 1]) {
      const anchor = onEnvelope((x * 1.35) / ENV_LEN, Math.PI - side * 0.75, 0.02);
      rigPts.push(x, hullTop, side * 1.25, anchor.x, anchor.y, anchor.z);
    }
  }
  const rigGeo = new THREE.BufferGeometry();
  rigGeo.setAttribute('position', new THREE.Float32BufferAttribute(rigPts, 3));
  ship.add(new THREE.LineSegments(rigGeo, new THREE.LineBasicMaterial({ color: '#3a2e24' })));

  // Propellers on outriggers.
  const props: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(limb(V(-4.8, hullTop - 0.2, 0), V(-5.6, hullTop - 0.1, s * 3.1), 0.08, 0.06, 6), new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.7 }));
    ship.add(arm);
    const p = propeller();
    p.position.set(-6.1, hullTop - 0.1, s * 3.1);
    ship.add(p);
    props.push(p);
  }

  // Lanterns at bow and stern.
  const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffcf7a', emissive: '#ffb347', emissiveIntensity: 2 });
  for (const x of [-5.6, 5.8]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), lanternMat);
    l.position.set(x, hullTop + 0.5, 0);
    ship.add(l);
  }

  ship.scale.setScalar(0.85);
  return {
    group,
    update: (time, night) => {
      const R = 95;
      const period = 150;
      const a = (time / period) * Math.PI * 2;
      const cx = 10;
      const cz = 5;
      group.position.set(cx + Math.cos(a) * R, 60 + Math.sin(time * 0.35) * 1.5, cz + Math.sin(a) * R);
      // Face along the direction of travel (counter-clockwise) and bank into the turn.
      group.rotation.set(0, -a - Math.PI / 2, 0);
      ship.rotation.x = -0.1;
      ship.rotation.z = Math.sin(time * 0.5) * 0.02;
      props.forEach((p, k) => (p.rotation.x = time * (14 + k)));
      lanternMat.emissiveIntensity = 0.6 + night * 3;
    },
  };
}
