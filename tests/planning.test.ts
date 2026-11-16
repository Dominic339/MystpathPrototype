import { describe, expect, it } from 'vitest';
import { createWorld, tick } from '../src/sim/world';
import { fieldArea, FIELD_LINES, inField } from '../src/sim/fields';
import { homeOf, noiseAt, noiseOf } from '../src/sim/living';
import { distToStreets } from '../src/sim/roads';
import { relief, radiusOf } from '../src/sim/town';

describe('a planned town', () => {
  const w = createWorld(20261114);
  for (let d = 0; d < 16; d++) for (let i = 0; i < 2400; i++) tick(w, 0.5);

  it('lays out streets once the band is a village, and lanes to its outlying buildings', () => {
    expect(w.villagers.length).toBeGreaterThanOrEqual(16);
    expect(w.plan).not.toBeNull();
    expect(w.streets.some((s) => s.kind === 'main')).toBe(true);
    expect(w.streets.some((s) => s.kind === 'lane')).toBe(true);
    // No building stands in a street.
    for (const s of w.structures) expect(distToStreets(w, s.x, s.z, false)).toBeGreaterThan(0);
  }, 120000);

  it('gives farms a fenced field sized within their limits, clear of buildings', () => {
    const farms = w.structures.filter((s) => s.field);
    expect(farms.length).toBeGreaterThan(0);
    for (const f of farms) {
      const spec = FIELD_LINES[f.line];
      expect(fieldArea(f.field!)).toBeGreaterThanOrEqual(spec.min * 0.95);
      expect(fieldArea(f.field!)).toBeLessThanOrEqual(spec.max * 1.01);
      for (const o of w.structures) if (o !== f) expect(inField(f.field!, o.x, o.z)).toBe(false);
    }
  });

  it('sinks workings on a deposit and names them for it', () => {
    const workings = w.structures.filter((s) => ['mine', 'quarry', 'sand-pit', 'clay-pit'].includes(s.line));
    expect(workings.length).toBeGreaterThan(0);
    for (const s of workings) expect(s.deposit).toBeTruthy();
  });

  it('houses people, and noise falls away from where the work is', () => {
    const housed = w.villagers.filter((v) => homeOf(w, v)).length;
    expect(housed).toBeGreaterThan(w.villagers.length * 0.7);
    const loud = w.structures.filter((s) => s.tier >= 0).sort((a, b) => noiseOf(b) - noiseOf(a))[0];
    expect(noiseAt(w, loud.x + 1, loud.z)).toBeGreaterThan(noiseAt(w, loud.x + 80, loud.z + 80));
  });

  it('only builds where a footing can take up the slope', () => {
    for (const s of w.structures.filter((x) => x.id > 8)) expect(relief(w, s.x, s.z, radiusOf(s))).toBeLessThanOrEqual(0.35 * radiusOf(s) + 0.71);
  });
});
