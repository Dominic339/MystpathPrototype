// Wild plant species. Every plant material comes from a living plant in the world — a tree,
// a bush, a stand of grain, a patch of herbs — never from a pool on the tile. Wild plants are
// scattered and seasonal; growing them at scale needs a discovery and a farm, garden or orchard.

import type { PropKind } from '../world';

/** Spring, summer, autumn, winter: how fast the plant produces in each season (0 = not at all). */
export type Seasons = readonly [number, number, number, number];

export interface PlantSpecies {
  id: string;
  name: string;
  /** The model the renderer draws for it. */
  prop: PropKind;
  /** What one plant holds when fully grown, gathered without killing it. */
  yields: Readonly<Record<string, number>>;
  /** Game seconds to regrow from empty to full in a productive season. */
  regrowSeconds: number;
  seasons: Seasons;
  /** Per-item seasons where they differ from the plant's (acorns in autumn, deadwood all year). */
  itemSeasons?: Readonly<Record<string, Seasons>>;
  /** Discovery that lets villagers grow it on purpose. */
  cultivatedBy?: string;
}

const ALL: Seasons = [1, 1, 1, 0.6];
const GROWING: Seasons = [1, 1, 0.7, 0];
const FRUITING: Seasons = [0, 1, 1, 0];
const AUTUMN: Seasons = [0, 0.3, 1, 0];

const p = (id: string, name: string, prop: PropKind, yields: Record<string, number>, regrowSeconds: number, seasons: Seasons, cultivatedBy?: string, itemSeasons?: Record<string, Seasons>): PlantSpecies => ({ id, name, prop, yields, regrowSeconds, seasons, cultivatedBy, itemSeasons });

export const FLORA: readonly PlantSpecies[] = [
  // Trees: deadwood all year; nuts, fruit and resin in season. Felling for timber comes with stone axes.
  p('oak', 'Oak', 'oak', { hardwood: 3, nuts: 2 }, 2400, ALL, 'orchards', { nuts: AUTUMN }),
  p('birch', 'Birch', 'birch', { hardwood: 3 }, 2400, ALL),
  p('pine', 'Pine', 'pine', { softwood: 3, resin: 2 }, 2400, ALL),
  p('tropical-hardwood', 'Mahogany', 'tropical', { hardwood: 4 }, 2400, ALL),
  p('cork-oak', 'Cork oak', 'oak', { hardwood: 2, cork: 2 }, 4800, ALL),
  p('rubber-tree', 'Rubber tree', 'tropical', { hardwood: 2, latex: 2 }, 3600, ALL),
  p('wild-apple', 'Wild apple', 'apple', { hardwood: 1, 'wild-fruit': 5 }, 2400, ALL, 'orchards', { 'wild-fruit': FRUITING }),
  p('hazel', 'Hazel', 'hazel', { nuts: 4, softwood: 1 }, 2400, ALL, 'orchards', { nuts: AUTUMN }),
  p('bamboo', 'Bamboo', 'bamboo', { bamboo: 4 }, 1800, GROWING),
  p('spirit-tree', 'Spirit tree', 'spirit', { 'spirit-wood': 0.5, hardwood: 2 }, 9600, ALL, 'sacred-groves'),

  // Bushes and small plants.
  p('berry-bush', 'Berry bush', 'berrybush', { berries: 6 }, 2400, FRUITING, 'orchards'),
  p('thicket', 'Thicket', 'bush', { softwood: 1 }, 2400, ALL),
  p('wild-grain', 'Wild grain', 'grain', { 'wild-grain': 4 }, 3000, [0, 0.6, 1, 0], 'agriculture'),
  p('wild-tubers', 'Wild tubers', 'tubers', { roots: 3 }, 3000, [0.6, 1, 1, 0], 'agriculture'),
  p('mushrooms', 'Mushroom ring', 'mushrooms', { mushrooms: 3 }, 2400, [0.6, 0.2, 1, 0], 'mushroom-cultivation'),
  p('wild-herbs', 'Wild herb patch', 'flowers', { herbs: 2, 'dye-plants': 1 }, 2400, GROWING, 'herb-gardening'),
  p('prickly-pear', 'Prickly pear', 'cactus', { 'wild-fruit': 2 }, 3600, [0.3, 1, 0.6, 0]),
  p('desert-scrub', 'Desert scrub', 'scrub', { softwood: 1 }, 3600, ALL),
  p('spice-vine', 'Wild pepper vine', 'bush', { spices: 1 }, 4800, FRUITING, 'spice-cultivation'),

  // Fibres and wetland plants.
  p('reeds', 'Reeds', 'reeds', { reeds: 6 }, 2400, GROWING),
  p('wild-flax', 'Wild flax', 'flax', { flax: 3 }, 3000, [0.3, 1, 0.6, 0], 'fibre-crops'),
  p('wild-hemp', 'Wild hemp', 'flax', { hemp: 3 }, 3000, [0.3, 1, 0.6, 0], 'fibre-crops'),
  p('wild-cotton', 'Wild cotton', 'cotton', { cotton: 3 }, 3600, [0, 0.5, 1, 0], 'fibre-crops'),
  p('seaweed-bed', 'Seaweed bed', 'seaweed', { seaweed: 4 }, 2400, ALL),
];

export const FLORA_BY_ID: ReadonlyMap<string, PlantSpecies> = new Map(FLORA.map((x) => [x.id, x]));
