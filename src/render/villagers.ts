// Hunter-gatherer villagers: small stylised figures readable from the management camera.
// Each has a jointed body so it can walk, gather, crouch at the water and idle by the fire.

import * as THREE from 'three';
import type { Heightfield } from '../sim/terrain';
import { ACTIVITY_CODES, VILLAGER_STRIDE } from '../sim/protocol';

interface Look {
  skin: string;
  hair: string;
  tunic: string;
  trim: string;
  legs: string;
}

const LOOKS: Look[] = [
  { skin: '#c99872', hair: '#2b1d14', tunic: '#8a6440', trim: '#d8c09a', legs: '#5a4030' },
  { skin: '#8d5a3b', hair: '#140e0b', tunic: '#a07b52', trim: '#6e2f22', legs: '#4a3526' },
  { skin: '#e0b48f', hair: '#7a4a24', tunic: '#6f5a3e', trim: '#c9b080', legs: '#3f3022' },
  { skin: '#a8724c', hair: '#1f1612', tunic: '#94704a', trim: '#2f4a5a', legs: '#5b4532' },
  { skin: '#d6a47c', hair: '#4a2f1c', tunic: '#7b5a3a', trim: '#a8452e', legs: '#4c392a' },
  { skin: '#6f452c', hair: '#0f0b09', tunic: '#b08a5e', trim: '#e2d2b0', legs: '#55402e' },
];

interface Figure {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  head: THREE.Group;
  x: number;
  z: number;
  heading: number;
  tx: number;
  tz: number;
  theading: number;
  activity: number;
  phase: number;
}

function mat(c: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
}

function makeFigure(look: Look, seed: number): Figure {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = mat(look.skin);
  const tunic = mat(look.tunic);
  const trim = mat(look.trim);
  const legsM = mat(look.legs);
  const hairM = mat(look.hair);

  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Legs pivot at the hips.
  const leg = () => {
    const g = new THREE.Group();
    add(g, new THREE.CapsuleGeometry(0.075, 0.55, 3, 8), legsM, 0, -0.36, 0);
    add(g, new THREE.CapsuleGeometry(0.08, 0.1, 3, 8), mat('#3b2a1e'), 0, -0.7, 0.04).rotation.x = Math.PI / 2; // wrapped foot
    return g;
  };
  const legL = leg();
  const legR = leg();
  legL.position.set(-0.1, 0.8, 0);
  legR.position.set(0.1, 0.8, 0);
  body.add(legL, legR);

  // Torso: a fur tunic flaring at the hem, with a trim band and a shoulder cloak.
  const torsoProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.27, 0.0),
    new THREE.Vector2(0.24, 0.12),
    new THREE.Vector2(0.2, 0.35),
    new THREE.Vector2(0.21, 0.55),
    new THREE.Vector2(0.17, 0.66),
    new THREE.Vector2(0.07, 0.72),
    new THREE.Vector2(0.0, 0.73),
  ];
  const torso = add(body, new THREE.LatheGeometry(torsoProfile, 12), tunic, 0, 0.66, 0);
  torso.scale.set(1, 1, 0.78);
  add(body, new THREE.CylinderGeometry(0.205, 0.205, 0.06, 12), trim, 0, 0.98, 0).scale.set(1, 1, 0.8); // belt
  const cloak = add(body, new THREE.SphereGeometry(0.26, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), mat(look.trim), 0, 1.27, -0.01);
  cloak.scale.set(1.05, 0.55, 0.85);

  // Arms pivot at the shoulders.
  const arm = (side: number) => {
    const g = new THREE.Group();
    add(g, new THREE.CapsuleGeometry(0.06, 0.42, 3, 8), skin, 0, -0.26, 0);
    add(g, new THREE.CapsuleGeometry(0.068, 0.16, 3, 8), tunic, 0, -0.06, 0);
    g.position.set(side * 0.25, 1.3, 0);
    g.rotation.z = side * 0.08;
    return g;
  };
  const armL = arm(-1);
  const armR = arm(1);
  body.add(armL, armR);

  // Head with hair; some wear a braid, some a headband.
  const head = new THREE.Group();
  head.position.set(0, 1.47, 0);
  body.add(head);
  add(head, new THREE.CylinderGeometry(0.055, 0.06, 0.1, 8), skin, 0, -0.04, 0);
  const skull = add(head, new THREE.SphereGeometry(0.135, 14, 12), skin, 0, 0.1, 0.01);
  skull.scale.set(0.95, 1.08, 1);
  add(head, new THREE.SphereGeometry(0.142, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.12, -0.012);
  add(head, new THREE.SphereGeometry(0.02, 6, 4), mat('#1a1410'), -0.045, 0.12, 0.125);
  add(head, new THREE.SphereGeometry(0.02, 6, 4), mat('#1a1410'), 0.045, 0.12, 0.125);
  if (seed % 2 === 0) {
    const braid = add(head, new THREE.CapsuleGeometry(0.035, 0.28, 3, 6), hairM, 0, -0.05, -0.13);
    braid.rotation.x = 0.25;
  } else {
    add(head, new THREE.TorusGeometry(0.138, 0.018, 6, 18), trim, 0, 0.15, 0).rotation.x = Math.PI / 2;
  }

  return { root, body, legL, legR, armL, armR, head, x: 0, z: 0, heading: 0, tx: 0, tz: 0, theading: 0, activity: 0, phase: seed * 1.3 };
}

export interface VillagerView {
  group: THREE.Group;
  setTargets: (buf: Float32Array) => void;
  update: (dt: number, time: number) => void;
}

export function buildVillagers(looks: number[], terrain: Heightfield): VillagerView {
  const group = new THREE.Group();
  group.name = 'villagers';
  const figures = looks.map((l, i) => {
    const f = makeFigure(LOOKS[l % LOOKS.length], i);
    group.add(f.root);
    return f;
  });
  let initialised = false;

  return {
    group,
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
        // Smoothly follow the simulation's positions between ticks.
        const k = Math.min(1, dt * 8);
        const dx = f.tx - f.x;
        const dz = f.tz - f.z;
        f.x += dx * k;
        f.z += dz * k;
        let dh = f.theading - f.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        f.heading += dh * Math.min(1, dt * 6);
        f.root.position.set(f.x, terrain.sample(f.x, f.z), f.z);
        f.root.rotation.y = f.heading;

        const act = ACTIVITY_CODES[f.activity] ?? 'resting';
        const walking = act === 'walking';
        f.phase += dt * (walking ? 7.5 : 1.5);
        const s = Math.sin(f.phase);
        if (walking) {
          f.legL.rotation.x = s * 0.55;
          f.legR.rotation.x = -s * 0.55;
          f.armL.rotation.x = -s * 0.45;
          f.armR.rotation.x = s * 0.45;
          f.body.position.y = Math.abs(Math.cos(f.phase)) * 0.05;
          f.body.rotation.x = 0.06;
        } else if (act === 'gathering') {
          // Bend and reach toward the ground.
          f.legL.rotation.x = 0.35;
          f.legR.rotation.x = -0.1;
          f.body.rotation.x = 0.55 + Math.sin(time * 2.2 + f.phase) * 0.12;
          f.body.position.y = -0.08;
          f.armL.rotation.x = -0.9 + Math.sin(time * 3 + f.phase) * 0.3;
          f.armR.rotation.x = -1.1 - Math.sin(time * 3 + f.phase) * 0.3;
        } else if (act === 'fetching-water') {
          // Crouch at the water's edge.
          f.legL.rotation.x = 1.1;
          f.legR.rotation.x = -0.6;
          f.body.position.y = -0.32;
          f.body.rotation.x = 0.35;
          f.armL.rotation.x = -1.2;
          f.armR.rotation.x = -1.2;
        } else {
          // Idle by the fire: weight shifts and small gestures.
          f.legL.rotation.x = 0;
          f.legR.rotation.x = 0;
          f.body.position.y = 0;
          f.body.rotation.x = 0;
          f.armL.rotation.x = Math.sin(time * 0.7 + f.phase) * 0.12;
          f.armR.rotation.x = -0.25 + Math.sin(time * 1.1 + f.phase) * 0.25;
          f.head.rotation.y = Math.sin(time * 0.4 + f.phase) * 0.4;
        }
      }
    },
  };
}
