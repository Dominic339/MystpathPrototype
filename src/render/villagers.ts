// Hunter-gatherer villagers: stylised but properly jointed human figures —
// shoulders, elbows, wrists, hands with thumbs, hips, knees and feet — readable from the
// management camera and convincing up close.

import * as THREE from 'three';
import type { Heightfield } from '../sim/terrain';
import { ACTIVITY_CODES, VILLAGER_STRIDE } from '../sim/protocol';

interface Look {
  skin: string;
  hair: string;
  tunic: string;
  trim: string;
  wraps: string;
  build: number; // 0.92 slight … 1.08 broad
  height: number;
  hairStyle: 'braid' | 'band' | 'bun' | 'short';
}

const LOOKS: Look[] = [
  { skin: '#c99872', hair: '#2b1d14', tunic: '#8a6440', trim: '#d8c09a', wraps: '#5a4030', build: 1.0, height: 1.0, hairStyle: 'braid' },
  { skin: '#8d5a3b', hair: '#140e0b', tunic: '#a07b52', trim: '#6e2f22', wraps: '#4a3526', build: 1.07, height: 1.04, hairStyle: 'short' },
  { skin: '#e0b48f', hair: '#7a4a24', tunic: '#6f5a3e', trim: '#c9b080', wraps: '#3f3022', build: 0.93, height: 0.96, hairStyle: 'bun' },
  { skin: '#a8724c', hair: '#1f1612', tunic: '#94704a', trim: '#2f4a5a', wraps: '#5b4532', build: 1.03, height: 1.02, hairStyle: 'band' },
  { skin: '#d6a47c', hair: '#4a2f1c', tunic: '#7b5a3a', trim: '#a8452e', wraps: '#4c392a', build: 0.95, height: 0.97, hairStyle: 'braid' },
  { skin: '#6f452c', hair: '#0f0b09', tunic: '#b08a5e', trim: '#e2d2b0', wraps: '#55402e', build: 1.05, height: 1.01, hairStyle: 'short' },
];

const THIGH = 0.44;
const SHIN = 0.42;
const ANKLE = 0.07;
const HIP_HEIGHT = THIGH + SHIN + ANKLE;
const UPPER_ARM = 0.29;
const FOREARM = 0.25;

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(c: string, roughness = 0.85): THREE.MeshStandardMaterial {
  const key = `${c}:${roughness}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color: c, roughness }));
  return mats.get(key)!;
}

/** A tapered limb segment hanging down from its joint, with a slight muscle bulge and rounded ends. */
function limbSegment(length: number, rTop: number, rBottom: number, bulge = 0.12, radial = 10): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, rTop * 0.75), new THREE.Vector2(rTop * 0.72, rTop * 0.52)];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = (rTop + (rBottom - rTop) * t) * (1 + bulge * Math.sin(Math.PI * Math.min(1, t * 1.3)));
    pts.push(new THREE.Vector2(r, -t * length));
  }
  pts.push(new THREE.Vector2(rBottom * 0.72, -length - rBottom * 0.52), new THREE.Vector2(0, -length - rBottom * 0.75));
  // Lathe wants the profile from bottom to top for outward normals.
  return new THREE.LatheGeometry(pts.reverse(), radial);
}

function hand(skin: THREE.Material, side: number): THREE.Group {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.05, 3, 8), skin);
  palm.scale.set(1.25, 1, 0.62);
  palm.position.y = -0.045;
  g.add(palm);
  // Four fingers, slightly curled.
  for (let f = 0; f < 4; f++) {
    const finger = new THREE.Group();
    finger.position.set((f - 1.5) * 0.017, -0.085, 0.004);
    finger.rotation.x = 0.35;
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.038 - Math.abs(f - 1.4) * 0.006, 2, 5), skin);
    seg.position.y = -0.022;
    finger.add(seg);
    g.add(finger);
  }
  // Opposable thumb.
  const thumb = new THREE.Group();
  thumb.position.set(side * -0.03, -0.035, 0.012);
  thumb.rotation.set(0.5, 0, side * -0.7);
  const tseg = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.035, 2, 5), skin);
  tseg.position.y = -0.02;
  thumb.add(tseg);
  g.add(thumb);
  return g;
}

export interface Figure {
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  thighL: THREE.Group;
  thighR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  x: number;
  z: number;
  heading: number;
  tx: number;
  tz: number;
  theading: number;
  activity: number;
  phase: number;
}

export function makeFigure(lookIndex: number, seed: number): Figure {
  const look = LOOKS[lookIndex % LOOKS.length];
  const root = new THREE.Group();
  const skin = mat(look.skin, 0.7);
  const tunic = mat(look.tunic, 0.95);
  const trim = mat(look.trim, 0.9);
  const wraps = mat(look.wraps, 0.95);
  const hairM = mat(look.hair, 0.8);
  const hide = mat('#3b2a1e', 0.95);
  const b = look.build;

  const mesh = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const joint = (parent: THREE.Object3D, x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  const hips = joint(root, 0, HIP_HEIGHT, 0);
  // Pelvis.
  mesh(hips, new THREE.SphereGeometry(0.15 * b, 14, 10), wraps, 0, 0.02, 0).scale.set(1.05, 0.7, 0.75);

  // Legs: thigh → knee → shin → ankle → foot.
  const leg = (side: number) => {
    const thigh = joint(hips, side * 0.095 * b, -0.02, 0);
    mesh(thigh, limbSegment(THIGH, 0.085 * b, 0.06 * b, 0.1), wraps);
    const knee = joint(thigh, 0, -THIGH, 0);
    mesh(knee, new THREE.SphereGeometry(0.058 * b, 10, 8), wraps);
    mesh(knee, limbSegment(SHIN, 0.06 * b, 0.04 * b, 0.18), wraps);
    // Leather wraps around the calf.
    for (let k = 0; k < 3; k++) mesh(knee, new THREE.TorusGeometry(0.056 * b - k * 0.004, 0.009, 5, 12), hide, 0, -0.14 - k * 0.08, 0).rotation.x = Math.PI / 2;
    const ankle = joint(knee, 0, -SHIN, 0);
    const foot = mesh(ankle, new THREE.CapsuleGeometry(0.045, 0.12, 3, 8), hide, 0, -0.035, 0.05);
    foot.rotation.x = Math.PI / 2;
    foot.scale.set(1.05, 1, 0.75);
    return { thigh, knee };
  };
  const L = leg(-1);
  const R = leg(1);

  // Torso: spine pivots at the waist; chest broader than waist, with shoulders and a neck.
  const spine = joint(hips, 0, 0.06, 0);
  const torsoProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.15, 0.0),
    new THREE.Vector2(0.135, 0.12), // waist
    new THREE.Vector2(0.16, 0.26),
    new THREE.Vector2(0.185, 0.38), // chest
    new THREE.Vector2(0.17, 0.46),
    new THREE.Vector2(0.11, 0.52), // shoulders slope to neck
    new THREE.Vector2(0.05, 0.545),
    new THREE.Vector2(0.0, 0.55),
  ];
  const torso = mesh(spine, new THREE.LatheGeometry(torsoProfile, 16), skin);
  torso.scale.set(1.08 * b, 1, 0.7 * b);

  // Fur tunic over the torso, flaring to mid-thigh, with a fringed hem and belt.
  const tunicProfile = [
    new THREE.Vector2(0.0, -0.3),
    new THREE.Vector2(0.21, -0.3),
    new THREE.Vector2(0.2, -0.18),
    new THREE.Vector2(0.17, 0.0),
    new THREE.Vector2(0.155, 0.12),
    new THREE.Vector2(0.175, 0.26),
    new THREE.Vector2(0.195, 0.38),
    new THREE.Vector2(0.18, 0.465),
    new THREE.Vector2(0.12, 0.525),
    new THREE.Vector2(0.075, 0.55),
  ];
  const tunicMesh = mesh(spine, new THREE.LatheGeometry(tunicProfile, 16), tunic);
  tunicMesh.scale.set(1.1 * b, 1, 0.74 * b);
  const hem = mesh(spine, new THREE.CylinderGeometry(0.215, 0.235, 0.05, 16, 1, true), trim, 0, -0.3, 0);
  hem.scale.set(1.1 * b, 1, 0.74 * b);
  const belt = mesh(spine, new THREE.TorusGeometry(0.16, 0.018, 6, 18), hide, 0, 0.11, 0);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1.08 * b, 0.72 * b, 1);
  mesh(spine, new THREE.SphereGeometry(0.03, 8, 6), mat('#c9b27a'), 0.07 * b, 0.1, 0.11 * b); // belt pouch toggle
  // Fur collar.
  const collar = mesh(spine, new THREE.TorusGeometry(0.11, 0.045, 8, 16), trim, 0, 0.5, 0);
  collar.rotation.x = Math.PI / 2;
  collar.scale.set(1.25 * b, 0.9 * b, 1);

  // Arms: shoulder → upper arm → elbow → forearm → wrist → hand.
  const arm = (side: number) => {
    const shoulder = joint(spine, side * 0.2 * b, 0.47, 0);
    mesh(shoulder, new THREE.SphereGeometry(0.06 * b, 10, 8), tunic);
    mesh(shoulder, limbSegment(UPPER_ARM, 0.058 * b, 0.045 * b, 0.15), skin);
    const sleeve = mesh(shoulder, new THREE.CylinderGeometry(0.064 * b, 0.058 * b, 0.14, 10), tunic, 0, -0.06, 0);
    sleeve.scale.z = 0.95;
    const elbow = joint(shoulder, 0, -UPPER_ARM, 0);
    mesh(elbow, new THREE.SphereGeometry(0.044 * b, 8, 6), skin);
    mesh(elbow, limbSegment(FOREARM, 0.044 * b, 0.032 * b, 0.12), skin);
    mesh(elbow, new THREE.TorusGeometry(0.036, 0.008, 5, 10), hide, 0, -FOREARM + 0.03, 0).rotation.x = Math.PI / 2; // wrist band
    const wrist = joint(elbow, 0, -FOREARM - 0.01, 0);
    const h = hand(skin, side);
    h.rotation.y = side * 0.4;
    wrist.add(h);
    shoulder.rotation.z = side * 0.09;
    return { shoulder, elbow };
  };
  const AL = arm(-1);
  const AR = arm(1);

  // Head: neck, skull with jaw, ears, brow, nose, eyes, and a hairstyle.
  const head = joint(spine, 0, 0.56, 0);
  mesh(head, new THREE.CylinderGeometry(0.045, 0.055, 0.1, 10), skin, 0, 0.03, 0);
  const skull = mesh(head, new THREE.SphereGeometry(0.115, 18, 14), skin, 0, 0.17, 0);
  skull.scale.set(0.92, 1.08, 1.02);
  const jaw = mesh(head, new THREE.SphereGeometry(0.085, 14, 10), skin, 0, 0.11, 0.025);
  jaw.scale.set(1, 0.85, 1);
  for (const s of [-1, 1]) {
    mesh(head, new THREE.SphereGeometry(0.024, 8, 6), skin, s * 0.105, 0.165, 0).scale.set(0.5, 1, 0.8); // ears
    mesh(head, new THREE.SphereGeometry(0.014, 8, 6), mat('#f2ece0', 0.4), s * 0.038, 0.18, 0.1); // eye whites
    mesh(head, new THREE.SphereGeometry(0.0085, 8, 6), mat('#1a120c', 0.3), s * 0.038, 0.18, 0.112); // irises
    const brow = mesh(head, new THREE.CapsuleGeometry(0.008, 0.03, 2, 4), hairM, s * 0.04, 0.205, 0.103);
    brow.rotation.z = Math.PI / 2 + s * 0.12;
  }
  const nose = mesh(head, new THREE.ConeGeometry(0.018, 0.045, 6), skin, 0, 0.155, 0.118);
  nose.rotation.x = Math.PI / 2.4;
  mesh(head, new THREE.CapsuleGeometry(0.006, 0.03, 2, 4), mat('#7a3f33', 0.6), 0, 0.118, 0.103).rotation.z = Math.PI / 2; // mouth

  const hairCap = mesh(head, new THREE.SphereGeometry(0.122, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), hairM, 0, 0.185, -0.012);
  hairCap.scale.set(0.96, 1.08, 1.06);
  if (look.hairStyle === 'braid') {
    for (let k = 0; k < 4; k++) mesh(head, new THREE.SphereGeometry(0.032 - k * 0.003, 8, 6), hairM, 0, 0.13 - k * 0.055, -0.12 - k * 0.012);
  } else if (look.hairStyle === 'bun') {
    mesh(head, new THREE.SphereGeometry(0.055, 10, 8), hairM, 0, 0.27, -0.06);
  } else if (look.hairStyle === 'band') {
    const band = mesh(head, new THREE.TorusGeometry(0.118, 0.014, 6, 20), trim, 0, 0.215, 0);
    band.rotation.x = Math.PI / 2 - 0.15;
    mesh(head, new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.3), hairM, 0, 0.16, -0.03); // hair to the nape
  }

  root.scale.setScalar(look.height);
  return {
    root,
    hips,
    spine,
    head,
    thighL: L.thigh,
    thighR: R.thigh,
    kneeL: L.knee,
    kneeR: R.knee,
    shoulderL: AL.shoulder,
    shoulderR: AR.shoulder,
    elbowL: AL.elbow,
    elbowR: AR.elbow,
    x: 0,
    z: 0,
    heading: 0,
    tx: 0,
    tz: 0,
    theading: 0,
    activity: 0,
    phase: seed * 1.3,
  };
}

/** How far the hips drop for given thigh/knee angles, so feet stay on the ground. */
function hipDrop(thigh: number, knee: number): number {
  const legHeight = THIGH * Math.cos(thigh) + SHIN * Math.cos(thigh - knee) + ANKLE;
  return HIP_HEIGHT - legHeight;
}

export function pose(f: Figure, p: { tl: number; tr: number; kl: number; kr: number; sl: number; sr: number; el: number; er: number; spine: number; bob?: number; headYaw?: number }): void {
  f.thighL.rotation.x = -p.tl;
  f.thighR.rotation.x = -p.tr;
  f.kneeL.rotation.x = p.kl;
  f.kneeR.rotation.x = p.kr;
  f.shoulderL.rotation.x = -p.sl;
  f.shoulderR.rotation.x = -p.sr;
  f.elbowL.rotation.x = -p.el;
  f.elbowR.rotation.x = -p.er;
  f.spine.rotation.x = p.spine;
  f.head.rotation.y = p.headYaw ?? 0;
  f.head.rotation.x = -p.spine * 0.5;
  const drop = Math.min(hipDrop(p.tl, p.kl), hipDrop(p.tr, p.kr));
  f.hips.position.y = HIP_HEIGHT - Math.max(0, drop) + (p.bob ?? 0);
}

export interface VillagerView {
  group: THREE.Group;
  setTargets: (buf: Float32Array) => void;
  update: (dt: number, time: number) => void;
  /** World position of a villager, for camera follow. */
  positionOf: (index: number) => THREE.Vector3 | null;
}

export function buildVillagers(looks: number[], terrain: Heightfield): VillagerView {
  const group = new THREE.Group();
  group.name = 'villagers';
  const figures = looks.map((l, i) => {
    const f = makeFigure(l, i);
    group.add(f.root);
    return f;
  });
  let initialised = false;

  return {
    group,
    positionOf: (i) => (figures[i] ? figures[i].root.position.clone() : null),
    setTargets(buf) {
      figures.forEach((f, k) => {
        f.tx = buf[k * VILLAGER_STRIDE];
        f.tz = buf[k * VILLAGER_STRIDE + 1];
        f.theading = buf[k * VILLAGER_STRIDE + 2];
        f.activity = buf[k * VILLAGER_STRIDE + 3];
        if (!initialised) {
          f.x = f.tx;
          f.z = f.tz;
          f.heading = f.theading;
        }
      });
      initialised = true;
    },
    update(dt, time) {
      for (const f of figures) {
        const k = Math.min(1, dt * 8);
        f.x += (f.tx - f.x) * k;
        f.z += (f.tz - f.z) * k;
        let dh = f.theading - f.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        f.heading += dh * Math.min(1, dt * 6);
        f.root.position.set(f.x, terrain.sample(f.x, f.z), f.z);
        f.root.rotation.y = f.heading;

        const act = ACTIVITY_CODES[f.activity] ?? 'resting';
        const walking = act === 'walking';
        f.phase += dt * (walking ? 6.8 : 1.5);
        const s = Math.sin(f.phase);
        const c = Math.cos(f.phase);
        if (walking) {
          // Knees bend as each leg swings through; elbows stay softly bent.
          pose(f, {
            tl: s * 0.5,
            tr: -s * 0.5,
            kl: Math.max(0, -c) * 0.9 + 0.08,
            kr: Math.max(0, c) * 0.9 + 0.08,
            sl: -s * 0.42,
            sr: s * 0.42,
            el: 0.35 + Math.max(0, s) * 0.3,
            er: 0.35 + Math.max(0, -s) * 0.3,
            spine: 0.06,
            bob: Math.abs(c) * 0.03,
          });
        } else if (act === 'gathering') {
          // Bend at the hips and knees and pick at the ground.
          const pick = Math.sin(time * 3 + f.phase);
          pose(f, { tl: 0.55, tr: 0.25, kl: 0.9, kr: 0.45, sl: 1.0 + pick * 0.2, sr: 0.8 - pick * 0.2, el: 0.6, er: 0.9, spine: 0.55 + Math.sin(time * 2.2 + f.phase) * 0.08 });
        } else if (act === 'fetching-water') {
          // Deep crouch at the water's edge, reaching forward.
          pose(f, { tl: 1.35, tr: 1.0, kl: 2.2, kr: 1.9, sl: 1.1, sr: 1.25, el: 0.4, er: 0.5, spine: 0.4 });
        } else {
          // Idle by the fire: weight shifts and small gestures.
          const g = Math.sin(time * 1.1 + f.phase);
          pose(f, {
            tl: 0.02,
            tr: -0.04 + Math.sin(time * 0.3 + f.phase) * 0.04,
            kl: 0.05,
            kr: 0.12,
            sl: Math.sin(time * 0.7 + f.phase) * 0.08,
            sr: 0.3 + g * 0.25,
            el: 0.2,
            er: 0.9 + g * 0.35,
            spine: 0,
            headYaw: Math.sin(time * 0.4 + f.phase) * 0.45,
          });
        }
      }
    },
  };
}
