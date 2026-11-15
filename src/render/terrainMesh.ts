// Terrain rendering: a heightfield mesh painted with vertex colours (grass, dirt,
// wet banks, river silt, rock on steep slopes), plus fine procedural grain in the shader.

import * as THREE from 'three';
import type { Heightfield } from '../sim/terrain';
import { smoothstep } from '../sim/terrain';
import type { CampLayout, PropInstance } from '../sim/world';
import { Noise2D } from '../sim/noise';
import { color, mix } from './geom';
import { globalUniforms } from './materials';
import { envAtPoint } from '../sim/worldgen';

const GRASS_LUSH = color('#4a6e2c');
const GRASS_DRY = color('#8c8f4a');
const GRASS_DEEP = color('#2f4d22');
const FOREST_FLOOR = color('#4a4a26');
const DIRT = color('#7a5f43');
const DIRT_PACKED = color('#8f7658');
const MUD = color('#5a4a36');
const SAND = color('#b8a27a');
const SILT = color('#6e6249');
const ROCK = color('#7d776e');
const ROCK_DARK = color('#58534c');
const SCREE = color('#958c7c');

const SNOW = color('#e9eef3');
type Ground = (x: number, z: number, h: number, slope: number, nv: number, nf: number) => { color: THREE.Color; amount: number; grass: number };

/** How each environment paints the ground, and how much grass grows there. */
const BIOME_GROUND: Partial<Record<string, Ground>> = {
  desert: (x, z, _h, _s, nv) => {
    const ripple = Math.sin(x * 0.9 + Math.sin(z * 0.2) * 3) * 0.5 + 0.5;
    return { color: mix(color('#c9a470'), color('#e0c48e'), ripple * 0.5 + nv * 0.4), amount: 1, grass: 0.02 };
  },
  'dry-lake': (x, z, _h, _s, nv, nf) => {
    const crack = Math.abs(Math.sin(x * 1.3 + nf * 4) * Math.sin(z * 1.3 + nv * 4)) < 0.06 ? 0.35 : 0;
    return { color: mix(color('#ddd5c2'), color('#8a7e6a'), crack + nv * 0.1), amount: 1, grass: 0 };
  },
  coast: (_x, _z, _h, _s, nv) => ({ color: mix(color('#d6c39a'), color('#e6d6b0'), nv), amount: 0.95, grass: 0.08 }),
  volcanic: (_x, _z, h, slope, nv, nf) => {
    const sulphur = nf > 0.82 && h < 50 ? 0.6 : 0;
    const c = mix(mix(color('#2c2826'), color('#4a403a'), nv), color('#c9b23a'), sulphur);
    return { color: c, amount: 1, grass: slope < 0.3 && h < 15 ? 0.15 : 0 };
  },
  glacier: (_x, _z, _h, _s, nv) => ({ color: mix(color('#dfe8f0'), color('#b8cfe0'), nv * 0.6), amount: 1, grass: 0 }),
  'snowy-hills': (_x, _z, _h, slope, nv) => ({ color: mix(SNOW, color('#8a8a86'), smoothstep(0.5, 1.1, slope) * 0.8 + nv * 0.1), amount: 0.9, grass: 0.05 }),
  'chalk-hills': (_x, _z, _h, slope, nv, nf) => ({ color: mix(color('#7a8a44'), color('#e2ddcd'), smoothstep(0.35, 0.8, slope) * 0.8 + (nf > 0.8 ? 0.5 : 0)), amount: 0.6 + nv * 0.2, grass: 0.8 }),
  swamp: (_x, _z, _h, _s, nv, nf) => ({ color: mix(color('#3c4228'), color('#5a5a34'), nv), amount: 0.85, grass: nf > 0.5 ? 0.6 : 0.2 }),
  'tropical-forest': (_x, _z, _h, _s, nv) => ({ color: mix(color('#2a5a20'), color('#3f7a2a'), nv), amount: 0.75, grass: 1 }),
  plains: (_x, _z, _h, _s, nv) => ({ color: mix(color('#8e8f48'), color('#a8a05a'), nv), amount: 0.55, grass: 1 }),
  'conifer-forest': (_x, _z, _h, _s, nv) => ({ color: mix(color('#4a4630'), color('#5a5236'), nv), amount: 0.5, grass: 0.5 }),
  mountains: (_x, _z, _h, _s, nv) => ({ color: mix(color('#77716a'), color('#9a9286'), nv), amount: 0.7, grass: 0.1 }),
  hills: (_x, _z, _h, _s, nv) => ({ color: mix(color('#6a7a3a'), color('#8a8a5a'), nv), amount: 0.3, grass: 0.8 }),
};

export interface TerrainBuild {
  mesh: THREE.Mesh;
  /** 0..1 per vertex: how suitable for grass tufts. */
  grassWeight: Float32Array;
}

export function buildTerrain(field: Heightfield, camp: CampLayout, props: PropInstance[], biome: Uint8Array): TerrainBuild {
  const res = field.res;
  const geo = new THREE.PlaneGeometry(field.size, field.size, res - 1, res - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  // Heights are sampled by world X/Z, so vertex order does not matter.
  const colors = new Float32Array(pos.count * 3);
  const grassWeight = new Float32Array(pos.count);
  const n = new Noise2D(271);
  const forest = forestDensity(field, props);

  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    const z = pos.getZ(k);
    const h = field.sample(x, z);
    pos.setY(k, h);
    const slope = field.slope(x, z);
    const above = h - field.waterLevel;
    const nv = n.fbm(x * 0.05, z * 0.05, 3) * 0.5 + 0.5;
    const nf = n.sample(x * 0.35, z * 0.35) * 0.5 + 0.5;

    // Meadow grass, varying between lush and sun-dried patches.
    const c = mix(GRASS_LUSH, GRASS_DRY, smoothstep(0.45, 0.85, nv) * 0.75);
    mix(c, GRASS_DEEP, smoothstep(0.55, 0.2, nf) * 0.35, c);

    // Forest floor under trees.
    const fd = sampleDensity(forest, field, x, z);
    mix(c, FOREST_FLOOR, Math.min(1, fd * 1.4) * 0.7, c);

    // Camp ground and worn paths.
    const campD = Math.hypot(x - camp.center.x, z - camp.center.z);
    const campWear = 1 - smoothstep(6 + nf * 4, 13 + nv * 3, campD);
    mix(c, mix(DIRT, DIRT_PACKED, nf), campWear * 0.9, c);
    const path = 0; // footpaths now come from the simulation (worn by villagers)

    // Wet banks and underwater silt.
    const bank = 1 - smoothstep(0.15, 1.2 + nv * 0.6, above);
    mix(c, mix(MUD, SAND, nf * 0.6), bank, c);
    if (above < 0) mix(c, SILT, smoothstep(0, -1.5, above), c);

    // Rock on steep slopes and high ground.
    const steep = smoothstep(0.55, 1.0, slope);
    mix(c, mix(ROCK, SCREE, nv), steep * 0.85, c);
    mix(c, ROCK_DARK, smoothstep(1.1, 1.6, slope) * 0.6, c);
    const high = smoothstep(28, 44, h) * (0.5 + nv * 0.5);
    mix(c, ROCK, high * 0.7, c);

    // Each environment paints its own ground; the lookup is jittered so borders blend.
    const env = envAtPoint(biome, x + (nf - 0.5) * 9, z + (nv - 0.5) * 9);
    let grassy = 1;
    const ground = BIOME_GROUND[env];
    if (ground && above > 0.05) {
      const g = ground(x, z, h, slope, nv, nf);
      mix(c, g.color, g.amount, c);
      grassy = g.grass;
    }
    // Snow on the high peaks, whatever the environment.
    const snow = env === 'volcanic' ? 0 : smoothstep(52, 66, h + nv * 6) * (1 - smoothstep(1.2, 1.7, slope));
    mix(c, SNOW, snow, c);

    colors[k * 3] = c.r;
    colors[k * 3 + 1] = c.g;
    colors[k * 3 + 2] = c.b;

    grassWeight[k] =
      grassy * (1 - snow) * (1 - steep) * (1 - campWear) * (1 - path) * smoothstep(0.6, 1.4, above) * (1 - high) * (1 - Math.min(1, fd * 1.2) * 0.6);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWear = globalUniforms.uWear;
    shader.uniforms.uWorldSize = globalUniforms.uWorldSize;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTerrainPos;
        uniform sampler2D uWear;
        uniform float uWorldSize;
        float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float grain = tNoise(vTerrainPos.xz * 1.7) * 0.6 + tNoise(vTerrainPos.xz * 6.3) * 0.4;
        diffuseColor.rgb *= 0.86 + grain * 0.26;
        // Footpaths worn by villagers: packed dirt with ragged edges.
        vec2 wearRoad = texture2D(uWear, vTerrainPos.xz / uWorldSize + 0.5).rg;
        float worn = wearRoad.r;
        float pathMix = smoothstep(0.12, 0.55, worn + (tNoise(vTerrainPos.xz * 2.3) - 0.5) * 0.18);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.11, 0.06) * (0.9 + grain * 0.25), pathMix * 0.85);
        // Built roads: trackways of packed light earth, then gravel, then cobbles and beyond.
        float roadTier = wearRoad.g * 7.0;
        float roadMix = smoothstep(0.15, 0.55, roadTier + (tNoise(vTerrainPos.xz * 1.8) - 0.5) * 0.25);
        if (roadMix > 0.0) {
          float pebble = step(0.72, tNoise(vTerrainPos.xz * 9.0));
          vec3 track = vec3(0.24, 0.17, 0.11) * (0.88 + grain * 0.24) + pebble * 0.04;
          vec3 gravel = vec3(0.3, 0.27, 0.22) * (0.8 + tNoise(vTerrainPos.xz * 14.0) * 0.4);
          vec2 cell = fract(vTerrainPos.xz * 2.2);
          float seam = smoothstep(0.0, 0.08, min(min(cell.x, cell.y), min(1.0 - cell.x, 1.0 - cell.y)));
          vec3 cobble = vec3(0.32, 0.31, 0.29) * (0.7 + tHash(floor(vTerrainPos.xz * 2.2)) * 0.35) * (0.55 + seam * 0.45);
          vec3 road = roadTier < 1.5 ? track : roadTier < 2.5 ? gravel : roadTier < 3.5 ? cobble : vec3(0.18, 0.18, 0.19) * (0.9 + grain * 0.2);
          diffuseColor.rgb = mix(diffuseColor.rgb, road, roadMix * 0.92);
        }`,
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return { mesh, grassWeight };
}

interface DensityGrid {
  cells: Float32Array;
  n: number;
  cell: number;
}

function forestDensity(field: Heightfield, props: PropInstance[]): DensityGrid {
  const cell = 6;
  const n = Math.ceil(field.size / cell);
  const cells = new Float32Array(n * n);
  const half = field.size / 2;
  for (const p of props) {
    if (p.kind !== 'oak' && p.kind !== 'pine' && p.kind !== 'birch') continue;
    const i = Math.floor((p.x + half) / cell);
    const j = Math.floor((p.z + half) / cell);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        cells[jj * n + ii] += di === 0 && dj === 0 ? 0.5 : 0.15;
      }
  }
  return { cells, n, cell };
}

function sampleDensity(g: DensityGrid, field: Heightfield, x: number, z: number): number {
  const half = field.size / 2;
  const fx = (x + half) / g.cell - 0.5;
  const fz = (z + half) / g.cell - 0.5;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const at = (a: number, b: number) => (a < 0 || b < 0 || a >= g.n || b >= g.n ? 0 : g.cells[b * g.n + a]);
  return (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - tz) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * tz;
}
