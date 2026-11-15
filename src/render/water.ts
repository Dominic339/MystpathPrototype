// Simulated water.
//
// - A real-time wave simulation (2D wave equation on a grid over every wet cell) carries
//   ripples, splashes and boat wakes, which spread, reflect off the banks and fade.
// - The river current from the simulation moves surface detail downstream (flow mapping)
//   and pushes floating objects.
// - A gentle wind swell, deeper water swelling more, is shared by the shader and by
//   heightAt() so boats float on exactly the surface you see.

import * as THREE from 'three';
import type { Heightfield } from '../sim/terrain';
import { globalUniforms } from './materials';

export interface FlowGrid {
  res: number;
  size: number;
  data: Float32Array;
}

const N = 256; // wave grid cells per side
const MAX_DEPTH = 5;
const WAVE_SPEED = 4.2; // m/s
const SIM_HZ = 40;

/** Wind swell height; mirrored exactly in the shaders. */
export function swell(x: number, z: number, t: number): number {
  return 0.07 * Math.sin(0.31 * x + 0.9 * t) + 0.05 * Math.sin(0.23 * z - 0.7 * t + 1.3) + 0.035 * Math.sin(0.41 * (x + z) + 1.25 * t + 2.1);
}

export class WaterSystem {
  readonly mesh: THREE.Mesh;
  readonly uniforms: Record<string, THREE.IUniform>;
  private cur = new Float32Array(N * N);
  private prev = new Float32Array(N * N);
  private mask = new Uint8Array(N * N);
  private heightTex: THREE.DataTexture;
  private acc = 0;
  private time = 0;
  private readonly cell: number;

  constructor(
    private field: Heightfield,
    private flow: FlowGrid,
  ) {
    this.cell = field.size / (N - 1);
    // Depth map shared by the shader (colour, swell strength) and the wave mask.
    const depthBytes = new Uint8Array(N * N);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1) - 0.5) * field.size;
        const z = (j / (N - 1) - 0.5) * field.size;
        const d = field.waterLevel - field.sample(x, z);
        const k = j * N + i;
        this.mask[k] = d > 0.03 ? 1 : 0;
        depthBytes[k] = Math.round(THREE.MathUtils.clamp(d / MAX_DEPTH, 0, 1) * 255);
      }
    const depthTex = new THREE.DataTexture(depthBytes, N, N, THREE.RedFormat, THREE.UnsignedByteType);
    depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter;
    depthTex.needsUpdate = true;

    this.heightTex = new THREE.DataTexture(this.cur, N, N, THREE.RedFormat, THREE.FloatType);
    this.heightTex.magFilter = this.heightTex.minFilter = THREE.NearestFilter;
    this.heightTex.needsUpdate = true;

    // Flow map packed into RG bytes: -2..2 m/s → 0..255.
    const fb = new Uint8Array(flow.res * flow.res * 4);
    for (let k = 0; k < flow.res * flow.res; k++) {
      fb[k * 4] = Math.round(THREE.MathUtils.clamp(flow.data[k * 2] / 4 + 0.5, 0, 1) * 255);
      fb[k * 4 + 1] = Math.round(THREE.MathUtils.clamp(flow.data[k * 2 + 1] / 4 + 0.5, 0, 1) * 255);
      fb[k * 4 + 3] = 255;
    }
    const flowTex = new THREE.DataTexture(fb, flow.res, flow.res, THREE.RGBAFormat);
    flowTex.magFilter = flowTex.minFilter = THREE.LinearFilter;
    flowTex.needsUpdate = true;

    this.uniforms = {
      uTime: globalUniforms.uTime,
      uDepth: { value: depthTex },
      uHeight: { value: this.heightTex },
      uFlow: { value: flowTex },
      uTexel: { value: 1 / N },
      uSize: { value: field.size },
      uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
      uSkyZenith: { value: new THREE.Color('#3f7fd0') },
      uSkyHorizon: { value: new THREE.Color('#bcd8ee') },
      uLight: { value: 1 },
      uFogColor: { value: new THREE.Color('#bcd8ee') },
      uFogDensity: { value: 0.0013 },
      uSimTime: { value: 0 },
    };

    const geo = new THREE.PlaneGeometry(field.size, field.size, N - 1, N - 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, transparent: true, depthWrite: false, vertexShader: VERT, fragmentShader: FRAG });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = field.waterLevel;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'water';
    this.mesh.frustumCulled = false;
  }

  /** Push the surface down (or up) in a soft circle: splashes, paddles, wakes. */
  disturb(x: number, z: number, amount: number, radius = 1.5): void {
    const fi = (x / this.field.size + 0.5) * (N - 1);
    const fj = (z / this.field.size + 0.5) * (N - 1);
    const rc = Math.ceil((radius * 1.6) / this.cell) + 1;
    for (let j = Math.floor(fj) - rc; j <= Math.ceil(fj) + rc; j++)
      for (let i = Math.floor(fi) - rc; i <= Math.ceil(fi) + rc; i++) {
        if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) continue;
        const k = j * N + i;
        if (!this.mask[k]) continue;
        const d = Math.hypot((i - fi) * this.cell, (j - fj) * this.cell) / radius;
        if (d > 1.6) continue;
        this.cur[k] += amount * Math.exp(-d * d * 2.2);
      }
  }

  depthAt(x: number, z: number): number {
    return this.field.waterLevel - this.field.sample(x, z);
  }

  /** Surface height at a point: simulated ripples plus swell. */
  heightAt(x: number, z: number): number {
    const fi = (x / this.field.size + 0.5) * (N - 1);
    const fj = (z / this.field.size + 0.5) * (N - 1);
    const i = Math.floor(fi);
    const j = Math.floor(fj);
    const tx = fi - i;
    const tz = fj - j;
    const at = (a: number, b: number) => (a < 0 || b < 0 || a >= N || b >= N ? 0 : this.cur[b * N + a]);
    const h = (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - tz) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * tz;
    const depthGain = THREE.MathUtils.clamp(this.depthAt(x, z) / 2.5, 0, 1);
    return this.field.waterLevel + h + swell(x, z, this.time) * depthGain;
  }

  /** Swell height (no ripples) at a point, relative to the water level. */
  swellAt(x: number, z: number): number {
    return swell(x, z, this.time) * THREE.MathUtils.clamp(this.depthAt(x, z) / 2.5, 0, 1);
  }

  /** Ripple height averaged over a disc — what a hull of that size actually feels. */
  rippleAverage(x: number, z: number, radius: number): number {
    let sum = 0;
    let n = 0;
    for (let a = 0; a < 8; a++) {
      const px = x + Math.cos((a / 8) * Math.PI * 2) * radius;
      const pz = z + Math.sin((a / 8) * Math.PI * 2) * radius;
      sum += this.heightAt(px, pz) - this.field.waterLevel - this.swellAt(px, pz);
      n++;
    }
    return sum / n;
  }

  /** River current at a point, in m/s. */
  flowAt(x: number, z: number): { x: number; z: number } {
    const r = this.flow.res;
    const i = Math.round(THREE.MathUtils.clamp((x / this.flow.size + 0.5) * (r - 1), 0, r - 1));
    const j = Math.round(THREE.MathUtils.clamp((z / this.flow.size + 0.5) * (r - 1), 0, r - 1));
    const k = (j * r + i) * 2;
    return { x: this.flow.data[k], z: this.flow.data[k + 1] };
  }

  update(dt: number): void {
    this.time += dt;
    this.uniforms.uSimTime.value = this.time;
    this.acc += dt;
    const step = 1 / SIM_HZ;
    let steps = 0;
    while (this.acc >= step && steps < 4) {
      this.step(step);
      this.acc -= step;
      steps++;
    }
    if (this.acc > step) this.acc = 0; // fell behind: drop time rather than spiral
    if (steps) {
      this.heightTex.image.data = this.cur;
      this.heightTex.needsUpdate = true;
    }
  }

  private step(dt: number): void {
    const lambda = Math.min(0.45, ((WAVE_SPEED * dt) / this.cell) ** 2);
    const cur = this.cur;
    const next = this.prev; // reused: holds the previous state, overwritten with the next
    const mask = this.mask;
    const damp = 0.994;
    for (let j = 1; j < N - 1; j++) {
      const row = j * N;
      for (let i = 1; i < N - 1; i++) {
        const k = row + i;
        if (!mask[k]) {
          next[k] = 0;
          continue;
        }
        // Dry neighbours mirror this cell, so waves reflect off the banks.
        const c = cur[k];
        const l = mask[k - 1] ? cur[k - 1] : c;
        const r = mask[k + 1] ? cur[k + 1] : c;
        const u = mask[k - N] ? cur[k - N] : c;
        const d = mask[k + N] ? cur[k + N] : c;
        next[k] = (c + (c - next[k]) * damp + lambda * (l + r + u + d - 4 * c)) * 0.9995;
      }
    }
    this.prev = cur;
    this.cur = next;
  }
}

const SWELL_GLSL = /* glsl */ `
  float swell(vec2 p, float t) {
    return 0.07 * sin(0.31 * p.x + 0.9 * t) + 0.05 * sin(0.23 * p.y - 0.7 * t + 1.3) + 0.035 * sin(0.41 * (p.x + p.y) + 1.25 * t + 2.1);
  }`;

const VERT = /* glsl */ `
  uniform sampler2D uHeight;
  uniform sampler2D uDepth;
  uniform float uSize;
  uniform float uSimTime;
  varying vec3 vWorld;
  varying vec4 vView;
  varying vec2 vUv;
  ${SWELL_GLSL}
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vUv = w.xz / uSize + 0.5;
    float depth = texture2D(uDepth, vUv).r * 5.0;
    w.y += texture2D(uHeight, vUv).r + swell(w.xz, uSimTime) * clamp(depth / 2.5, 0.0, 1.0);
    vWorld = w.xyz;
    vView = viewMatrix * w;
    gl_Position = projectionMatrix * vView;
  }`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uSimTime;
  uniform sampler2D uDepth;
  uniform sampler2D uHeight;
  uniform sampler2D uFlow;
  uniform float uTexel;
  uniform float uSize;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyZenith;
  uniform vec3 uSkyHorizon;
  uniform float uLight;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vWorld;
  varying vec4 vView;
  varying vec2 vUv;
  ${SWELL_GLSL}

  // Manual bilinear filtering of the float height field (float textures may not filter natively).
  float heightAt(vec2 uv) {
    vec2 st = uv / uTexel - 0.5;
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = texture2D(uHeight, (i + vec2(0.5, 0.5)) * uTexel).r;
    float b = texture2D(uHeight, (i + vec2(1.5, 0.5)) * uTexel).r;
    float c = texture2D(uHeight, (i + vec2(0.5, 1.5)) * uTexel).r;
    float d = texture2D(uHeight, (i + vec2(1.5, 1.5)) * uTexel).r;
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float ripples(vec2 p) {
    float t = uTime;
    return vnoise(p * 0.55 + vec2(t * 0.1, t * 0.06)) * 0.55 + vnoise(p * 1.4 - vec2(t * 0.16, -t * 0.12)) * 0.3 + vnoise(p * 3.1 + vec2(-t * 0.25, t * 0.2)) * 0.15;
  }
  // Surface detail carried downstream by the current: two offset phases blended so it never stretches.
  float flowDetail(vec2 p, vec2 flow) {
    float period = 2.5;
    float ph0 = fract(uTime / period);
    float ph1 = fract(uTime / period + 0.5);
    float w0 = 1.0 - abs(1.0 - 2.0 * ph0);
    return ripples(p - flow * ph0 * period) * w0 + ripples(p - flow * ph1 * period + 13.7) * (1.0 - w0);
  }

  void main() {
    float depthN = texture2D(uDepth, vUv).r;
    vec2 flow = (texture2D(uFlow, vUv).rg - 0.5) * 4.0;
    float speed = length(flow);

    // Surface normal: simulated waves + swell + flowing detail.
    float hl = heightAt(vUv - vec2(uTexel, 0.0));
    float hr = heightAt(vUv + vec2(uTexel, 0.0));
    float hd = heightAt(vUv - vec2(0.0, uTexel));
    float hu = heightAt(vUv + vec2(0.0, uTexel));
    float cell = uSize * uTexel;
    float g = clamp(depthN * 5.0 / 2.5, 0.0, 1.0);
    float e = 0.2;
    float s0 = swell(vWorld.xz, uSimTime) * g;
    float sx = swell(vWorld.xz + vec2(e, 0.0), uSimTime) * g;
    float sz = swell(vWorld.xz + vec2(0.0, e), uSimTime) * g;
    float d0 = flowDetail(vWorld.xz, flow);
    float dx = flowDetail(vWorld.xz + vec2(e, 0.0), flow);
    float dz = flowDetail(vWorld.xz + vec2(0.0, e), flow);
    float detail = (0.32 + speed * 0.25) * 0.25;
    vec3 n = normalize(vec3(
      (hl - hr) / (2.0 * cell) * 1.6 + (s0 - sx) / e + (d0 - dx) / e * detail,
      1.0,
      (hd - hu) / (2.0 * cell) * 1.6 + (s0 - sz) / e + (d0 - dz) / e * detail));

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(n, viewDir), 0.0), 5.0);

    vec3 shallow = vec3(0.10, 0.24, 0.20);
    vec3 deep = vec3(0.01, 0.05, 0.075);
    vec3 body = mix(shallow, deep, smoothstep(0.0, 0.75, depthN));
    body *= (0.35 + 0.65 * max(dot(n, uSunDir), 0.0)) * uLight * uSunColor;

    vec3 r = reflect(-viewDir, n);
    vec3 sky = mix(uSkyHorizon, uSkyZenith, clamp(r.y * 1.6, 0.0, 1.0));
    vec3 col = mix(body, sky * 0.9, fresnel * 0.8);

    vec3 halfV = normalize(uSunDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), 600.0) * 2.2 + pow(max(dot(n, halfV), 0.0), 60.0) * 0.08;
    col += uSunColor * spec * step(0.0, uSunDir.y);

    // Foam: lapping at the shore, streaks in fast water, and on wave crests and wakes.
    float shore = 1.0 - smoothstep(0.0, 0.07, depthN);
    float lap = smoothstep(0.45, 0.75, vnoise(vWorld.xz * 1.6 + uTime * 0.4) + shore * 0.5);
    float hc = heightAt(vUv);
    float crest = smoothstep(0.07, 0.18, abs(hc)) * smoothstep(0.4, 0.75, vnoise(vWorld.xz * 3.0 - uTime));
    float streak = smoothstep(0.72, 0.9, flowDetail(vWorld.xz * 1.8, flow * 1.8)) * smoothstep(0.6, 1.4, speed) * 0.45;
    float foam = max(shore * lap * 0.5, max(crest * 0.6, streak));
    col = mix(col, vec3(0.8, 0.85, 0.85) * uLight * uLight, foam);

    float alpha = mix(0.55, 0.94, smoothstep(0.0, 0.35, depthN));
    alpha = max(max(alpha, fresnel), foam * 0.9);
    alpha *= smoothstep(0.0, 0.01, depthN + 0.004);

    float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dot(vView.xyz, vView.xyz));
    col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
