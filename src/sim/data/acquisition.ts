// How each base material is acquired. Early methods are by hand; later ones need a facility
// (mines for ores, quarries for stone, sand quarries, logging camps, derricks...).
// Yields are units per work cycle; a cycle's length is `seconds` of game time.

import type { EraId } from './eras';
import type { JobId } from './jobs';

export interface AcquisitionMethod {
  id: string;
  name: string;
  job: JobId;
  era: EraId;
  /** null = done by hand, no facility needed. */
  facility: string | null;
  seconds: number;
  yields: Readonly<Record<string, number>>;
  /** Discoveries needed before villagers can do this. */
  requires: readonly string[];
  /** Only works at a world feature of this kind (e.g. a wild beehive). */
  feature?: string;
}

const a = (
  id: string,
  name: string,
  job: JobId,
  era: EraId,
  facility: string | null,
  seconds: number,
  yields: Record<string, number>,
  requires: string[] = [],
  feature?: string,
): AcquisitionMethod => ({ id, name, job, era, facility, seconds, yields, requires, feature });

const HUNT = { 'game-meat': 3, hides: 1, bone: 2, sinew: 1, 'animal-fat': 1, fur: 0.5, feathers: 0.5, wool: 0.3 };

export const ACQUISITION: readonly AcquisitionMethod[] = [
  // By hand — available to hunter-gatherers.
  a('forage', 'Forage', 'forager', 'hunter-gatherer', null, 30, { berries: 3, 'wild-fruit': 3, nuts: 3, roots: 2, herbs: 1, mushrooms: 2, 'wild-grain': 2, seaweed: 3, 'dye-plants': 1, spices: 0.3 }),
  // Wild hives and nests are few, small and slow to recover.
  a('raid-wild-hive', 'Raid a wild hive', 'beekeeper', 'hunter-gatherer', null, 50, { honey: 1 }, [], 'wild-hive'),
  a('smoke-wild-hive', 'Smoke a wild hive', 'beekeeper', 'stone', null, 40, { honey: 3 }, ['bee-smoking'], 'wild-hive'),
  a('collect-eggs', 'Collect eggs from nests', 'forager', 'hunter-gatherer', null, 30, { eggs: 2, feathers: 1 }, [], 'bird-nests'),
  a('pick-wild-herbs', 'Pick wild herbs', 'forager', 'hunter-gatherer', null, 30, { herbs: 2, 'dye-plants': 1 }, [], 'herb-patch'),
  a('gather-deadwood', 'Gather deadwood', 'woodcutter', 'hunter-gatherer', null, 35, { softwood: 1, hardwood: 1 }),
  a('cut-fibres', 'Cut reeds and fibres', 'forager', 'hunter-gatherer', null, 30, { reeds: 3, flax: 2, hemp: 2, cotton: 2, bamboo: 1 }),
  a('collect-stones', 'Collect stones', 'stone-gatherer', 'hunter-gatherer', null, 30, { stone: 2, flint: 1, obsidian: 1, pumice: 1, gravel: 3, 'meteoric-iron': 0.05 }),
  a('dig-by-hand', 'Dig by hand', 'digger', 'hunter-gatherer', null, 40, { clay: 2, sand: 3, silt: 3, peat: 2, saltpeter: 1, borax: 1, sulfur: 1, bitumen: 1, 'rock-salt': 1, gypsum: 1 }),
  a('carry-water', 'Carry water', 'water-carrier', 'hunter-gatherer', null, 20, { 'fresh-water': 2, 'salt-water': 2 }),
  a('hand-fishing', 'Fish by hand', 'fisher', 'hunter-gatherer', null, 60, { fish: 1, shellfish: 2 }),
  a('hunt', 'Hunt', 'hunter', 'hunter-gatherer', null, 140, HUNT),
  a('scrape-resin', 'Scrape resin', 'tapper', 'hunter-gatherer', null, 40, { resin: 1, latex: 1 }),
  a('beachcomb', 'Comb beaches and riverbeds', 'digger', 'hunter-gatherer', null, 50, { amber: 0.2, jade: 0.2, gold: 0.05 }),
  a('collect-ice', 'Collect ice', 'digger', 'hunter-gatherer', null, 30, { ice: 2, 'frost-shard': 0.05 }),
  a('strip-bark', 'Strip bark', 'woodcutter', 'stone', null, 45, { cork: 1 }, ['stone-axes']),

  // Facilities — from the Stone era onward.
  a('logging', 'Logging', 'woodcutter', 'stone', 'logging-camp', 60, { softwood: 6, hardwood: 5, bamboo: 6, cork: 2 }, ['stone-axes']),
  a('tapping', 'Tapping', 'tapper', 'stone', 'tapping-grove', 60, { resin: 4, latex: 4 }, ['resin-tapping']),
  a('quarrying', 'Quarrying', 'quarrier', 'stone', 'quarry', 60, { stone: 8, limestone: 8, sandstone: 8, marble: 4, slate: 6, basalt: 6, chalk: 8, gypsum: 6, feldspar: 4, kaolin: 4 }, ['quarrying']),
  a('sand-quarrying', 'Sand quarrying', 'digger', 'stone', 'sand-quarry', 60, { sand: 12, gravel: 12, silt: 8 }, ['quarrying']),
  a('clay-digging', 'Clay digging', 'digger', 'stone', 'clay-pit', 60, { clay: 10, kaolin: 6 }, ['clay-working']),
  a('peat-cutting', 'Peat cutting', 'digger', 'stone', 'peat-cutting', 60, { peat: 10 }, ['peat-cutting']),
  a('panning', 'Panning', 'digger', 'stone', 'panning-station', 60, { gold: 0.6, 'tin-ore': 2, sapphire: 0.3, jade: 0.5, 'titanium-ore': 1 }, ['panning']),
  a('tar-digging', 'Tar digging', 'digger', 'stone', 'tar-pit', 60, { bitumen: 8 }, ['pitch-gathering']),
  a('well-drawing', 'Draw from a well', 'water-carrier', 'stone', 'well', 30, { 'fresh-water': 10 }, ['wells']),
  a('lodge-hunting', 'Organised hunting', 'hunter', 'stone', 'hunting-lodge', 140, { 'game-meat': 8, hides: 3, bone: 5, sinew: 3, 'animal-fat': 3, fur: 1.5, feathers: 3, wool: 1 }, ['organised-hunting']),
  a('net-fishing', 'Net fishing', 'fisher', 'stone', 'fishing-hut', 60, { fish: 6, shellfish: 4, seaweed: 4 }, ['net-fishing']),
  a('herding', 'Herding sheep and goats', 'herder', 'stone', 'pasture', 120, { wool: 6, 'animal-fat': 2, hides: 1, 'game-meat': 3 }, ['sheep-herding']),
  a('poultry-keeping', 'Keeping chickens', 'herder', 'stone', 'chicken-coop', 120, { eggs: 6, feathers: 3, poultry: 3 }, ['poultry-farming']),
  a('grain-farming', 'Grain farming', 'farmer', 'stone', 'farm', 120, { 'wild-grain': 15, roots: 12 }, ['agriculture']),
  a('fibre-farming', 'Fibre farming', 'farmer', 'stone', 'farm', 120, { flax: 8, cotton: 8, hemp: 8 }, ['fibre-crops']),
  a('herb-growing', 'Herb growing', 'farmer', 'stone', 'herb-garden', 120, { herbs: 6, 'dye-plants': 4 }, ['herb-gardening']),
  a('spice-growing', 'Spice growing', 'farmer', 'iron', 'spice-plantation', 120, { spices: 5 }, ['spice-cultivation']),
  a('mushroom-growing', 'Mushroom growing', 'farmer', 'iron', 'mushroom-cellar', 120, { mushrooms: 8 }, ['mushroom-cultivation']),
  a('grow-house-growing', 'Grow-house growing', 'farmer', 'renaissance', 'grow-house', 120, { herbs: 12, spices: 4, 'dye-plants': 6 }, ['grow-houses']),
  a('mining', 'Mining', 'miner', 'iron', 'mine', 90, {
    'iron-ore': 6, 'copper-ore': 6, 'tin-ore': 4, 'lead-ore': 5, 'zinc-ore': 5, 'silver-ore': 3, gold: 1, coal: 8, lignite: 8, graphite: 3, quartz: 4, mica: 4,
    fluorite: 3, barite: 4, 'rock-salt': 6, phosphate: 5, cinnabar: 2, 'manganese-ore': 4, chromite: 3, amethyst: 1, ruby: 0.5, sapphire: 0.5, emerald: 0.5,
    'mana-crystal': 1, 'hover-stone': 1, 'ember-stone': 0.8,
  }, ['mining']),
  a('evaporating', 'Evaporating brine', 'digger', 'iron', 'evaporation-pond', 120, { 'rock-salt': 6, potash: 3, 'lithium-ore': 2, borax: 2 }, ['brine-evaporation']),
  a('beekeeping', 'Beekeeping', 'beekeeper', 'iron', 'apiary', 120, { honey: 4 }, ['beekeeping']),
  a('orcharding', 'Orcharding', 'farmer', 'iron', 'orchard', 120, { 'wild-fruit': 12, nuts: 8 }, ['orchards']),
  a('ice-cutting', 'Ice cutting', 'digger', 'iron', 'ice-cutting', 60, { ice: 15, 'frost-shard': 0.3 }, ['ice-cutting']),
  a('grove-tending', 'Tend a sacred grove', 'arcanist', 'medieval', 'grove-shrine', 180, { 'spirit-wood': 1, herbs: 2 }, ['sacred-groves']),
  a('deep-mining', 'Deep mining', 'miner', 'industrial', 'deep-mine', 120, { 'nickel-ore': 4, 'tungsten-ore': 2, 'cobalt-ore': 2, 'platinum-ore': 0.5, 'uranium-ore': 1, 'rare-earth-ore': 1, diamond: 0.3, 'moonsilver-ore': 0.3, 'titanium-ore': 3 }, ['deep-mining']),
  a('open-pit-mining', 'Open-pit mining', 'miner', 'industrial', 'open-pit-mine', 120, { bauxite: 20, 'iron-ore': 20, 'copper-ore': 16, coal: 24, lignite: 24, phosphate: 18, potash: 16, 'lithium-ore': 6 }, ['open-pit-mining']),
  a('pumping', 'Pumping', 'water-carrier', 'industrial', 'water-pump', 30, { 'fresh-water': 40, 'salt-water': 40 }, ['steam-pumps']),
  a('oil-drilling', 'Oil drilling', 'driller', 'industrial', 'oil-derrick', 120, { 'crude-oil': 10 }, ['oil-drilling']),
  a('gas-drilling', 'Gas drilling', 'driller', 'industrial', 'gas-well', 120, { 'natural-gas': 10 }, ['gas-drilling']),
];

/** All methods that can yield a given material. */
export function methodsFor(materialId: string): AcquisitionMethod[] {
  return ACQUISITION.filter((m) => m.yields[materialId] !== undefined);
}
