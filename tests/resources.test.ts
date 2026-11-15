import { describe, expect, it } from 'vitest';
import { MATERIALS, MATERIAL_BY_ID } from '../src/sim/data/materials';
import { ACQUISITION, methodsFor } from '../src/sim/data/acquisition';
import { RECIPES, PRODUCTS, recipesUsing } from '../src/sim/data/processing';
import { FACILITIES, FACILITY_BY_ID } from '../src/sim/data/facilities';
import { ENVIRONMENTS } from '../src/sim/data/environments';
import { ERAS, eraIndex } from '../src/sim/data/eras';
import { JOBS } from '../src/sim/data/jobs';
import { DISCOVERIES, DISCOVERY_BY_ID } from '../src/sim/data/discoveries';
import { FLORA, FLORA_BY_ID } from '../src/sim/data/flora';
import { FAUNA, FAUNA_BY_ID } from '../src/sim/data/fauna';
import { FOODS, STORAGES } from '../src/sim/data/preservation';
import { LINES, ROAD_TIERS } from '../src/sim/data/structures';

const isItem = (id: string) => MATERIAL_BY_ID.has(id) || PRODUCTS[id] !== undefined;

describe('base materials', () => {
  it('has 104 unique materials', () => {
    expect(MATERIALS).toHaveLength(104);
    expect(new Set(MATERIALS.map((m) => m.id)).size).toBe(104);
  });

  it('every material can be acquired', () => {
    const missing = MATERIALS.filter((m) => methodsFor(m.id).length === 0).map((m) => m.id);
    expect(missing).toEqual([]);
  });

  it('every material can be processed', () => {
    const missing = MATERIALS.filter((m) => recipesUsing(m.id).length === 0).map((m) => m.id);
    expect(missing).toEqual([]);
  });

  it('every wild material has a real source in the world', () => {
    const ground = new Set<string>();
    const below = new Set<string>();
    const water = new Set<string>();
    for (const e of ENVIRONMENTS) {
      for (const id of Object.keys(e.ground)) ground.add(id);
      for (const id of Object.keys(e.below)) below.add(id);
      if (e.water) water.add(e.water);
    }
    const plants = new Set(FLORA.flatMap((f) => Object.keys(f.yields)));
    const animals = new Set(FAUNA.flatMap((f) => Object.keys(f.yields)));
    const kept = new Set(FAUNA.flatMap((f) => Object.keys(f.domestic?.yields ?? {})));
    for (const m of MATERIALS) {
      const src = { ground, below, water, plant: plants, animal: m.farmedOnly ? kept : animals }[m.layer];
      const ok = src.has(m.id) || (m.layer === 'ground' && below.has(m.id)) || (m.layer === 'below' && ground.has(m.id)) || (m.layer === 'water' && ground.has(m.id));
      expect(ok, `${m.id} (${m.layer})`).toBe(true);
    }
  });

  it('nothing living sits in a tile pool', () => {
    for (const e of ENVIRONMENTS)
      for (const id of [...Object.keys(e.ground), ...Object.keys(e.below)]) {
        const layer = MATERIAL_BY_ID.get(id)!.layer;
        expect(layer === 'plant' || layer === 'animal', `${e.id}: ${id}`).toBe(false);
      }
  });

  it('kept animals and crops need discoveries', () => {
    for (const m of MATERIALS.filter((x) => x.farmedOnly)) {
      const bulk = ACQUISITION.filter((a) => a.yields[m.id]);
      expect(bulk.length, m.id).toBeGreaterThan(0);
      for (const a of bulk) expect(a.requires.length, `${a.id} needs a discovery`).toBeGreaterThan(0);
    }
    for (const a of ACQUISITION.filter((x) => x.source === 'farm' || x.source === 'livestock')) expect(a.requires.length, a.id).toBeGreaterThan(0);
    for (const f of FAUNA) if (f.domestic) expect(DISCOVERY_BY_ID.has(f.domestic.discovery), f.id).toBe(true);
    for (const f of FLORA) if (f.cultivatedBy) expect(DISCOVERY_BY_ID.has(f.cultivatedBy), f.id).toBe(true);
  });
});

describe('references', () => {
  it('environments only name real materials and species', () => {
    for (const e of ENVIRONMENTS) {
      for (const id of [...Object.keys(e.ground), ...Object.keys(e.below)]) expect(MATERIAL_BY_ID.has(id), `${e.id}: ${id}`).toBe(true);
      for (const id of Object.keys(e.flora)) expect(FLORA_BY_ID.has(id), `${e.id}: ${id}`).toBe(true);
      for (const id of Object.keys(e.fauna)) expect(FAUNA_BY_ID.has(id), `${e.id}: ${id}`).toBe(true);
    }
    for (const f of [...FLORA, ...FAUNA]) for (const id of Object.keys(f.yields)) expect(MATERIAL_BY_ID.has(id), `${f.id}: ${id}`).toBe(true);
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

  it('discovery and species references resolve', () => {
    const work = new Set([...ACQUISITION.map((a) => a.id), ...RECIPES.map((r) => r.id)]);
    for (const d of DISCOVERIES) {
      for (const w of d.inspiredBy) expect(work.has(w), `${d.id}: ${w}`).toBe(true);
      for (const s of d.needsSeen ?? []) expect(isItem(s) || FAUNA_BY_ID.has(s) || FLORA_BY_ID.has(s), `${d.id}: ${s}`).toBe(true);
    }
    for (const a of ACQUISITION) {
      for (const r of a.requires) expect(DISCOVERY_BY_ID.has(r), `${a.id}: ${r}`).toBe(true);
      for (const sp of a.species ?? []) expect(FLORA_BY_ID.has(sp) || FAUNA_BY_ID.has(sp), `${a.id}: ${sp}`).toBe(true);
      // Every facility method is gated by a discovery.
      if (a.facility) expect(a.requires.length, a.id).toBeGreaterThan(0);
    }
    for (const d of DISCOVERIES) for (const r of d.requires) {
      const pre = DISCOVERY_BY_ID.get(r);
      expect(pre, `${d.id}: ${r}`).toBeDefined();
      expect(eraIndex(pre!.era)).toBeLessThanOrEqual(eraIndex(d.era));
    }
  });

  it('food preservation is consistent', () => {
    for (const id of Object.keys(FOODS)) expect(isItem(id), id).toBe(true);
    // Every edible base material has spoilage data.
    for (const m of MATERIALS) if (m.perishable && ['plant', 'animal'].includes(m.layer) && !['hides', 'animal-fat', 'herbs'].includes(m.id)) expect(FOODS[m.id], m.id).toBeDefined();
    for (const r of RECIPES) for (const d of r.requires ?? []) expect(DISCOVERY_BY_ID.has(d), `${r.id}: ${d}`).toBe(true);
    // Every storage is provided by a structure tier, with parallel cold paths.
    for (const s of STORAGES) expect(LINES.some((l) => l.tiers.some((t) => t.storage === s.id)), s.id).toBe(true);
    for (const id of ['ice-house', 'frost-box', 'refrigerator']) expect(STORAGES.some((s) => s.id === id), id).toBe(true);
    // Preserved foods keep far longer than raw.
    expect(FOODS['dried-meat'].shelfDays).toBeGreaterThan(FOODS['game-meat'].shelfDays * 20);
  });

  it('structure lines grow through the ages and cover every facility', () => {
    const provided = new Set(LINES.flatMap((l) => l.tiers.flatMap((t) => t.facilities)));
    // The camp's own spots (fire, knapping, drying rack, bone carving) need no building.
    const camp = new Set(['campfire', 'knapping-spot', 'drying-rack', 'bone-carver']);
    for (const f of FACILITIES) if (!camp.has(f.id)) expect(provided.has(f.id), f.id).toBe(true);
    for (const l of LINES) {
      expect(JOBS).toContain(l.job);
      l.tiers.forEach((t, i) => {
        for (const id of t.facilities) expect(FACILITY_BY_ID.has(id), `${l.id}: ${id}`).toBe(true);
        for (const r of t.requires) expect(DISCOVERY_BY_ID.has(r), `${l.id}/${t.name}: ${r}`).toBe(true);
        for (const id of Object.keys(t.build)) expect(isItem(id), `${l.id}/${t.name}: ${id}`).toBe(true);
        if (i > 0) expect(eraIndex(t.era)).toBeGreaterThanOrEqual(eraIndex(l.tiers[i - 1].era));
      });
    }
    for (const r of ROAD_TIERS) if (r.requires) expect(DISCOVERY_BY_ID.has(r.requires), r.name).toBe(true);
    // Boats grow into ships, and airships have their own yards.
    for (const id of ['canoe-yard', 'boatwright', 'shipyard', 'airship-yard']) expect(provided.has(id), id).toBe(true);
    // A smelter grows from a bloomery into a foundry and beyond.
    expect(LINES.find((l) => l.id === 'smelting')!.tiers.length).toBeGreaterThanOrEqual(4);
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
