// Discoveries: the hidden tech web. The player never unlocks these directly. Villagers make
// them while working: each piece of work builds insight toward the discoveries it could
// inspire, faster for people whose passion or talent fits and much faster for prodigies.
// Some discoveries need the band to have met something first (you cannot discover panning
// without ever finding gold, or poultry farming without wild fowl nearby).
//
// Knowing how is not having: a discovery unlocks a structure tier (structures.ts) or a recipe
// (processing.ts), and villagers still have to build it or make it from materials.

import type { EraId } from './eras';

export interface Discovery {
  id: string;
  name: string;
  era: EraId;
  requires: readonly string[];
  /** Work that can spark it: acquisition method ids or recipe ids. */
  inspiredBy: readonly string[];
  /** The band must have met at least one of these (items or species) first. */
  needsSeen?: readonly string[];
  description: string;
}

const d = (id: string, name: string, era: EraId, requires: string[], inspiredBy: string[], description: string, needsSeen?: string[]): Discovery => ({ id, name, era, requires, inspiredBy, description, needsSeen });

export const DISCOVERIES: readonly Discovery[] = [
  // ======================================================== Stone era
  // Tools and building
  d('stone-axes', 'Stone axes', 'stone', [], ['gather-deadwood', 'knap-flint'], 'Hafted stone axes make felling trees practical: woodcutters’ camps.'),
  d('wattle-and-daub', 'Wattle and daub', 'stone', [], ['dig-by-hand', 'cut-fibres'], 'Woven branches plastered with clay and thatched with reeds: roundhouses.'),
  d('woodworking', 'Woodworking', 'stone', ['stone-axes'], ['gather-deadwood', 'carve-canoe'], 'Splitting and shaping logs: log-cutting sheds.'),
  d('quarrying', 'Quarrying', 'stone', ['stone-axes'], ['collect-stones'], 'Splitting rock from the ground in blocks: quarries.'),
  d('stonecutting', 'Stonecutting', 'stone', ['quarrying'], ['collect-stones', 'shape-stone', 'quarrying'], 'Dressing stone into blocks: stonecutters’ yards.'),
  d('pottery', 'Pottery', 'stone', [], ['dig-by-hand', 'roast-roots'], 'Firing clay into pots in a pit kiln: cookhouses and kilns.', ['clay']),
  d('trackways', 'Trackways', 'stone', [], ['carry-water', 'gather-deadwood', 'collect-stones'], 'Clearing and packing the busiest footpaths into trackways.'),
  // Gathering skills
  d('resin-tapping', 'Resin tapping', 'stone', [], ['scrape-resin'], 'Scoring trees to collect resin and latex steadily: tapping groves.'),
  d('clay-working', 'Clay working', 'stone', [], ['dig-by-hand'], 'Digging and preparing clay in bulk: clay pits.', ['clay']),
  d('peat-cutting', 'Peat cutting', 'stone', [], ['dig-by-hand'], 'Cutting and drying peat for fuel.', ['peat']),
  d('panning', 'Panning', 'stone', [], ['dig-by-hand', 'beachcomb'], 'Washing river gravel for gold, tin and gems.', ['gold', 'tin-ore', 'jade']),
  d('pitch-gathering', 'Pitch gathering', 'stone', [], ['dig-by-hand'], 'Working tar seeps for bitumen.', ['bitumen']),
  d('wells', 'Wells', 'stone', ['clay-working'], ['carry-water'], 'Digging down to groundwater.'),
  d('organised-hunting', 'Organised hunting', 'stone', [], ['hunt'], 'Hunting parties working from a lodge; dangerous animals become fair game.'),
  d('net-fishing', 'Net fishing', 'stone', [], ['hand-fishing', 'twist-sinew', 'twist-reed-cordage'], 'Nets and traps worked from a fishing hut.'),
  d('dugout-canoe', 'Dugout canoe', 'stone', ['stone-axes'], ['hand-fishing', 'gather-deadwood'], 'Hollow a log into a boat: canoe-builders’ yards and landings.'),
  // Crafts
  d('tanning', 'Tanning', 'stone', [], ['cure-hide'], 'Soaking hides in bark tannin to make leather: tanning pits.'),
  d('weaving', 'Weaving', 'stone', [], ['twist-reed-cordage', 'cut-fibres'], 'Weaving baskets, mats and cloth on a loom: weavers’ huts.'),
  d('butchery', 'Butchery', 'stone', [], ['hunt', 'cook-meat'], 'Jointing carcasses properly so nothing is wasted.'),
  d('herbal-medicine', 'Herbal medicine', 'stone', [], ['pick-wild-herbs', 'dry-herbs'], 'Brewing remedies from herbs: herbalists’ huts.'),
  d('gem-cutting', 'Carving and polishing', 'stone', [], ['beachcomb', 'carve-bone'], 'Carving jade and polishing amber into jewellery.', ['amber', 'jade']),
  // Farming and husbandry: wild sources are small; these make them large.
  d('agriculture', 'Agriculture', 'stone', [], ['forage'], 'Sowing and harvesting grain and roots: garden plots.', ['wild-grain', 'roots']),
  d('fibre-crops', 'Fibre crops', 'stone', ['agriculture'], ['cut-fibres', 'twist-sinew'], 'Growing flax, hemp and cotton for cloth and rope.'),
  d('herb-gardening', 'Herb gardening', 'stone', ['agriculture'], ['pick-wild-herbs', 'dry-herbs'], 'Growing herbs and dye plants in tended gardens.'),
  d('animal-husbandry', 'Animal husbandry', 'stone', [], ['hunt'], 'Capturing young animals and keeping them instead of hunting them.', ['wild-boar', 'wild-goat', 'mouflon', 'aurochs', 'junglefowl']),
  d('poultry-farming', 'Poultry farming', 'stone', ['animal-husbandry'], ['collect-eggs', 'hunt'], 'Keeping chickens for eggs, feathers and meat: chicken coops.', ['junglefowl']),
  d('sheep-herding', 'Sheep and goat herding', 'stone', ['animal-husbandry'], ['hunt'], 'Herding sheep and goats for wool, milk and meat: folds.', ['wild-goat', 'mouflon']),
  d('pig-farming', 'Pig farming', 'stone', ['animal-husbandry'], ['hunt'], 'Keeping pigs bred from wild boar: pigsties.', ['wild-boar']),
  // Keeping food
  d('smoking', 'Smoking', 'stone', [], ['cook-meat', 'cook-fish', 'dry-meat'], 'Hanging meat and fish in smoke so it keeps for weeks: smokehouses.'),
  d('preserving', 'Honey preserves', 'stone', [], ['raid-wild-hive', 'dry-berries'], 'Sealing fruit in honey so it keeps through winter.', ['honey']),
  d('storage-pits', 'Storage pits', 'stone', [], ['dig-by-hand', 'roast-roots'], 'Reed-lined pits in cool earth that keep roots, nuts and grain far longer.'),
  d('bee-smoking', 'Bee smoking', 'stone', [], ['raid-wild-hive'], 'Calm wild bees with smoke to take far more honey and wax from wild hives.', ['honey']),

  // ======================================================== Iron era
  d('mining', 'Mining', 'iron', ['quarrying'], ['quarrying', 'cut-stone'], 'Shafts and tunnels into ore veins: adit mines.'),
  d('iron-smelting', 'Iron smelting', 'iron', ['mining', 'pottery'], ['mining', 'fire-pottery'], 'Smelting ore with charcoal in a clay bloomery.'),
  d('charcoal-burning', 'Charcoal burning', 'iron', ['pottery'], ['fire-pottery', 'cut-softwood'], 'Slow-burning wood under turf into charcoal for hotter fires.'),
  d('blacksmithing', 'Blacksmithing', 'iron', ['iron-smelting'], ['bloom-iron', 'smelt-copper'], 'Hammering iron into tools, weapons, nails and pots at a smithy.'),
  d('timber-framing', 'Timber framing', 'iron', ['woodworking'], ['cut-softwood', 'cut-hardwood'], 'Jointed timber frames: longhouses, cranes and bridges.'),
  d('ploughing', 'Ploughing', 'iron', ['agriculture', 'iron-smelting'], ['grain-farming'], 'An iron-shod plough turns far more ground.'),
  d('milling', 'Milling', 'iron', ['agriculture'], ['grain-farming', 'bake-flatbread'], 'Grinding grain into flour: quern houses and bakehouses.'),
  d('lime-burning', 'Lime burning', 'iron', ['pottery'], ['fire-pottery', 'cut-limestone'], 'Burning limestone and chalk into lime for mortar and plaster.'),
  d('glassmaking', 'Glassmaking', 'iron', ['pottery'], ['fire-pottery', 'fire-bricks'], 'Melting sand into glass.', ['sand']),
  d('mana-smelting', 'Mana smelting', 'medieval', ['iron-smelting', 'arcane-sight'], ['mining', 'bloom-iron'], 'Mana crystals heat a forge hotter than charcoal ever could.', ['mana-crystal']),
  d('ropemaking', 'Ropemaking', 'iron', ['weaving'], ['twist-sinew', 'weave-linen'], 'Laying long ropes on a ropewalk.'),
  d('dyeing', 'Dyeing', 'iron', ['weaving'], ['weave-linen', 'pick-wild-herbs'], 'Fixing colour into cloth.'),
  d('candle-making', 'Candle making', 'iron', [], ['render-fat'], 'Tallow and beeswax candles and soap.'),
  d('plank-boats', 'Plank boats', 'iron', ['dugout-canoe', 'woodworking'], ['carve-canoe', 'cut-softwood'], 'Boats built from sawn planks: boatwrights and wharves.'),
  d('gravel-roads', 'Gravel roads', 'iron', ['trackways'], ['quarrying', 'wash-gravel'], 'Trackways laid with gravel stay firm in the wet.'),
  d('cattle-herding', 'Cattle herding', 'iron', ['animal-husbandry'], ['hunt', 'herding'], 'Taming aurochs into cattle for milk, meat, hides and pulling.', ['aurochs']),
  d('beekeeping', 'Beekeeping', 'iron', ['bee-smoking'], ['smoke-wild-hive'], 'Keeping bees in boxes instead of raiding wild hives: apiaries.'),
  d('orchards', 'Orchards', 'iron', ['agriculture'], ['forage', 'grain-farming'], 'Planting fruit and nut trees.'),
  d('spice-cultivation', 'Spice cultivation', 'iron', ['agriculture'], ['forage', 'herb-growing'], 'Growing spices on plantations.', ['spices']),
  d('mushroom-cultivation', 'Mushroom cultivation', 'iron', ['agriculture'], ['forage'], 'Growing mushrooms in dark cellars.', ['mushrooms']),
  d('brine-evaporation', 'Brine evaporation', 'iron', [], ['carry-water', 'dig-by-hand'], 'Evaporating brine for salt, potash and lithium.', ['salt-water', 'rock-salt']),
  d('ice-cutting', 'Ice cutting', 'iron', [], ['collect-ice'], 'Cutting and storing ice blocks.', ['ice']),
  d('salting', 'Salting', 'iron', [], ['cook-meat', 'dry-meat', 'carry-water'], 'Packing meat and fish in salt so it keeps for months.', ['salt', 'rock-salt', 'salt-water']),
  d('fermenting', 'Fermenting', 'iron', [], ['dry-fruit', 'forage', 'herding'], 'Letting milk, roots and fruit turn into cheese and pickles that keep.'),
  d('root-cellar', 'Root cellars', 'iron', ['storage-pits'], ['grain-farming', 'dig-by-hand'], 'A cool, dark cellar for roots, fruit and cheese.'),
  d('ice-house', 'Ice houses', 'iron', ['ice-cutting'], ['ice-cutting', 'collect-ice'], 'Ice cut in winter and packed in straw keeps meat and milk cold through summer.'),

  // ======================================================== Medieval era
  d('masonry', 'Masonry', 'medieval', ['stonecutting', 'timber-framing'], ['cut-stone', 'burn-limestone'], 'Mortared stone walls: cottages, halls, well houses and stone bridges.'),
  d('water-mills', 'Water mills', 'medieval', ['milling', 'timber-framing'], ['mill-flour', 'cut-hardwood'], 'Water wheels drive mills, saws and looms.'),
  d('crop-rotation', 'Crop rotation', 'medieval', ['ploughing'], ['grain-farming'], 'Resting fields in turn keeps them fertile: open-field farms.'),
  d('blast-furnaces', 'Blast furnaces', 'medieval', ['iron-smelting'], ['bloom-iron', 'burn-charcoal'], 'Tall furnaces with bellows smelt far more iron.'),
  d('sailing', 'Sailing', 'medieval', ['plank-boats'], ['build-plank-boat', 'weave-canvas'], 'Canvas sails and keels: shipyards and harbours.'),
  d('cobbled-roads', 'Cobbled roads', 'medieval', ['gravel-roads', 'masonry'], ['cut-stone'], 'Roads paved with set stones.'),
  d('arcane-sight', 'Arcane sight', 'medieval', [], ['mining', 'beachcomb', 'collect-stones', 'forage'], 'Some stones hum and some wood glows: the first who can see magic can find mana crystals, hover stone, ember stone, frost shards and spirit wood.'),
  d('sacred-groves', 'Sacred groves', 'medieval', ['arcane-sight'], ['forage', 'grove-tending'], 'Tending ancient groves for spirit wood.', ['spirit-wood']),
  d('levitation', 'Levitation', 'medieval', ['mining', 'arcane-sight'], ['mining', 'attune-mana'], 'Hover stone can be woken to lift weight against the ground.', ['hover-stone']),
  d('cold-binding', 'Cold binding', 'medieval', ['arcane-sight'], ['collect-ice', 'attune-mana'], 'Frost shards can be bound into cores that stay cold for months.', ['frost-shard']),
  d('frost-box', 'Frost rooms', 'medieval', ['cold-binding'], ['bind-frost'], 'Rooms chilled by bound frost shards: food keeps almost indefinitely.'),

  // ======================================================== Renaissance
  d('brickwork', 'Brickwork', 'renaissance', ['masonry'], ['fire-bricks'], 'Fired brick buildings with glazed windows: townhouses.'),
  d('printing', 'Printing', 'renaissance', ['water-mills'], ['bind-books', 'make-paper'], 'Movable type: books for everyone, from a printing house.'),
  d('gunpowder', 'Gunpowder', 'renaissance', [], ['mill-gunpowder', 'burn-charcoal'], 'Saltpetre, sulphur and charcoal.', ['saltpeter', 'sulfur']),
  d('grow-houses', 'Grow houses', 'renaissance', ['herb-gardening', 'glassmaking'], ['herb-growing'], 'Glass houses that grow herbs, spices and seedlings year-round.'),
  d('airship', 'Airship', 'renaissance', ['levitation', 'sailing'], ['cut-levitation-core', 'weave-canvas'], 'A canvas envelope carried aloft by levitation cores: airship yards and mooring masts.'),

  // ======================================================== Industrial
  d('steam-pumps', 'Steam engines', 'industrial', ['wells', 'blast-furnaces'], ['well-drawing', 'bloom-iron'], 'Coal-fired engines that pump, hoist, saw and drive.'),
  d('factory-system', 'Factories', 'industrial', ['steam-pumps'], ['weave-linen', 'fire-bricks'], 'Many workers and machines under one roof: mills, works and terraced housing.'),
  d('steel', 'Steel', 'industrial', ['blast-furnaces', 'steam-pumps'], ['smelt-iron-coke', 'bloom-iron'], 'Cheap strong steel: foundries, steel ships, docks, iron bridges.'),
  d('railways', 'Railways', 'industrial', ['steel'], ['smelt-iron-coke'], 'Steam trains on iron rails.'),
  d('macadam', 'Macadam roads', 'industrial', ['cobbled-roads'], ['wash-gravel'], 'Rolled, layered stone roads.'),
  d('canning', 'Canning', 'industrial', ['salting'], ['salt-meat', 'make-preserves'], 'Sealing cooked food in tin cans so it keeps for years.'),
  d('refrigerator', 'Refrigeration', 'industrial', ['steam-pumps'], ['ice-cutting', 'pumping'], 'Mechanical cooling driven by an engine.'),
  d('deep-mining', 'Deep mining', 'industrial', ['mining', 'steam-pumps'], ['mining'], 'Deep shafts for rare ores.'),
  d('open-pit-mining', 'Open-pit mining', 'industrial', ['deep-mining'], ['deep-mining'], 'Stripping whole hillsides for bulk ore.'),
  d('oil-drilling', 'Oil drilling', 'industrial', ['deep-mining'], ['deep-mining', 'tar-digging'], 'Drilling for crude oil.'),
  d('gas-drilling', 'Gas drilling', 'industrial', ['oil-drilling'], ['oil-drilling'], 'Drilling for natural gas.'),

  // ======================================================== Modern
  d('concrete', 'Concrete', 'modern', ['factory-system', 'lime-burning'], ['burn-limestone'], 'Poured concrete: apartment blocks and waterworks.'),
  d('electricity', 'Electricity', 'modern', ['steel'], ['smelt-copper', 'form-electrodes'], 'Generators and wires: arc furnaces, electric rail, waterworks.'),
  d('assembly-lines', 'Assembly lines', 'modern', ['electricity', 'factory-system'], ['weave-linen', 'smelt-iron-coke'], 'Factories with moving lines.'),
  d('asphalt', 'Asphalt roads', 'modern', ['macadam', 'oil-drilling'], ['lay-asphalt'], 'Smooth tarred roads.'),

  // ======================================================== Techno-magic
  d('stasis-vault', 'Stasis vaults', 'techno-magic', ['refrigerator', 'frost-box'], ['bind-frost', 'attune-mana'], 'Machinery and frost magic together stop time for what is stored.'),
  d('arcane-engineering', 'Arcane engineering', 'techno-magic', ['electricity', 'levitation'], ['attune-mana', 'cut-levitation-core'], 'Machines and magic as one: arcologies, mana bores, sky docks, levitation lanes.'),
];

export const DISCOVERY_BY_ID: ReadonlyMap<string, Discovery> = new Map(DISCOVERIES.map((x) => [x.id, x]));

/** Insight a villager needs to make a discovery of this era. */
export function insightNeeded(era: EraId): number {
  const steps: Record<EraId, number> = { 'hunter-gatherer': 120, stone: 160, iron: 320, medieval: 600, renaissance: 1000, industrial: 1600, modern: 2400, 'techno-magic': 3600 };
  return steps[era];
}
