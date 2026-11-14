// Deterministic randomness. Everything random in the simulation flows from a world seed,
// so the same seed always produces the same world and the same history.

/** Mulberry32: a small, fast, seedable PRNG. Returns floats in [0, 1). */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Current internal state, for saving. */
  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }
}

/** Stateless integer hash → [0, 1). Use for per-location values that must not depend on call order. */
export function hash01(seed: number, a: number, b = 0, c = 0): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (a | 0), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ (b | 0), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ (c | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Derive an independent sub-seed (e.g. one for terrain, one for villagers) from a world seed. */
export function subSeed(seed: number, channel: number): number {
  return Math.floor(hash01(seed, channel, 0x51ed) * 4294967296) >>> 0;
}
