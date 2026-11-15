// Facilities: places where materials are acquired (mines, quarries, logging camps...) or
// processed (log cutters, stonemasons, smelters...). One basic facility per output, per the
// design: real chains, simplified steps. Building them comes in the building phase.

import type { EraId } from './eras';
import type { JobId } from './jobs';

export type FacilityKind = 'acquisition' | 'processing';

export interface Facility {
  id: string;
  name: string;
  kind: FacilityKind;
  era: EraId;
  job: JobId;
  /** Footprint in hexes (one hex ≈ one large building). */
  hexes: number;
  workers: number;
}

const f = (id: string, name: string, kind: FacilityKind, era: EraId, job: JobId, hexes = 1, workers = 2): Facility => ({ id, name, kind, era, job, hexes, workers });

export const FACILITIES: readonly Facility[] = [
  // Acquisition
  f('logging-camp', 'Logging camp', 'acquisition', 'stone', 'woodcutter', 1, 4),
  f('tapping-grove', 'Tapping grove', 'acquisition', 'stone', 'tapper', 1, 2),
  f('quarry', 'Quarry', 'acquisition', 'stone', 'quarrier', 2, 6),
  f('sand-quarry', 'Sand quarry', 'acquisition', 'stone', 'digger', 1, 4),
  f('clay-pit', 'Clay pit', 'acquisition', 'stone', 'digger', 1, 3),
  f('peat-cutting', 'Peat cutting', 'acquisition', 'stone', 'digger', 1, 3),
  f('mine', 'Mine', 'acquisition', 'iron', 'miner', 1, 8),
  f('deep-mine', 'Deep mine', 'acquisition', 'industrial', 'miner', 2, 12),
  f('open-pit-mine', 'Open-pit mine', 'acquisition', 'industrial', 'miner', 4, 16),
  f('panning-station', 'Panning station', 'acquisition', 'stone', 'digger', 1, 2),
  f('evaporation-pond', 'Evaporation pond', 'acquisition', 'iron', 'digger', 2, 2),
  f('well', 'Well', 'acquisition', 'stone', 'water-carrier', 1, 1),
  f('water-pump', 'Water pump', 'acquisition', 'industrial', 'water-carrier', 1, 1),
  f('oil-derrick', 'Oil derrick', 'acquisition', 'industrial', 'driller', 1, 4),
  f('gas-well', 'Gas well', 'acquisition', 'industrial', 'driller', 1, 3),
  f('tar-pit', 'Tar pit workings', 'acquisition', 'stone', 'digger', 1, 2),
  f('hunting-lodge', 'Hunting lodge', 'acquisition', 'stone', 'hunter', 1, 4),
  f('fishing-hut', 'Fishing hut', 'acquisition', 'stone', 'fisher', 1, 3),
  f('pasture', 'Pasture', 'acquisition', 'stone', 'herder', 3, 2),
  f('apiary', 'Apiary', 'acquisition', 'iron', 'beekeeper', 1, 1),
  f('farm', 'Farm', 'acquisition', 'stone', 'farmer', 3, 4),
  f('chicken-coop', 'Chicken coop', 'acquisition', 'stone', 'herder', 1, 1),
  f('herb-garden', 'Herb garden', 'acquisition', 'stone', 'farmer', 1, 1),
  f('spice-plantation', 'Spice plantation', 'acquisition', 'iron', 'farmer', 2, 3),
  f('mushroom-cellar', 'Mushroom cellar', 'acquisition', 'iron', 'farmer', 1, 1),
  f('grow-house', 'Grow house', 'acquisition', 'renaissance', 'farmer', 1, 2),
  f('orchard', 'Orchard', 'acquisition', 'iron', 'farmer', 2, 2),
  f('ice-cutting', 'Ice cutting', 'acquisition', 'iron', 'digger', 1, 3),
  f('grove-shrine', 'Grove shrine', 'acquisition', 'medieval', 'arcanist', 1, 1),

  // Processing
  f('campfire', 'Campfire', 'processing', 'hunter-gatherer', 'cook', 1, 2),
  f('knapping-spot', 'Knapping spot', 'processing', 'hunter-gatherer', 'knapper', 1, 1),
  f('drying-rack', 'Drying rack', 'processing', 'hunter-gatherer', 'tanner', 1, 1),
  f('log-cutter', 'Log cutter', 'processing', 'stone', 'carpenter', 1, 3),
  f('sawmill', 'Sawmill', 'processing', 'medieval', 'carpenter', 1, 4),
  f('stonemason', 'Stonemason', 'processing', 'stone', 'mason', 1, 3),
  f('kiln', 'Kiln', 'processing', 'stone', 'potter', 1, 2),
  f('lime-kiln', 'Lime kiln', 'processing', 'iron', 'potter', 1, 2),
  f('charcoal-kiln', 'Charcoal kiln', 'processing', 'iron', 'woodcutter', 1, 2),
  f('coke-oven', 'Coke oven', 'processing', 'industrial', 'smelter', 1, 3),
  f('bloomery', 'Bloomery', 'processing', 'iron', 'smelter', 1, 2),
  f('smelter', 'Smelter', 'processing', 'iron', 'smelter', 1, 4),
  f('mana-forge', 'Mana forge', 'processing', 'iron', 'arcanist', 1, 2),
  f('glassworks', 'Glassworks', 'processing', 'iron', 'glassblower', 1, 3),
  f('tannery', 'Tannery', 'processing', 'stone', 'tanner', 1, 2),
  f('furrier', 'Furrier', 'processing', 'stone', 'tanner', 1, 2),
  f('butcher', 'Butcher', 'processing', 'stone', 'cook', 1, 2),
  f('smokehouse', 'Smokehouse', 'processing', 'stone', 'cook', 1, 2),
  f('mill', 'Mill', 'processing', 'iron', 'farmer', 1, 2),
  f('kitchen', 'Kitchen', 'processing', 'stone', 'cook', 1, 3),
  f('weaver', 'Weaver', 'processing', 'stone', 'weaver', 1, 3),
  f('ropewalk', 'Ropewalk', 'processing', 'iron', 'weaver', 2, 2),
  f('dye-works', 'Dye works', 'processing', 'iron', 'dyer', 1, 2),
  f('herbalist', 'Herbalist', 'processing', 'stone', 'herbalist', 1, 1),
  f('chandlery', 'Chandlery', 'processing', 'iron', 'chandler', 1, 2),
  f('saltworks', 'Saltworks', 'processing', 'iron', 'chemist', 1, 2),
  f('gunpowder-mill', 'Gunpowder mill', 'processing', 'renaissance', 'chemist', 1, 3),
  f('fertilizer-works', 'Fertilizer works', 'processing', 'industrial', 'chemist', 1, 3),
  f('chemical-works', 'Chemical works', 'processing', 'industrial', 'chemist', 2, 6),
  f('refinery', 'Refinery', 'processing', 'industrial', 'refiner', 3, 8),
  f('gas-plant', 'Gas plant', 'processing', 'industrial', 'refiner', 2, 4),
  f('gem-cutter', 'Gem cutter', 'processing', 'iron', 'gemcutter', 1, 1),
  f('bone-carver', 'Bone carver', 'processing', 'hunter-gatherer', 'knapper', 1, 1),
  f('crystal-attuner', 'Crystal attuner', 'processing', 'medieval', 'arcanist', 1, 2),
  f('levitation-workshop', 'Levitation workshop', 'processing', 'renaissance', 'arcanist', 1, 3),
  f('enrichment-plant', 'Enrichment plant', 'processing', 'modern', 'chemist', 3, 10),
];

export const FACILITY_BY_ID: ReadonlyMap<string, Facility> = new Map(FACILITIES.map((x) => [x.id, x]));
