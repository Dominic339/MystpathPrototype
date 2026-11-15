// Optional hex grid overlay draped over the terrain (toggle with H).

import * as THREE from 'three';
import type { Heightfield } from '../sim/terrain';
import { HEX_SIZE, hexCorners, hexesInRadius, hexToWorld } from '../sim/hex';

export function buildHexOverlay(field: Heightfield): THREE.LineSegments {
  const pts: number[] = [];
  const radius = Math.floor(field.size / 2 / (HEX_SIZE * 1.5));
  const half = field.size / 2 - 2;
  for (const h of hexesInRadius({ q: 0, r: 0 }, radius)) {
    const c = hexToWorld(h);
    if (Math.abs(c.x) > half || Math.abs(c.z) > half) continue;
    const corners = hexCorners(h);
    for (let i = 0; i < 6; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 6];
      // Subdivide each edge so it hugs the ground.
      const steps = 4;
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps;
        const t1 = (s + 1) / steps;
        const x0 = a.x + (b.x - a.x) * t0;
        const z0 = a.z + (b.z - a.z) * t0;
        const x1 = a.x + (b.x - a.x) * t1;
        const z1 = a.z + (b.z - a.z) * t1;
        const y0 = Math.max(field.waterLevel, field.sample(x0, z0)) + 0.15;
        const y1 = Math.max(field.waterLevel, field.sample(x1, z1)) + 0.15;
        pts.push(x0, y0, z0, x1, y1, z1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({ color: '#f4ecd2', transparent: true, opacity: 0.35, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.name = 'hex-overlay';
  lines.renderOrder = 3;
  return lines;
}
