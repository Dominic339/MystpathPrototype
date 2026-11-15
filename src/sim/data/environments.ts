// Environments. Every hex has one, and it decides four things:
//   ground — non-living things lying on or just under the surface (stone, clay, sand, salt…),
//            collected from the tile; finite, they do not grow back;
//   flora  — which wild plant species grow there and how densely;
//   fauna  — which wild animals live there and how many;
//   below  — deposits deep underground, reached by quarries, mines and drills.
// Nothing living sits in a tile pool: meat comes from animals, berries from bushes.
// Abundance and density are 0..1.

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
  ground: Readonly<Record<string, number>>;
  flora: Readonly<Record<string, number>>;
  fauna: Readonly<Record<string, number>>;
  below: Readonly<Record<string, number>>;
  /** Water you can draw from here without limit. */
  water?: 'fresh-water' | 'salt-water';
}

type Def = { ground?: Record<string, number>; flora?: Record<string, number>; fauna?: Record<string, number>; below?: Record<string, number>; water?: 'fresh-water' | 'salt-water' };
const env = (id: EnvironmentId, name: string, d: Def): Environment => ({ id, name, ground: d.ground ?? {}, flora: d.flora ?? {}, fauna: d.fauna ?? {}, below: d.below ?? {}, water: d.water });

export const ENVIRONMENTS: readonly Environment[] = [
  env('plains', 'Plains', {
    ground: { gravel: 0.3, stone: 0.15, 'meteoric-iron': 0.01 },
    flora: { 'wild-grain': 0.8, 'wild-tubers': 0.4, 'wild-flax': 0.35, 'wild-hemp': 0.3, 'wild-herbs': 0.1, 'berry-bush': 0.15, 'cork-oak': 0.06 },
    fauna: { aurochs: 0.4, 'red-deer': 0.3, hare: 0.6, 'nesting-birds': 0.1 },
    below: { stone: 0.4, clay: 0.3, phosphate: 0.15, 'crude-oil': 0.08, 'natural-gas': 0.06, coal: 0.12, 'iron-ore': 0.1 },
  }),
  env('meadow', 'Meadow', {
    ground: { stone: 0.15, clay: 0.1 },
    flora: { 'wild-herbs': 0.35, 'wild-grain': 0.5, 'wild-tubers': 0.35, 'berry-bush': 0.35, 'wild-flax': 0.2, 'wild-apple': 0.1 },
    fauna: { hare: 0.6, 'red-deer': 0.25, fox: 0.15, 'wild-bees': 0.12, 'nesting-birds': 0.1 },
    below: { stone: 0.35, clay: 0.25, chalk: 0.1 },
  }),
  env('temperate-forest', 'Broadleaf forest', {
    ground: { stone: 0.2, clay: 0.15, amber: 0.02 },
    flora: { oak: 0.9, birch: 0.4, pine: 0.15, hazel: 0.4, 'berry-bush': 0.35, mushrooms: 0.45, 'wild-apple': 0.2, thicket: 0.4 },
    fauna: { 'red-deer': 0.6, 'wild-boar': 0.5, fox: 0.2, bear: 0.05, 'wild-bees': 0.25, 'nesting-birds': 0.1 },
    below: { stone: 0.4, coal: 0.15, 'iron-ore': 0.1, clay: 0.2 },
  }),
  env('conifer-forest', 'Conifer forest', {
    ground: { stone: 0.3, amber: 0.03 },
    flora: { pine: 0.95, birch: 0.2, mushrooms: 0.35, 'berry-bush': 0.25 },
    fauna: { elk: 0.4, 'red-deer': 0.3, bear: 0.1, fox: 0.3, 'wild-bees': 0.08, 'nesting-birds': 0.08 },
    below: { stone: 0.5, coal: 0.12, 'iron-ore': 0.1, 'copper-ore': 0.06 },
  }),
  env('tropical-forest', 'Tropical forest', {
    ground: { clay: 0.3 },
    flora: { 'tropical-hardwood': 0.8, bamboo: 0.5, 'rubber-tree': 0.4, 'spice-vine': 0.35, 'wild-apple': 0.4, 'wild-cotton': 0.2, mushrooms: 0.25, 'wild-herbs': 0.25 },
    fauna: { 'wild-boar': 0.5, junglefowl: 0.6, 'wild-bees': 0.2, 'nesting-birds': 0.2 },
    below: { bauxite: 0.3, clay: 0.3, gold: 0.03, emerald: 0.02 },
  }),
  env('desert', 'Desert', {
    ground: { sand: 0.9, gypsum: 0.3, saltpeter: 0.15, bitumen: 0.06, 'meteoric-iron': 0.02 },
    flora: { 'prickly-pear': 0.4, 'desert-scrub': 0.6 },
    fauna: { 'wild-goat': 0.1, hare: 0.1 },
    below: { sandstone: 0.7, 'rock-salt': 0.3, gypsum: 0.4, 'crude-oil': 0.25, 'natural-gas': 0.2, 'copper-ore': 0.12, potash: 0.1, 'uranium-ore': 0.02 },
  }),
  env('dry-lake', 'Dry lake bed', {
    ground: { borax: 0.5, 'rock-salt': 0.5, sand: 0.4, silt: 0.3 },
    below: { 'lithium-ore': 0.3, potash: 0.4, 'rock-salt': 0.6, gypsum: 0.3 },
  }),
  env('hills', 'Hills', {
    ground: { stone: 0.5, flint: 0.25, gravel: 0.3 },
    flora: { 'wild-herbs': 0.15, thicket: 0.3, 'berry-bush': 0.15, hazel: 0.15, pine: 0.2 },
    fauna: { 'wild-goat': 0.5, mouflon: 0.4, 'red-deer': 0.2, hare: 0.3, 'nesting-birds': 0.05 },
    below: { stone: 0.8, limestone: 0.4, slate: 0.3, 'iron-ore': 0.35, 'copper-ore': 0.25, coal: 0.3, 'manganese-ore': 0.12, barite: 0.12, kaolin: 0.12, feldspar: 0.2, 'zinc-ore': 0.08, 'lead-ore': 0.08 },
  }),
  env('chalk-hills', 'Chalk hills', {
    ground: { flint: 0.6, chalk: 0.4 },
    flora: { 'wild-herbs': 0.2, thicket: 0.2, 'cork-oak': 0.15 },
    fauna: { mouflon: 0.4, hare: 0.4 },
    below: { chalk: 0.9, limestone: 0.4, flint: 0.4 },
  }),
  env('mountains', 'Mountains', {
    ground: { stone: 0.7, gravel: 0.3, 'hover-stone': 0.02 },
    flora: { pine: 0.2 },
    fauna: { 'wild-goat': 0.4, bear: 0.05 },
    below: {
      stone: 0.9, marble: 0.25, slate: 0.35, 'iron-ore': 0.4, 'copper-ore': 0.35, 'tin-ore': 0.15, 'lead-ore': 0.2, 'zinc-ore': 0.2, 'silver-ore': 0.15, gold: 0.06,
      'nickel-ore': 0.08, chromite: 0.1, 'tungsten-ore': 0.05, 'titanium-ore': 0.08, 'cobalt-ore': 0.05, 'platinum-ore': 0.015, 'rare-earth-ore': 0.02, 'uranium-ore': 0.015,
      graphite: 0.12, quartz: 0.35, mica: 0.25, fluorite: 0.1, feldspar: 0.3, ruby: 0.03, sapphire: 0.03, emerald: 0.02, diamond: 0.008,
      'mana-crystal': 0.04, 'hover-stone': 0.05, 'moonsilver-ore': 0.01,
    },
  }),
  env('snowy-hills', 'Snowy hills', {
    ground: { ice: 0.7, stone: 0.4, 'frost-shard': 0.03 },
    flora: { pine: 0.2 },
    fauna: { elk: 0.3, fox: 0.4, bear: 0.1, hare: 0.3 },
    below: { stone: 0.7, 'iron-ore': 0.2, 'copper-ore': 0.15, quartz: 0.2, coal: 0.15 },
  }),
  env('glacier', 'Glacier', {
    ground: { ice: 1, 'frost-shard': 0.15, gravel: 0.3 },
    below: { stone: 0.6 },
  }),
  env('volcanic', 'Volcanic land', {
    ground: { obsidian: 0.6, pumice: 0.5, sulfur: 0.5, basalt: 0.3 },
    below: { basalt: 0.9, sulfur: 0.4, cinnabar: 0.15, amethyst: 0.12, 'ember-stone': 0.06, diamond: 0.01, 'copper-ore': 0.15, gold: 0.04 },
  }),
  env('swamp', 'Swamp', {
    ground: { peat: 0.8, silt: 0.7 },
    flora: { reeds: 0.7, mushrooms: 0.35, 'wild-herbs': 0.1 },
    fauna: { 'wild-fowl': 0.6, 'wild-boar': 0.2, 'river-fish': 0.3, 'nesting-birds': 0.35 },
    below: { lignite: 0.4, peat: 0.6, clay: 0.4, 'natural-gas': 0.08 },
    water: 'fresh-water',
  }),
  env('riverbank', 'Riverbank', {
    ground: { clay: 0.7, sand: 0.6, gravel: 0.6, silt: 0.5, flint: 0.2, jade: 0.02, gold: 0.02, 'tin-ore': 0.03, sapphire: 0.01, 'titanium-ore': 0.01 },
    flora: { reeds: 0.6, 'wild-herbs': 0.1 },
    fauna: { 'wild-fowl': 0.3, 'nesting-birds': 0.3, 'shellfish-bed': 0.2 },
    below: { clay: 0.6, sand: 0.5, gravel: 0.5 },
    water: 'fresh-water',
  }),
  env('river', 'River', {
    ground: { gravel: 0.3, sand: 0.3, gold: 0.02, jade: 0.01 },
    fauna: { 'river-fish': 0.8, 'shellfish-bed': 0.3, 'wild-fowl': 0.2 },
    below: { gravel: 0.5, sand: 0.4 },
    water: 'fresh-water',
  }),
  env('lake', 'Lake', {
    ground: { silt: 0.5, ice: 0.1 },
    flora: { reeds: 0.3 },
    fauna: { 'river-fish': 0.7, 'shellfish-bed': 0.25, 'wild-fowl': 0.5 },
    below: { silt: 0.6, clay: 0.4 },
    water: 'fresh-water',
  }),
  env('coast', 'Coast', {
    ground: { sand: 0.9, amber: 0.05, 'titanium-ore': 0.05, gravel: 0.3 },
    flora: { 'seaweed-bed': 0.6 },
    fauna: { 'shellfish-bed': 0.6, seal: 0.3, 'nesting-birds': 0.4 },
    below: { limestone: 0.3, phosphate: 0.2, sand: 0.6 },
    water: 'salt-water',
  }),
  env('sea', 'Sea', {
    flora: { 'seaweed-bed': 0.5 },
    fauna: { 'sea-fish': 0.8, 'shellfish-bed': 0.3, seal: 0.1 },
    below: { 'crude-oil': 0.12, 'natural-gas': 0.12 },
    water: 'salt-water',
  }),
  env('ancient-grove', 'Ancient grove', {
    ground: { stone: 0.2 },
    flora: { oak: 0.7, 'spirit-tree': 0.3, 'wild-herbs': 0.25, mushrooms: 0.5, 'wild-apple': 0.3 },
    fauna: { 'red-deer': 0.3, 'wild-bees': 0.2 },
    below: { 'mana-crystal': 0.15, stone: 0.3 },
  }),
];

export const ENVIRONMENT_BY_ID: ReadonlyMap<EnvironmentId, Environment> = new Map(ENVIRONMENTS.map((e) => [e.id, e]));
