import { describe, expect, it } from 'vitest';
import { GOODS } from '../src/sim/data/goods';
import { RECIPES } from '../src/sim/data/processing';
import { MATERIALS } from '../src/sim/data/materials';
import { FACILITIES } from '../src/sim/data/facilities';
import { DISCOVERIES } from '../src/sim/data/discoveries';
import { ERAS } from '../src/sim/data/eras';

describe('final goods', () => {
  // Everything that can be made, starting from what grows, roams and lies in the ground.
  const makeable = new Set(MATERIALS.map((m) => m.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of RECIPES) if (Object.keys(r.inputs).every((i) => makeable.has(i))) for (const o of Object.keys(r.outputs)) if (!makeable.has(o)) { makeable.add(o); grew = true; }
  }

  it('every good can be made from base materials, along a full chain', () => {
    expect(GOODS.filter((g) => !makeable.has(g.id)).map((g) => g.id)).toEqual([]);
  });

  it('every recipe uses real facilities and discoveries', () => {
    const fac = new Set(FACILITIES.map((f) => f.id));
    const dis = new Set(DISCOVERIES.map((d) => d.id));
    expect(RECIPES.filter((r) => !fac.has(r.facility) || (r.requires ?? []).some((d) => !dis.has(d))).map((r) => r.id)).toEqual([]);
  });

  it('every age brings something new to use', () => {
    for (const era of ERAS) expect(GOODS.some((g) => g.era === era), era).toBe(true);
  });
});
