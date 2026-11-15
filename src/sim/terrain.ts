// The terrain heightfield. The simulation owns it; the renderer draws a copy.
// It stays editable for the whole game, because villagers terraform (flatten land,
// raise levees, dig channels) and some god abilities reshape the ground.

export class Heightfield {
  /** Vertices per side. */
  readonly res: number;
  /** World size per side, in metres. */
  readonly size: number;
  /** Heights in metres, row-major (z rows, x columns). */
  readonly heights: Float32Array;
  /** Sea / lake surface height in metres. */
  waterLevel: number;

  constructor(res: number, size: number, heights?: Float32Array, waterLevel = 0) {
    this.res = res;
    this.size = size;
    this.heights = heights ?? new Float32Array(res * res);
    this.waterLevel = waterLevel;
  }

  get spacing(): number {
    return this.size / (this.res - 1);
  }

  /** World X/Z of grid column/row. The field is centred on the origin. */
  gridToWorld(i: number, j: number): { x: number; z: number } {
    const half = this.size / 2;
    return { x: -half + i * this.spacing, z: -half + j * this.spacing };
  }

  at(i: number, j: number): number {
    const ci = Math.min(this.res - 1, Math.max(0, i));
    const cj = Math.min(this.res - 1, Math.max(0, j));
    return this.heights[cj * this.res + ci];
  }

  set(i: number, j: number, h: number): void {
    if (i < 0 || j < 0 || i >= this.res || j >= this.res) return;
    this.heights[j * this.res + i] = h;
  }

  /** Bilinear height at any world X/Z. */
  sample(x: number, z: number): number {
    const half = this.size / 2;
    const fx = (x + half) / this.spacing;
    const fz = (z + half) / this.spacing;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const h00 = this.at(i, j);
    const h10 = this.at(i + 1, j);
    const h01 = this.at(i, j + 1);
    const h11 = this.at(i + 1, j + 1);
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  /** Slope as rise over run (0 = flat). */
  slope(x: number, z: number): number {
    const d = this.spacing;
    const dx = (this.sample(x + d, z) - this.sample(x - d, z)) / (2 * d);
    const dz = (this.sample(x, z + d) - this.sample(x, z - d)) / (2 * d);
    return Math.sqrt(dx * dx + dz * dz);
  }

  isWater(x: number, z: number): boolean {
    return this.sample(x, z) < this.waterLevel;
  }

  /**
   * Terraform: blend the ground inside a circle toward `targetHeight`.
   * `falloff` is the soft edge width in metres. Returns the grid bounds touched,
   * so the renderer can rebuild only the affected chunk.
   */
  flatten(cx: number, cz: number, radius: number, targetHeight: number, falloff = 4): GridBounds {
    return this.editCircle(cx, cz, radius + falloff, (h, d) => {
      const t = d <= radius ? 1 : 1 - smoothstep(radius, radius + falloff, d);
      return h + (targetHeight - h) * t;
    });
  }

  /** Terraform: raise (positive) or lower (negative) the ground with a smooth dome. */
  raise(cx: number, cz: number, radius: number, amount: number): GridBounds {
    return this.editCircle(cx, cz, radius, (h, d) => {
      const t = 1 - smoothstep(0, radius, d);
      return h + amount * t;
    });
  }

  private editCircle(cx: number, cz: number, reach: number, fn: (h: number, dist: number) => number): GridBounds {
    const half = this.size / 2;
    const s = this.spacing;
    const i0 = Math.max(0, Math.floor((cx - reach + half) / s));
    const i1 = Math.min(this.res - 1, Math.ceil((cx + reach + half) / s));
    const j0 = Math.max(0, Math.floor((cz - reach + half) / s));
    const j1 = Math.min(this.res - 1, Math.ceil((cz + reach + half) / s));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const { x, z } = this.gridToWorld(i, j);
        const d = Math.hypot(x - cx, z - cz);
        if (d > reach) continue;
        const k = j * this.res + i;
        this.heights[k] = fn(this.heights[k], d);
      }
    }
    return { i0, i1, j0, j1 };
  }
}

export interface GridBounds {
  i0: number;
  i1: number;
  j0: number;
  j1: number;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
