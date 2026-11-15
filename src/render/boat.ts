// A dugout canoe with a paddler, floating on the simulated water. It follows the river
// down to the lake and back, is carried by the current, rides the waves (pitch and roll
// from four float points), and leaves a wake and paddle splashes in the wave simulation.
// Boat behaviour lives here for the test scene; real boats will move into the simulation.

import * as THREE from 'three';
import { color, jitter, merge, mix, noise3, part } from './geom';
import { natureMaterial } from './materials';
import { makeFigure, pose, type Figure } from './villagers';
import type { WaterSystem } from './water';

const WOOD = color('#6b4a2e');
const WOOD_DARK = color('#3a2718');
const WOOD_INNER = color('#8a6440');

function canoeGeometry(): THREE.BufferGeometry {
  const L = 5.2;
  const B = 0.42;
  const D = 0.42;
  const segL = 24;
  const segV = 10;
  const outer: THREE.Vector3[][] = [];
  const inner: THREE.Vector3[][] = [];
  for (let i = 0; i <= segL; i++) {
    const u = i / segL;
    const x = (u - 0.5) * L;
    const w = Math.pow(Math.sin(Math.PI * u), 0.55);
    const sheer = 0.12 * Math.pow(Math.abs(u - 0.5) * 2, 3);
    const o: THREE.Vector3[] = [];
    const n: THREE.Vector3[] = [];
    for (let j = 0; j <= segV; j++) {
      const a = Math.PI * (j / segV);
      o.push(new THREE.Vector3(x, -Math.sin(a) * D * (0.4 + 0.6 * w) + sheer, -Math.cos(a) * B * Math.max(0.03, w)));
      n.push(new THREE.Vector3(x, -Math.sin(a) * (D - 0.07) * (0.4 + 0.6 * w) + sheer + 0.02, -Math.cos(a) * (B - 0.06) * Math.max(0.02, w)));
    }
    outer.push(o);
    inner.push(n);
  }
  const quads = (grid: THREE.Vector3[][], flip: boolean): THREE.BufferGeometry => {
    const pos: number[] = [];
    for (let i = 0; i < segL; i++)
      for (let j = 0; j < segV; j++) {
        const a = grid[i][j];
        const b = grid[i + 1][j];
        const c = grid[i + 1][j + 1];
        const d = grid[i][j + 1];
        const tri = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
        for (const q of tri) pos.push(q.x, q.y, q.z);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  const hull = part(quads(outer, false), (p) => jitter(mix(WOOD_DARK, WOOD, noise3(p.x * 1.5, p.y * 12, p.z * 4) * 0.5 + 0.55), 0.06, p.x, p.y, p.z));
  const hollow = part(quads(inner, true), (p) => jitter(WOOD_INNER, 0.08, p.x * 2, p.y * 8, p.z));
  // Gunwale strips joining the outer and inner rims.
  const rim: number[] = [];
  for (let i = 0; i < segL; i++)
    for (const j of [0, segV]) {
      const a = outer[i][j];
      const b = outer[i + 1][j];
      const c = inner[i + 1][j];
      const d = inner[i][j];
      const tri = j === 0 ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
      for (const q of tri) rim.push(q.x, q.y, q.z);
    }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rim, 3));
  rg.computeVertexNormals();
  // Cargo: a hide bundle and a basket.
  const bundle = new THREE.CapsuleGeometry(0.16, 0.4, 3, 8);
  bundle.rotateZ(Math.PI / 2);
  bundle.translate(1.1, -0.05, 0);
  const basket = new THREE.CylinderGeometry(0.17, 0.13, 0.22, 10);
  basket.translate(-1.5, -0.08, 0);
  return merge([hull, hollow, part(rg, WOOD), part(bundle, color('#a07b52')), part(basket, color('#b89a5e'))]);
}

/** The canoe's open top as a flat lid at the gunwales; drawn depth-only so water never shows inside. */
function canoeMask(): THREE.BufferGeometry {
  const L = 5.2;
  const B = 0.42;
  const segL = 24;
  const pos: number[] = [];
  const rim = (u: number, side: number) => {
    const w = Math.pow(Math.sin(Math.PI * u), 0.55);
    const sheer = 0.12 * Math.pow(Math.abs(u - 0.5) * 2, 3);
    return new THREE.Vector3((u - 0.5) * L, sheer - 0.01, side * B * Math.max(0.03, w));
  };
  for (let i = 0; i < segL; i++) {
    const a = rim(i / segL, -1);
    const b = rim((i + 1) / segL, -1);
    const c = rim((i + 1) / segL, 1);
    const d = rim(i / segL, 1);
    for (const q of [a, c, b, a, d, c]) pos.push(q.x, q.y, q.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function paddleGeometry(): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.018, 0.018, 1.25, 6);
  const blade = new THREE.CapsuleGeometry(0.075, 0.28, 2, 8);
  blade.scale(1, 1, 0.22);
  blade.translate(0, -0.72, 0);
  const grip = new THREE.CapsuleGeometry(0.025, 0.06, 2, 6);
  grip.rotateZ(Math.PI / 2);
  grip.translate(0, 0.63, 0);
  return merge([part(shaft, WOOD), part(blade, WOOD_INNER), part(grip, WOOD_DARK)]);
}

export interface BoatView {
  group: THREE.Group;
  update: (dt: number, time: number) => void;
}

export function buildBoat(water: WaterSystem, route: [number, number][]): BoatView {
  const group = new THREE.Group();
  group.name = 'canoe';
  const canoe = new THREE.Mesh(canoeGeometry(), natureMaterial({ roughness: 0.85 }));
  canoe.castShadow = true;
  canoe.receiveShadow = true;
  group.add(canoe);
  // Depth-only lid: drawn after the hull and before the (transparent) water, it hides the
  // water surface inside the hull while leaving everything already drawn visible.
  const mask = new THREE.Mesh(canoeMask(), new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
  mask.renderOrder = 1;
  mask.userData.noAO = true;
  canoe.add(mask);

  // Paddler kneeling mid-boat, with a paddle held in both hands.
  const paddler: Figure = makeFigure(3, 11);
  paddler.root.rotation.y = Math.PI / 2; // face the bow (+X)
  paddler.root.position.set(-0.3, -0.42, 0);
  group.add(paddler.root);
  const paddle = new THREE.Group();
  const paddleMesh = new THREE.Mesh(paddleGeometry(), natureMaterial({ roughness: 0.7 }));
  paddleMesh.castShadow = true;
  paddle.add(paddleMesh);
  group.add(paddle);

  let index = 0;
  let dirStep = 1;
  let x = route[0][0];
  let z = route[0][1];
  let heading = Math.atan2(route[1][1] - z, route[1][0] - x);
  const vel = new THREE.Vector2();
  let strokeSide = 1;
  let wakeTimer = 0;
  let lastStroke = 0;
  let smoothWant = heading;
  let turnRate = 0;
  let floatY = 0.16;

  return {
    group,
    update(dt, time) {
      // Steer toward the next route point; ping-pong along the route.
      const [tx, tz] = route[index];
      if (Math.hypot(tx - x, tz - z) < 7) {
        if (index + dirStep < 0 || index + dirStep >= route.length) dirStep = -dirStep;
        index += dirStep;
      }
      let want = Math.atan2(tz - z, tx - x);
      // Keep off the banks: turn gently toward whichever side ahead is deeper.
      const look = 6;
      const dl = water.depthAt(x + Math.cos(heading + 0.45) * look, z + Math.sin(heading + 0.45) * look);
      const dr = water.depthAt(x + Math.cos(heading - 0.45) * look, z + Math.sin(heading - 0.45) * look);
      want += THREE.MathUtils.clamp((dl - dr) * 0.35, -0.7, 0.7) * (Math.min(dl, dr) < 1.2 ? 1 : 0.3);
      smoothWant += Math.atan2(Math.sin(want - smoothWant), Math.cos(want - smoothWant)) * Math.min(1, dt * 1.5);
      const dh = Math.atan2(Math.sin(smoothWant - heading), Math.cos(smoothWant - heading));
      turnRate += (THREE.MathUtils.clamp(dh * 1.2, -0.6, 0.6) - turnRate) * Math.min(1, dt * 2);
      heading += turnRate * dt;

      // Paddling thrust plus the river current, with water drag.
      const flow = water.flowAt(x, z);
      const thrust = 1.5;
      vel.x += (Math.cos(heading) * thrust + flow.x - vel.x) * Math.min(1, dt * 0.8);
      vel.y += (Math.sin(heading) * thrust + flow.z - vel.y) * Math.min(1, dt * 0.8);
      const nx = x + vel.x * dt;
      const nz = z + vel.y * dt;
      if (water.depthAt(nx, nz) > 0.35) {
        x = nx;
        z = nz;
      } else {
        vel.multiplyScalar(1 - Math.min(1, dt * 3));
      }

      // Float: ride the swell (sampled at bow, stern and sides) plus ripples averaged over
      // the hull, so the boat responds to passing waves but not to its own wake.
      const c = Math.cos(heading);
      const s = Math.sin(heading);
      const bow = water.swellAt(x + c * 2.2, z + s * 2.2);
      const stern = water.swellAt(x - c * 2.2, z - s * 2.2);
      const port = water.swellAt(x - s * 0.5, z + c * 0.5);
      const star = water.swellAt(x + s * 0.5, z - c * 0.5);
      const ripple = THREE.MathUtils.clamp(water.rippleAverage(x, z, 2.6), -0.08, 0.08);
      const targetY = 0 + (bow + stern + port + star) / 4 + ripple + 0.16;
      floatY += (targetY - floatY) * Math.min(1, dt * 4);
      group.position.set(x, floatY, z);
      group.rotation.set(0, -heading, 0);
      const pitch = Math.atan2(bow - stern, 4.4);
      const roll = Math.atan2(port - star, 1.0) * 0.6 + Math.sin(time * 1.3) * 0.012 - turnRate * 0.08;
      canoe.rotation.z += (pitch - canoe.rotation.z) * Math.min(1, dt * 3);
      canoe.rotation.x += (roll - canoe.rotation.x) * Math.min(1, dt * 3);
      paddler.root.rotation.z = canoe.rotation.x;
      paddler.root.rotation.x = -canoe.rotation.z;

      // Paddle stroke, alternating sides; each stroke splashes into the wave simulation.
      const cycle = (time * 0.75) % 1;
      if (cycle < lastStroke) strokeSide = -strokeSide;
      lastStroke = cycle;
      const pull = Math.sin(cycle * Math.PI * 2);
      const kneel = { tl: 1.4, tr: 1.4, kl: 1.45, kr: 1.45, sl: 0.9 + pull * 0.35, sr: 0.9 - pull * 0.35, el: 0.7, er: 0.7, spine: 0.25 + pull * 0.12 };
      pose(paddler, kneel);
      paddler.hips.position.y = 0.15;
      paddler.spine.rotation.z = strokeSide * 0.25;
      paddle.position.set(-0.05 + pull * 0.45, 0.25, strokeSide * 0.48);
      paddle.rotation.set(strokeSide * 0.35, 0, 0.4 - pull * 0.6);
      const bladeWorld = new THREE.Vector3(0, -0.72, 0).applyMatrix4(paddleMesh.matrixWorld);
      if (pull > 0.85) water.disturb(bladeWorld.x, bladeWorld.z, -0.03, 0.5);

      // Bow wave and wake, scaled by speed relative to the water.
      wakeTimer += dt;
      const rel = Math.hypot(vel.x - flow.x, vel.y - flow.z);
      if (wakeTimer > 0.12) {
        wakeTimer = 0;
        // V-shaped wake spreading from just behind the stern on both sides.
        water.disturb(x - c * 3.2 - s * 0.9, z - s * 3.2 + c * 0.9, -0.018 * rel, 0.9);
        water.disturb(x - c * 3.2 + s * 0.9, z - s * 3.2 - c * 0.9, -0.018 * rel, 0.9);
        water.disturb(x + c * 3.0, z + s * 3.0, -0.012 * rel, 0.7); // small bow wave ahead
      }
    },
  };
}
