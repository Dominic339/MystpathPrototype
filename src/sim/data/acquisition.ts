// How each base material is acquired. Every method draws on one kind of source:
//   ground    — the hex's ground pool (stones, clay, sand, salt…)
//   plant     — a wild plant (a tree, bush, stand or patch)
//   herd      — a wild animal herd that must be found, stalked and caught
//   shoal     — a fish shoal in a river, lake or sea
//   fixed     — a fixed animal source: a wild hive, bird nests, a shellfish bed
//   water     — open water, which never runs out
//   below     — deposits underground (quarries, mines, drills)
//   farm      — crops villagers have planted (needs a farming discovery)
//   livestock — animals villagers keep (needs husbandry and a herd started from wild stock)
// Hand methods need no facility. Facility methods need a discovery and come with the
// building phase. Yields are units per work cycle; a cycle is `seconds` of game time.

import type { EraId } from './eras';
import type { JobId } from './jobs';

export type Source = 'ground' | 'plant' | 'herd' | 'shoal' | 'fixed' | 'water' | 'below' | 'farm' | 'livestock';

export interface AcquisitionMethod {
  id: string;
  name: string;
  job: JobId;
  era: EraId;
  /** null = done by hand, no facility needed. */
  facility: string | null;
  source: Source;
  /** Only these species (plant or animal ids), if set. */
  species?: readonly string[];
  seconds: number;
  /** Most a villager takes per cycle, per material (limited by what the source holds). */
  yields: Readonly<Record<string, number>>;
  /** Discoveries needed before villagers can do this. */
  requires: readonly string[];
}

type Opts = { species?: string[]; requires?: string[] };
const a = (id: string, name: string, job: JobId, era: EraId, facility: string | null, source: Source, seconds: number, yields: Record<string, number>, o: Opts = {}): AcquisitionMethod => ({
  id, name, job, era, facility, source, species: o.species, seconds, yields, requires: o.requires ?? [],
});

const HG = 'hunter-gatherer';

export const ACQUISITION: readonly AcquisitionMethod[] = [
  // ---- By hand: hunter-gatherers.
  // From wild plants
  a('forage', 'Forage', 'forager', HG, null, 'plant', 30, { berries: 4, 'wild-fruit': 4, nuts: 3, roots: 3, mushrooms: 3, 'wild-grain': 3, seaweed: 3 }),
  a('pick-wild-herbs', 'Pick wild herbs', 'forager', HG, null, 'plant', 30, { herbs: 2, 'dye-plants': 1, spices: 1 }),
  a('gather-deadwood', 'Gather deadwood', 'woodcutter', HG, null, 'plant', 35, { softwood: 2, hardwood: 2 }),
  a('cut-fibres', 'Cut reeds and fibres', 'forager', HG, null, 'plant', 30, { reeds: 3, flax: 2, hemp: 2, cotton: 2, bamboo: 2 }),
  a('scrape-resin', 'Scrape resin', 'tapper', HG, null, 'plant', 40, { resin: 1, latex: 1 }),
  a('strip-bark', 'Strip cork bark', 'woodcutter', 'stone', null, 'plant', 45, { cork: 1 }, { requires: ['stone-axes'] }),
  a('gather-spirit-wood', 'Gather fallen spirit wood', 'arcanist', HG, null, 'plant', 90, { 'spirit-wood': 0.2 }),
  // From animals
  a('hunt', 'Hunt', 'hunter', HG, null, 'herd', 60, { 'game-meat': 30, hides: 3, bone: 8, sinew: 3, 'animal-fat': 8, fur: 4, feathers: 3, wool: 2 }),
  a('hand-fishing', 'Fish by hand', 'fisher', HG, null, 'shoal', 50, { fish: 3 }),
  a('canoe-fishing', 'Fish from a canoe', 'fisher', 'stone', null, 'shoal', 50, { fish: 6 }, { requires: ['dugout-canoe'] }),
  a('gather-shellfish', 'Gather shellfish', 'fisher', HG, null, 'fixed', 40, { shellfish: 3 }, { species: ['shellfish-bed'] }),
  a('raid-wild-hive', 'Raid a wild hive', 'beekeeper', HG, null, 'fixed', 50, { honey: 1 }, { species: ['wild-bees'] }),
  a('smoke-wild-hive', 'Smoke a wild hive', 'beekeeper', 'stone', null, 'fixed', 40, { honey: 3 }, { species: ['wild-bees'], requires: ['bee-smoking'] }),
  a('collect-eggs', 'Collect eggs from nests', 'forager', HG, null, 'fixed', 30, { eggs: 2, feathers: 1 }, { species: ['nesting-birds'] }),
  // From the ground and water
  a('collect-stones', 'Collect stones', 'stone-gatherer', HG, null, 'ground', 30, { stone: 2, flint: 1, obsidian: 1, pumice: 1, basalt: 1, gravel: 3, 'meteoric-iron': 0.05, 'hover-stone': 0.05 }),
  a('dig-by-hand', 'Dig by hand', 'digger', HG, null, 'ground', 40, { clay: 2, sand: 3, silt: 3, peat: 2, chalk: 2, saltpeter: 1, borax: 1, sulfur: 1, bitumen: 1, 'rock-salt': 1, gypsum: 1 }),
  a('beachcomb', 'Comb beaches and riverbeds', 'digger', HG, null, 'ground', 50, { amber: 0.2, jade: 0.2, gold: 0.05, 'tin-ore': 0.1, sapphire: 0.02, 'titanium-ore': 0.05 }),
  a('collect-ice', 'Collect ice', 'digger', HG, null, 'ground', 30, { ice: 2, 'frost-shard': 0.05 }),
  a('carry-water', 'Carry water', 'water-carrier', HG, null, 'water', 20, { 'fresh-water': 2, 'salt-water': 2 }),

  // ---- Facilities: from the Stone era onward, built in the building phase.
  a('logging', 'Logging', 'woodcutter', 'stone', 'logging-camp', 'plant', 60, { softwood: 6, hardwood: 5, bamboo: 6, cork: 2 }, { requires: ['stone-axes'] }),
  a('tapping', 'Tapping', 'tapper', 'stone', 'tapping-grove', 'plant', 60, { resin: 4, latex: 4 }, { requires: ['resin-tapping'] }),
  a('quarrying', 'Quarrying', 'quarrier', 'stone', 'quarry', 'below', 60, { stone: 8, limestone: 8, sandstone: 8, marble: 4, slate: 6, basalt: 6, chalk: 8, gypsum: 6, feldspar: 4, kaolin: 4, flint: 4 }, { requires: ['quarrying'] }),
  a('sand-quarrying', 'Sand quarrying', 'digger', 'stone', 'sand-quarry', 'below', 60, { sand: 12, gravel: 12, silt: 8 }, { requires: ['quarrying'] }),
  a('clay-digging', 'Clay digging', 'digger', 'stone', 'clay-pit', 'below', 60, { clay: 10, kaolin: 6 }, { requires: ['clay-working'] }),
  a('peat-cutting', 'Peat cutting', 'digger', 'stone', 'peat-cutting', 'below', 60, { peat: 10 }, { requires: ['peat-cutting'] }),
  a('panning', 'Panning', 'digger', 'stone', 'panning-station', 'ground', 60, { gold: 0.6, 'tin-ore': 2, sapphire: 0.3, jade: 0.5, 'titanium-ore': 1 }, { requires: ['panning'] }),
  a('tar-digging', 'Tar digging', 'digger', 'stone', 'tar-pit', 'ground', 60, { bitumen: 8 }, { requires: ['pitch-gathering'] }),
  a('well-drawing', 'Draw from a well', 'water-carrier', 'stone', 'well', 'water', 30, { 'fresh-water': 10 }, { requires: ['wells'] }),
  a('lodge-hunting', 'Organised hunting', 'hunter', 'stone', 'hunting-lodge', 'herd', 140, { 'game-meat': 30, hides: 6, bone: 12, sinew: 6, 'animal-fat': 10, fur: 6, feathers: 4, wool: 2 }, { requires: ['organised-hunting'] }),
  a('net-fishing', 'Net fishing', 'fisher', 'stone', 'fishing-hut', 'shoal', 60, { fish: 8 }, { requires: ['net-fishing'] }),
  a('herding', 'Herding sheep and goats', 'herder', 'stone', 'pasture', 'livestock', 120, { wool: 6, milk: 4, hides: 1, 'game-meat': 3 }, { species: ['wild-goat', 'mouflon'], requires: ['sheep-herding'] }),
  a('pig-keeping', 'Keeping pigs', 'herder', 'stone', 'pigsty', 'livestock', 120, { 'game-meat': 6, 'animal-fat': 3, hides: 1 }, { species: ['wild-boar'], requires: ['pig-farming'] }),
  a('poultry-keeping', 'Keeping chickens', 'herder', 'stone', 'chicken-coop', 'livestock', 120, { eggs: 6, feathers: 3, poultry: 3 }, { species: ['junglefowl'], requires: ['poultry-farming'] }),
  a('cattle-keeping', 'Keeping cattle', 'herder', 'iron', 'cattle-pasture', 'livestock', 120, { milk: 8, 'game-meat': 6, hides: 2, bone: 3 }, { species: ['aurochs'], requires: ['cattle-herding'] }),
  a('grain-farming', 'Grain farming', 'farmer', 'stone', 'farm', 'farm', 120, { 'wild-grain': 15, roots: 12 }, { requires: ['agriculture'] }),
  a('fibre-farming', 'Fibre farming', 'farmer', 'stone', 'fibre-field', 'farm', 120, { flax: 8, cotton: 8, hemp: 8 }, { requires: ['fibre-crops'] }),
  a('herb-growing', 'Herb growing', 'farmer', 'stone', 'herb-garden', 'farm', 120, { herbs: 6, 'dye-plants': 4 }, { requires: ['herb-gardening'] }),
  a('spice-growing', 'Spice growing', 'farmer', 'iron', 'spice-plantation', 'farm', 120, { spices: 5 }, { requires: ['spice-cultivation'] }),
  a('mushroom-growing', 'Mushroom growing', 'farmer', 'iron', 'mushroom-cellar', 'farm', 120, { mushrooms: 8 }, { requires: ['mushroom-cultivation'] }),
  a('grow-house-growing', 'Grow-house growing', 'farmer', 'renaissance', 'grow-house', 'farm', 120, { herbs: 12, spices: 4, 'dye-plants': 6 }, { requires: ['grow-houses'] }),
  a('orcharding', 'Orcharding', 'farmer', 'iron', 'orchard', 'farm', 120, { 'wild-fruit': 12, nuts: 8, berries: 8 }, { requires: ['orchards'] }),
  a('beekeeping', 'Beekeeping', 'beekeeper', 'iron', 'apiary', 'livestock', 120, { honey: 4 }, { species: ['wild-bees'], requires: ['beekeeping'] }),
  a('mining', 'Mining', 'miner', 'iron', 'mine', 'below', 90, {
    'iron-ore': 6, 'copper-ore': 6, 'tin-ore': 4, 'lead-ore': 5, 'zinc-ore': 5, 'silver-ore': 3, gold: 1, coal: 8, lignite: 8, graphite: 3, quartz: 4, mica: 4,
    fluorite: 3, barite: 4, 'rock-salt': 6, phosphate: 5, cinnabar: 2, 'manganese-ore': 4, chromite: 3, amethyst: 1, ruby: 0.5, sapphire: 0.5, emerald: 0.5,
    'mana-crystal': 1, 'hover-stone': 1, 'ember-stone': 0.8,
  }, { requires: ['mining'] }),
  a('evaporating', 'Evaporating brine', 'digger', 'iron', 'evaporation-pond', 'water', 120, { 'rock-salt': 6, potash: 3, 'lithium-ore': 2, borax: 2 }, { requires: ['brine-evaporation'] }),
  a('ice-cutting', 'Ice cutting', 'digger', 'iron', 'ice-cutting', 'ground', 60, { ice: 15, 'frost-shard': 0.3 }, { requires: ['ice-cutting'] }),
  a('grove-tending', 'Tend a sacred grove', 'arcanist', 'medieval', 'grove-shrine', 'plant', 180, { 'spirit-wood': 1, herbs: 2 }, { species: ['spirit-tree'], requires: ['sacred-groves'] }),
  a('deep-mining', 'Deep mining', 'miner', 'industrial', 'deep-mine', 'below', 120, { 'nickel-ore': 4, 'tungsten-ore': 2, 'cobalt-ore': 2, 'platinum-ore': 0.5, 'uranium-ore': 1, 'rare-earth-ore': 1, diamond: 0.3, 'moonsilver-ore': 0.3, 'titanium-ore': 3 }, { requires: ['deep-mining'] }),
  a('open-pit-mining', 'Open-pit mining', 'miner', 'industrial', 'open-pit-mine', 'below', 120, { bauxite: 20, 'iron-ore': 20, 'copper-ore': 16, coal: 24, lignite: 24, phosphate: 18, potash: 16, 'lithium-ore': 6 }, { requires: ['open-pit-mining'] }),
  a('pumping', 'Pumping', 'water-carrier', 'industrial', 'water-pump', 'water', 30, { 'fresh-water': 40, 'salt-water': 40 }, { requires: ['steam-pumps'] }),
  a('oil-drilling', 'Oil drilling', 'driller', 'industrial', 'oil-derrick', 'below', 120, { 'crude-oil': 10 }, { requires: ['oil-drilling'] }),
  a('gas-drilling', 'Gas drilling', 'driller', 'industrial', 'gas-well', 'below', 120, { 'natural-gas': 10 }, { requires: ['gas-drilling'] }),
];

export const METHOD_BY_ID: ReadonlyMap<string, AcquisitionMethod> = new Map(ACQUISITION.map((m) => [m.id, m]));

/** All methods that can yield a given material. */
export function methodsFor(materialId: string): AcquisitionMethod[] {
  return ACQUISITION.filter((m) => m.yields[materialId] !== undefined);
}
