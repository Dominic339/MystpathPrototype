// The 103 base (raw) materials — the inputs to every production chain.
// Each comes from the surface (collected), the subsurface (mined), water, or animals.

export type Layer = 'surface' | 'subsurface' | 'water' | 'animal';
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
  /** Only comes from farming or husbandry, never found wild. */
  farmedOnly?: boolean;
}

const m = (id: string, name: string, category: Category, layer: Layer, rarity: Rarity = 'common', extra: Partial<Material> = {}): Material => ({ id, name, category, layer, rarity, ...extra });

export const MATERIALS: readonly Material[] = [
  // Stone and earth (18)
  m('stone', 'Stone (granite)', 'stone-earth', 'subsurface'),
  m('limestone', 'Limestone', 'stone-earth', 'subsurface'),
  m('sandstone', 'Sandstone', 'stone-earth', 'subsurface'),
  m('marble', 'Marble', 'stone-earth', 'subsurface', 'uncommon'),
  m('slate', 'Slate', 'stone-earth', 'subsurface'),
  m('basalt', 'Basalt', 'stone-earth', 'subsurface'),
  m('obsidian', 'Obsidian', 'stone-earth', 'surface', 'uncommon'),
  m('flint', 'Flint', 'stone-earth', 'surface'),
  m('chalk', 'Chalk', 'stone-earth', 'subsurface'),
  m('clay', 'Clay', 'stone-earth', 'surface'),
  m('kaolin', 'Kaolin (china clay)', 'stone-earth', 'subsurface', 'uncommon'),
  m('sand', 'Sand', 'stone-earth', 'surface'),
  m('gravel', 'Gravel', 'stone-earth', 'surface'),
  m('silt', 'Silt and mud', 'stone-earth', 'surface'),
  m('peat', 'Peat', 'stone-earth', 'surface'),
  m('rock-salt', 'Rock salt', 'stone-earth', 'subsurface'),
  m('gypsum', 'Gypsum', 'stone-earth', 'subsurface'),
  m('pumice', 'Pumice', 'stone-earth', 'surface', 'uncommon'),

  // Metal ores (20)
  m('iron-ore', 'Iron ore', 'ore', 'subsurface'),
  m('copper-ore', 'Copper ore', 'ore', 'subsurface'),
  m('tin-ore', 'Tin ore', 'ore', 'subsurface', 'uncommon'),
  m('lead-ore', 'Lead ore', 'ore', 'subsurface'),
  m('zinc-ore', 'Zinc ore', 'ore', 'subsurface'),
  m('silver-ore', 'Silver ore', 'ore', 'subsurface', 'uncommon'),
  m('gold', 'Gold (ore and river nuggets)', 'ore', 'subsurface', 'rare'),
  m('nickel-ore', 'Nickel ore', 'ore', 'subsurface', 'uncommon'),
  m('chromite', 'Chromite', 'ore', 'subsurface', 'uncommon'),
  m('bauxite', 'Bauxite (aluminium)', 'ore', 'subsurface'),
  m('manganese-ore', 'Manganese ore', 'ore', 'subsurface'),
  m('tungsten-ore', 'Tungsten ore', 'ore', 'subsurface', 'rare'),
  m('titanium-ore', 'Titanium ore', 'ore', 'subsurface', 'uncommon'),
  m('cobalt-ore', 'Cobalt ore', 'ore', 'subsurface', 'rare'),
  m('platinum-ore', 'Platinum ore', 'ore', 'subsurface', 'very-rare'),
  m('cinnabar', 'Cinnabar (mercury)', 'ore', 'subsurface', 'rare'),
  m('lithium-ore', 'Lithium ore', 'ore', 'subsurface', 'rare'),
  m('uranium-ore', 'Uranium ore', 'ore', 'subsurface', 'very-rare'),
  m('rare-earth-ore', 'Rare-earth ore', 'ore', 'subsurface', 'very-rare'),
  m('meteoric-iron', 'Meteoric iron', 'ore', 'surface', 'very-rare'),

  // Fuels and industrial minerals (16)
  m('coal', 'Coal', 'fuel-mineral', 'subsurface'),
  m('lignite', 'Lignite (brown coal)', 'fuel-mineral', 'subsurface'),
  m('crude-oil', 'Crude oil', 'fuel-mineral', 'subsurface', 'uncommon'),
  m('natural-gas', 'Natural gas', 'fuel-mineral', 'subsurface', 'uncommon'),
  m('bitumen', 'Bitumen (tar)', 'fuel-mineral', 'surface', 'uncommon'),
  m('sulfur', 'Sulfur', 'fuel-mineral', 'surface', 'uncommon'),
  m('saltpeter', 'Saltpeter', 'fuel-mineral', 'surface', 'uncommon'),
  m('phosphate', 'Phosphate rock', 'fuel-mineral', 'subsurface'),
  m('potash', 'Potash', 'fuel-mineral', 'subsurface'),
  m('graphite', 'Graphite', 'fuel-mineral', 'subsurface', 'uncommon'),
  m('quartz', 'Quartz crystal', 'fuel-mineral', 'subsurface'),
  m('mica', 'Mica', 'fuel-mineral', 'subsurface'),
  m('borax', 'Borax', 'fuel-mineral', 'surface', 'uncommon'),
  m('fluorite', 'Fluorite', 'fuel-mineral', 'subsurface', 'uncommon'),
  m('barite', 'Barite', 'fuel-mineral', 'subsurface'),
  m('feldspar', 'Feldspar', 'fuel-mineral', 'subsurface'),

  // Gems (7)
  m('diamond', 'Diamond', 'gem', 'subsurface', 'very-rare'),
  m('ruby', 'Ruby', 'gem', 'subsurface', 'rare'),
  m('sapphire', 'Sapphire', 'gem', 'subsurface', 'rare'),
  m('emerald', 'Emerald', 'gem', 'subsurface', 'rare'),
  m('amethyst', 'Amethyst', 'gem', 'subsurface', 'uncommon'),
  m('jade', 'Jade', 'gem', 'surface', 'uncommon'),
  m('amber', 'Amber', 'gem', 'surface', 'uncommon'),

  // Water and ice (3)
  m('fresh-water', 'Fresh water', 'water', 'water'),
  m('salt-water', 'Salt water', 'water', 'water'),
  m('ice', 'Ice', 'water', 'surface'),

  // Plants (20)
  m('softwood', 'Softwood logs', 'plant', 'surface'),
  m('hardwood', 'Hardwood logs', 'plant', 'surface'),
  m('bamboo', 'Bamboo', 'plant', 'surface'),
  m('reeds', 'Reeds', 'plant', 'surface'),
  m('flax', 'Flax', 'plant', 'surface'),
  m('cotton', 'Cotton', 'plant', 'surface'),
  m('hemp', 'Hemp', 'plant', 'surface'),
  m('wild-grain', 'Wild grain', 'plant', 'surface', 'common', { perishable: true }),
  m('berries', 'Berries', 'plant', 'surface', 'common', { perishable: true }),
  m('wild-fruit', 'Wild fruit', 'plant', 'surface', 'common', { perishable: true }),
  m('nuts', 'Nuts', 'plant', 'surface'),
  m('roots', 'Roots and tubers', 'plant', 'surface', 'common', { perishable: true }),
  m('herbs', 'Herbs', 'plant', 'surface', 'common', { perishable: true }),
  m('mushrooms', 'Mushrooms', 'plant', 'surface', 'common', { perishable: true }),
  m('resin', 'Tree resin', 'plant', 'surface'),
  m('latex', 'Latex (rubber)', 'plant', 'surface', 'uncommon'),
  m('seaweed', 'Seaweed', 'plant', 'water', 'common', { perishable: true }),
  m('dye-plants', 'Dye plants', 'plant', 'surface'),
  m('cork', 'Cork bark', 'plant', 'surface', 'uncommon'),
  m('spices', 'Spices', 'plant', 'surface', 'uncommon'),

  // Animal materials (13)
  m('game-meat', 'Game meat', 'animal', 'animal', 'common', { perishable: true }),
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

  // Magical materials (6)
  m('mana-crystal', 'Mana crystals', 'magic', 'subsurface', 'rare'),
  m('hover-stone', 'Hover stone', 'magic', 'subsurface', 'rare'),
  m('ember-stone', 'Ember stone', 'magic', 'subsurface', 'rare', { proposed: true }),
  m('frost-shard', 'Frost shard', 'magic', 'surface', 'rare', { proposed: true }),
  m('moonsilver-ore', 'Moonsilver ore', 'magic', 'subsurface', 'very-rare', { proposed: true }),
  m('spirit-wood', 'Spirit wood', 'magic', 'surface', 'very-rare', { proposed: true }),
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
  honey: 0.25,
  seaweed: 0.1,
};
