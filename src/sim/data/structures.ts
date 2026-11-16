// Structures: everything villagers build. Each is a *line* that grows through the ages — a
// building is put up at its first tier and later upgraded in place, keeping its spot, its
// workers and its owner, while its model, capacity and speed change. A smelter starts as a
// clay bloomery and ends as a foundry; a canoe-builder's yard grows into a shipyard.
//
// Tiers name the facilities (from facilities.ts) whose methods and recipes they provide; a
// tier keeps everything the tiers below it provided.

import type { EraId } from './eras';
import type { JobId } from './jobs';

export type StructureKind = 'housing' | 'storage' | 'acquisition' | 'processing' | 'vehicles' | 'port' | 'civic';

/** Where a line can be built. */
export type Site =
  | 'camp' // near the town centre
  | 'meadow' // open, flat ground
  | 'forest' // among trees
  | 'rocky' // rocky or hilly ground, stone to hand
  | 'bank' // on the riverbank or lake shore
  | 'water' // at the water's edge, partly over it
  | 'clay' // where the ground holds clay
  | 'sand'
  | 'sulfur' // sulfur vents and crusts (volcanic ground)
  | 'salts' // saltpetre, borax, potash or rock salt in the ground
  | 'peat'
  | 'tar'
  | 'below' // over a deposit worth mining
  | 'hills';

export interface Tier {
  era: EraId;
  name: string;
  requires: readonly string[];
  /** Facilities this tier adds (methods and recipes). */
  facilities: readonly string[];
  build: Readonly<Record<string, number>>;
  /** Builder work in game seconds. */
  seconds: number;
  workers: number;
  /** Work speed multiplier for its facilities. */
  speed: number;
  /** Model id for the renderer. */
  model: string;
  /** People housed. */
  housing?: number;
  /** Food storage it provides (preservation.ts). */
  storage?: string;
}

export interface Line {
  id: string;
  name: string;
  kind: StructureKind;
  site: Site;
  /** The job that builds and runs it. */
  job: JobId;
  tiers: readonly Tier[];
}

type T = Omit<Tier, 'facilities' | 'speed' | 'workers'> & { facilities?: string[]; speed?: number; workers?: number };
const t = (era: EraId, name: string, requires: string[], build: Record<string, number>, seconds: number, model: string, extra: Partial<T> = {}): Tier => ({
  era, name, requires, build, seconds, model, facilities: extra.facilities ?? [], speed: extra.speed ?? 1, workers: extra.workers ?? 2, housing: extra.housing, storage: extra.storage,
});
const line = (id: string, name: string, kind: StructureKind, site: Site, job: JobId, tiers: Tier[]): Line => ({ id, name, kind, site, job, tiers });

// Shorthands for common costs.
const HUT = { softwood: 8, reeds: 10, clay: 4 };
const SHED = { softwood: 10, hardwood: 4, reeds: 8 };

export const LINES: readonly Line[] = [
  // ---------------------------------------------------------------- Housing
  line('housing', 'Homes', 'housing', 'camp', 'builder', [
    t('hunter-gatherer', 'Hide tent', [], { hides: 4, softwood: 6, cordage: 1 }, 200, 'tent', { housing: 2 }),
    t('stone', 'Roundhouse', ['wattle-and-daub'], { softwood: 10, reeds: 14, clay: 8 }, 500, 'roundhouse', { housing: 4 }),
    t('iron', 'Timber longhouse', ['timber-framing'], { lumber: 16, reeds: 20, 'cut-stone': 6 }, 900, 'longhouse', { housing: 8 }),
    t('medieval', 'Timber-framed cottage', ['masonry'], { planks: 20, 'cut-stone': 10, plaster: 6 }, 900, 'cottage', { housing: 6 }),
    t('renaissance', 'Brick townhouse', ['brickwork'], { bricks: 30, planks: 16, glass: 4 }, 1100, 'townhouse', { housing: 10 }),
    t('industrial', 'Terraced row', ['factory-system'], { bricks: 60, 'iron-ingot': 6, glass: 10 }, 1400, 'terrace', { housing: 20 }),
    t('modern', 'Apartment block', ['concrete'], { quicklime: 40, aggregate: 60, 'iron-ingot': 20, glass: 30 }, 2000, 'apartments', { housing: 60 }),
    t('techno-magic', 'Arcology spire', ['arcane-engineering'], { 'iron-ingot': 80, glass: 80, 'mana-cell': 10, 'levitation-core': 6 }, 3000, 'arcology', { housing: 200 }),
  ]),

  // ---------------------------------------------------------------- Food storage
  line('food-store', 'Food store', 'storage', 'camp', 'digger', [
    t('stone', 'Storage pits', ['storage-pits'], { reeds: 6, 'stone-tools': 1 }, 400, 'storage-pits', { storage: 'storage-pits', workers: 0 }),
    t('iron', 'Root cellar', ['root-cellar'], { 'cut-stone': 12, lumber: 8 }, 900, 'root-cellar', { storage: 'root-cellar', workers: 0 }),
  ]),
  line('cold-store', 'Cold store', 'storage', 'camp', 'mason', [
    t('iron', 'Ice house', ['ice-house'], { 'cut-stone': 20, lumber: 12, reeds: 20 }, 1200, 'ice-house', { storage: 'ice-house', workers: 0 }),
    t('medieval', 'Frost room', ['frost-box'], { 'cold-core': 2, planks: 10, 'cut-stone': 10 }, 900, 'frost-room', { storage: 'frost-box', workers: 0 }),
    t('industrial', 'Refrigerated store', ['refrigerator'], { 'iron-ingot': 10, 'copper-ingot': 6, bricks: 20 }, 1200, 'refrigerated-store', { storage: 'refrigerator', workers: 0 }),
    t('techno-magic', 'Stasis vault', ['stasis-vault'], { 'iron-ingot': 20, 'mana-cell': 4, 'cold-core': 4 }, 2400, 'stasis-vault', { storage: 'stasis-vault', workers: 0 }),
  ]),

  // ---------------------------------------------------------------- Gathering and farming
  line('logging', 'Logging', 'acquisition', 'forest', 'woodcutter', [
    t('stone', "Woodcutters' camp", ['stone-axes'], { softwood: 6, reeds: 6, 'stone-tools': 2 }, 300, 'woodcutters-camp', { facilities: ['logging-camp'], workers: 3 }),
    t('medieval', 'Logging yard', ['water-mills'], { planks: 12, 'iron-ingot': 2 }, 600, 'logging-yard', { speed: 1.6, workers: 5 }),
    t('industrial', 'Steam lumber camp', ['steam-pumps'], { 'iron-ingot': 10, planks: 10 }, 900, 'steam-lumber', { speed: 3, workers: 6 }),
    t('modern', 'Mechanised forestry', ['assembly-lines'], { 'iron-ingot': 20, fuel: 10 }, 1200, 'forestry', { speed: 5, workers: 6 }),
    t('techno-magic', "Grove-singers' lodge", ['arcane-engineering'], { 'spirit-focus': 2, planks: 20 }, 1200, 'grove-lodge', { speed: 6, workers: 4 }),
  ]),
  line('tapping', 'Tapping', 'acquisition', 'forest', 'tapper', [
    t('stone', 'Tapping grove', ['resin-tapping'], { softwood: 4, reeds: 4 }, 250, 'tapping-grove', { facilities: ['tapping-grove'] }),
    t('industrial', 'Rubber plantation', ['factory-system'], { planks: 10, 'iron-ingot': 4 }, 900, 'plantation', { speed: 3, workers: 4 }),
  ]),
  line('quarry', 'Quarry', 'acquisition', 'rocky', 'quarrier', [
    t('stone', 'Stone quarry', ['quarrying'], { softwood: 6, 'stone-tools': 3, cordage: 2 }, 400, 'quarry', { facilities: ['quarry'], workers: 4 }),
    t('iron', 'Quarry with cranes', ['timber-framing'], { lumber: 10, rope: 4, 'iron-ingot': 2 }, 700, 'quarry-crane', { speed: 1.6, workers: 6 }),
    t('industrial', 'Blasting quarry', ['steam-pumps'], { 'iron-ingot': 10, gunpowder: 6 }, 900, 'quarry-blast', { speed: 3, workers: 8 }),
  ]),
  line('sand-pit', 'Sand pit', 'acquisition', 'sand', 'digger', [
    t('stone', 'Sand and gravel pit', ['quarrying'], { softwood: 4, 'stone-tools': 2 }, 250, 'sand-pit', { facilities: ['sand-quarry'], workers: 3 }),
    t('industrial', 'Gravel works', ['steam-pumps'], { 'iron-ingot': 8, bricks: 10 }, 800, 'gravel-works', { speed: 3, workers: 6 }),
  ]),
  line('sulfur', 'Sulfur works', 'acquisition', 'sulfur', 'digger', [
    t('iron', 'Sulfur diggings', ['mining'], { lumber: 6, 'stone-tools': 2 }, 400, 'sulfur-diggings', { facilities: ['sulfur-works'], workers: 3 }),
    t('industrial', 'Sulfur works', ['steam-pumps'], { bricks: 20, 'iron-ingot': 6 }, 900, 'sulfur-works', { speed: 3, workers: 6 }),
  ]),
  line('diggings', 'Mineral diggings', 'acquisition', 'salts', 'digger', [
    t('iron', 'Mineral diggings', ['mining'], { lumber: 6, 'stone-tools': 2 }, 400, 'mineral-diggings', { facilities: ['mineral-pit'], workers: 3 }),
    t('industrial', 'Mineral works', ['steam-pumps'], { bricks: 20, 'iron-ingot': 6 }, 900, 'mineral-works', { speed: 3, workers: 6 }),
  ]),
  line('clay-pit', 'Clay pit', 'acquisition', 'clay', 'digger', [
    t('stone', 'Clay pit', ['clay-working'], { softwood: 4, 'stone-tools': 1 }, 250, 'clay-pit', { facilities: ['clay-pit'] }),
    t('industrial', 'Brickfield clay works', ['factory-system'], { bricks: 20, 'iron-ingot': 4 }, 800, 'clay-works', { speed: 3, workers: 5 }),
  ]),
  line('peat', 'Peat cutting', 'acquisition', 'peat', 'digger', [t('stone', 'Peat cuttings', ['peat-cutting'], { softwood: 3, 'stone-tools': 1 }, 200, 'peat-cutting', { facilities: ['peat-cutting'] })]),
  line('tar', 'Tar pit', 'acquisition', 'tar', 'digger', [t('stone', 'Tar pit workings', ['pitch-gathering'], { softwood: 4 }, 200, 'tar-pit', { facilities: ['tar-pit'] })]),
  line('panning', 'Panning', 'acquisition', 'bank', 'digger', [
    t('stone', 'Panning station', ['panning'], { softwood: 4, reeds: 4 }, 200, 'panning', { facilities: ['panning-station'] }),
    t('industrial', 'Gold dredge', ['steam-pumps'], { 'iron-ingot': 12, planks: 8 }, 900, 'dredge', { speed: 4, workers: 4 }),
  ]),
  line('well', 'Water', 'acquisition', 'camp', 'water-carrier', [
    t('stone', 'Well', ['wells'], { stone: 12, softwood: 2, cordage: 1 }, 300, 'well', { facilities: ['well'], workers: 1 }),
    t('medieval', 'Well house', ['masonry'], { 'cut-stone': 10, planks: 6 }, 500, 'well-house', { speed: 1.5, workers: 1 }),
    t('industrial', 'Pumping station', ['steam-pumps'], { 'iron-ingot': 10, bricks: 20 }, 900, 'pump-station', { facilities: ['water-pump'], speed: 2, workers: 2 }),
    t('modern', 'Waterworks', ['electricity'], { quicklime: 20, 'iron-ingot': 20 }, 1200, 'waterworks', { speed: 4, workers: 3 }),
  ]),
  line('mine', 'Mine', 'acquisition', 'below', 'miner', [
    t('iron', 'Adit mine', ['mining'], { lumber: 12, 'stone-tools': 4, cordage: 4 }, 800, 'adit', { facilities: ['mine'], workers: 6 }),
    t('medieval', 'Shaft mine with windlass', ['water-mills'], { planks: 16, rope: 6, 'iron-ingot': 4 }, 1000, 'shaft-mine', { speed: 1.6, workers: 8 }),
    t('industrial', 'Deep mine with steam hoist', ['deep-mining'], { 'iron-ingot': 20, bricks: 20 }, 1400, 'deep-mine', { facilities: ['deep-mine'], speed: 3, workers: 12 }),
    t('modern', 'Open-pit mine', ['open-pit-mining'], { 'iron-ingot': 30, fuel: 20 }, 1600, 'open-pit', { facilities: ['open-pit-mine'], speed: 5, workers: 16 }),
    t('techno-magic', 'Mana bore', ['arcane-engineering'], { 'mana-cell': 6, 'iron-ingot': 30 }, 1600, 'mana-bore', { speed: 8, workers: 8 }),
  ]),
  line('oil', 'Oil drilling', 'acquisition', 'below', 'driller', [
    t('industrial', 'Oil derrick', ['oil-drilling'], { 'iron-ingot': 16, planks: 10 }, 1000, 'derrick', { facilities: ['oil-derrick'], workers: 4 }),
    t('modern', 'Pumpjack field', ['electricity'], { 'iron-ingot': 30 }, 1200, 'pumpjacks', { speed: 3, workers: 4 }),
  ]),
  line('gas', 'Gas drilling', 'acquisition', 'below', 'driller', [t('industrial', 'Gas well', ['gas-drilling'], { 'iron-ingot': 12 }, 900, 'gas-well', { facilities: ['gas-well'], workers: 3 })]),
  line('brine', 'Brine pans', 'acquisition', 'water', 'digger', [t('iron', 'Evaporation ponds', ['brine-evaporation'], { clay: 20, 'cut-stone': 6 }, 600, 'brine-pans', { facilities: ['evaporation-pond'] })]),
  line('ice', 'Ice cutting', 'acquisition', 'water', 'digger', [t('iron', 'Ice-cutting camp', ['ice-cutting'], { lumber: 6, rope: 2 }, 300, 'ice-camp', { facilities: ['ice-cutting'], workers: 3 })]),
  line('hunting', 'Hunting', 'acquisition', 'forest', 'hunter', [
    t('stone', 'Hunting lodge', ['organised-hunting'], { ...SHED, hides: 4 }, 400, 'hunting-lodge', { facilities: ['hunting-lodge'], workers: 4 }),
    t('medieval', 'Hunting hall', ['masonry'], { planks: 14, 'cut-stone': 6 }, 700, 'hunting-hall', { speed: 1.4, workers: 6 }),
  ]),
  line('fishing', 'Fishing', 'acquisition', 'water', 'fisher', [
    t('stone', 'Fishing hut', ['net-fishing'], { ...SHED, cordage: 3 }, 350, 'fishing-hut', { facilities: ['fishing-hut'], workers: 3 }),
    t('medieval', 'Fishing quay', ['sailing'], { planks: 16, rope: 6 }, 700, 'fishing-quay', { speed: 1.8, workers: 6 }),
    t('industrial', 'Trawler wharf', ['steam-pumps'], { 'iron-ingot': 14, planks: 10 }, 1000, 'trawler-wharf', { speed: 4, workers: 8 }),
  ]),
  line('farm', 'Farm', 'acquisition', 'meadow', 'farmer', [
    t('stone', 'Garden plots', ['agriculture'], { softwood: 4, 'stone-tools': 2 }, 300, 'garden-plots', { facilities: ['farm'], workers: 3 }),
    t('iron', 'Ploughed fields', ['ploughing'], { lumber: 6, 'iron-ingot': 2 }, 500, 'ploughed-fields', { speed: 1.8, workers: 4 }),
    t('medieval', 'Open-field farm', ['crop-rotation'], { planks: 10, 'iron-ingot': 2 }, 700, 'open-fields', { speed: 2.4, workers: 5 }),
    t('industrial', 'Mechanised farm', ['steam-pumps'], { 'iron-ingot': 12, fertilizer: 6 }, 900, 'mech-farm', { speed: 4, workers: 4 }),
    t('modern', 'Agri-complex', ['electricity'], { 'iron-ingot': 20, fuel: 10, fertilizer: 10 }, 1200, 'agri-complex', { speed: 6, workers: 4 }),
    t('techno-magic', 'Hydro-arcology farm', ['arcane-engineering'], { glass: 40, 'mana-cell': 4 }, 1600, 'hydro-farm', { speed: 10, workers: 3 }),
  ]),
  line('fibre-farm', 'Fibre fields', 'acquisition', 'meadow', 'farmer', [t('stone', 'Flax and hemp plots', ['fibre-crops'], { softwood: 4, 'stone-tools': 1 }, 300, 'fibre-plots', { facilities: ['fibre-field'], workers: 2 })]),
  line('herb-garden', 'Herb garden', 'acquisition', 'camp', 'farmer', [
    t('stone', 'Herb garden', ['herb-gardening'], { softwood: 3, reeds: 3 }, 200, 'herb-garden', { facilities: ['herb-garden'], workers: 1 }),
    t('renaissance', 'Grow house', ['grow-houses'], { glass: 20, planks: 10 }, 800, 'grow-house', { facilities: ['grow-house'], speed: 2, workers: 2 }),
  ]),
  line('orchard', 'Orchard', 'acquisition', 'meadow', 'farmer', [t('iron', 'Orchard', ['orchards'], { lumber: 4 }, 400, 'orchard', { facilities: ['orchard'] })]),
  line('spices', 'Spice plantation', 'acquisition', 'meadow', 'farmer', [t('iron', 'Spice plantation', ['spice-cultivation'], { lumber: 6 }, 500, 'spice-plantation', { facilities: ['spice-plantation'], workers: 3 })]),
  line('mushrooms', 'Mushroom cellar', 'acquisition', 'camp', 'farmer', [t('iron', 'Mushroom cellar', ['mushroom-cultivation'], { 'cut-stone': 8, lumber: 4 }, 500, 'mushroom-cellar', { facilities: ['mushroom-cellar'], workers: 1 })]),
  line('pasture', 'Pasture', 'acquisition', 'meadow', 'herder', [
    t('stone', 'Goat and sheep fold', ['sheep-herding'], { softwood: 12, cordage: 2 }, 350, 'fold', { facilities: ['pasture'] }),
    t('iron', 'Cattle pasture', ['cattle-herding'], { lumber: 10, softwood: 10 }, 500, 'cattle-pasture', { facilities: ['cattle-pasture'], workers: 3 }),
    t('industrial', 'Dairy farm', ['factory-system'], { bricks: 20, 'iron-ingot': 6 }, 900, 'dairy-farm', { speed: 3, workers: 4 }),
  ]),
  line('pigsty', 'Pigsty', 'acquisition', 'camp', 'herder', [t('stone', 'Pigsty', ['pig-farming'], { softwood: 8, reeds: 4 }, 250, 'pigsty', { facilities: ['pigsty'], workers: 1 })]),
  line('coop', 'Chicken coop', 'acquisition', 'camp', 'herder', [
    t('stone', 'Chicken coop', ['poultry-farming'], { softwood: 6, reeds: 6 }, 200, 'coop', { facilities: ['chicken-coop'], workers: 1 }),
    t('industrial', 'Poultry barn', ['factory-system'], { bricks: 16, 'iron-ingot': 4 }, 700, 'poultry-barn', { speed: 4, workers: 2 }),
  ]),
  line('apiary', 'Apiary', 'acquisition', 'meadow', 'beekeeper', [t('iron', 'Apiary', ['beekeeping'], { lumber: 6, reeds: 4 }, 300, 'apiary', { facilities: ['apiary'], workers: 1 })]),
  line('grove', 'Grove shrine', 'acquisition', 'forest', 'arcanist', [t('medieval', 'Grove shrine', ['sacred-groves'], { 'cut-stone': 8, planks: 4 }, 600, 'grove-shrine', { facilities: ['grove-shrine'], workers: 1 })]),

  // ---------------------------------------------------------------- Processing
  line('hearth', 'Cooking', 'processing', 'camp', 'cook', [
    t('stone', 'Cookhouse', ['pottery'], { ...HUT, pottery: 4 }, 400, 'cookhouse', { facilities: ['kitchen'], workers: 2 }),
    t('iron', 'Bakehouse', ['milling'], { 'cut-stone': 12, lumber: 8, bricks: 6 }, 700, 'bakehouse', { speed: 1.5, workers: 3 }),
    t('industrial', 'Cannery', ['canning'], { bricks: 30, 'iron-ingot': 10 }, 1000, 'cannery', { facilities: ['cannery'], speed: 3, workers: 6 }),
  ]),
  line('smokehouse', 'Smokehouse', 'processing', 'camp', 'cook', [t('stone', 'Smokehouse', ['smoking'], { ...HUT }, 300, 'smokehouse', { facilities: ['smokehouse'], workers: 1 })]),
  line('butcher', 'Butchery', 'processing', 'camp', 'cook', [t('stone', 'Butchering shelter', ['butchery'], { softwood: 6, reeds: 4 }, 250, 'butcher', { facilities: ['butcher'], workers: 1 })]),
  line('woodwork', 'Woodworking', 'processing', 'camp', 'carpenter', [
    t('stone', 'Log-cutting shed', ['woodworking'], { ...SHED, 'stone-tools': 2 }, 350, 'log-shed', { facilities: ['log-cutter'], workers: 2 }),
    t('medieval', 'Water sawmill', ['water-mills'], { lumber: 20, 'iron-ingot': 4, 'cut-stone': 10 }, 900, 'water-sawmill', { facilities: ['sawmill'], speed: 2, workers: 3 }),
    t('industrial', 'Steam sawmill', ['steam-pumps'], { 'iron-ingot': 14, bricks: 20 }, 1100, 'steam-sawmill', { speed: 4, workers: 4 }),
    t('modern', 'Timber factory', ['assembly-lines'], { 'iron-ingot': 24, quicklime: 20 }, 1400, 'timber-factory', { speed: 7, workers: 5 }),
  ]),
  line('masonry', 'Stoneworking', 'processing', 'rocky', 'mason', [
    t('stone', "Stonecutters' yard", ['stonecutting'], { softwood: 6, 'stone-tools': 3 }, 350, 'stone-yard', { facilities: ['stonemason'], workers: 2 }),
    t('medieval', "Masons' lodge", ['masonry'], { 'cut-stone': 16, planks: 8, 'iron-ingot': 2 }, 800, 'masons-lodge', { speed: 1.8, workers: 4 }),
    t('industrial', 'Stone works', ['steam-pumps'], { 'iron-ingot': 12, bricks: 20 }, 1000, 'stone-works', { speed: 3.5, workers: 5 }),
  ]),
  line('pottery', 'Pottery and kilns', 'processing', 'clay', 'potter', [
    t('stone', 'Pit kiln', ['pottery'], { clay: 10, softwood: 6 }, 300, 'pit-kiln', { facilities: ['kiln'], workers: 1 }),
    t('iron', 'Updraft kiln', ['lime-burning'], { bricks: 10, clay: 10, lumber: 4 }, 600, 'updraft-kiln', { facilities: ['lime-kiln'], speed: 1.6, workers: 2 }),
    t('industrial', 'Brickworks', ['factory-system'], { bricks: 40, 'iron-ingot': 6 }, 1000, 'brickworks', { speed: 4, workers: 6 }),
  ]),
  line('charcoal', 'Charcoal burning', 'processing', 'forest', 'woodcutter', [
    t('iron', 'Charcoal clamp', ['charcoal-burning'], { softwood: 10, clay: 6 }, 300, 'charcoal-clamp', { facilities: ['charcoal-kiln'], workers: 1 }),
    t('industrial', 'Coke ovens', ['steam-pumps'], { bricks: 40, 'iron-ingot': 6 }, 1000, 'coke-ovens', { facilities: ['coke-oven'], speed: 3, workers: 3 }),
  ]),
  line('smelting', 'Smelting', 'processing', 'camp', 'smelter', [
    t('iron', 'Clay bloomery', ['iron-smelting'], { clay: 16, 'cut-stone': 6, charcoal: 6 }, 600, 'bloomery', { facilities: ['bloomery', 'smelter'], workers: 2 }),
    t('medieval', 'Blast furnace', ['blast-furnaces'], { 'cut-stone': 30, bricks: 20, 'iron-ingot': 6 }, 1100, 'blast-furnace', { speed: 2, workers: 4 }),
    t('industrial', 'Foundry', ['steel'], { bricks: 60, 'iron-ingot': 20 }, 1500, 'foundry', { speed: 4, workers: 8 }),
    t('modern', 'Electric arc works', ['electricity'], { 'iron-ingot': 40, 'copper-ingot': 20, electrodes: 6 }, 1800, 'arc-works', { speed: 7, workers: 8 }),
    t('techno-magic', 'Mana-arc foundry', ['arcane-engineering'], { 'mana-cell': 8, 'iron-ingot': 40 }, 1800, 'mana-arc', { speed: 10, workers: 6 }),
  ]),
  line('mana-forge', 'Mana forge', 'processing', 'camp', 'arcanist', [t('medieval', 'Mana forge', ['mana-smelting'], { 'cut-stone': 12, 'mana-crystal': 2 }, 700, 'mana-forge', { facilities: ['mana-forge'] })]),
  line('glass', 'Glassmaking', 'processing', 'camp', 'glassblower', [
    t('iron', 'Glass furnace', ['glassmaking'], { bricks: 12, clay: 10 }, 600, 'glass-furnace', { facilities: ['glassworks'] }),
    t('industrial', 'Glassworks', ['factory-system'], { bricks: 40, 'iron-ingot': 8 }, 1000, 'glassworks', { speed: 4, workers: 6 }),
  ]),
  line('tanning', 'Tanning', 'processing', 'bank', 'tanner', [
    t('stone', 'Tanning pits', ['tanning'], { softwood: 6, 'stone-tools': 1, reeds: 4 }, 300, 'tanning-pits', { facilities: ['tannery', 'furrier'] }),
    t('medieval', 'Tannery', ['masonry'], { planks: 12, 'cut-stone': 8 }, 700, 'tannery', { speed: 1.8, workers: 3 }),
    t('industrial', 'Leather works', ['factory-system'], { bricks: 30, 'iron-ingot': 6 }, 1000, 'leather-works', { speed: 4, workers: 5 }),
  ]),
  line('weaving', 'Weaving', 'processing', 'camp', 'weaver', [
    t('stone', "Weaver's hut", ['weaving'], { ...HUT }, 350, 'weaver-hut', { facilities: ['weaver'], workers: 2 }),
    t('medieval', 'Weaving house', ['water-mills'], { planks: 14, 'cut-stone': 6 }, 700, 'weaving-house', { speed: 2, workers: 4 }),
    t('industrial', 'Textile mill', ['factory-system'], { bricks: 50, 'iron-ingot': 12, glass: 10 }, 1300, 'textile-mill', { speed: 5, workers: 10 }),
    t('modern', 'Textile factory', ['assembly-lines'], { 'iron-ingot': 24, quicklime: 20 }, 1500, 'textile-factory', { speed: 8, workers: 10 }),
  ]),
  line('ropewalk', 'Ropewalk', 'processing', 'camp', 'weaver', [t('iron', 'Ropewalk', ['ropemaking'], { lumber: 12, reeds: 10 }, 500, 'ropewalk', { facilities: ['ropewalk'] })]),
  line('dye', 'Dye works', 'processing', 'bank', 'dyer', [t('iron', 'Dye works', ['dyeing'], { lumber: 8, pottery: 6 }, 500, 'dye-works', { facilities: ['dye-works'] })]),
  line('herbalist', 'Herbalist', 'processing', 'camp', 'herbalist', [t('stone', "Herbalist's hut", ['herbal-medicine'], { ...HUT }, 300, 'herbalist-hut', { facilities: ['herbalist'], workers: 1 })]),
  line('chandlery', 'Chandlery', 'processing', 'camp', 'chandler', [t('iron', 'Chandlery', ['candle-making'], { lumber: 8, pottery: 4 }, 400, 'chandlery', { facilities: ['chandlery'], workers: 1 })]),
  line('saltworks', 'Saltworks', 'processing', 'bank', 'chemist', [t('iron', 'Salt boiling house', ['salting'], { 'cut-stone': 10, pottery: 6 }, 500, 'saltworks', { facilities: ['saltworks'] })]),
  line('mill', 'Mill', 'processing', 'bank', 'farmer', [
    t('iron', 'Hand quern house', ['milling'], { 'cut-stone': 6, lumber: 6 }, 400, 'quern-house', { facilities: ['mill'], workers: 1 }),
    t('medieval', 'Watermill', ['water-mills'], { 'cut-stone': 16, planks: 12, 'iron-ingot': 2 }, 900, 'watermill', { speed: 2.5, workers: 2 }),
    t('industrial', 'Roller mill', ['steam-pumps'], { 'iron-ingot': 16, bricks: 20 }, 1100, 'roller-mill', { speed: 5, workers: 3 }),
  ]),
  line('gems', 'Gem cutting', 'processing', 'camp', 'gemcutter', [
    t('stone', 'Carving bench', ['gem-cutting'], { softwood: 4, 'stone-tools': 2 }, 250, 'carving-bench', { facilities: ['gem-cutter'], workers: 1 }),
    t('renaissance', "Jeweller's workshop", ['brickwork'], { bricks: 10, glass: 4 }, 600, 'jeweller', { speed: 2, workers: 2 }),
  ]),
  line('chemistry', 'Chemistry', 'processing', 'camp', 'chemist', [
    t('renaissance', 'Gunpowder mill', ['gunpowder'], { 'cut-stone': 16, planks: 10 }, 900, 'powder-mill', { facilities: ['gunpowder-mill'], workers: 3 }),
    t('industrial', 'Chemical works', ['factory-system'], { bricks: 60, 'iron-ingot': 16, glass: 10 }, 1400, 'chemical-works', { facilities: ['chemical-works', 'fertilizer-works'], speed: 2, workers: 6 }),
    t('modern', 'Enrichment plant', ['electricity'], { quicklime: 60, 'iron-ingot': 40 }, 2000, 'enrichment', { facilities: ['enrichment-plant'], speed: 3, workers: 10 }),
  ]),
  line('refinery', 'Refinery', 'processing', 'camp', 'refiner', [t('industrial', 'Refinery', ['oil-drilling'], { 'iron-ingot': 30, bricks: 30 }, 1400, 'refinery', { facilities: ['refinery', 'gas-plant'], workers: 8 })]),
  line('arcane', 'Arcane workshop', 'processing', 'camp', 'arcanist', [
    t('medieval', 'Crystal attuner', ['cold-binding'], { 'cut-stone': 10, glass: 4 }, 700, 'attuner', { facilities: ['crystal-attuner'] }),
    t('renaissance', 'Levitation workshop', ['levitation'], { bricks: 16, glass: 8, 'iron-ingot': 4 }, 900, 'levitation-workshop', { facilities: ['levitation-workshop'], speed: 1.5, workers: 3 }),
  ]),

  line('workshop', 'Workshop', 'processing', 'camp', 'carpenter', [
    t('stone', "Craft workshop", ['woodworking'], { ...SHED, 'stone-tools': 2 }, 350, 'craft-workshop', { facilities: ['workshop'], workers: 2 }),
    t('iron', "Carpenter's workshop", ['timber-framing'], { lumber: 12, 'cut-stone': 4 }, 600, 'carpenter-workshop', { speed: 1.4, workers: 3 }),
    t('medieval', 'Guild workshop', ['masonry'], { planks: 14, 'cut-stone': 10 }, 800, 'guild-workshop', { speed: 1.8, workers: 4 }),
    t('renaissance', 'Printing house', ['printing'], { bricks: 16, planks: 10, 'iron-ingot': 2 }, 900, 'printing-house', { facilities: ['printing-press'], speed: 2, workers: 5 }),
    t('industrial', 'Manufactory', ['factory-system'], { bricks: 50, 'iron-ingot': 10, glass: 10 }, 1300, 'manufactory', { facilities: ['manufactory'], speed: 3, workers: 10 }),
    t('modern', 'Assembly plant', ['assembly-lines'], { 'iron-ingot': 40, quicklime: 40, glass: 20 }, 1800, 'assembly-plant', { facilities: ['assembly-plant'], speed: 5, workers: 14 }),
    t('techno-magic', 'Arcane fabricator', ['arcane-engineering'], { 'mana-cell': 6, 'iron-ingot': 30, glass: 20 }, 2000, 'fabricator', { facilities: ['fabricator'], speed: 7, workers: 8 }),
  ]),
  line('smithy', 'Smithing', 'processing', 'camp', 'smith', [
    t('iron', 'Smithy', ['blacksmithing'], { 'cut-stone': 8, lumber: 6, clay: 6 }, 500, 'smithy', { facilities: ['smithy'], workers: 2 }),
    t('medieval', 'Forge with bellows', ['blast-furnaces'], { 'cut-stone': 16, planks: 6, 'iron-ingot': 4 }, 800, 'forge', { speed: 1.8, workers: 3 }),
    t('industrial', 'Machine shop', ['steam-pumps'], { bricks: 40, 'iron-ingot': 16, glass: 6 }, 1200, 'machine-shop', { facilities: ['machine-shop'], speed: 3, workers: 8 }),
  ]),

  // ---------------------------------------------------------------- Vehicles: canoes to airships
  line('boatyard', 'Boatbuilding', 'vehicles', 'bank', 'carpenter', [
    t('stone', "Canoe-builder's yard", ['dugout-canoe'], { softwood: 6, reeds: 4, 'stone-tools': 2 }, 300, 'canoe-yard', { facilities: ['canoe-yard'], workers: 2 }),
    t('iron', 'Boatwright', ['plank-boats'], { lumber: 16, rope: 4, pitch: 4 }, 800, 'boatwright', { facilities: ['boatwright'], workers: 3 }),
    t('medieval', 'Shipyard', ['sailing'], { planks: 30, rope: 10, 'iron-ingot': 6 }, 1400, 'shipyard', { facilities: ['shipyard'], speed: 1.5, workers: 6 }),
    t('industrial', 'Steel shipyard', ['steel'], { 'iron-ingot': 40, bricks: 30 }, 2000, 'steel-shipyard', { facilities: ['steel-shipyard'], speed: 3, workers: 12 }),
  ]),
  line('airship-yard', 'Airship building', 'vehicles', 'camp', 'carpenter', [
    t('renaissance', 'Airship yard', ['airship'], { planks: 30, canvas: 10, rope: 10, 'iron-ingot': 6 }, 1600, 'airship-yard', { facilities: ['airship-yard'], workers: 6 }),
    t('industrial', 'Airship works', ['steam-pumps'], { 'iron-ingot': 40, canvas: 20 }, 2000, 'airship-works', { facilities: ['airship-works'], speed: 2, workers: 10 }),
    t('techno-magic', 'Sky dock', ['arcane-engineering'], { 'iron-ingot': 60, 'levitation-core': 10, 'mana-cell': 6 }, 2400, 'sky-dock', { speed: 4, workers: 10 }),
  ]),

  // ---------------------------------------------------------------- Infrastructure (roads are a ground layer; see world.roads)
  line('port', 'Port', 'port', 'water', 'builder', [
    t('stone', 'Canoe landing', ['dugout-canoe'], { softwood: 8, cordage: 2 }, 250, 'landing', { workers: 0 }),
    t('iron', 'Wharf', ['plank-boats'], { lumber: 20, 'cut-stone': 10 }, 700, 'wharf', { workers: 0 }),
    t('medieval', 'Harbour', ['sailing'], { 'cut-stone': 40, planks: 20 }, 1400, 'harbour', { workers: 0 }),
    t('industrial', 'Docks', ['steel'], { 'iron-ingot': 30, bricks: 40 }, 2000, 'docks', { workers: 0 }),
    t('modern', 'Container port', ['assembly-lines'], { 'iron-ingot': 60, quicklime: 60 }, 2400, 'container-port', { workers: 0 }),
  ]),
  line('skyport', 'Skyport', 'port', 'camp', 'builder', [
    t('renaissance', 'Mooring mast', ['airship'], { planks: 16, rope: 10 }, 700, 'mooring-mast', { workers: 0 }),
    t('industrial', 'Airship terminal', ['steam-pumps'], { 'iron-ingot': 24, bricks: 30 }, 1400, 'airship-terminal', { workers: 0 }),
    t('techno-magic', 'Sky harbour', ['arcane-engineering'], { 'levitation-core': 8, 'iron-ingot': 40 }, 2000, 'sky-harbour', { workers: 0 }),
  ]),
  line('railway', 'Railway', 'civic', 'camp', 'builder', [
    t('industrial', 'Railway station', ['railways'], { 'iron-ingot': 30, planks: 20, bricks: 20 }, 1400, 'rail-station', { workers: 0 }),
    t('modern', 'Electric rail station', ['electricity'], { 'iron-ingot': 40, 'copper-ingot': 20 }, 1600, 'electric-station', { workers: 0 }),
    t('techno-magic', 'Maglev terminus', ['arcane-engineering'], { 'levitation-core': 6, 'iron-ingot': 40 }, 2000, 'maglev', { workers: 0 }),
  ]),
  line('bridge', 'Bridge', 'civic', 'water', 'builder', [
    t('iron', 'Timber bridge', ['timber-framing'], { lumber: 20, rope: 4 }, 800, 'timber-bridge', { workers: 0 }),
    t('medieval', 'Stone bridge', ['masonry'], { 'cut-stone': 50 }, 1400, 'stone-bridge', { workers: 0 }),
    t('industrial', 'Iron bridge', ['steel'], { 'iron-ingot': 40 }, 1600, 'iron-bridge', { workers: 0 }),
  ]),
];

/** Road surfaces by tier (a ground layer that worn footpaths are upgraded into). */
export const ROAD_TIERS: readonly { era: EraId; name: string; requires: string | null; speed: number }[] = [
  { era: 'hunter-gatherer', name: 'Footpath', requires: null, speed: 1 },
  { era: 'stone', name: 'Trackway', requires: 'trackways', speed: 1.15 },
  { era: 'iron', name: 'Gravel road', requires: 'gravel-roads', speed: 1.3 },
  { era: 'medieval', name: 'Cobbled road', requires: 'cobbled-roads', speed: 1.45 },
  { era: 'industrial', name: 'Macadam road', requires: 'macadam', speed: 1.7 },
  { era: 'modern', name: 'Asphalt road', requires: 'asphalt', speed: 2 },
  { era: 'techno-magic', name: 'Levitation lane', requires: 'arcane-engineering', speed: 3 },
];

export const LINE_BY_ID: ReadonlyMap<string, Line> = new Map(LINES.map((l) => [l.id, l]));

/** Facilities a structure provides at a given tier (its own and every tier below). */
export function facilitiesAt(l: Line, tier: number): string[] {
  return l.tiers.slice(0, tier + 1).flatMap((x) => x.facilities);
}
