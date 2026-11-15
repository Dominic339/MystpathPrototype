// The 104 base (raw) materials — the inputs to every production chain.
// Each has one source: the ground (collected from the tile), below ground (quarried, mined,
// drilled), water, a plant species, or an animal species. Living things never sit in tile pools.

export type Layer = 'ground' | 'below' | 'water' | 'plant' | 'animal';
export type Category = 'stone-earth' | 'ore' | 'fuel-mineral' | 'gem' | 'water' | 'plant' | 'animal' | 'magic';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'very-rare';

export interface Material {
  id: string;
  name: string;
  category: Category;
  layer: Layer;
  rarity: Rarity;
  /** Spoils over time unless processed (food, organics). */
  perishable?: boolean;
  /** Proposed in the design doc rather than settled. */
  proposed?: boolean;
  /** Only comes from farming or kept animals, never found wild. */
  farmedOnly?: boolean;
}

const m = (id: string, name: string, category: Category, layer: Layer, rarity: Rarity = 'common', extra: Partial<Material> = {}): Material => ({ id, name, category, layer, rarity, ...extra });

export const MATERIALS: readonly Material[] = [
  // Stone and earth (18)
  m('stone', 'Stone (granite)', 'stone-earth', 'below'),
  m('limestone', 'Limestone', 'stone-earth', 'below'),
  m('sandstone', 'Sandstone', 'stone-earth', 'below'),
  m('marble', 'Marble', 'stone-earth', 'below', 'uncommon'),
  m('slate', 'Slate', 'stone-earth', 'below'),
  m('basalt', 'Basalt', 'stone-earth', 'below'),
  m('obsidian', 'Obsidian', 'stone-earth', 'ground', 'uncommon'),
  m('flint', 'Flint', 'stone-earth', 'ground'),
  m('chalk', 'Chalk', 'stone-earth', 'below'),
  m('clay', 'Clay', 'stone-earth', 'ground'),
  m('kaolin', 'Kaolin (china clay)', 'stone-earth', 'below', 'uncommon'),
  m('sand', 'Sand', 'stone-earth', 'ground'),
  m('gravel', 'Gravel', 'stone-earth', 'ground'),
  m('silt', 'Silt and mud', 'stone-earth', 'ground'),
  m('peat', 'Peat', 'stone-earth', 'ground'),
  m('rock-salt', 'Rock salt', 'stone-earth', 'below'),
  m('gypsum', 'Gypsum', 'stone-earth', 'below'),
  m('pumice', 'Pumice', 'stone-earth', 'ground', 'uncommon'),

  // Metal ores (20)
  m('iron-ore', 'Iron ore', 'ore', 'below'),
  m('copper-ore', 'Copper ore', 'ore', 'below'),
  m('tin-ore', 'Tin ore', 'ore', 'below', 'uncommon'),
  m('lead-ore', 'Lead ore', 'ore', 'below'),
  m('zinc-ore', 'Zinc ore', 'ore', 'below'),
  m('silver-ore', 'Silver ore', 'ore', 'below', 'uncommon'),
  m('gold', 'Gold (ore and river nuggets)', 'ore', 'below', 'rare'),
  m('nickel-ore', 'Nickel ore', 'ore', 'below', 'uncommon'),
  m('chromite', 'Chromite', 'ore', 'below', 'uncommon'),
  m('bauxite', 'Bauxite (aluminium)', 'ore', 'below'),
  m('manganese-ore', 'Manganese ore', 'ore', 'below'),
  m('tungsten-ore', 'Tungsten ore', 'ore', 'below', 'rare'),
  m('titanium-ore', 'Titanium ore', 'ore', 'below', 'uncommon'),
  m('cobalt-ore', 'Cobalt ore', 'ore', 'below', 'rare'),
  m('platinum-ore', 'Platinum ore', 'ore', 'below', 'very-rare'),
  m('cinnabar', 'Cinnabar (mercury)', 'ore', 'below', 'rare'),
  m('lithium-ore', 'Lithium ore', 'ore', 'below', 'rare'),
  m('uranium-ore', 'Uranium ore', 'ore', 'below', 'very-rare'),
  m('rare-earth-ore', 'Rare-earth ore', 'ore', 'below', 'very-rare'),
  m('meteoric-iron', 'Meteoric iron', 'ore', 'ground', 'very-rare'),

  // Fuels and industrial minerals (16)
  m('coal', 'Coal', 'fuel-mineral', 'below'),
  m('lignite', 'Lignite (brown coal)', 'fuel-mineral', 'below'),
  m('crude-oil', 'Crude oil', 'fuel-mineral', 'below', 'uncommon'),
  m('natural-gas', 'Natural gas', 'fuel-mineral', 'below', 'uncommon'),
  m('bitumen', 'Bitumen (tar)', 'fuel-mineral', 'ground', 'uncommon'),
  m('sulfur', 'Sulfur', 'fuel-mineral', 'ground', 'uncommon'),
  m('saltpeter', 'Saltpeter', 'fuel-mineral', 'ground', 'uncommon'),
  m('phosphate', 'Phosphate rock', 'fuel-mineral', 'below'),
  m('potash', 'Potash', 'fuel-mineral', 'below'),
  m('graphite', 'Graphite', 'fuel-mineral', 'below', 'uncommon'),
  m('quartz', 'Quartz crystal', 'fuel-mineral', 'below'),
  m('mica', 'Mica', 'fuel-mineral', 'below'),
  m('borax', 'Borax', 'fuel-mineral', 'ground', 'uncommon'),
  m('fluorite', 'Fluorite', 'fuel-mineral', 'below', 'uncommon'),
  m('barite', 'Barite', 'fuel-mineral', 'below'),
  m('feldspar', 'Feldspar', 'fuel-mineral', 'below'),

  // Gems (7)
  m('diamond', 'Diamond', 'gem', 'below', 'very-rare'),
  m('ruby', 'Ruby', 'gem', 'below', 'rare'),
  m('sapphire', 'Sapphire', 'gem', 'below', 'rare'),
  m('emerald', 'Emerald', 'gem', 'below', 'rare'),
  m('amethyst', 'Amethyst', 'gem', 'below', 'uncommon'),
  m('jade', 'Jade', 'gem', 'ground', 'uncommon'),
  m('amber', 'Amber', 'gem', 'ground', 'uncommon'),

  // Water and ice (3)
  m('fresh-water', 'Fresh water', 'water', 'water'),
  m('salt-water', 'Salt water', 'water', 'water'),
  m('ice', 'Ice', 'water', 'ground'),

  // Plants (20)
  m('softwood', 'Softwood logs', 'plant', 'plant'),
  m('hardwood', 'Hardwood logs', 'plant', 'plant'),
  m('bamboo', 'Bamboo', 'plant', 'plant'),
  m('reeds', 'Reeds', 'plant', 'plant'),
  m('flax', 'Flax', 'plant', 'plant'),
  m('cotton', 'Cotton', 'plant', 'plant'),
  m('hemp', 'Hemp', 'plant', 'plant'),
  m('wild-grain', 'Wild grain', 'plant', 'plant', 'common', { perishable: true }),
  m('berries', 'Berries', 'plant', 'plant', 'common', { perishable: true }),
  m('wild-fruit', 'Wild fruit', 'plant', 'plant', 'common', { perishable: true }),
  m('nuts', 'Nuts', 'plant', 'plant'),
  m('roots', 'Roots and tubers', 'plant', 'plant', 'common', { perishable: true }),
  m('herbs', 'Herbs', 'plant', 'plant', 'common', { perishable: true }),
  m('mushrooms', 'Mushrooms', 'plant', 'plant', 'common', { perishable: true }),
  m('resin', 'Tree resin', 'plant', 'plant'),
  m('latex', 'Latex (rubber)', 'plant', 'plant', 'uncommon'),
  m('seaweed', 'Seaweed', 'plant', 'plant', 'common', { perishable: true }),
  m('dye-plants', 'Dye plants', 'plant', 'plant'),
  m('cork', 'Cork bark', 'plant', 'plant', 'uncommon'),
  m('spices', 'Spices', 'plant', 'plant', 'uncommon'),

  // Animal materials (14)
  m('game-meat', 'Meat', 'animal', 'animal', 'common', { perishable: true }),
  m('fish', 'Fish', 'animal', 'animal', 'common', { perishable: true }),
  m('shellfish', 'Shellfish', 'animal', 'animal', 'common', { perishable: true }),
  m('hides', 'Hides', 'animal', 'animal', 'common', { perishable: true }),
  m('fur', 'Fur', 'animal', 'animal'),
  m('bone', 'Bone', 'animal', 'animal'),
  m('feathers', 'Feathers', 'animal', 'animal'),
  m('sinew', 'Sinew', 'animal', 'animal'),
  m('animal-fat', 'Animal fat', 'animal', 'animal', 'common', { perishable: true }),
  m('honey', 'Honey and beeswax', 'animal', 'animal', 'uncommon'),
  m('wool', 'Wool', 'animal', 'animal'),
  m('eggs', 'Eggs', 'animal', 'animal', 'common', { perishable: true }),
  m('poultry', 'Poultry', 'animal', 'animal', 'common', { perishable: true, farmedOnly: true }),
  m('milk', 'Milk', 'animal', 'animal', 'common', { perishable: true, farmedOnly: true }),

  // Magical materials (6)
  m('mana-crystal', 'Mana crystals', 'magic', 'below', 'rare'),
  m('hover-stone', 'Hover stone', 'magic', 'below', 'rare'),
  m('ember-stone', 'Ember stone', 'magic', 'below', 'rare', { proposed: true }),
  m('frost-shard', 'Frost shard', 'magic', 'ground', 'rare', { proposed: true }),
  m('moonsilver-ore', 'Moonsilver ore', 'magic', 'below', 'very-rare', { proposed: true }),
  m('spirit-wood', 'Spirit wood', 'magic', 'plant', 'very-rare', { proposed: true }),
];

export const MATERIAL_BY_ID: ReadonlyMap<string, Material> = new Map(MATERIALS.map((x) => [x.id, x]));

export function material(id: string): Material {
  const found = MATERIAL_BY_ID.get(id);
  if (!found) throw new Error(`Unknown material "${id}"`);
  return found;
}

/** Edible raw materials and how filling each unit is (0..1 of a day's food). */
export const FOOD_VALUE: Readonly<Record<string, number>> = {
  berries: 0.12,
  'wild-fruit': 0.15,
  nuts: 0.2,
  roots: 0.2,
  mushrooms: 0.1,
  'wild-grain': 0.18,
  'game-meat': 0.45,
  fish: 0.35,
  shellfish: 0.25,
  eggs: 0.2,
  poultry: 0.35,
  milk: 0.15,
  honey: 0.25,
  seaweed: 0.1,
};
