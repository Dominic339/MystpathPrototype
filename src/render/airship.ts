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

function envelope(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 48, 24);
  g.rotateZ(Math.PI / 2); // poles along X
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Teardrop: fuller nose, tapered tail.
    const taper = x < 0 ? 1 - 0.38 * x * x : 1 - 0.08 * x * x;
    // Gentle bulge between gores.
    const ang = Math.atan2(z, y);
    const scallop = 1 + 0.018 * Math.abs(Math.sin(ang * 6));
    pos.setXYZ(i, x * ENV_LEN, y * ENV_R * taper * scallop, z * ENV_R * taper * scallop);
  }
  g.computeVertexNormals();
  return part(g, (p, n) => {
    const ang = Math.atan2(p.z, p.y);
    const gore = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 12);
    const c = (gore % 2 === 0 ? CREAM : CLARET).clone();
    // Weathering toward the bottom, seams darker.
    const seam = Math.abs(Math.sin(ang * 6));
    c.multiplyScalar(0.82 + 0.18 * seam);
    mix(c, color('#5c5048'), Math.max(0, -n.y - 0.4) * 0.35, c);
    return jitter(c, 0.04, p.x, p.y, p.z);
  });
}

function bands(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const fx of [-0.62, -0.2, 0.25, 0.65]) {
    const x = fx * ENV_LEN;
    const taper = fx < 0 ? 1 - 0.38 * fx * fx : 1 - 0.08 * fx * fx;
    const t = new THREE.TorusGeometry(ENV_R * taper * 1.005, 0.07, 6, 48);
    t.rotateY(Math.PI / 2);
    t.translate(x, 0, 0);
    parts.push(part(t, BRASS));
  }
  // A spine along the top.
  parts.push(part(limb(V(-ENV_LEN * 0.8, ENV_R * 0.83, 0), V(ENV_LEN * 0.85, ENV_R * 0.92, 0), 0.08, 0.08, 6, 0.4), BRASS));
  return merge(parts);
}

function fins(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(-4.2, 0);
    shape.lineTo(-5.4, 3.2);
    shape.lineTo(-2.4, 3.0);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
    g.translate(0, 0, -0.06);
    g.translate(-ENV_LEN * 0.62, ENV_R * 0.45, 0);
    g.rotateX((k / 4) * Math.PI * 2 + Math.PI / 4);
    parts.push(part(g, (p) => (Math.abs(p.y) + Math.abs(p.z) > ENV_R * 0.9 ? CLARET : CREAM)));
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
  return merge([hullPart, deckPart, cabinPart, roofPart, ...rails]);
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
    for (const s of [-1, 1]) struts.push(part(limb(V(x, hullTop, s * 1.2), V(x * 1.1, -ENV_R * 0.88, s * 1.6), 0.07, 0.06, 6), WOOD_DARK));
  mk(merge(struts));
  const rigPts: number[] = [];
  for (let k = 0; k <= 10; k++) {
    const x = -5 + k;
    for (const s of [-1, 1]) {
      const ex = x * 1.35;
      const ef = ex / ENV_LEN;
      const taper = ef < 0 ? 1 - 0.38 * ef * ef : 1 - 0.08 * ef * ef;
      rigPts.push(x, hullTop, s * 1.25, ex, -ENV_R * taper * 0.7, s * ENV_R * taper * 0.7);
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
