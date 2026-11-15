import { describe, expect, it } from 'vitest';
import { MATERIALS, MATERIAL_BY_ID } from '../src/sim/data/materials';
import { ACQUISITION, methodsFor } from '../src/sim/data/acquisition';
import { RECIPES, PRODUCTS, recipesUsing } from '../src/sim/data/processing';
import { FACILITIES, FACILITY_BY_ID } from '../src/sim/data/facilities';
import { ENVIRONMENTS } from '../src/sim/data/environments';
import { ERAS, eraIndex } from '../src/sim/data/eras';
import { JOBS } from '../src/sim/data/jobs';
import { DISCOVERIES, DISCOVERY_BY_ID } from '../src/sim/data/discoveries';
import { FEATURES, FEATURE_BY_ID } from '../src/sim/data/features';

const isItem = (id: string) => MATERIAL_BY_ID.has(id) || PRODUCTS[id] !== undefined;

describe('base materials', () => {
  it('has 103 unique materials', () => {
    expect(MATERIALS).toHaveLength(103);
    expect(new Set(MATERIALS.map((m) => m.id)).size).toBe(103);
  });

  it('every material can be acquired', () => {
    const missing = MATERIALS.filter((m) => methodsFor(m.id).length === 0).map((m) => m.id);
    expect(missing).toEqual([]);
  });

  it('every material can be processed', () => {
    const missing = MATERIALS.filter((m) => recipesUsing(m.id).length === 0).map((m) => m.id);
    expect(missing).toEqual([]);
  });

  it('every wild material occurs in the world (tile pools or world features)', () => {
    const found = new Set<string>();
    for (const e of ENVIRONMENTS) for (const id of [...Object.keys(e.surface), ...Object.keys(e.subsurface)]) found.add(id);
    for (const f of FEATURES) for (const id of Object.keys(f.yields)) found.add(id);
    expect(MATERIALS.filter((m) => !m.farmedOnly && !found.has(m.id)).map((m) => m.id)).toEqual([]);
  });

  it('farmable organics come from features or farming, not endless tile pools', () => {
    for (const e of ENVIRONMENTS) for (const id of ['honey', 'eggs', 'feathers', 'poultry']) expect(e.surface[id], `${e.id}: ${id}`).toBeUndefined();
    // Large-scale sources need discoveries.
    for (const id of ['honey', 'eggs', 'feathers', 'poultry', 'herbs', 'wool']) {
      const bulk = ACQUISITION.filter((a) => a.facility && a.yields[id]);
      expect(bulk.length, id).toBeGreaterThan(0);
      for (const a of bulk) expect(a.requires.length, `${a.id} needs a discovery`).toBeGreaterThan(0);
    }
  });
});

describe('references', () => {
  it('environment pools only name real materials', () => {
    for (const e of ENVIRONMENTS) for (const id of [...Object.keys(e.surface), ...Object.keys(e.subsurface)]) expect(MATERIAL_BY_ID.has(id), `${e.id}: ${id}`).toBe(true);
  });

  it('acquisition methods are consistent', () => {
    for (const a of ACQUISITION) {
      if (a.facility) {
        const fac = FACILITY_BY_ID.get(a.facility);
        expect(fac, a.id).toBeDefined();
        expect(fac!.kind).toBe('acquisition');
        expect(eraIndex(fac!.era)).toBeLessThanOrEqual(eraIndex(a.era));
      }
      expect(JOBS).toContain(a.job);
      for (const id of Object.keys(a.yields)) expect(MATERIAL_BY_ID.has(id), `${a.id}: ${id}`).toBe(true);
    }
  });

  it('recipes are consistent', () => {
    for (const r of RECIPES) {
      const fac = FACILITY_BY_ID.get(r.facility);
      expect(fac, r.id).toBeDefined();
      expect(fac!.kind).toBe('processing');
      expect(ERAS).toContain(r.era);
      for (const id of [...Object.keys(r.inputs), ...Object.keys(r.outputs)]) expect(isItem(id), `${r.id}: ${id}`).toBe(true);
    }
  });

  it('discoveries and feature references resolve', () => {
    for (const a of ACQUISITION) {
      for (const r of a.requires) expect(DISCOVERY_BY_ID.has(r), `${a.id}: ${r}`).toBe(true);
      if (a.feature) expect(FEATURE_BY_ID.has(a.feature), a.id).toBe(true);
      // Every facility method is gated by a discovery.
      if (a.facility) expect(a.requires.length, a.id).toBeGreaterThan(0);
    }
    for (const d of DISCOVERIES) for (const r of d.requires) {
      const pre = DISCOVERY_BY_ID.get(r);
      expect(pre, `${d.id}: ${r}`).toBeDefined();
      expect(eraIndex(pre!.era)).toBeLessThanOrEqual(eraIndex(d.era));
    }
    for (const e of ENVIRONMENTS) for (const f of Object.keys(e.features)) expect(FEATURE_BY_ID.has(f), `${e.id}: ${f}`).toBe(true);
  });

  it('includes the facilities the design names', () => {
    for (const id of ['mine', 'quarry', 'sand-quarry', 'log-cutter', 'stonemason', 'logging-camp', 'smelter', 'mana-forge', 'bloomery']) expect(FACILITY_BY_ID.has(id), id).toBe(true);
    expect(FACILITIES.length).toBeGreaterThan(50);
  });

  it('iron has parallel coal and mana paths', () => {
    const iron = RECIPES.filter((r) => r.outputs['iron-ingot']);
    expect(iron.some((r) => r.inputs['mana-crystal'])).toBe(true);
    expect(iron.some((r) => r.inputs.charcoal || r.inputs.coke)).toBe(true);
  });
});
