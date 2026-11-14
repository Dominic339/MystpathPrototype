// Shared materials and global shader uniforms (time, wind).

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { displace } from './geom';

export const globalUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 },
};

/**
 * Vertex-coloured standard material with optional wind sway.
 * Sway grows with height above the model's base, so trunks stay planted and canopies move.
 */
export function natureMaterial(
  opts: { sway?: number; roughness?: number; flat?: boolean; side?: THREE.Side; grain?: number; grainScale?: number } = {},
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: opts.roughness ?? 0.9,
    metalness: 0,
    flatShading: opts.flat ?? false,
    side: opts.side ?? THREE.FrontSide,
  });
  const sway = opts.sway ?? 0;
  const grain = opts.grain ?? 0.22;
  const grainScale = opts.grainScale ?? 2.4;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = globalUniforms.uTime;
    shader.uniforms.uWind = globalUniforms.uWind;
    shader.uniforms.uSway = { value: sway };
    shader.uniforms.uGrain = { value: grain };
    shader.uniforms.uGrainScale = { value: grainScale };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;\nuniform float uSway;\nvarying vec3 vGrainPos;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 swayOrigin = instanceMatrix[3].xyz;
        #else
          vec3 swayOrigin = vec3(0.0);
        #endif
        float swayH = max(transformed.y, 0.0);
        float swayPh = uTime * 1.25 + swayOrigin.x * 0.09 + swayOrigin.z * 0.07;
        float gust = 0.65 + 0.35 * sin(uTime * 0.31 + swayOrigin.x * 0.013);
        float swayAmt = uSway * uWind * gust * swayH * swayH;
        transformed.x += (sin(swayPh) + 0.35 * sin(swayPh * 2.7 + transformed.z)) * swayAmt;
        transformed.z += cos(swayPh * 0.83) * swayAmt * 0.7;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 grainP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          grainP = instanceMatrix * grainP;
        #endif
        vGrainPos = (modelMatrix * grainP).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uGrain;
        uniform float uGrainScale;
        varying vec3 vGrainPos;
        float gHash(vec3 p) { return fract(sin(dot(p, vec3(17.1, 113.7, 271.3))) * 43758.5453); }
        float gNoise(vec3 p) {
          vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          float a = mix(mix(gHash(i), gHash(i + vec3(1,0,0)), f.x), mix(gHash(i + vec3(0,1,0)), gHash(i + vec3(1,1,0)), f.x), f.y);
          float b = mix(mix(gHash(i + vec3(0,0,1)), gHash(i + vec3(1,0,1)), f.x), mix(gHash(i + vec3(0,1,1)), gHash(i + vec3(1,1,1)), f.x), f.y);
          return mix(a, b, f.z);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float gn = gNoise(vGrainPos * uGrainScale) * 0.65 + gNoise(vGrainPos * uGrainScale * 3.7) * 0.35;
        diffuseColor.rgb *= 1.0 - uGrain + gn * uGrain * 1.6;`,
      );
  };
  mat.customProgramCacheKey = () => `nature-${sway}-${grain}-${grainScale}`;
  return mat;
}

/** A lumpy sphere with smooth normals, for canopies and bushes. */
export function blob(radius: number, detail: number, lump: number, freq: number, seed: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  displace(g, lump, freq, seed);
  g.computeVertexNormals();
  return g;
}

/** A faceted rock: strongly displaced, flattened base, flat shading via non-indexed normals. */
export function rockShape(radius: number, seed: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, 2);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  displace(g, 0.42, 1.1 / radius, seed);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setY(i, y < 0 ? y * 0.35 : y * 0.8);
    pos.setX(i, pos.getX(i) * (1 + Math.sin(seed) * 0.2));
  }
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}
