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
  /** What stands in a cell: walking through a building or a planted field costs dear (1 = open ground). */
  obstacle: Float32Array;
  /** Connected region per cell (-1 = impassable): routes between regions are impossible. */
  region: Int32Array;
  private gBuf?: Float32Array;
  private cameBuf?: Int32Array;
  private seen?: Uint32Array;
  private done?: Uint32Array;
  private stamp = 0;

  /** `water` makes a grid for boats: open water is passable, land is not. */
  constructor(terrain: Heightfield, readonly mode: 'land' | 'water' = 'land') {
    this.size = terrain.size;
    this.n = Math.floor(terrain.size / NAV_CELL);
    this.cost = new Float32Array(this.n * this.n);
    this.wear = new Float32Array(this.n * this.n);
    this.road = new Uint8Array(this.n * this.n);
    this.obstacle = new Float32Array(this.n * this.n).fill(1);
    this.region = new Int32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++)
      for (let i = 0; i < this.n; i++) {
        const { x, z } = this.cellCenter(i, j);
        const h = terrain.sample(x, z);
        const k = j * this.n + i;
        if (mode === 'water') {
          this.cost[k] = h < terrain.waterLevel - 0.45 ? 1 : Infinity;
          continue;
        }
        if (h < terrain.waterLevel + 0.12) {
          this.cost[k] = Infinity;
          continue;
        }
        const slope = terrain.slope(x, z);
        this.cost[k] = slope > 1.4 ? Infinity : 1 + slope * slope * 6;
      }
    this.labelRegions();
  }

  /** Flood-fill the passable cells into connected regions. */
  private labelRegions(): void {
    const n = this.n;
    this.region.fill(-1);
    let next = 0;
    const stack: number[] = [];
    for (let k0 = 0; k0 < n * n; k0++) {
      if (this.region[k0] !== -1 || !Number.isFinite(this.cost[k0])) continue;
      this.region[k0] = next;
      stack.push(k0);
      while (stack.length) {
        const k = stack.pop()!;
        const i = k % n;
        const j = (k - i) / n;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
          const nk = nj * n + ni;
          if (this.region[nk] === -1 && Number.isFinite(this.cost[nk])) {
            this.region[nk] = next;
            stack.push(nk);
          }
        }
      }
      next++;
    }
  }

  /**
   * Walking cost from a point to every cell (Infinity beyond `maxCost`), following paths
   * and roads like real routes do. Used to keep villagers to places within a sensible walk.
   */
  distanceField(x: number, z: number, maxCost = 160): Float32Array {
    const n = this.n;
    const dist = new Float32Array(n * n).fill(Infinity);
    const s = this.nearestPassable(x, z);
    if (!s) return dist;
    const { i, j } = this.cellOf(s.x, s.z);
    const heap = new MinHeap();
    dist[j * n + i] = 0;
    heap.push(j * n + i, 0);
    while (heap.size) {
      const k = heap.pop();
      const d = dist[k];
      if (d > maxCost) continue;
      const ci = k % n;
      const cj = (k - ci) / n;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
          const nk = nj * n + ni;
          if (!Number.isFinite(this.cost[nk])) continue;
          const nd = d + this.stepCost(nk) * (di && dj ? 1.414 : 1);
          if (nd < dist[nk]) {
            dist[nk] = nd;
            heap.push(nk, nd);
          }
        }
    }
    return dist;
  }

  /** Look up a distance field at a point (via the nearest passable cell). */
  fieldAt(field: Float32Array, x: number, z: number): number {
    const p = this.passable(x, z) ? { x, z } : this.nearestPassable(x, z);
    if (!p) return Infinity;
    const { i, j } = this.cellOf(p.x, p.z);
    return field[j * this.n + i];
  }

  regionAt(x: number, z: number): number {
    const { i, j } = this.cellOf(x, z);
    return this.region[j * this.n + i];
  }

  /** Can you get from one point to another at all? */
  connected(ax: number, az: number, bx: number, bz: number): boolean {
    const a = this.nearestPassable(ax, az);
    const b = this.nearestPassable(bx, bz);
    return !!a && !!b && this.regionAt(a.x, a.z) === this.regionAt(b.x, b.z);
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
    return this.cost[k] * (1 - 0.6 * Math.min(1, this.wear[k])) * road * this.obstacle[k];
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
    // Different regions (across water): no route, and no need to search.
    if (this.region[sk] !== this.region[gk] || this.region[sk] < 0) return null;
    // Search buffers are reused between calls; a stamp marks which entries belong to this search.
    if (!this.gBuf) {
      this.gBuf = new Float32Array(n * n);
      this.cameBuf = new Int32Array(n * n);
      this.seen = new Uint32Array(n * n);
      this.done = new Uint32Array(n * n);
    }
    const stamp = ++this.stamp;
    const gArr = this.gBuf!;
    const came = this.cameBuf!;
    const seen = this.seen!;
    const done = this.done!;
    const G = (k: number) => (seen[k] === stamp ? gArr[k] : Infinity);
    const heap = new MinHeap();
    gArr[sk] = 0;
    seen[sk] = stamp;
    came[sk] = -1;
    heap.push(sk, 0);
    const h = (k: number) => {
      const dx = Math.abs((k % n) - goal.i);
      const dz = Math.abs(Math.floor(k / n) - goal.j);
      // Weighted toward the goal: much faster on a big map, and still follows worn paths and roads.
      return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) * 0.8;
    };
    let found = false;
    let expanded = 0;
    while (heap.size) {
      const k = heap.pop();
      if (done[k] === stamp) continue;
      done[k] = stamp;
      if (k === gk) {
        found = true;
        break;
      }
      if (++expanded > 15000) break;
      const ci = k % n;
      const cj = Math.floor(k / n);
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
          const nk = nj * n + ni;
          if (done[nk] === stamp || !Number.isFinite(this.cost[nk])) continue;
          // No corner cutting past impassable cells.
          if (di && dj && (!Number.isFinite(this.cost[cj * n + ni]) || !Number.isFinite(this.cost[nj * n + ci]))) continue;
          const step = this.stepCost(nk) * (di && dj ? 1.414 : 1);
          const ng = gArr[k] + step;
          if (ng < G(nk)) {
            gArr[nk] = ng;
            seen[nk] = stamp;
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

  /** Bare soil of a planted field: looks worn, and people keep off it. */
  setField(x: number, z: number): void {
    const { i, j } = this.cellOf(x, z);
    const k = j * this.n + i;
    if (this.road[k]) return;
    this.obstacle[k] = Math.max(this.obstacle[k], 4);
  }

  /** A building's ground: people go round. */
  setBuilding(x: number, z: number, r: number): void {
    const { i, j } = this.cellOf(x, z);
    const n = Math.ceil(r / NAV_CELL);
    for (let dj = -n; dj <= n; dj++)
      for (let di = -n; di <= n; di++) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= this.n || jj >= this.n || Math.hypot(di, dj) * NAV_CELL > r) continue;
        this.obstacle[jj * this.n + ii] = 14;
      }
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
