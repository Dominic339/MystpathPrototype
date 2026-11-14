import { describe, expect, it } from 'vitest';
import { hash01, Rng } from '../src/sim/rng';
import { Noise2D } from '../src/sim/noise';
import { hexDistance, hexesInRadius, hexToWorld, worldToHex } from '../src/sim/hex';
import { calendar, CYCLE_SECONDS, DAY_SECONDS, DAYS_PER_SEASON, DAYS_PER_YEAR } from '../src/sim/time';
import { Heightfield } from '../src/sim/terrain';
import { createWorld, tick } from '../src/sim/world';
import { loadWorld, saveWorld } from '../src/sim/save';

describe('determinism', () => {
  it('same seed gives the same random sequence', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('hash is stable and in range', () => {
    expect(hash01(1, 2, 3)).toBe(hash01(1, 2, 3));
    for (let i = 0; i < 1000; i++) {
      const v = hash01(7, i, i * 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('noise is seeded', () => {
    expect(new Noise2D(5).fbm(1.3, 2.7)).toBe(new Noise2D(5).fbm(1.3, 2.7));
    expect(new Noise2D(5).fbm(1.3, 2.7)).not.toBe(new Noise2D(6).fbm(1.3, 2.7));
  });

  it('same seed builds the same world and history', () => {
    const a = createWorld(1234);
    const b = createWorld(1234);
    expect(a.terrain.heights).toEqual(b.terrain.heights);
    expect(a.props).toEqual(b.props);
    for (let i = 0; i < 600; i++) {
      tick(a, 0.5);
      tick(b, 0.5);
    }
    expect(a.villagers).toEqual(b.villagers);
  });
});

describe('hex grid', () => {
  it('round-trips hex centres', () => {
    for (const h of hexesInRadius({ q: 0, r: 0 }, 6)) {
      const p = hexToWorld(h);
      expect(worldToHex(p.x, p.z)).toEqual(h);
    }
  });

  it('counts hexes in a radius', () => {
    expect(hexesInRadius({ q: 0, r: 0 }, 2)).toHaveLength(19);
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -1 })).toBe(3);
  });
});

describe('game clock', () => {
  it('follows the design timings', () => {
    expect(CYCLE_SECONDS).toBe(1200); // 20 real minutes per day + night
    expect(calendar(0).isDay).toBe(true);
    expect(calendar(DAY_SECONDS + 1).isDay).toBe(false);
    expect(calendar(CYCLE_SECONDS * DAYS_PER_SEASON).season).toBe('Summer');
    expect(calendar(CYCLE_SECONDS * DAYS_PER_YEAR).year).toBe(2);
    expect((CYCLE_SECONDS * DAYS_PER_YEAR) / 60).toBe(800); // a year is 800 minutes
  });
});

describe('terrain', () => {
  it('flattens ground for building', () => {
    const t = new Heightfield(65, 64);
    for (let k = 0; k < t.heights.length; k++) t.heights[k] = Math.sin(k) * 3;
    t.flatten(0, 0, 6, 1.5, 2);
    expect(t.sample(0, 0)).toBeCloseTo(1.5, 5);
    expect(t.sample(3, 2)).toBeCloseTo(1.5, 5);
  });
});

describe('save and load', () => {
  it('round-trips a world exactly', () => {
    const w = createWorld(99);
    for (let i = 0; i < 100; i++) tick(w, 0.5);
    const restored = loadWorld(JSON.parse(JSON.stringify(saveWorld(w))));
    expect(restored.terrain.heights).toEqual(w.terrain.heights);
    expect(restored.villagers).toEqual(w.villagers);
    for (let i = 0; i < 200; i++) {
      tick(w, 0.5);
      tick(restored, 0.5);
    }
    expect(restored.villagers).toEqual(w.villagers);
  });
});
