// Final goods: what villagers actually use. Each belongs to a category of need (clothing,
// tools, furniture…), has the age it first appears in, a quality (how much it adds to a
// person's life) and a lifetime (days before it wears out and needs replacing). People use
// the best good of each category the town has; as goods wear out the town makes more, and as
// the ages pass people come to expect better. Recipes for every good are in processing.ts.

import type { EraId } from './eras';

export type GoodCategory = 'clothing' | 'footwear' | 'tools' | 'furniture' | 'lighting' | 'wares' | 'medicine' | 'leisure' | 'weapons' | 'transport';

export interface Good {
  id: string;
  name: string;
  category: GoodCategory;
  era: EraId;
  /** 0..1: how much it adds to a person's life (tools: how much faster they work). */
  quality: number;
  /** Days one lasts a person. */
  lifetimeDays: number;
}

// Lifetimes are given in rough real-world feel and stretched to game days (a game day is
// twenty minutes, so a coat that lasts "a season" lasts dozens of them).
const g = (id: string, name: string, category: GoodCategory, era: EraId, quality: number, lifetimeDays: number): Good => ({ id, name, category, era, quality, lifetimeDays: lifetimeDays * 3 });

export const GOODS: readonly Good[] = [
  // Clothing and footwear
  g('hide-clothing', 'Hide clothing', 'clothing', 'hunter-gatherer', 0.3, 20),
  g('fur-cloak', 'Fur cloak', 'clothing', 'hunter-gatherer', 0.4, 25),
  g('woven-clothing', 'Woven clothing', 'clothing', 'stone', 0.55, 25),
  g('fine-clothing', 'Fine dyed clothing', 'clothing', 'medieval', 0.75, 30),
  g('factory-clothing', 'Factory-made clothing', 'clothing', 'industrial', 0.7, 20),
  g('synthetic-clothing', 'Synthetic clothing', 'clothing', 'modern', 0.8, 30),
  g('enchanted-garments', 'Enchanted garments', 'clothing', 'techno-magic', 0.95, 60),
  g('moccasins', 'Moccasins', 'footwear', 'stone', 0.4, 15),
  g('boots', 'Hobnailed boots', 'footwear', 'iron', 0.65, 30),
  g('factory-shoes', 'Factory shoes', 'footwear', 'industrial', 0.75, 30),
  // Tools: better tools make all work faster
  g('stone-tools', 'Stone tools', 'tools', 'hunter-gatherer', 0.3, 10),
  g('bone-tools', 'Bone tools', 'tools', 'hunter-gatherer', 0.3, 10),
  g('iron-tools', 'Iron tools', 'tools', 'iron', 0.6, 30),
  g('steel-tools', 'Steel tools', 'tools', 'industrial', 0.75, 40),
  g('power-tools', 'Power tools', 'tools', 'modern', 0.9, 40),
  g('mana-tools', 'Mana-charged tools', 'tools', 'techno-magic', 1, 80),
  // Home
  g('baskets', 'Baskets and mats', 'furniture', 'stone', 0.2, 30),
  g('simple-furniture', 'Simple furniture', 'furniture', 'stone', 0.45, 60),
  g('fine-furniture', 'Fine furniture', 'furniture', 'medieval', 0.7, 90),
  g('upholstered-furniture', 'Upholstered furniture', 'furniture', 'industrial', 0.8, 90),
  g('modern-furniture', 'Modern furniture', 'furniture', 'modern', 0.85, 90),
  g('candles', 'Candles', 'lighting', 'iron', 0.4, 5),
  g('oil-lamps', 'Oil lamps', 'lighting', 'renaissance', 0.6, 40),
  g('electric-lights', 'Electric lights', 'lighting', 'modern', 0.85, 60),
  g('mana-lamps', 'Mana lamps', 'lighting', 'techno-magic', 0.95, 120),
  g('pottery', 'Pottery', 'wares', 'stone', 0.35, 30),
  g('glassware', 'Glassware', 'wares', 'iron', 0.55, 40),
  g('metalware', 'Pots, pans and cutlery', 'wares', 'iron', 0.6, 60),
  g('porcelain', 'Porcelain', 'wares', 'renaissance', 0.75, 60),
  // Health
  g('medicine', 'Herbal medicine', 'medicine', 'stone', 0.5, 20),
  g('soap', 'Soap', 'medicine', 'iron', 0.45, 10),
  g('pharmaceuticals', 'Pharmaceuticals', 'medicine', 'modern', 0.85, 20),
  // Leisure and luxury
  g('drums', 'Drums', 'leisure', 'hunter-gatherer', 0.3, 60),
  g('mead', 'Mead', 'leisure', 'iron', 0.4, 5),
  g('beer', 'Beer', 'leisure', 'iron', 0.4, 5),
  g('wine', 'Wine', 'leisure', 'iron', 0.5, 5),
  g('jewellery', 'Jewellery', 'leisure', 'iron', 0.75, 200),
  g('books', 'Books', 'leisure', 'medieval', 0.6, 60),
  g('lutes', 'Lutes', 'leisure', 'medieval', 0.6, 90),
  g('printed-books', 'Printed books', 'leisure', 'renaissance', 0.7, 60),
  g('pianos', 'Pianos', 'leisure', 'industrial', 0.85, 200),
  g('radios', 'Radios', 'leisure', 'modern', 0.85, 90),
  // Weapons: better weapons make hunting (and, later, defence) easier
  g('spears', 'Spears', 'weapons', 'hunter-gatherer', 0.3, 20),
  g('bows', 'Bows and arrows', 'weapons', 'stone', 0.5, 25),
  g('iron-weapons', 'Iron weapons', 'weapons', 'iron', 0.65, 40),
  g('muskets', 'Muskets', 'weapons', 'renaissance', 0.75, 60),
  g('rifles', 'Rifles', 'weapons', 'industrial', 0.9, 80),
  // Transport: carts and their successors let people carry more
  g('carts', 'Carts', 'transport', 'iron', 0.5, 120),
  g('wagons', 'Wagons', 'transport', 'medieval', 0.65, 150),
  g('locomotives', 'Locomotives', 'transport', 'industrial', 0.8, 400),
  g('automobiles', 'Automobiles', 'transport', 'modern', 0.9, 300),
  g('hover-carriages', 'Hover carriages', 'transport', 'techno-magic', 1, 600),
];

export const GOOD_BY_ID: ReadonlyMap<string, Good> = new Map(GOODS.map((x) => [x.id, x]));
export const GOOD_CATEGORIES: readonly GoodCategory[] = ['clothing', 'footwear', 'tools', 'furniture', 'lighting', 'wares', 'medicine', 'leisure', 'weapons', 'transport'];

/** What people expect of their goods in each age: below it they grumble, above it they are glad. */
export const EXPECTED_QUALITY: Readonly<Record<EraId, number>> = {
  'hunter-gatherer': 0.2, stone: 0.3, iron: 0.45, medieval: 0.55, renaissance: 0.6, industrial: 0.65, modern: 0.75, 'techno-magic': 0.85,
};

/** Categories people feel the lack of (the rest only add joy when present). */
export const BASIC_NEEDS: readonly GoodCategory[] = ['clothing', 'tools', 'wares', 'medicine'];
