import { describe, expect, it } from 'vitest';
import { ENVIRONMENT_BY_ID } from '../src/sim/data/environments';
import { FAUNA_BY_ID } from '../src/sim/data/fauna';
import { MATERIALS } from '../src/sim/data/materials';
import { workable } from '../src/sim/discovery';
import { createWorld } from '../src/sim/world';

describe('generated world', () => {
  const w = createWorld(20261114);

  it('has every environment', () => {
    const envs = new Set(w.hexes.map((h) => h.env));
    for (const id of ENVIRONMENT_BY_ID.keys()) expect(envs.has(id), id).toBe(true);
  });

  it('holds every one of the base materials somewhere', () => {
    const found = new Set<string>();
    for (const h of w.hexes) {
      for (const id of Object.keys(h.ground)) found.add(id);
      for (const id of Object.keys(h.below)) found.add(id);
      const water = ENVIRONMENT_BY_ID.get(h.env)!.water;
      if (water) found.add(water);
    }
    for (const n of w.nodes) for (const id of Object.keys(n.stock)) found.add(id);
    const species = new Set(w.herds.map((h) => h.species));
    for (const n of w.nodes) if (n.kind === 'fixed' && n.species) species.add(n.species);
    for (const sp of species) {
      const f = FAUNA_BY_ID.get(sp)!;
      for (const id of Object.keys(f.yields)) found.add(id);
      // Kept animals start from wild stock living in the world.
      for (const id of Object.keys(f.domestic?.yields ?? {})) found.add(id);
    }
    const missing = MATERIALS.filter((m) => !found.has(m.id)).map((m) => m.id);
    expect(missing).toEqual([]);
  });

  it('keeps later materials locked until their age and knowledge', () => {
    expect(workable(w, 'flint')).toBe(true);
    expect(workable(w, 'limestone')).toBe(true); // one age ahead is within reach
    expect(workable(w, 'iron-ore')).toBe(false);
    expect(workable(w, 'uranium-ore')).toBe(false);
    expect(workable(w, 'mana-crystal')).toBe(false);
    w.discoveries.push('arcane-sight');
    expect(workable(w, 'mana-crystal')).toBe(false); // still needs the Medieval age within reach
  });
});
