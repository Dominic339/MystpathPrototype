// Walking routes. A* over a land grid: water is impassable, steep ground is costly, and
// well-trodden ground is cheaper — so routes villagers use often become footpaths that
// attract even more traffic.

import type { Heightfield } from './terrain';

export const NAV_CELL = 2; // metres

export class NavGrid {
  readonly n: number;
  readonly size: number;
  /** Base cost per cell; Infinity = impassable. */
  readonly cost: Float32Array;
  /** Foot traffic wear, 0..~1. */
  wear: Float32Array;
  /** Road surface tier per cell (0 = none; see ROAD_TIERS). */
  road: Uint8Array;

  constructor(terrain: Heightfield) {
    this.size = terrain.size;
    this.n = Math.floor(terrain.size / NAV_CELL);
    this.cost = new Float32Array(this.n * this.n);
    this.wear = new Float32Array(this.n * this.n);
    this.road = new Uint8Array(this.n * this.n);
    for (let j = 0; j < this.n; j++)
      for (let i = 0; i < this.n; i++) {
        const { x, z } = this.cellCenter(i, j);
        const h = terrain.sample(x, z);
        const k = j * this.n + i;
        if (h < terrain.waterLevel + 0.12) {
          this.cost[k] = Infinity;
          continue;
        }
        const slope = terrain.slope(x, z);
        this.cost[k] = slope > 1.4 ? Infinity : 1 + slope * slope * 6;
      }
  }

  cellCenter(i: number, j: number): { x: number; z: number } {
    return { x: -this.size / 2 + (i + 0.5) * NAV_CELL, z: -this.size / 2 + (j + 0.5) * NAV_CELL };
  }

  cellOf(x: number, z: number): { i: number; j: number } {
    const i = Math.min(this.n - 1, Math.max(0, Math.floor((x + this.size / 2) / NAV_CELL)));
    const j = Math.min(this.n - 1, Math.max(0, Math.floor((z + this.size / 2) / NAV_CELL)));
    return { i, j };
  }

  passable(x: number, z: number): boolean {
    const { i, j } = this.cellOf(x, z);
    return Number.isFinite(this.cost[j * this.n + i]);
  }

  /** Cost of stepping into a cell, cheaper where the ground is worn into a path. */
  private stepCost(k: number): number {
    const road = this.road[k] ? 0.35 / (1 + this.road[k] * 0.15) : 1;
    return this.cost[k] * (1 - 0.6 * Math.min(1, this.wear[k])) * road;
  }

  /** Nearest passable cell to a point (for targets at the water's edge). */
  nearestPassable(x: number, z: number): { x: number; z: number } | null {
    const { i, j } = this.cellOf(x, z);
    for (let r = 0; r < 8; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= this.n || jj >= this.n) continue;
          if (Number.isFinite(this.cost[jj * this.n + ii])) return this.cellCenter(ii, jj);
        }
    return null;
  }

  /** A* route from a to b as world waypoints, simplified where the line of sight is clear. */
  findPath(ax: number, az: number, bx: number, bz: number): { x: number; z: number }[] | null {
    const start = this.cellOf(ax, az);
    const goalP = this.passable(bx, bz) ? { x: bx, z: bz } : this.nearestPassable(bx, bz);
    if (!goalP) return null;
    const goal = this.cellOf(goalP.x, goalP.z);
    const n = this.n;
    const sk = start.j * n + start.i;
    const gk = goal.j * n + goal.i;
    if (sk === gk) return [goalP];
    const g = new Float32Array(n * n).fill(Infinity);
    const came = new Int32Array(n * n).fill(-1);
    const closed = new Uint8Array(n * n);
    const heap = new MinHeap();
    g[sk] = 0;
    heap.push(sk, 0);
    const h = (k: number) => {
      const dx = Math.abs((k % n) - goal.i);
      const dz = Math.abs(Math.floor(k / n) - goal.j);
      return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) * 0.4; // admissible with path discount
    };
    let found = false;
    let expanded = 0;
    while (heap.size) {
      const k = heap.pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === gk) {
        found = true;
        break;
      }
      if (++expanded > 40000) break;
      const ci = k % n;
      const cj = Math.floor(k / n);
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
          const nk = nj * n + ni;
          if (closed[nk] || !Number.isFinite(this.cost[nk])) continue;
          // No corner cutting past impassable cells.
          if (di && dj && (!Number.isFinite(this.cost[cj * n + ni]) || !Number.isFinite(this.cost[nj * n + ci]))) continue;
          const step = this.stepCost(nk) * (di && dj ? 1.414 : 1);
          const ng = g[k] + step;
          if (ng < g[nk]) {
            g[nk] = ng;
            came[nk] = k;
            heap.push(nk, ng + h(nk));
          }
        }
    }
    if (!found) return null;
    const cells: number[] = [];
    for (let k = gk; k !== -1 && k !== sk; k = came[k]) cells.push(k);
    cells.reverse();
    const pts = cells.map((k) => this.cellCenter(k % n, Math.floor(k / n)));
    pts[pts.length - 1] = goalP;
    return this.simplify({ x: ax, z: az }, pts);
  }

  /** Drop waypoints that a straight walk can skip without crossing water or worn-path detours. */
  private simplify(start: { x: number; z: number }, pts: { x: number; z: number }[]): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    let anchor = start;
    let i = 0;
    while (i < pts.length) {
      let j = i;
      while (j + 1 < pts.length && j - i < 6 && this.clearLine(anchor, pts[j + 1])) j++;
      out.push(pts[j]);
      anchor = pts[j];
      i = j + 1;
    }
    return out;
  }

  private clearLine(a: { x: number; z: number }, b: { x: number; z: number }): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(d / (NAV_CELL * 0.5));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (!this.passable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  roadAt(x: number, z: number): number {
    const { i, j } = this.cellOf(x, z);
    return this.road[j * this.n + i];
  }

  /** Feet wear the ground. */
  tread(x: number, z: number, amount: number): void {
    const { i, j } = this.cellOf(x, z);
    const k = j * this.n + i;
    this.wear[k] = Math.min(1.5, this.wear[k] + amount);
  }

  /** Unused paths slowly grow back. */
  regrow(dt: number): void {
    const f = Math.exp(-dt / 20000);
    for (let k = 0; k < this.wear.length; k++) this.wear[k] *= f;
  }
}

class MinHeap {
  private keys: number[] = [];
  private pri: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(k: number, p: number): void {
    this.keys.push(k);
    this.pri.push(p);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.pri[parent] <= this.pri[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.keys[0];
    const lastK = this.keys.pop()!;
    const lastP = this.pri.pop()!;
    if (this.keys.length) {
      this.keys[0] = lastK;
      this.pri[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.pri[l] < this.pri[m]) m = l;
        if (r < this.keys.length && this.pri[r] < this.pri[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.pri[a], this.pri[b]] = [this.pri[b], this.pri[a]];
  }
}
