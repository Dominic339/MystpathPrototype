// Discoveries: the hidden tech web. The player never unlocks these directly. Villagers make
// them while working: each piece of work builds insight toward the discoveries it could
// inspire, faster for people whose passion or talent fits and much faster for prodigies.
// Some discoveries need the band to have met something first (you cannot discover panning
// without ever finding gold, or poultry farming without wild fowl nearby).
//
// Inventions are discoveries that describe a thing. Knowing how is not having one: an
// invention must then be built from materials before it exists in the world.

import type { EraId } from './eras';
import type { JobId } from './jobs';

export interface Build {
  inputs: Readonly<Record<string, number>>;
  seconds: number;
  job: JobId;
  /** Where it is built. */
  site: 'camp' | 'riverbank';
  /** How many the band wants. */
  want: number;
}

export interface Discovery {
  id: string;
  name: string;
  era: EraId;
  requires: readonly string[];
  /** Work that can spark it: acquisition method ids or recipe ids. */
  inspiredBy: readonly string[];
  /** The band must have met at least one of these (materials or animal species) first. */
  needsSeen?: readonly string[];
  /** For inventions: what has to be built. */
  build?: Build;
  description: string;
}

type Opts = { needsSeen?: string[]; build?: Build };
const d = (id: string, name: string, era: EraId, requires: string[], inspiredBy: string[], description: string, opts: Opts = {}): Discovery => ({ id, name, era, requires, inspiredBy, description, ...opts });

export const DISCOVERIES: readonly Discovery[] = [
  // ---- Stone era: what hunter-gatherers can work out from their own lives.
  d('bee-smoking', 'Bee smoking', 'stone', [], ['raid-wild-hive'], 'Calm wild bees with smoke to take far more honey and wax from wild hives.', { needsSeen: ['honey'] }),
  d('stone-axes', 'Stone axes', 'stone', [], ['gather-deadwood', 'knap-flint'], 'Hafted stone axes make felling trees practical: logging camps.'),
  d('resin-tapping', 'Resin tapping', 'stone', [], ['scrape-resin'], 'Scoring trees to collect resin and latex steadily: tapping groves.'),
  d('quarrying', 'Quarrying', 'stone', ['stone-axes'], ['collect-stones'], 'Splitting rock from the ground in blocks: quarries and sand quarries.'),
  d('clay-working', 'Clay working', 'stone', [], ['dig-by-hand'], 'Digging and preparing clay in bulk: clay pits.', { needsSeen: ['clay'] }),
  d('peat-cutting', 'Peat cutting', 'stone', [], ['dig-by-hand'], 'Cutting and drying peat for fuel.', { needsSeen: ['peat'] }),
  d('panning', 'Panning', 'stone', [], ['dig-by-hand', 'beachcomb'], 'Washing river gravel for gold, tin and gems.', { needsSeen: ['gold', 'tin-ore', 'jade'] }),
  d('pitch-gathering', 'Pitch gathering', 'stone', [], ['dig-by-hand'], 'Working tar seeps for bitumen.', { needsSeen: ['bitumen'] }),
  d('wells', 'Wells', 'stone', ['clay-working'], ['carry-water'], 'Digging down to groundwater.'),
  d('organised-hunting', 'Organised hunting', 'stone', [], ['hunt'], 'Hunting parties working from a lodge; dangerous animals become fair game.'),
  d('net-fishing', 'Net fishing', 'stone', [], ['hand-fishing', 'twist-sinew'], 'Nets and traps worked from a fishing hut.'),
  d('dugout-canoe', 'Dugout canoe', 'stone', ['stone-axes'], ['hand-fishing', 'gather-deadwood'], 'Hollow a log into a boat to fish open water and carry loads by river.', {
    build: { inputs: { hardwood: 10, resin: 2, 'stone-tools': 1 }, seconds: 900, job: 'carpenter', site: 'riverbank', want: 1 },
  }),

  // Farming and husbandry: wild sources are small; these make them large.
  d('agriculture', 'Agriculture', 'stone', [], ['forage'], 'Sowing and harvesting grain and roots: farms.', { needsSeen: ['wild-grain', 'roots'] }),
  d('fibre-crops', 'Fibre crops', 'stone', ['agriculture'], ['cut-fibres', 'twist-sinew'], 'Growing flax, hemp and cotton for cloth and rope.'),
  d('herb-gardening', 'Herb gardening', 'stone', ['agriculture'], ['pick-wild-herbs', 'dry-herbs'], 'Growing herbs and dye plants in tended gardens.'),
  d('animal-husbandry', 'Animal husbandry', 'stone', [], ['hunt'], 'Capturing young animals and keeping them instead of hunting them.', { needsSeen: ['wild-boar', 'wild-goat', 'mouflon', 'aurochs', 'junglefowl'] }),
  d('poultry-farming', 'Poultry farming', 'stone', ['animal-husbandry'], ['collect-eggs', 'hunt'], 'Keeping chickens for eggs, feathers and meat: chicken coops.', { needsSeen: ['junglefowl'] }),
  d('sheep-herding', 'Sheep and goat herding', 'stone', ['animal-husbandry'], ['hunt'], 'Herding sheep and goats for wool, milk and meat: pastures.', { needsSeen: ['wild-goat', 'mouflon'] }),
  d('pig-farming', 'Pig farming', 'stone', ['animal-husbandry'], ['hunt'], 'Keeping pigs bred from wild boar: pigsties.', { needsSeen: ['wild-boar'] }),

  // ---- Iron era
  d('cattle-herding', 'Cattle herding', 'iron', ['animal-husbandry'], ['hunt', 'herding'], 'Taming aurochs into cattle for milk, meat, hides and pulling.', { needsSeen: ['aurochs'] }),
  d('beekeeping', 'Beekeeping', 'iron', ['bee-smoking'], ['smoke-wild-hive'], 'Keeping bees in boxes instead of raiding wild hives: apiaries.'),
  d('orchards', 'Orchards', 'iron', ['agriculture'], ['forage', 'grain-farming'], 'Planting fruit and nut trees.'),
  d('spice-cultivation', 'Spice cultivation', 'iron', ['agriculture'], ['forage', 'herb-growing'], 'Growing spices on plantations.', { needsSeen: ['spices'] }),
  d('mushroom-cultivation', 'Mushroom cultivation', 'iron', ['agriculture'], ['forage'], 'Growing mushrooms in dark cellars.', { needsSeen: ['mushrooms'] }),
  d('mining', 'Mining', 'iron', ['quarrying'], ['quarrying'], 'Shafts and tunnels into ore veins: mines.'),
  d('brine-evaporation', 'Brine evaporation', 'iron', [], ['carry-water', 'dig-by-hand'], 'Evaporating brine for salt, potash and lithium.', { needsSeen: ['salt-water', 'rock-salt'] }),
  d('ice-cutting', 'Ice cutting', 'iron', [], ['collect-ice'], 'Cutting and storing ice blocks.', { needsSeen: ['ice'] }),

  // ---- Medieval and later
  d('sacred-groves', 'Sacred groves', 'medieval', [], ['forage', 'grove-tending'], 'Tending ancient groves for spirit wood.', { needsSeen: ['spirit-wood'] }),
  d('levitation', 'Levitation', 'medieval', ['mining'], ['mining', 'attune-mana'], 'Hover stone can be woken to lift weight against the ground.', { needsSeen: ['hover-stone'] }),
  d('grow-houses', 'Grow houses', 'renaissance', ['herb-gardening'], ['herb-growing'], 'Glass houses that grow herbs, spices and seedlings year-round.'),
  d('airship', 'Airship', 'renaissance', ['levitation'], ['cut-levitation-core', 'weave-canvas'], 'A canvas envelope carried aloft by levitation cores, steered by fins and a gondola.', {
    build: { inputs: { canvas: 20, 'hardwood-beams': 8, rope: 10, 'levitation-core': 4 }, seconds: 3600, job: 'carpenter', site: 'camp', want: 1 },
  }),
  d('deep-mining', 'Deep mining', 'industrial', ['mining'], ['mining'], 'Deep shafts for rare ores.'),
  d('open-pit-mining', 'Open-pit mining', 'industrial', ['mining'], ['mining'], 'Stripping whole hillsides for bulk ore.'),
  d('steam-pumps', 'Steam pumps', 'industrial', ['wells'], ['well-drawing'], 'Pumping water in quantity.'),
  d('oil-drilling', 'Oil drilling', 'industrial', ['deep-mining'], ['deep-mining', 'tar-digging'], 'Drilling for crude oil.'),
  d('gas-drilling', 'Gas drilling', 'industrial', ['oil-drilling'], ['oil-drilling'], 'Drilling for natural gas.'),
];

export const DISCOVERY_BY_ID: ReadonlyMap<string, Discovery> = new Map(DISCOVERIES.map((x) => [x.id, x]));

/** Insight a villager needs to make a discovery of this era. */
export function insightNeeded(era: EraId): number {
  const steps: Record<EraId, number> = { 'hunter-gatherer': 120, stone: 160, iron: 320, medieval: 600, renaissance: 1000, industrial: 1600, modern: 2400, 'techno-magic': 3600 };
  return steps[era];
}
