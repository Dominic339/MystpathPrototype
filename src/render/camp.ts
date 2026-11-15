// The hunter-gatherer camp: hide tents, a campfire with flames, smoke and firelight,
// a drying rack, log seats, a woodpile and baskets.

import * as THREE from 'three';
import type { Heightfield } from '../sim/terrain';
import type { CampLayout, Placement } from '../sim/world';
import { color, jitter, limb, merge, mix, noise3, part } from './geom';
import { globalUniforms, natureMaterial, rockShape } from './materials';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const POLE = color('#6b5137');
const POLE_DARK = color('#3f2e20');
const HIDE = color('#b08a62');
const HIDE_DARK = color('#7d5b3c');
const HIDE_LIGHT = color('#d1b48a');

export function tentGeometry(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const radius = 2.4;
  const height = 4.3;
  const poles = 9;
  const doorStart = 0.15; // radians where the door gap begins
  const doorWidth = 0.75;
  // Poles cross above the apex.
  for (let p = 0; p < poles; p++) {
    const a = (p / poles) * Math.PI * 2;
    const foot = V(Math.cos(a) * radius * 1.04, -0.1, Math.sin(a) * radius * 1.04);
    const top = V(-Math.cos(a) * 0.35, height + 0.9, -Math.sin(a) * 0.35);
    parts.push(part(limb(foot, top, 0.055, 0.035, 5), (pt) => mix(POLE_DARK, POLE, noise3(pt.x * 4, pt.y * 2, pt.z * 4) * 0.5 + 0.6)));
  }
  // Hide cover: a cone that sags between poles and leaves a door gap.
  const segs = 54;
  const rings = 10;
  const positions: number[] = [];
  const pt = (u: number, v: number) => {
    const a = doorStart + doorWidth + u * (Math.PI * 2 - doorWidth);
    const poleSpacing = (Math.PI * 2) / poles;
    const between = Math.abs(((a % poleSpacing) + poleSpacing) % poleSpacing - poleSpacing / 2) / (poleSpacing / 2); // 1 at poles, 0 midway
    const sag = (1 - between) * 0.12 * (1 - v);
    const r = radius * (1 - v * 0.93) - sag;
    return V(Math.cos(a) * r, v * height * 0.94, Math.sin(a) * r);
  };
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < rings; j++) {
      const a = pt(i / segs, j / rings);
      const b = pt((i + 1) / segs, j / rings);
      const c = pt((i + 1) / segs, (j + 1) / rings);
      const d = pt(i / segs, (j + 1) / rings);
      for (const q of [a, c, b, a, d, c]) positions.push(q.x, q.y, q.z);
    }
  const cover = new THREE.BufferGeometry();
  cover.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  cover.computeVertexNormals();
  parts.push(
    part(cover, (p) => {
      // Stitched hide panels of slightly different tones, smoke-darkened near the top.
      const a = Math.atan2(p.z, p.x);
      const panel = Math.floor((a + Math.PI) / ((Math.PI * 2) / 7) + Math.floor(p.y / 1.4) * 3 + seed);
      const tone = ((panel * 37) % 10) / 10;
      const c = mix(HIDE_DARK, HIDE_LIGHT, tone * 0.7 + 0.15);
      mix(c, color('#3a2c22'), Math.max(0, p.y / height - 0.7) * 1.6, c);
      // Painted band.
      if (p.y > 1.2 && p.y < 1.45) mix(c, color('#8a2f22'), 0.65, c);
      return jitter(c, 0.06, p.x, p.y, p.z);
    }),
  );
  // Door flap folded back.
  const flap = new THREE.BufferGeometry();
  const fa = doorStart;
  const f0 = V(Math.cos(fa) * radius, 0, Math.sin(fa) * radius);
  const f1 = V(Math.cos(fa - 0.5) * radius * 1.05, 0.1, Math.sin(fa - 0.5) * radius * 1.05);
  const f2 = V(Math.cos(fa) * radius * 0.35, height * 0.62, Math.sin(fa) * radius * 0.35);
  flap.setAttribute('position', new THREE.Float32BufferAttribute([f0.x, f0.y, f0.z, f1.x, f1.y, f1.z, f2.x, f2.y, f2.z, f0.x, f0.y, f0.z, f2.x, f2.y, f2.z, f1.x, f1.y, f1.z], 3));
  flap.computeVertexNormals();
  parts.push(part(flap, HIDE_DARK));
  return merge(parts);
}

function logGeometry(len: number, r: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r * 1.05, len, 9, 1);
  g.rotateZ(Math.PI / 2);
  const end = color('#c49a6c');
  return part(g, (p, n) => (Math.abs(n.x) > 0.8 ? end : jitter(mix(POLE_DARK, POLE, noise3(p.x * 3, p.y * 9, p.z * 9) * 0.5 + 0.5), 0.1, p.x, p.y, p.z)));
}

function rackGeometry(): { frame: THREE.BufferGeometry; hides: THREE.BufferGeometry } {
  const parts: THREE.BufferGeometry[] = [];
  const w = 3.2;
  for (const sx of [-w / 2, w / 2]) {
    parts.push(part(limb(V(sx - 0.5, 0, 0), V(sx, 2.1, 0), 0.05, 0.04, 5), POLE));
    parts.push(part(limb(V(sx + 0.5, 0, 0), V(sx, 2.1, 0), 0.05, 0.04, 5), POLE));
  }
  parts.push(part(limb(V(-w / 2 - 0.2, 2.05, 0), V(w / 2 + 0.2, 2.05, 0), 0.045, 0.045, 5), POLE));
  // Hides draped over the bar (rendered double-sided).
  const hides: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(0.8, 1.5, 4, 6);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const x = pos.getX(i);
      pos.setZ(i, Math.sin((y + 0.75) * 1.3) * 0.08 + Math.cos(x * 4) * 0.03);
      pos.setX(i, x * (1 - (0.75 - y) * 0.12));
    }
    g.computeVertexNormals();
    g.translate(-1 + k * 1.0, 2.05 - 0.75, 0.02);
    const tone = [HIDE, HIDE_LIGHT, HIDE_DARK][k];
    hides.push(part(g, (p) => jitter(tone, 0.08, p.x, p.y, p.z)));
  }
  return { frame: merge(parts), hides: merge(hides) };
}

function woodpileGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  let k = 0;
  for (let row = 0; row < 4; row++) {
    const count = 5 - row;
    for (let i = 0; i < count; i++) {
      const g = logGeometry(1.4 + ((k * 7) % 3) * 0.1, 0.13);
      g.rotateY(Math.PI / 2 + (((k * 13) % 5) - 2) * 0.03);
      g.translate((i - (count - 1) / 2) * 0.27, 0.13 + row * 0.23, 0);
      parts.push(g);
      k++;
    }
  }
  return merge(parts);
}

function stoneRing(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stone = color('#6e6a64');
  const sooty = color('#2e2b28');
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2;
    const g = rockShape(0.22 + ((k * 7) % 4) * 0.03, k * 3.1);
    g.translate(Math.cos(a) * 0.85, 0.08, Math.sin(a) * 0.85);
    parts.push(part(g, (p) => mix(stone, sooty, Math.max(0, 1 - Math.hypot(p.x, p.z) / 0.95) * 1.6)));
  }
  // Charred logs in the fire.
  for (let k = 0; k < 4; k++) {
    const g = logGeometry(1.0, 0.08);
    g.rotateY((k / 4) * Math.PI);
    g.rotateZ(0.25);
    g.translate(0, 0.18, 0);
    const pos = g.getAttribute('color');
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * 0.25, pos.getY(i) * 0.22, pos.getZ(i) * 0.2);
    parts.push(g);
  }
  return merge(parts);
}

function basketGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.32, 0.24, 0.42, 14, 4, true);
  g.translate(0, 0.21, 0);
  const a = color('#b89a5e');
  const b = color('#8c6f3e');
  const basket = part(g, (p) => (Math.floor(p.y * 22) % 2 === 0 ? a : b));
  const fill = new THREE.CircleGeometry(0.3, 12);
  fill.rotateX(-Math.PI / 2);
  fill.translate(0, 0.34, 0);
  return merge([basket, part(fill, color('#7a2b3a'))]);
}

function flameMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: globalUniforms.uTime },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.7, 78.3))) * 43758.5); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
      void main() {
        vec2 uv = vUv;
        float n = vn(vec2(uv.x * 4.0, uv.y * 3.0 - uTime * 3.2)) * 0.6 + vn(vec2(uv.x * 9.0, uv.y * 6.0 - uTime * 5.0)) * 0.4;
        float shape = 1.0 - smoothstep(0.0, 0.5, abs(uv.x - 0.5) * (1.6 + uv.y * 2.2));
        float f = shape * (1.0 - uv.y) * 1.6 - n * uv.y * 1.2;
        f = clamp(f, 0.0, 1.0);
        vec3 col = mix(vec3(1.0, 0.25, 0.03), vec3(1.0, 0.85, 0.4), f);
        gl_FragColor = vec4(col * f * 3.0, f);
      }`,
  });
}

export interface CampBuild {
  group: THREE.Group;
  update: (realTime: number, night: number) => void;
}

export function buildCamp(camp: CampLayout, terrain: Heightfield): CampBuild {
  const group = new THREE.Group();
  group.name = 'camp';
  const mat = natureMaterial({ roughness: 0.92 });
  const place = (geo: THREE.BufferGeometry, p: Placement, yOffset = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p.x, terrain.sample(p.x, p.z) + yOffset, p.z);
    m.rotation.y = p.rot;
    m.scale.setScalar(p.scale ?? 1);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  // Tents are homes now: the town draws them (and replaces them as homes are upgraded).
  const rack = rackGeometry();
  place(rack.frame, camp.rack);
  const hideMesh = new THREE.Mesh(rack.hides, natureMaterial({ roughness: 0.95, side: THREE.DoubleSide }));
  hideMesh.position.set(camp.rack.x, terrain.sample(camp.rack.x, camp.rack.z), camp.rack.z);
  hideMesh.rotation.y = camp.rack.rot;
  hideMesh.castShadow = true;
  group.add(hideMesh);
  place(woodpileGeometry(), camp.woodpile);
  camp.logs.forEach((l) => place(logGeometry(1.8, 0.2), l, 0.15));
  const basket = basketGeometry();
  place(basket, { x: camp.woodpile.x - 1.4, z: camp.woodpile.z + 0.9, rot: 0 });
  place(basket, { x: camp.tents[0].x + 2.2, z: camp.tents[0].z + 1.6, rot: 1 }, 0).scale.setScalar(0.85);

  const fireY = terrain.sample(camp.fire.x, camp.fire.z);
  place(stoneRing(), { x: camp.fire.x, z: camp.fire.z, rot: 0 });

  // Flames: crossed quads, plus a warm point light.
  const flames = new THREE.Group();
  const fm = flameMaterial();
  for (let k = 0; k < 3; k++) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.5), fm);
    q.position.y = 0.85;
    q.rotation.y = (k / 3) * Math.PI;
    flames.add(q);
  }
  flames.position.set(camp.fire.x, fireY, camp.fire.z);
  group.add(flames);

  const fireLight = new THREE.PointLight(new THREE.Color('#ff9a45'), 30, 22, 1.6);
  fireLight.position.set(camp.fire.x, fireY + 1.3, camp.fire.z);
  group.add(fireLight);

  // Smoke puffs drifting upward.
  const smokeTex = makeSmokeTexture();
  const smoke: THREE.Sprite[] = [];
  for (let k = 0; k < 14; k++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: '#b9b4ad', transparent: true, depthWrite: false, opacity: 0.4 }));
    group.add(s);
    smoke.push(s);
  }

  return {
    group,
    update: (time, night) => {
      const flicker = 0.85 + 0.15 * Math.sin(time * 11.3) * Math.sin(time * 7.1 + 1.3) + 0.05 * Math.sin(time * 23.7);
      fireLight.intensity = (12 + night * 38) * flicker;
      flames.scale.set(1, 0.9 + 0.12 * Math.sin(time * 9.7), 1);
      smoke.forEach((s, k) => {
        const life = (time * 0.18 + k / smoke.length) % 1;
        const drift = life * life;
        s.position.set(camp.fire.x + Math.sin(k * 2.1 + time * 0.3) * 0.4 + drift * 3.5, fireY + 1.4 + life * 9, camp.fire.z + drift * 1.5);
        const size = 0.8 + life * 3.2;
        s.scale.set(size, size, 1);
        (s.material as THREE.SpriteMaterial).opacity = 0.45 * Math.sin(life * Math.PI) * (1 - night * 0.5);
      });
    },
  };
}

function makeSmokeTexture(): THREE.Texture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const dx = (i - size / 2) / (size / 2);
      const dy = (j - size / 2) / (size / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      const n = noise3(i * 0.15, j * 0.15, 0) * 0.3;
      const a = Math.max(0, 1 - d) ** 1.8 * Math.min(1, Math.max(0, 0.75 + n));
      const k = (j * size + i) * 4;
      data[k] = data[k + 1] = data[k + 2] = 255;
      data[k + 3] = Math.round(a * 255);
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
