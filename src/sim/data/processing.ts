// Processing: what every base material becomes, and where. One basic facility per output
// (log cutters for logs, stonemasons for stone, smelters for ore...), keeping recognisable
// components (planks, cut stone, ingots, glass) and skipping fine detail. Parallel paths
// exist where the design calls for them (a bloomery and a mana forge both make iron).

import type { EraId } from './eras';

export interface Recipe {
  id: string;
  name: string;
  facility: string;
  era: EraId;
  inputs: Readonly<Record<string, number>>;
  outputs: Readonly<Record<string, number>>;
  seconds: number;
  /** Discoveries needed before villagers can make it. */
  requires?: readonly string[];
}

/** Processed goods (anything a recipe makes that is not a base material). */
export const PRODUCTS: Readonly<Record<string, string>> = {
  'cooked-meat': 'Cooked meat', 'cooked-fish': 'Cooked fish', 'roasted-food': 'Roasted roots and nuts', flatbread: 'Flatbread', 'dried-meat': 'Dried meat',
  'dried-fish': 'Dried fish', 'dried-fruit': 'Dried fruit and berries', 'dried-herbs': 'Dried herbs', 'dried-seaweed': 'Dried seaweed', 'cured-hide': 'Cured hide',
  cordage: 'Cordage', tallow: 'Tallow', 'resin-glue': 'Resin glue', 'stone-tools': 'Stone tools', 'obsidian-blades': 'Obsidian blades', 'bone-tools': 'Bone tools',
  fletching: 'Fletching', 'drinking-water': 'Drinking water', 'peat-fuel': 'Peat fuel', lumber: 'Lumber', 'hardwood-beams': 'Hardwood beams', 'bamboo-poles': 'Bamboo poles',
  planks: 'Planks', 'hardwood-planks': 'Hardwood planks', 'cork-goods': 'Cork stoppers and floats', charcoal: 'Charcoal', 'cut-stone': 'Cut stone',
  'limestone-blocks': 'Limestone blocks', 'sandstone-blocks': 'Sandstone blocks', 'marble-slabs': 'Marble slabs', 'slate-tiles': 'Slate tiles', 'basalt-blocks': 'Basalt blocks',
  aggregate: 'Aggregate', abrasive: 'Pumice abrasive', bricks: 'Bricks', pottery: 'Pottery', porcelain: 'Porcelain', 'mud-bricks': 'Mud bricks', plaster: 'Plaster',
  quicklime: 'Quicklime', glaze: 'Ceramic glaze', pitch: 'Pitch', crucibles: 'Graphite crucibles', glass: 'Glass', 'fine-glass': 'Fine glass and lenses',
  'borosilicate-glass': 'Borosilicate glass', 'iron-ingot': 'Iron ingot', 'copper-ingot': 'Copper ingot', 'tin-ingot': 'Tin ingot', 'lead-ingot': 'Lead ingot',
  'zinc-ingot': 'Zinc ingot', 'silver-ingot': 'Silver ingot', 'gold-ingot': 'Gold ingot', 'nickel-ingot': 'Nickel ingot', chromium: 'Chromium', aluminium: 'Aluminium',
  manganese: 'Manganese', tungsten: 'Tungsten', titanium: 'Titanium', cobalt: 'Cobalt', platinum: 'Platinum', mercury: 'Mercury', lithium: 'Lithium',
  'rare-earth-metals': 'Rare-earth metals', 'fuel-rods': 'Nuclear fuel rods', 'moonsilver-ingot': 'Moonsilver ingot', coke: 'Coke', briquettes: 'Fuel briquettes',
  fuel: 'Fuel', plastics: 'Plastics', 'fuel-gas': 'Fuel gas', asphalt: 'Asphalt', gunpowder: 'Gunpowder', 'sulfuric-acid': 'Sulfuric acid', 'hydrofluoric-acid': 'Hydrofluoric acid',
  'barium-compounds': 'Barium compounds', electrodes: 'Graphite electrodes', insulators: 'Mica insulators', fertilizer: 'Fertilizer', rubber: 'Rubber', salt: 'Salt',
  'cut-diamond': 'Cut diamond', 'cut-ruby': 'Cut ruby', 'cut-sapphire': 'Cut sapphire', 'cut-emerald': 'Cut emerald', 'cut-amethyst': 'Cut amethyst',
  'carved-jade': 'Carved jade', 'amber-beads': 'Amber beads', leather: 'Leather', pelts: 'Pelts', linen: 'Linen', 'cotton-cloth': 'Cotton cloth', 'wool-cloth': 'Woollen cloth',
  canvas: 'Canvas', baskets: 'Baskets and mats', rope: 'Rope', dye: 'Dye', medicine: 'Medicine', candles: 'Candles and soap', 'wax-and-honey': 'Beeswax and honey',
  'meat-cuts': 'Meat cuts', 'smoked-fish': 'Smoked fish', 'smoked-meat': 'Smoked meat', flour: 'Flour', bread: 'Bread', preserves: 'Preserves', 'spice-blend': 'Spice blend',
  'egg-dishes': 'Egg dishes', cheese: 'Cheese', 'salted-meat': 'Salted meat', 'salted-fish': 'Salted fish', pickles: 'Pickles', 'canned-food': 'Canned food', 'dugout-canoe': 'Dugout canoe',
  'hide-clothing': 'Hide clothing', 'fur-cloak': 'Fur cloak', 'woven-clothing': 'Woven clothing', 'fine-clothing': 'Fine dyed clothing', 'factory-clothing': 'Factory-made clothing',
  'synthetic-clothing': 'Synthetic clothing', 'enchanted-garments': 'Enchanted garments', moccasins: 'Moccasins', boots: 'Hobnailed boots', 'factory-shoes': 'Factory shoes',
  'iron-tools': 'Iron tools', 'steel-tools': 'Steel tools', 'power-tools': 'Power tools', 'mana-tools': 'Mana-charged tools', 'simple-furniture': 'Simple furniture',
  'fine-furniture': 'Fine furniture', 'upholstered-furniture': 'Upholstered furniture', 'modern-furniture': 'Modern furniture', 'oil-lamps': 'Oil lamps', 'electric-lights': 'Electric lights',
  'mana-lamps': 'Mana lamps', glassware: 'Glassware', metalware: 'Pots, pans and cutlery', soap: 'Soap', pharmaceuticals: 'Pharmaceuticals', drums: 'Drums', mead: 'Mead', beer: 'Beer',
  wine: 'Wine', jewellery: 'Jewellery', paper: 'Paper', books: 'Books', lutes: 'Lutes', 'printed-books': 'Printed books', pianos: 'Pianos', radios: 'Radios', spears: 'Spears',
  bows: 'Bows and arrows', 'iron-weapons': 'Iron weapons', muskets: 'Muskets', rifles: 'Rifles', carts: 'Carts', wagons: 'Wagons', locomotives: 'Locomotives', automobiles: 'Automobiles',
  'hover-carriages': 'Hover carriages', 'machine-parts': 'Machine parts', 'steam-engine': 'Steam engine', 'electric-motor': 'Electric motor', electronics: 'Electronics', 'plank-boat': 'Plank boat', 'sailing-ship': 'Sailing ship', steamship: 'Steamship', airship: 'Airship', 'motor-airship': 'Motor airship', 'roast-poultry': 'Roast poultry', 'mana-cell': 'Mana cell', 'heat-core': 'Heat core', 'cold-core': 'Cold core', 'levitation-core': 'Levitation core', 'spirit-focus': 'Spirit focus',
};

const r = (id: string, name: string, facility: string, era: EraId, inputs: Record<string, number>, outputs: Record<string, number>, seconds = 60, requires?: string[]): Recipe => ({ id, name, facility, era, inputs, outputs, seconds, requires });

export const RECIPES: readonly Recipe[] = [
  // Hunter-gatherer camp
  r('cook-meat', 'Cook meat', 'campfire', 'hunter-gatherer', { 'game-meat': 1 }, { 'cooked-meat': 1 }, 20),
  r('cook-fish', 'Cook fish', 'campfire', 'hunter-gatherer', { fish: 1 }, { 'cooked-fish': 1 }, 15),
  r('cook-shellfish', 'Cook shellfish', 'campfire', 'hunter-gatherer', { shellfish: 2 }, { 'cooked-fish': 1 }, 15),
  r('roast-roots', 'Roast roots', 'campfire', 'hunter-gatherer', { roots: 2 }, { 'roasted-food': 1 }, 20),
  r('roast-nuts', 'Roast nuts', 'campfire', 'hunter-gatherer', { nuts: 2 }, { 'roasted-food': 1 }, 15),
  r('roast-mushrooms', 'Roast mushrooms', 'campfire', 'hunter-gatherer', { mushrooms: 2 }, { 'roasted-food': 1 }, 15),
  r('cook-eggs', 'Cook eggs', 'campfire', 'hunter-gatherer', { eggs: 2 }, { 'egg-dishes': 1 }, 15),
  r('roast-poultry', 'Roast poultry', 'campfire', 'stone', { poultry: 1 }, { 'roast-poultry': 1 }, 20),
  r('bake-flatbread', 'Bake flatbread', 'campfire', 'hunter-gatherer', { 'wild-grain': 3, 'fresh-water': 1 }, { flatbread: 2 }, 30),
  r('render-fat', 'Render fat', 'campfire', 'hunter-gatherer', { 'animal-fat': 2 }, { tallow: 1 }, 30),
  r('make-resin-glue', 'Make resin glue', 'campfire', 'hunter-gatherer', { resin: 2 }, { 'resin-glue': 1 }, 25),
  r('boil-water', 'Boil water', 'campfire', 'hunter-gatherer', { 'fresh-water': 1 }, { 'drinking-water': 1 }, 10),
  r('melt-ice', 'Melt ice', 'campfire', 'hunter-gatherer', { ice: 1 }, { 'fresh-water': 1 }, 10),
  // Preserving over the fire, once discovered.
  r('smoke-meat-fire', 'Smoke meat over the fire', 'campfire', 'stone', { 'game-meat': 2 }, { 'smoked-meat': 2 }, 120, ['smoking']),
  r('smoke-fish-fire', 'Smoke fish over the fire', 'campfire', 'stone', { fish: 2 }, { 'smoked-fish': 2 }, 100, ['smoking']),
  r('honey-preserves', 'Make honey preserves', 'campfire', 'stone', { berries: 4, honey: 1 }, { preserves: 2 }, 90, ['preserving']),
  r('knap-flint', 'Knap flint tools', 'knapping-spot', 'hunter-gatherer', { flint: 1 }, { 'stone-tools': 1 }, 40),
  r('knap-obsidian', 'Knap obsidian blades', 'knapping-spot', 'hunter-gatherer', { obsidian: 1 }, { 'obsidian-blades': 1 }, 40),
  r('shape-stone', 'Shape stone tools', 'knapping-spot', 'hunter-gatherer', { stone: 2 }, { 'stone-tools': 1 }, 50),
  r('carve-bone', 'Carve bone tools', 'bone-carver', 'hunter-gatherer', { bone: 2 }, { 'bone-tools': 1 }, 40),
  r('make-fletching', 'Make fletching', 'bone-carver', 'hunter-gatherer', { feathers: 3 }, { fletching: 1 }, 20),
  r('cure-hide', 'Cure hide', 'drying-rack', 'hunter-gatherer', { hides: 1 }, { 'cured-hide': 1 }, 90),
  r('dry-meat', 'Dry meat', 'drying-rack', 'hunter-gatherer', { 'game-meat': 2 }, { 'dried-meat': 1 }, 90),
  r('dry-fish', 'Dry fish', 'drying-rack', 'hunter-gatherer', { fish: 2 }, { 'dried-fish': 1 }, 90),
  r('dry-fruit', 'Dry fruit', 'drying-rack', 'hunter-gatherer', { 'wild-fruit': 3 }, { 'dried-fruit': 1 }, 90),
  r('dry-berries', 'Dry berries', 'drying-rack', 'hunter-gatherer', { berries: 4 }, { 'dried-fruit': 1 }, 90),
  r('dry-herbs', 'Dry herbs', 'drying-rack', 'hunter-gatherer', { herbs: 3 }, { 'dried-herbs': 1 }, 60),
  r('dry-seaweed', 'Dry seaweed', 'drying-rack', 'hunter-gatherer', { seaweed: 3 }, { 'dried-seaweed': 1 }, 60),
  r('dry-peat', 'Dry peat', 'drying-rack', 'hunter-gatherer', { peat: 2 }, { 'peat-fuel': 2 }, 120),
  r('twist-sinew', 'Twist sinew cordage', 'drying-rack', 'hunter-gatherer', { sinew: 2 }, { cordage: 1 }, 40),
  r('twist-reed-cordage', 'Twist reed cordage', 'drying-rack', 'hunter-gatherer', { reeds: 3 }, { cordage: 1 }, 45),

  // Wood
  r('cut-softwood', 'Cut softwood', 'log-cutter', 'stone', { softwood: 1 }, { lumber: 2 }),
  r('cut-hardwood', 'Cut hardwood beams', 'log-cutter', 'stone', { hardwood: 1 }, { 'hardwood-beams': 2 }),
  r('cut-bamboo', 'Cut bamboo poles', 'log-cutter', 'stone', { bamboo: 2 }, { 'bamboo-poles': 2 }),
  r('cut-cork', 'Cut cork goods', 'log-cutter', 'stone', { cork: 1 }, { 'cork-goods': 2 }),
  r('saw-planks', 'Saw planks', 'sawmill', 'medieval', { softwood: 1 }, { planks: 4 }),
  r('saw-hardwood-planks', 'Saw hardwood planks', 'sawmill', 'medieval', { hardwood: 1 }, { 'hardwood-planks': 3 }),
  r('burn-charcoal', 'Burn charcoal', 'charcoal-kiln', 'iron', { hardwood: 2 }, { charcoal: 2 }, 120),
  r('burn-softwood-charcoal', 'Burn softwood charcoal', 'charcoal-kiln', 'iron', { softwood: 2 }, { charcoal: 1 }, 120),

  // Stone and earth
  r('cut-stone', 'Cut stone', 'stonemason', 'stone', { stone: 2 }, { 'cut-stone': 1 }),
  r('cut-limestone', 'Cut limestone blocks', 'stonemason', 'stone', { limestone: 2 }, { 'limestone-blocks': 1 }),
  r('cut-sandstone', 'Cut sandstone blocks', 'stonemason', 'stone', { sandstone: 2 }, { 'sandstone-blocks': 1 }),
  r('cut-marble', 'Cut marble slabs', 'stonemason', 'iron', { marble: 2 }, { 'marble-slabs': 1 }),
  r('split-slate', 'Split slate tiles', 'stonemason', 'stone', { slate: 1 }, { 'slate-tiles': 3 }),
  r('cut-basalt', 'Cut basalt blocks', 'stonemason', 'stone', { basalt: 2 }, { 'basalt-blocks': 1 }),
  r('wash-gravel', 'Wash aggregate', 'stonemason', 'stone', { gravel: 3 }, { aggregate: 3 }),
  r('grind-pumice', 'Grind pumice abrasive', 'stonemason', 'stone', { pumice: 1 }, { abrasive: 2 }),
  r('fire-bricks', 'Fire bricks', 'kiln', 'stone', { clay: 3 }, { bricks: 2 }, 90),
  r('fire-pottery', 'Fire pottery', 'kiln', 'stone', { clay: 2 }, { pottery: 1 }, 90),
  r('fire-porcelain', 'Fire porcelain', 'kiln', 'iron', { kaolin: 2 }, { porcelain: 1 }, 120),
  r('form-mud-bricks', 'Form mud bricks', 'kiln', 'stone', { silt: 4 }, { 'mud-bricks': 3 }, 60),
  r('burn-plaster', 'Burn plaster', 'kiln', 'stone', { gypsum: 2 }, { plaster: 2 }, 90),
  r('mix-glaze', 'Mix glaze', 'kiln', 'iron', { feldspar: 2 }, { glaze: 1 }, 60),
  r('boil-pitch', 'Boil pitch', 'kiln', 'stone', { bitumen: 2 }, { pitch: 2 }, 60),
  r('fire-crucibles', 'Fire crucibles', 'kiln', 'iron', { graphite: 2, clay: 1 }, { crucibles: 1 }, 90),
  r('burn-limestone', 'Burn limestone', 'lime-kiln', 'iron', { limestone: 2 }, { quicklime: 2 }, 120),
  r('burn-chalk', 'Burn chalk', 'lime-kiln', 'iron', { chalk: 2 }, { quicklime: 2 }, 120),
  r('make-salt', 'Make salt', 'saltworks', 'iron', { 'rock-salt': 2 }, { salt: 2 }),
  r('boil-sea-salt', 'Boil sea salt', 'saltworks', 'iron', { 'salt-water': 5 }, { salt: 1 }, 90),

  // Glass
  r('make-glass', 'Make glass', 'glassworks', 'iron', { sand: 3, potash: 1 }, { glass: 2 }, 90),
  r('make-plain-glass', 'Make plain glass', 'glassworks', 'iron', { sand: 4 }, { glass: 1 }, 90),
  r('grind-lenses', 'Grind lenses', 'glassworks', 'renaissance', { quartz: 2 }, { 'fine-glass': 1 }, 120),
  r('make-borosilicate', 'Make borosilicate glass', 'glassworks', 'industrial', { sand: 3, borax: 1 }, { 'borosilicate-glass': 2 }, 90),

  // Metals — parallel paths for iron (charcoal bloomery, mana forge, coke smelter)
  r('bloom-iron', 'Smelt iron (bloomery)', 'bloomery', 'iron', { 'iron-ore': 2, charcoal: 1 }, { 'iron-ingot': 1 }, 120),
  r('mana-iron', 'Smelt iron (mana forge)', 'mana-forge', 'iron', { 'iron-ore': 4, 'mana-crystal': 1 }, { 'iron-ingot': 3 }, 120),
  r('smelt-iron-coke', 'Smelt iron (coke)', 'smelter', 'industrial', { 'iron-ore': 2, coke: 1 }, { 'iron-ingot': 2 }, 90),
  r('forge-meteoric', 'Forge meteoric iron', 'bloomery', 'iron', { 'meteoric-iron': 1 }, { 'iron-ingot': 2 }, 120),
  r('smelt-copper', 'Smelt copper', 'smelter', 'iron', { 'copper-ore': 2, charcoal: 1 }, { 'copper-ingot': 1 }, 90),
  r('smelt-tin', 'Smelt tin', 'smelter', 'iron', { 'tin-ore': 2, charcoal: 1 }, { 'tin-ingot': 1 }, 90),
  r('smelt-lead', 'Smelt lead', 'smelter', 'iron', { 'lead-ore': 2, charcoal: 1 }, { 'lead-ingot': 1 }, 90),
  r('smelt-zinc', 'Smelt zinc', 'smelter', 'medieval', { 'zinc-ore': 2, charcoal: 1 }, { 'zinc-ingot': 1 }, 90),
  r('smelt-silver', 'Smelt silver', 'smelter', 'iron', { 'silver-ore': 2, charcoal: 1 }, { 'silver-ingot': 1 }, 90),
  r('smelt-gold', 'Smelt gold', 'smelter', 'iron', { gold: 1 }, { 'gold-ingot': 1 }, 60),
  r('roast-cinnabar', 'Roast cinnabar', 'smelter', 'medieval', { cinnabar: 2 }, { mercury: 1 }, 90),
  r('smelt-nickel', 'Smelt nickel', 'smelter', 'industrial', { 'nickel-ore': 2, coke: 1 }, { 'nickel-ingot': 1 }, 90),
  r('smelt-chromium', 'Smelt chromium', 'smelter', 'industrial', { chromite: 2, coke: 1 }, { chromium: 1 }, 90),
  r('smelt-manganese', 'Smelt manganese', 'smelter', 'industrial', { 'manganese-ore': 2, coke: 1 }, { manganese: 1 }, 90),
  r('smelt-tungsten', 'Smelt tungsten', 'smelter', 'industrial', { 'tungsten-ore': 2, coke: 1 }, { tungsten: 1 }, 120),
  r('smelt-titanium', 'Smelt titanium', 'smelter', 'modern', { 'titanium-ore': 2, coke: 1 }, { titanium: 1 }, 120),
  r('smelt-cobalt', 'Smelt cobalt', 'smelter', 'industrial', { 'cobalt-ore': 2, coke: 1 }, { cobalt: 1 }, 120),
  r('refine-platinum', 'Refine platinum', 'smelter', 'industrial', { 'platinum-ore': 2 }, { platinum: 1 }, 120),
  r('forge-moonsilver', 'Forge moonsilver', 'mana-forge', 'medieval', { 'moonsilver-ore': 2, 'mana-crystal': 1 }, { 'moonsilver-ingot': 1 }, 150),
  r('refine-aluminium', 'Refine aluminium', 'chemical-works', 'industrial', { bauxite: 4 }, { aluminium: 1 }, 120),
  r('extract-lithium', 'Extract lithium', 'chemical-works', 'modern', { 'lithium-ore': 3 }, { lithium: 1 }, 120),
  r('separate-rare-earths', 'Separate rare earths', 'chemical-works', 'modern', { 'rare-earth-ore': 3 }, { 'rare-earth-metals': 1 }, 150),
  r('enrich-uranium', 'Enrich uranium', 'enrichment-plant', 'modern', { 'uranium-ore': 4 }, { 'fuel-rods': 1 }, 300),

  // Fuels and chemistry
  r('bake-coke', 'Bake coke', 'coke-oven', 'industrial', { coal: 2 }, { coke: 1 }, 90),
  r('press-briquettes', 'Press briquettes', 'coke-oven', 'industrial', { lignite: 2 }, { briquettes: 1 }, 60),
  r('refine-oil', 'Refine oil', 'refinery', 'industrial', { 'crude-oil': 2 }, { fuel: 1, plastics: 1 }, 120),
  r('process-gas', 'Process gas', 'gas-plant', 'industrial', { 'natural-gas': 2 }, { 'fuel-gas': 2 }, 60),
  r('lay-asphalt', 'Mix asphalt', 'refinery', 'industrial', { bitumen: 2, gravel: 2 }, { asphalt: 2 }, 60),
  r('mill-gunpowder', 'Mill gunpowder', 'gunpowder-mill', 'renaissance', { sulfur: 1, saltpeter: 3, charcoal: 1 }, { gunpowder: 2 }, 120),
  r('make-sulfuric-acid', 'Make sulfuric acid', 'chemical-works', 'industrial', { sulfur: 2 }, { 'sulfuric-acid': 1 }, 90),
  r('make-hf', 'Make hydrofluoric acid', 'chemical-works', 'industrial', { fluorite: 2, sulfur: 1 }, { 'hydrofluoric-acid': 1 }, 120),
  r('process-barite', 'Process barite', 'chemical-works', 'industrial', { barite: 2 }, { 'barium-compounds': 1 }, 90),
  r('form-electrodes', 'Form electrodes', 'chemical-works', 'industrial', { graphite: 2 }, { electrodes: 1 }, 90),
  r('split-mica', 'Split mica insulators', 'chemical-works', 'industrial', { mica: 1 }, { insulators: 2 }, 60),
  r('mix-phosphate-fertilizer', 'Mix phosphate fertilizer', 'fertilizer-works', 'industrial', { phosphate: 2 }, { fertilizer: 2 }, 90),
  r('mix-potash-fertilizer', 'Mix potash fertilizer', 'fertilizer-works', 'industrial', { potash: 2 }, { fertilizer: 2 }, 90),
  r('vulcanise-rubber', 'Vulcanise rubber', 'chemical-works', 'industrial', { latex: 2, sulfur: 1 }, { rubber: 2 }, 90),

  // Gems
  r('cut-diamond', 'Cut diamond', 'gem-cutter', 'iron', { diamond: 1 }, { 'cut-diamond': 1 }, 180),
  r('cut-ruby', 'Cut ruby', 'gem-cutter', 'iron', { ruby: 1 }, { 'cut-ruby': 1 }, 150),
  r('cut-sapphire', 'Cut sapphire', 'gem-cutter', 'iron', { sapphire: 1 }, { 'cut-sapphire': 1 }, 150),
  r('cut-emerald', 'Cut emerald', 'gem-cutter', 'iron', { emerald: 1 }, { 'cut-emerald': 1 }, 150),
  r('cut-amethyst', 'Cut amethyst', 'gem-cutter', 'iron', { amethyst: 1 }, { 'cut-amethyst': 1 }, 120),
  r('carve-jade', 'Carve jade', 'gem-cutter', 'stone', { jade: 1 }, { 'carved-jade': 1 }, 150),
  r('polish-amber', 'Polish amber beads', 'gem-cutter', 'stone', { amber: 1 }, { 'amber-beads': 2 }, 90),

  // Animal goods, cloth, food
  r('tan-leather', 'Tan leather', 'tannery', 'stone', { hides: 2 }, { leather: 2 }, 120),
  r('dress-fur', 'Dress fur', 'furrier', 'stone', { fur: 2 }, { pelts: 1 }, 90),
  r('weave-linen', 'Weave linen', 'weaver', 'stone', { flax: 3 }, { linen: 1 }, 90),
  r('weave-cotton', 'Weave cotton', 'weaver', 'iron', { cotton: 3 }, { 'cotton-cloth': 1 }, 90),
  r('weave-wool', 'Weave wool', 'weaver', 'stone', { wool: 3 }, { 'wool-cloth': 1 }, 90),
  r('weave-canvas', 'Weave canvas', 'weaver', 'iron', { hemp: 3 }, { canvas: 1 }, 90),
  r('weave-baskets', 'Weave baskets and mats', 'weaver', 'stone', { reeds: 4 }, { baskets: 1 }, 60),
  r('lay-rope', 'Lay rope', 'ropewalk', 'iron', { hemp: 2 }, { rope: 2 }, 60),
  r('make-dye', 'Make dye', 'dye-works', 'iron', { 'dye-plants': 3 }, { dye: 1 }, 90),
  r('brew-medicine', 'Brew medicine', 'herbalist', 'stone', { herbs: 3 }, { medicine: 1 }, 90),
  r('make-candles', 'Make candles and soap', 'chandlery', 'iron', { 'animal-fat': 3 }, { candles: 2 }, 90),
  r('separate-honey', 'Separate honey and wax', 'chandlery', 'iron', { honey: 2 }, { 'wax-and-honey': 2 }, 60),
  r('butcher-meat', 'Butcher meat', 'butcher', 'stone', { 'game-meat': 2 }, { 'meat-cuts': 3 }, 60),
  r('smoke-fish', 'Smoke fish', 'smokehouse', 'stone', { fish: 2 }, { 'smoked-fish': 2 }, 120),
  r('smoke-meat', 'Smoke meat', 'smokehouse', 'stone', { 'game-meat': 2 }, { 'smoked-meat': 2 }, 120),
  r('mill-flour', 'Mill flour', 'mill', 'iron', { 'wild-grain': 3 }, { flour: 2 }, 60),
  r('bake-bread', 'Bake bread', 'kitchen', 'iron', { flour: 2, 'fresh-water': 1 }, { bread: 3 }, 90),
  r('make-preserves', 'Make preserves', 'kitchen', 'stone', { berries: 4, honey: 1 }, { preserves: 2 }, 90, ['preserving']),
  r('preserve-fruit', 'Preserve fruit', 'kitchen', 'stone', { 'wild-fruit': 3 }, { preserves: 1 }, 90),
  r('make-cheese', 'Make cheese', 'kitchen', 'stone', { milk: 4 }, { cheese: 1 }, 120, ['fermenting']),
  r('salt-meat', 'Salt meat', 'kitchen', 'iron', { 'game-meat': 2, salt: 1 }, { 'salted-meat': 2 }, 90, ['salting']),
  r('salt-fish', 'Salt fish', 'kitchen', 'iron', { fish: 2, salt: 1 }, { 'salted-fish': 2 }, 90, ['salting']),
  r('pickle-roots', 'Pickle roots', 'kitchen', 'iron', { roots: 3, salt: 1 }, { pickles: 3 }, 90, ['fermenting', 'salting']),
  r('can-meat', 'Can meat', 'cannery', 'industrial', { 'cooked-meat': 4, 'tin-ingot': 1 }, { 'canned-food': 4 }, 90, ['canning']),
  r('can-fish', 'Can fish', 'cannery', 'industrial', { 'cooked-fish': 4, 'tin-ingot': 1 }, { 'canned-food': 4 }, 90, ['canning']),
  r('blend-spices', 'Blend spices', 'kitchen', 'iron', { spices: 2 }, { 'spice-blend': 1 }, 60),

  // Magic
  // ---------------------------------------------------------------- Final goods
  // Clothing and footwear
  r('sew-hide-clothing', 'Sew hide clothing', 'drying-rack', 'hunter-gatherer', { 'cured-hide': 2, sinew: 1 }, { 'hide-clothing': 1 }, 120),
  r('sew-fur-cloak', 'Sew a fur cloak', 'drying-rack', 'hunter-gatherer', { fur: 2, sinew: 1 }, { 'fur-cloak': 1 }, 120),
  r('tailor-linen', 'Tailor linen clothing', 'weaver', 'stone', { linen: 2 }, { 'woven-clothing': 1 }, 120),
  r('tailor-wool', 'Tailor wool clothing', 'weaver', 'stone', { 'wool-cloth': 2 }, { 'woven-clothing': 1 }, 120),
  r('tailor-fine', 'Tailor fine dyed clothing', 'weaver', 'medieval', { 'wool-cloth': 2, dye: 1, linen: 1 }, { 'fine-clothing': 1 }, 180),
  r('sew-factory-clothing', 'Sew factory clothing', 'manufactory', 'industrial', { 'cotton-cloth': 3 }, { 'factory-clothing': 4 }, 120, ['factory-system']),
  r('make-synthetic-clothing', 'Make synthetic clothing', 'assembly-plant', 'modern', { plastics: 2, 'cotton-cloth': 1 }, { 'synthetic-clothing': 4 }, 120, ['assembly-lines']),
  r('weave-enchanted-garments', 'Weave enchanted garments', 'fabricator', 'techno-magic', { 'wool-cloth': 2, 'mana-cell': 1 }, { 'enchanted-garments': 2 }, 180, ['arcane-engineering']),
  r('make-moccasins', 'Make moccasins', 'tannery', 'stone', { leather: 1 }, { moccasins: 1 }, 90),
  r('make-boots', 'Make hobnailed boots', 'tannery', 'iron', { leather: 2, 'iron-ingot': 1 }, { boots: 2 }, 150, ['blacksmithing']),
  r('make-factory-shoes', 'Make factory shoes', 'manufactory', 'industrial', { leather: 2, rubber: 1 }, { 'factory-shoes': 4 }, 120, ['factory-system']),
  // Tools
  r('forge-iron-tools', 'Forge iron tools', 'smithy', 'iron', { 'iron-ingot': 2, lumber: 1 }, { 'iron-tools': 2 }, 150, ['blacksmithing']),
  r('make-steel-tools', 'Make steel tools', 'machine-shop', 'industrial', { 'iron-ingot': 3, coke: 1, lumber: 1 }, { 'steel-tools': 3 }, 150, ['steel']),
  r('make-power-tools', 'Make power tools', 'assembly-plant', 'modern', { 'electric-motor': 1, 'steel-tools': 1, plastics: 1 }, { 'power-tools': 2 }, 150, ['electricity']),
  r('charge-mana-tools', 'Charge mana tools', 'fabricator', 'techno-magic', { 'steel-tools': 1, 'mana-cell': 1 }, { 'mana-tools': 1 }, 120, ['arcane-engineering']),
  // Home
  r('make-simple-furniture', 'Make simple furniture', 'workshop', 'stone', { lumber: 3, cordage: 1 }, { 'simple-furniture': 1 }, 150, ['woodworking']),
  r('make-fine-furniture', 'Make fine furniture', 'workshop', 'medieval', { 'hardwood-planks': 3, 'resin-glue': 1 }, { 'fine-furniture': 1 }, 200),
  r('make-upholstered-furniture', 'Make upholstered furniture', 'manufactory', 'industrial', { planks: 3, 'cotton-cloth': 2, 'iron-ingot': 1 }, { 'upholstered-furniture': 2 }, 180, ['factory-system']),
  r('make-modern-furniture', 'Make modern furniture', 'assembly-plant', 'modern', { plastics: 2, aluminium: 1 }, { 'modern-furniture': 3 }, 150, ['assembly-lines']),
  r('make-oil-lamps', 'Make oil lamps', 'smithy', 'renaissance', { 'copper-ingot': 1, glass: 1 }, { 'oil-lamps': 2 }, 120),
  r('make-electric-lights', 'Make electric lights', 'assembly-plant', 'modern', { glass: 1, 'copper-ingot': 1, tungsten: 1 }, { 'electric-lights': 4 }, 120, ['electricity']),
  r('make-mana-lamps', 'Make mana lamps', 'fabricator', 'techno-magic', { glass: 1, 'mana-cell': 1 }, { 'mana-lamps': 4 }, 120, ['arcane-engineering']),
  r('blow-glassware', 'Blow glassware', 'glassworks', 'iron', { glass: 2 }, { glassware: 2 }, 90),
  r('make-metalware', 'Make pots, pans and cutlery', 'smithy', 'iron', { 'iron-ingot': 1 }, { metalware: 2 }, 120, ['blacksmithing']),
  // Health
  r('make-soap', 'Make soap', 'chandlery', 'iron', { 'animal-fat': 2, potash: 1 }, { soap: 3 }, 90),
  r('make-pharmaceuticals', 'Make pharmaceuticals', 'chemical-works', 'modern', { herbs: 2, 'sulfuric-acid': 1 }, { pharmaceuticals: 4 }, 150, ['electricity']),
  // Leisure and luxury
  r('make-drums', 'Make drums', 'drying-rack', 'hunter-gatherer', { 'cured-hide': 1, softwood: 1 }, { drums: 1 }, 120),
  r('brew-mead', 'Brew mead', 'kitchen', 'iron', { honey: 2, 'fresh-water': 1 }, { mead: 2 }, 120, ['fermenting']),
  r('brew-beer', 'Brew beer', 'kitchen', 'iron', { 'wild-grain': 3, 'fresh-water': 2 }, { beer: 3 }, 120, ['fermenting']),
  r('press-wine', 'Press wine', 'kitchen', 'iron', { 'wild-fruit': 4 }, { wine: 2 }, 150, ['fermenting']),
  r('make-gold-jewellery', 'Make gold jewellery', 'gem-cutter', 'iron', { 'gold-ingot': 1, 'cut-ruby': 1 }, { jewellery: 2 }, 200),
  r('make-silver-jewellery', 'Make silver jewellery', 'gem-cutter', 'iron', { 'silver-ingot': 1, 'amber-beads': 2 }, { jewellery: 2 }, 200),
  r('make-paper', 'Make paper', 'mill', 'medieval', { softwood: 2, 'fresh-water': 2 }, { paper: 4 }, 120, ['water-mills']),
  r('bind-books', 'Bind books', 'workshop', 'medieval', { paper: 4, leather: 1 }, { books: 1 }, 200),
  r('make-lutes', 'Make lutes', 'workshop', 'medieval', { 'hardwood-planks': 1, sinew: 1 }, { lutes: 1 }, 200),
  r('print-books', 'Print books', 'printing-press', 'renaissance', { paper: 6, leather: 1, dye: 1 }, { 'printed-books': 4 }, 150, ['printing']),
  r('build-piano', 'Build a piano', 'manufactory', 'industrial', { 'hardwood-planks': 4, 'iron-ingot': 2 }, { pianos: 1 }, 300, ['factory-system']),
  r('make-radios', 'Make radios', 'assembly-plant', 'modern', { electronics: 1, plastics: 1 }, { radios: 2 }, 150, ['electricity']),
  // Weapons
  r('make-spears', 'Make spears', 'knapping-spot', 'hunter-gatherer', { softwood: 1, flint: 1, sinew: 1 }, { spears: 2 }, 90),
  r('make-bows', 'Make bows and arrows', 'workshop', 'stone', { softwood: 1, sinew: 2, fletching: 1 }, { bows: 1 }, 150),
  r('forge-iron-weapons', 'Forge iron weapons', 'smithy', 'iron', { 'iron-ingot': 2, lumber: 1 }, { 'iron-weapons': 1 }, 180, ['blacksmithing']),
  r('make-muskets', 'Make muskets', 'smithy', 'renaissance', { 'iron-ingot': 2, 'hardwood-planks': 1, gunpowder: 1 }, { muskets: 1 }, 240, ['gunpowder']),
  r('make-rifles', 'Make rifles', 'machine-shop', 'industrial', { 'iron-ingot': 3, 'hardwood-planks': 1 }, { rifles: 2 }, 200, ['steel']),
  // Transport
  r('build-cart', 'Build a cart', 'workshop', 'iron', { lumber: 4, 'iron-ingot': 1 }, { carts: 1 }, 240, ['timber-framing']),
  r('build-wagon', 'Build a wagon', 'workshop', 'medieval', { planks: 6, 'iron-ingot': 2 }, { wagons: 1 }, 300),
  r('build-locomotive', 'Build a locomotive', 'machine-shop', 'industrial', { 'iron-ingot': 20, 'steam-engine': 1 }, { locomotives: 1 }, 1200, ['railways']),
  r('build-automobile', 'Build an automobile', 'assembly-plant', 'modern', { 'machine-parts': 4, rubber: 2, glass: 2, 'electric-motor': 1 }, { automobiles: 1 }, 600, ['assembly-lines']),
  r('build-hover-carriage', 'Build a hover carriage', 'fabricator', 'techno-magic', { 'levitation-core': 2, aluminium: 4, 'mana-cell': 1 }, { 'hover-carriages': 1 }, 600, ['arcane-engineering']),
  // Machines: the parts the modern goods are made from
  r('make-machine-parts', 'Make machine parts', 'machine-shop', 'industrial', { 'iron-ingot': 3 }, { 'machine-parts': 2 }, 150, ['steam-pumps']),
  r('build-steam-engine', 'Build a steam engine', 'machine-shop', 'industrial', { 'machine-parts': 3, 'copper-ingot': 1 }, { 'steam-engine': 1 }, 300, ['steam-pumps']),
  r('wind-electric-motor', 'Wind an electric motor', 'assembly-plant', 'modern', { 'copper-ingot': 3, 'iron-ingot': 2, insulators: 1 }, { 'electric-motor': 1 }, 200, ['electricity']),
  r('make-electronics', 'Make electronics', 'assembly-plant', 'modern', { 'copper-ingot': 1, 'fine-glass': 1, plastics: 1, 'rare-earth-metals': 1 }, { electronics: 2 }, 200, ['electricity']),

  // Vehicles: canoes to airships.
  r('carve-canoe', 'Carve a dugout canoe', 'canoe-yard', 'stone', { hardwood: 8, resin: 2, 'stone-tools': 1 }, { 'dugout-canoe': 1 }, 600, ['dugout-canoe']),
  r('build-plank-boat', 'Build a plank boat', 'boatwright', 'iron', { lumber: 12, pitch: 3, rope: 2 }, { 'plank-boat': 1 }, 900, ['plank-boats']),
  r('build-sailing-ship', 'Build a sailing ship', 'shipyard', 'medieval', { planks: 40, canvas: 12, rope: 12, 'iron-ingot': 4 }, { 'sailing-ship': 1 }, 2400, ['sailing']),
  r('build-steamship', 'Build a steamship', 'steel-shipyard', 'industrial', { 'iron-ingot': 60, planks: 20, fuel: 10 }, { steamship: 1 }, 3000, ['steel']),
  r('build-airship', 'Build an airship', 'airship-yard', 'renaissance', { canvas: 20, 'hardwood-beams': 8, rope: 10, 'levitation-core': 4 }, { airship: 1 }, 3600, ['airship']),
  r('build-motor-airship', 'Build a motor airship', 'airship-works', 'industrial', { 'iron-ingot': 20, canvas: 30, 'levitation-core': 6, fuel: 10 }, { 'motor-airship': 1 }, 3600, ['steam-pumps']),
  r('attune-mana', 'Attune mana cell', 'crystal-attuner', 'medieval', { 'mana-crystal': 2 }, { 'mana-cell': 1 }, 150),
  r('bind-ember', 'Bind heat core', 'crystal-attuner', 'medieval', { 'ember-stone': 2 }, { 'heat-core': 1 }, 150),
  r('bind-frost', 'Bind cold core', 'crystal-attuner', 'medieval', { 'frost-shard': 2 }, { 'cold-core': 1 }, 150, ['cold-binding']),
  r('shape-spirit-focus', 'Shape spirit focus', 'crystal-attuner', 'medieval', { 'spirit-wood': 1 }, { 'spirit-focus': 1 }, 180),
  r('cut-levitation-core', 'Cut levitation core', 'levitation-workshop', 'renaissance', { 'hover-stone': 2 }, { 'levitation-core': 1 }, 180),
];

/** Recipes that consume a given material. */
export function recipesUsing(itemId: string): Recipe[] {
  return RECIPES.filter((x) => x.inputs[itemId] !== undefined);
}

export function itemName(id: string, materials: ReadonlyMap<string, { name: string }>): string {
  return materials.get(id)?.name ?? PRODUCTS[id] ?? id;
}
