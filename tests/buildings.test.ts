import { describe, expect, it } from 'vitest';
import { LINES } from '../src/sim/data/structures';
import { buildingGeometry, hasModel, townStyle, STYLE_COUNT } from '../src/render/buildings';

describe('buildings through the ages', () => {
  it('every tier of every building has its own model', () => {
    const missing = LINES.flatMap((l) => l.tiers.filter((t) => !hasModel(t.model)).map((t) => `${l.id}:${t.model}`));
    expect(missing).toEqual([]);
  });

  it('every model builds cleanly in every town style and variant', () => {
    const models = [...new Set(LINES.flatMap((l) => l.tiers.map((t) => [t.model, l.kind] as const)).map((x) => x.join('|')))];
    for (let st = 0; st < STYLE_COUNT; st += 2)
      for (const key of models) {
        const [model, kind] = key.split('|');
        const g = buildingGeometry(model, kind, townStyle(0, st), st % 4);
        const pos = g.getAttribute('position').array as Float32Array;
        expect(pos.length, model).toBeGreaterThan(0);
        expect(pos.every(Number.isFinite), model).toBe(true);
      }
  }, 120000);
});
