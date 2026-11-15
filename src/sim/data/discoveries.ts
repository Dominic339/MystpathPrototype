// Discoveries that unlock ways of acquiring materials. The full tech tree (every invention,
// hidden as a web) grows from here; these are the entries the resource system depends on.
// Villagers make discoveries; nothing here is unlocked by the player directly.

import type { EraId } from './eras';

export interface Discovery {
  id: string;
  name: string;
  era: EraId;
  requires: readonly string[];
  /** What it means in the world, for the tech web and tooltips. */
  description: string;
}

const d = (id: string, name: string, era: EraId, requires: string[], description: string): Discovery => ({ id, name, era, requires, description });

export const DISCOVERIES: readonly Discovery[] = [
  // Gathering skills
  d('bee-smoking', 'Bee smoking', 'stone', [], 'Calm wild bees with smoke to take far more honey and wax from wild hives.'),
  d('stone-axes', 'Stone axes', 'stone', [], 'Hafted stone axes make felling trees practical: logging camps.'),
  d('resin-tapping', 'Resin tapping', 'stone', [], 'Scoring trees to collect resin and latex steadily: tapping groves.'),
  d('quarrying', 'Quarrying', 'stone', ['stone-axes'], 'Splitting rock from the ground in blocks: quarries and sand quarries.'),
  d('clay-working', 'Clay working', 'stone', [], 'Digging and preparing clay in bulk: clay pits.'),
  d('peat-cutting', 'Peat cutting', 'stone', [], 'Cutting and drying peat for fuel.'),
  d('panning', 'Panning', 'stone', [], 'Washing river gravel for gold, tin and gems.'),
  d('pitch-gathering', 'Pitch gathering', 'stone', [], 'Working tar seeps for bitumen.'),
  d('wells', 'Wells', 'stone', ['clay-working'], 'Digging down to groundwater.'),
  d('organised-hunting', 'Organised hunting', 'stone', [], 'Hunting parties working from a lodge.'),
  d('net-fishing', 'Net fishing', 'stone', [], 'Nets and traps worked from a fishing hut.'),

  // Farming and husbandry: wild sources are small; these make them large.
  d('agriculture', 'Agriculture', 'stone', [], 'Sowing and harvesting grain and roots: farms.'),
  d('fibre-crops', 'Fibre crops', 'stone', ['agriculture'], 'Growing flax, hemp and cotton for cloth and rope.'),
  d('herb-gardening', 'Herb gardening', 'stone', ['agriculture'], 'Growing herbs and dye plants in tended gardens.'),
  d('animal-husbandry', 'Animal husbandry', 'stone', [], 'Taming and keeping animals.'),
  d('poultry-farming', 'Poultry farming', 'stone', ['animal-husbandry'], 'Keeping chickens for eggs, feathers and meat: chicken coops.'),
  d('sheep-herding', 'Sheep herding', 'stone', ['animal-husbandry'], 'Herding sheep and goats for wool, hides and meat: pastures.'),
  d('beekeeping', 'Beekeeping', 'iron', ['bee-smoking'], 'Keeping bees in boxes instead of raiding wild hives: apiaries.'),
  d('orchards', 'Orchards', 'iron', ['agriculture'], 'Planting fruit and nut trees.'),
  d('spice-cultivation', 'Spice cultivation', 'iron', ['agriculture'], 'Growing spices on plantations.'),
  d('mushroom-cultivation', 'Mushroom cultivation', 'iron', ['agriculture'], 'Growing mushrooms in dark cellars.'),
  d('grow-houses', 'Grow houses', 'renaissance', ['herb-gardening'], 'Glass houses that grow herbs, spices and seedlings year-round.'),

  // Earth and water
  d('mining', 'Mining', 'iron', ['quarrying'], 'Shafts and tunnels into ore veins: mines.'),
  d('brine-evaporation', 'Brine evaporation', 'iron', [], 'Evaporating brine for salt, potash and lithium.'),
  d('ice-cutting', 'Ice cutting', 'iron', [], 'Cutting and storing ice blocks.'),
  d('sacred-groves', 'Sacred groves', 'medieval', [], 'Tending ancient groves for spirit wood.'),
  d('deep-mining', 'Deep mining', 'industrial', ['mining'], 'Deep shafts for rare ores.'),
  d('open-pit-mining', 'Open-pit mining', 'industrial', ['mining'], 'Stripping whole hillsides for bulk ore.'),
  d('steam-pumps', 'Steam pumps', 'industrial', ['wells'], 'Pumping water in quantity.'),
  d('oil-drilling', 'Oil drilling', 'industrial', ['deep-mining'], 'Drilling for crude oil.'),
  d('gas-drilling', 'Gas drilling', 'industrial', ['oil-drilling'], 'Drilling for natural gas.'),
];

export const DISCOVERY_BY_ID: ReadonlyMap<string, Discovery> = new Map(DISCOVERIES.map((x) => [x.id, x]));
