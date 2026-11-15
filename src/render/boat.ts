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

export function canoeGeometry(): THREE.BufferGeometry {
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

export type BoatMode = 'paddle' | 'fish' | 'trawl';

export interface BoatView {
  group: THREE.Group;
  /** Where the simulation has the boat now, and what its crew is doing. */
  setTarget: (x: number, z: number, mode: BoatMode) => void;
  update: (dt: number, time: number) => void;
}

/** A net trailing from the stern: a rope with floats and a dark mesh sinking behind. */
function netGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rope = color('#5a4a34');
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push(new THREE.Vector3(-1.6 - t * 5, -0.15 - t * 0.12, side * (0.2 + Math.sin(t * Math.PI) * 1.4)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    parts.push(part(new THREE.TubeGeometry(curve, 16, 0.015, 4), rope));
    for (let k = 1; k <= 8; k += 1.5) {
      const f = new THREE.SphereGeometry(0.07, 6, 4);
      const p = curve.getPoint(k / 8);
      f.translate(p.x, -0.12, p.z);
      parts.push(part(f, color('#d9b04a')));
    }
  }
  const mesh = new THREE.PlaneGeometry(5, 2.6, 8, 4);
  mesh.rotateX(-Math.PI / 2);
  mesh.translate(-4.1, -0.35, 0);
  parts.push(part(mesh, (p) => (Math.abs(Math.sin(p.x * 14)) < 0.3 || Math.abs(Math.sin(p.z * 14)) < 0.3 ? color('#2e2a22') : color('#3c4a46'))));
  return merge(parts);
}

export function buildBoat(water: WaterSystem, look = 3, seed = 11, start: [number, number] = [0, 0]): BoatView {
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
  const paddler: Figure = makeFigure(look, seed);
  paddler.root.rotation.y = Math.PI / 2; // face the bow (+X)
  paddler.root.position.set(-0.3, -0.42, 0);
  group.add(paddler.root);
  const paddle = new THREE.Group();
  const paddleMesh = new THREE.Mesh(paddleGeometry(), natureMaterial({ roughness: 0.7 }));
  paddleMesh.castShadow = true;
  paddle.add(paddleMesh);
  group.add(paddle);

  // A net (shown when trawling) and a fishing line (when fishing).
  const net = new THREE.Mesh(netGeometry(), natureMaterial({ roughness: 0.9, side: THREE.DoubleSide }));
  net.visible = false;
  canoe.add(net);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.3, 0.9, 0.5), new THREE.Vector3(1.6, -0.3, 1.4)]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#d8d0b8' }));
  line.visible = false;
  canoe.add(line);

  let x = start[0];
  let z = start[1];
  let heading = 0;
  let tx = x;
  let tz = z;
  let mode: BoatMode = 'paddle';
  const vel = new THREE.Vector2();
  let wakeTimer = 0;
  let strokePhase = 0;
  let strokeCount = 0;
  let side = 1;
  let targetSide = 1;
  let splashTimer = 0;
  let smoothWant = heading;
  let turnRate = 0;
  let floatY = 0.16;
  let floatVel = 0;
  let pitchVel = 0;
  let rollVel = 0;

  return {
    group,
    setTarget(nx, nz, m) {
      tx = nx;
      tz = nz;
      mode = m;
      // Far off (just launched, or the view was reset): jump there.
      if (Math.hypot(tx - x, tz - z) > 25) {
        x = tx;
        z = tz;
        vel.set(0, 0);
      }
    },
    update(dt, time) {
      // Follow the simulation's position: paddle toward it, slowing on arrival.
      const dist = Math.hypot(tx - x, tz - z);
      let want = dist > 0.8 ? Math.atan2(tz - z, tx - x) : heading;
      net.visible = mode === 'trawl';
      line.visible = mode === 'fish';
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
      const thrust = (mode === 'fish' ? 0 : mode === 'trawl' ? 0.6 : 1.7) * THREE.MathUtils.clamp(dist / 3, mode === 'trawl' ? 0.5 : 0, 1);
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

      // Float: ride the swell and the simulated waves. Waves are averaged over each quarter
      // of the hull (bow, stern, port, starboard), so passing waves and splashes rock the
      // boat, while its own wake (emitted well behind the stern) does not.
      const c = Math.cos(heading);
      const s = Math.sin(heading);
      const region = (ax: number, az: number) => {
        let sum = 0;
        for (let k = 0; k < 5; k++) {
          const ox = Math.cos(k * 1.2566) * 0.45;
          const oz = Math.sin(k * 1.2566) * 0.45;
          sum += water.swellAt(ax + ox, az + oz) + water.rippleAt(ax + ox, az + oz);
        }
        return sum / 5;
      };
      const bow = region(x + c * 1.7, z + s * 1.7);
      const stern = region(x - c * 1.5, z - s * 1.5);
      const port = region(x - s * 0.6, z + c * 0.6);
      const star = region(x + s * 0.6, z - c * 0.6);
      const targetY = THREE.MathUtils.clamp((bow + stern + port + star) / 4, -0.25, 0.25) + 0.16;
      // Buoyancy as a damped spring: lag and a little overshoot read as weight.
      floatVel += ((targetY - floatY) * 28 - floatVel * 6) * dt;
      floatY += floatVel * dt;
      group.position.set(x, floatY, z);
      group.rotation.set(0, -heading, 0);
      const pitch = THREE.MathUtils.clamp(Math.atan2(bow - stern, 3.2), -0.18, 0.18);
      const roll = THREE.MathUtils.clamp(Math.atan2(port - star, 1.2) * 0.7, -0.2, 0.2) + Math.sin(time * 1.3) * 0.012 - turnRate * 0.08;
      pitchVel += ((pitch - canoe.rotation.z) * 30 - pitchVel * 7) * dt;
      rollVel += ((roll - canoe.rotation.x) * 34 - rollVel * 6) * dt;
      canoe.rotation.z += pitchVel * dt;
      canoe.rotation.x += rollVel * dt;
      paddler.root.rotation.z = canoe.rotation.x;
      paddler.root.rotation.x = -canoe.rotation.z;

      // Paddle stroke: a smooth pull (blade in the water, sweeping back) and a feathered
      // recovery. The paddler switches sides every few strokes with an arc over the boat.
      const ease = (t: number) => t * t * (3 - 2 * t);
      // Fishing with a line: paddle laid across the boat, arms out holding the line.
      if (thrust < 0.05) {
        paddle.position.set(-0.3, 0.12, 0);
        paddle.rotation.set(Math.PI / 2, 0, 0.1);
        pose(paddler, { tl: 1.45, tr: 1.45, kl: 0.25, kr: 0.25, sl: 0.9, sr: 1.1, el: 0.5, er: 0.4, spine: 0.15 + Math.sin(time * 0.8) * 0.03 });
        paddler.hips.position.y = 0.22;
        paddler.spine.rotation.y = 0.5;
        paddler.spine.rotation.z = 0;
        return;
      }
      strokePhase += dt * (mode === 'trawl' ? 0.4 : 0.7);
      if (strokePhase >= 1) {
        strokePhase -= 1;
        strokeCount++;
        if (strokeCount % 6 === 0) targetSide = -targetSide;
      }
      const PULL = 0.58;
      let px: number;
      let py: number;
      let tilt: number;
      let feather: number;
      let inWater = false;
      if (strokePhase < PULL) {
        const t = ease(strokePhase / PULL);
        px = 0.3 - 0.75 * t;
        py = 0.3;
        tilt = 0.45 - 0.8 * t;
        feather = 0;
        inWater = true;
      } else {
        const t = ease((strokePhase - PULL) / (1 - PULL));
        px = -0.45 + 0.75 * t;
        py = 0.3 + Math.sin(t * Math.PI) * 0.25;
        tilt = -0.35 + 0.8 * t;
        feather = Math.sin(t * Math.PI) * 1.3;
        // Side switches happen during recovery, carrying the paddle up and over.
        if (side !== targetSide) {
          side = -targetSide * Math.cos(Math.PI * t);
          py += Math.sin(t * Math.PI) * 0.45;
          if (t > 0.98) side = targetSide;
        }
      }
      const sideZ = side * 0.47;
      paddle.position.set(px - 0.3, py, sideZ);
      paddle.rotation.set(side * 0.32, feather, tilt);

      // The body follows the paddle: reach forward at the catch, twist and lean into the pull.
      const reach = THREE.MathUtils.clamp((px + 0.45) / 0.75, 0, 1);
      pose(paddler, {
        tl: 1.45,
        tr: 1.45,
        kl: 0.25,
        kr: 0.25,
        sl: 0.55 + reach * 0.75,
        sr: 0.55 + reach * 0.75,
        el: 0.85 - reach * 0.45,
        er: 0.85 - reach * 0.45,
        spine: 0.12 + reach * 0.2,
      });
      paddler.hips.position.y = 0.22;
      paddler.spine.rotation.y = side * (reach - 0.4) * 0.45;
      paddler.spine.rotation.z = side * 0.12;

      // Ripples from the blade while it pulls through the water.
      if (inWater && strokePhase > 0.05 && strokePhase < PULL - 0.05) {
        splashTimer += dt;
        if (splashTimer > 0.08) {
          splashTimer = 0;
          const bladeWorld = new THREE.Vector3(0, -0.72, 0).applyMatrix4(paddleMesh.matrixWorld);
          water.disturb(bladeWorld.x, bladeWorld.z, -0.012, 0.45);
        }
      }

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
