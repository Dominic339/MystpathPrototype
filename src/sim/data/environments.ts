// Environments and their resource pools. Every hex has one environment; its surface pool is
// what can be collected from the ground, its subsurface pool is what lies below for mining.
// Abundance is 0..1: roughly the chance a hex carries the deposit and how rich it is.

export type EnvironmentId =
  | 'plains'
  | 'meadow'
  | 'temperate-forest'
  | 'conifer-forest'
  | 'tropical-forest'
  | 'desert'
  | 'dry-lake'
  | 'hills'
  | 'chalk-hills'
  | 'mountains'
  | 'snowy-hills'
  | 'glacier'
  | 'volcanic'
  | 'swamp'
  | 'riverbank'
  | 'river'
  | 'lake'
  | 'coast'
  | 'sea'
  | 'ancient-grove';

export interface Environment {
  id: EnvironmentId;
  name: string;
  surface: Readonly<Record<string, number>>;
  subsurface: Readonly<Record<string, number>>;
  /** Chance per hex of each world feature (wild hives, bird nests, herb patches). */
  features: Readonly<Record<string, number>>;
}

const FEATURES_BY_ENV: Partial<Record<EnvironmentId, Record<string, number>>> = {
  meadow: { 'wild-hive': 0.12, 'bird-nests': 0.1, 'herb-patch': 0.3 },
  plains: { 'bird-nests': 0.1, 'herb-patch': 0.1 },
  'temperate-forest': { 'wild-hive': 0.25, 'bird-nests': 0.1 },
  'conifer-forest': { 'wild-hive': 0.08, 'bird-nests': 0.08 },
  'tropical-forest': { 'wild-hive': 0.2, 'bird-nests': 0.2 },
  hills: { 'herb-patch': 0.15, 'bird-nests': 0.05 },
  'chalk-hills': { 'herb-patch': 0.2 },
  swamp: { 'bird-nests': 0.35, 'herb-patch': 0.1 },
  riverbank: { 'bird-nests': 0.3 },
  coast: { 'bird-nests': 0.4 },
  'ancient-grove': { 'wild-hive': 0.2, 'herb-patch': 0.3 },
};

const env = (id: EnvironmentId, name: string, surface: Record<string, number>, subsurface: Record<string, number> = {}): Environment => ({
  id,
  name,
  surface,
  subsurface,
  features: FEATURES_BY_ENV[id] ?? {},
});

export const ENVIRONMENTS: readonly Environment[] = [
  env('plains', 'Plains',
    { 'wild-grain': 0.8, roots: 0.5, flax: 0.4, hemp: 0.35, cotton: 0.15, herbs: 0.1, 'game-meat': 0.5, hides: 0.5, bone: 0.5, sinew: 0.4, 'animal-fat': 0.4, gravel: 0.3, 'dye-plants': 0.2, 'meteoric-iron': 0.01 },
    { stone: 0.4, clay: 0.3, phosphate: 0.15, 'crude-oil': 0.08, 'natural-gas': 0.06, coal: 0.12, 'iron-ore': 0.1 }),
  env('meadow', 'Meadow',
    { herbs: 0.24, 'wild-grain': 0.5, roots: 0.4, berries: 0.35, 'dye-plants': 0.4, flax: 0.25 },
    { stone: 0.35, clay: 0.25, chalk: 0.1 }),
  env('temperate-forest', 'Broadleaf forest',
    { hardwood: 0.9, softwood: 0.2, nuts: 0.6, mushrooms: 0.5, berries: 0.45, 'wild-fruit': 0.3, resin: 0.15, cork: 0.05, 'game-meat': 0.6, hides: 0.6, fur: 0.3, bone: 0.6, sinew: 0.5, 'animal-fat': 0.5, amber: 0.02 },
    { stone: 0.4, coal: 0.15, 'iron-ore': 0.1, clay: 0.2 }),
  env('conifer-forest', 'Conifer forest',
    { softwood: 0.9, resin: 0.6, mushrooms: 0.4, berries: 0.3, 'game-meat': 0.5, hides: 0.5, fur: 0.5, bone: 0.5, sinew: 0.4, 'animal-fat': 0.4, amber: 0.03 },
    { stone: 0.5, coal: 0.12, 'iron-ore': 0.1, 'copper-ore': 0.06 }),
  env('tropical-forest', 'Tropical forest',
    { hardwood: 0.8, bamboo: 0.6, 'wild-fruit': 0.7, spices: 0.4, latex: 0.45, nuts: 0.4, mushrooms: 0.3, 'dye-plants': 0.35, cotton: 0.2, 'game-meat': 0.5, hides: 0.4, bone: 0.4, },
    { bauxite: 0.3, clay: 0.3, gold: 0.03, emerald: 0.02 }),
  env('desert', 'Desert',
    { sand: 0.9, gypsum: 0.3, saltpeter: 0.15, bitumen: 0.06, 'meteoric-iron': 0.02, 'game-meat': 0.15, hides: 0.15 },
    { sandstone: 0.7, 'rock-salt': 0.3, gypsum: 0.4, 'crude-oil': 0.25, 'natural-gas': 0.2, 'copper-ore': 0.12, potash: 0.1, 'uranium-ore': 0.02 }),
  env('dry-lake', 'Dry lake bed',
    { borax: 0.5, 'rock-salt': 0.5, sand: 0.4, silt: 0.3 },
    { 'lithium-ore': 0.3, potash: 0.4, 'rock-salt': 0.6, gypsum: 0.3 }),
  env('hills', 'Hills',
    { stone: 0.5, flint: 0.25, herbs: 0.12, 'game-meat': 0.4, hides: 0.4, wool: 0.3, bone: 0.4, sinew: 0.3, 'animal-fat': 0.3, gravel: 0.3 },
    { stone: 0.8, limestone: 0.4, slate: 0.3, 'iron-ore': 0.35, 'copper-ore': 0.25, coal: 0.3, 'manganese-ore': 0.12, barite: 0.12, kaolin: 0.12, feldspar: 0.2, 'zinc-ore': 0.08, 'lead-ore': 0.08 }),
  env('chalk-hills', 'Chalk hills',
    { flint: 0.6, herbs: 0.1, chalk: 0.4, 'game-meat': 0.3, hides: 0.3, wool: 0.25 },
    { chalk: 0.9, limestone: 0.4, flint: 0.4 }),
  env('mountains', 'Mountains',
    { stone: 0.7, gravel: 0.3, wool: 0.2, 'game-meat': 0.2, fur: 0.2, 'hover-stone': 0.02 },
    {
      stone: 0.9, marble: 0.25, slate: 0.35, 'iron-ore': 0.4, 'copper-ore': 0.35, 'tin-ore': 0.15, 'lead-ore': 0.2, 'zinc-ore': 0.2, 'silver-ore': 0.15, gold: 0.06,
      'nickel-ore': 0.08, chromite: 0.1, 'tungsten-ore': 0.05, 'titanium-ore': 0.08, 'cobalt-ore': 0.05, 'platinum-ore': 0.015, 'rare-earth-ore': 0.02, 'uranium-ore': 0.015,
      graphite: 0.12, quartz: 0.35, mica: 0.25, fluorite: 0.1, feldspar: 0.3, ruby: 0.03, sapphire: 0.03, emerald: 0.02, diamond: 0.008,
      'mana-crystal': 0.04, 'hover-stone': 0.05, 'moonsilver-ore': 0.01,
    }),
  env('snowy-hills', 'Snowy hills',
    { ice: 0.7, fur: 0.6, 'game-meat': 0.35, hides: 0.35, bone: 0.35, 'animal-fat': 0.45, stone: 0.4, 'frost-shard': 0.03 },
    { stone: 0.7, 'iron-ore': 0.2, 'copper-ore': 0.15, quartz: 0.2, coal: 0.15 }),
  env('glacier', 'Glacier',
    { ice: 1, 'frost-shard': 0.15, gravel: 0.3 },
    { stone: 0.6 }),
  env('volcanic', 'Volcanic land',
    { obsidian: 0.6, pumice: 0.5, sulfur: 0.5, basalt: 0.3 },
    { basalt: 0.9, sulfur: 0.4, cinnabar: 0.15, amethyst: 0.12, 'ember-stone': 0.06, diamond: 0.01, 'copper-ore': 0.15, gold: 0.04 }),
  env('swamp', 'Swamp',
    { peat: 0.8, reeds: 0.7, silt: 0.7, mushrooms: 0.35, herbs: 0.1, 'game-meat': 0.25, fish: 0.3, 'fresh-water': 0.7 },
    { lignite: 0.4, peat: 0.6, clay: 0.4, 'natural-gas': 0.08 }),
  env('riverbank', 'Riverbank',
    { clay: 0.7, sand: 0.6, gravel: 0.6, reeds: 0.6, silt: 0.5, flint: 0.2, jade: 0.02, gold: 0.02, 'tin-ore': 0.03, sapphire: 0.01, 'fresh-water': 1, 'titanium-ore': 0.01 },
    { clay: 0.6, sand: 0.5, gravel: 0.5 }),
  env('river', 'River',
    { 'fresh-water': 1, fish: 0.8, shellfish: 0.3, gravel: 0.3, sand: 0.3, gold: 0.02, jade: 0.01 },
    { gravel: 0.5, sand: 0.4 }),
  env('lake', 'Lake',
    { 'fresh-water': 1, fish: 0.7, shellfish: 0.25, reeds: 0.3, silt: 0.5, ice: 0.1 },
    { silt: 0.6, clay: 0.4 }),
  env('coast', 'Coast',
    { sand: 0.9, shellfish: 0.6, seaweed: 0.6, 'salt-water': 1, amber: 0.05, 'titanium-ore': 0.05, gravel: 0.3 },
    { limestone: 0.3, phosphate: 0.2, sand: 0.6 }),
  env('sea', 'Sea',
    { 'salt-water': 1, fish: 0.8, shellfish: 0.4, seaweed: 0.5 },
    { 'crude-oil': 0.12, 'natural-gas': 0.12 }),
  env('ancient-grove', 'Ancient grove',
    { hardwood: 0.7, 'spirit-wood': 0.3, herbs: 0.17, mushrooms: 0.5, 'wild-fruit': 0.3 },
    { 'mana-crystal': 0.15, stone: 0.3 }),
];

export const ENVIRONMENT_BY_ID: ReadonlyMap<EnvironmentId, Environment> = new Map(ENVIRONMENTS.map((e) => [e.id, e]));

/** Materials that occur in an environment, at either layer. */
export function materialsIn(id: EnvironmentId): string[] {
  const e = ENVIRONMENT_BY_ID.get(id);
  if (!e) return [];
  return [...new Set([...Object.keys(e.surface), ...Object.keys(e.subsurface)])];
}
