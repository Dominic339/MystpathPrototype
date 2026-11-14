// Water: one surface at the water level, shaded from a depth map of the terrain beneath it.
// Shallow edges are clear and green, deep water is blue-teal, shorelines get foam,
// and the surface reflects the sky and the sun.

import * as THREE from 'three';
import type { Heightfield } from '../sim/terrain';
import { globalUniforms } from './materials';

export interface WaterUniforms {
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSkyZenith: { value: THREE.Color };
  uSkyHorizon: { value: THREE.Color };
  uLight: { value: number };
  uFogColor: { value: THREE.Color };
  uFogDensity: { value: number };
}

const MAX_DEPTH = 5;

export function buildWater(field: Heightfield): { mesh: THREE.Mesh; uniforms: WaterUniforms } {
  // Depth map: 0 at the shoreline (or above water), 1 at MAX_DEPTH metres deep.
  const res = 256;
  const data = new Uint8Array(res * res);
  for (let j = 0; j < res; j++)
    for (let i = 0; i < res; i++) {
      const x = (i / (res - 1) - 0.5) * field.size;
      const z = (j / (res - 1) - 0.5) * field.size;
      const d = (field.waterLevel - field.sample(x, z)) / MAX_DEPTH;
      data[j * res + i] = Math.round(Math.min(1, Math.max(0, d)) * 255);
    }
  const depthTex = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.UnsignedByteType);
  depthTex.magFilter = THREE.LinearFilter;
  depthTex.minFilter = THREE.LinearFilter;
  depthTex.needsUpdate = true;

  const uniforms: WaterUniforms & Record<string, THREE.IUniform> = {
    uTime: globalUniforms.uTime,
    uDepth: { value: depthTex },
    uSize: { value: field.size },
    uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
    uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uSkyZenith: { value: new THREE.Color('#3f7fd0') },
    uSkyHorizon: { value: new THREE.Color('#bcd8ee') },
    uLight: { value: 1 },
    uFogColor: { value: new THREE.Color('#bcd8ee') },
    uFogDensity: { value: 0.0025 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec4 vView;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vView = viewMatrix * w;
        gl_Position = projectionMatrix * vView;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uDepth;
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

      float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float waves(vec2 p) {
        float t = uTime;
        float h = vnoise(p * 0.35 + vec2(t * 0.12, t * 0.07)) * 0.5;
        h += vnoise(p * 0.9 - vec2(t * 0.18, -t * 0.11)) * 0.3;
        h += vnoise(p * 2.3 + vec2(-t * 0.27, t * 0.21)) * 0.2;
        return h;
      }

      void main() {
        vec2 uv = vWorld.xz / uSize + 0.5;
        float depth = texture2D(uDepth, uv).r;

        // Normal from the wave height field.
        float e = 0.15;
        float h0 = waves(vWorld.xz);
        float hx = waves(vWorld.xz + vec2(e, 0.0));
        float hz = waves(vWorld.xz + vec2(0.0, e));
        vec3 n = normalize(vec3((h0 - hx) * 0.45, e, (h0 - hz) * 0.45));

        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(n, viewDir), 0.0), 5.0);

        vec3 shallow = vec3(0.10, 0.24, 0.20);
        vec3 deep = vec3(0.01, 0.05, 0.075);
        vec3 body = mix(shallow, deep, smoothstep(0.0, 0.75, depth));
        float diffuse = 0.35 + 0.65 * max(dot(n, uSunDir), 0.0);
        body *= diffuse * uLight * uSunColor;

        vec3 r = reflect(-viewDir, n);
        vec3 sky = mix(uSkyHorizon, uSkyZenith, clamp(r.y * 1.6, 0.0, 1.0));
        vec3 col = mix(body, sky * 0.9, fresnel * 0.8);

        vec3 halfV = normalize(uSunDir + viewDir);
        float spec = pow(max(dot(n, halfV), 0.0), 600.0) * 2.2 + pow(max(dot(n, halfV), 0.0), 60.0) * 0.08;
        col += uSunColor * spec * step(0.0, uSunDir.y);

        // Shoreline foam that laps with the waves.
        float shore = 1.0 - smoothstep(0.0, 0.07, depth);
        float lap = smoothstep(0.45, 0.75, vnoise(vWorld.xz * 1.6 + uTime * 0.4) + shore * 0.5);
        col = mix(col, vec3(0.8, 0.85, 0.85) * uLight * uLight, shore * lap * 0.5);

        float alpha = mix(0.55, 0.94, smoothstep(0.0, 0.35, depth));
        alpha = max(alpha, fresnel);
        alpha *= smoothstep(0.0, 0.01, depth + 0.004);

        float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dot(vView.xyz, vView.xyz));
        col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  const geo = new THREE.PlaneGeometry(field.size, field.size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = field.waterLevel;
  mesh.renderOrder = 2;
  mesh.name = 'water';
  return { mesh, uniforms };
}
