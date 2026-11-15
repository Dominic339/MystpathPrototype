// Animal species. Every animal material comes from a living animal: wild herds that roam,
// breed and can be hunted out, fish shoals, and fixed sources like hives, nests and shellfish
// beds. Keeping animals (wool, eggs, milk, poultry) needs animal husbandry and then a
// discovery for that animal, and a herd started from wild animals that live nearby.

import type { PropKind } from '../world';

export type Movement = 'land' | 'water' | 'fixed';

export interface AnimalSpecies {
  id: string;
  name: string;
  movement: Movement;
  /** Usual herd size when healthy. */
  herd: number;
  /** Walking and fleeing speed, metres per second. */
  speed: number;
  flee: number;
  /** How close a person can get before the herd notices (metres). */
  wariness: number;
  /** Base chance a hunter's attempt succeeds. */
  catchChance: number;
  /** What one animal gives when hunted, fished or harvested. */
  yields: Readonly<Record<string, number>>;
  /** For fixed sources (hives, nests, beds): how long they take to refill, game seconds. */
  regrowSeconds?: number;
  /** Model for fixed sources. */
  prop?: PropKind;
  /** Kept animals: the discovery that domesticates it and what a kept herd produces. */
  domestic?: { discovery: string; yields: Readonly<Record<string, number>> };
  /** Dangerous to hunt without organised hunting. */
  dangerous?: boolean;
}

const a = (s: AnimalSpecies): AnimalSpecies => s;

export const FAUNA: readonly AnimalSpecies[] = [
  // Land animals
  a({ id: 'red-deer', name: 'Red deer', movement: 'land', herd: 5, speed: 1.2, flee: 7, wariness: 24, catchChance: 0.35, yields: { 'game-meat': 14, hides: 2, bone: 4, sinew: 2, 'animal-fat': 2 } }),
  a({ id: 'wild-boar', name: 'Wild boar', movement: 'land', herd: 4, speed: 0.9, flee: 5, wariness: 14, catchChance: 0.3, dangerous: true, yields: { 'game-meat': 16, hides: 1, bone: 3, 'animal-fat': 5 }, domestic: { discovery: 'pig-farming', yields: { 'game-meat': 6, 'animal-fat': 3, hides: 1 } } }),
  a({ id: 'hare', name: 'Hare', movement: 'land', herd: 3, speed: 1.0, flee: 9, wariness: 10, catchChance: 0.45, yields: { 'game-meat': 2, fur: 1, bone: 0.5 } }),
  a({ id: 'wild-goat', name: 'Wild goat', movement: 'land', herd: 6, speed: 1.0, flee: 6, wariness: 20, catchChance: 0.3, yields: { 'game-meat': 5, hides: 1, bone: 2, sinew: 1, 'animal-fat': 1, wool: 1 }, domestic: { discovery: 'sheep-herding', yields: { wool: 2, milk: 3, 'game-meat': 3, hides: 1 } } }),
  a({ id: 'mouflon', name: 'Wild sheep', movement: 'land', herd: 7, speed: 1.0, flee: 6, wariness: 20, catchChance: 0.3, yields: { 'game-meat': 5, hides: 1, bone: 2, wool: 2, 'animal-fat': 1 }, domestic: { discovery: 'sheep-herding', yields: { wool: 4, milk: 2, 'game-meat': 3 } } }),
  a({ id: 'aurochs', name: 'Aurochs', movement: 'land', herd: 6, speed: 1.0, flee: 5, wariness: 18, catchChance: 0.2, dangerous: true, yields: { 'game-meat': 20, hides: 3, bone: 8, sinew: 3, 'animal-fat': 5 }, domestic: { discovery: 'cattle-herding', yields: { milk: 6, 'game-meat': 8, hides: 2 } } }),
  a({ id: 'elk', name: 'Elk', movement: 'land', herd: 3, speed: 1.1, flee: 6, wariness: 22, catchChance: 0.25, yields: { 'game-meat': 14, hides: 3, bone: 6, sinew: 3, 'animal-fat': 3 } }),
  a({ id: 'fox', name: 'Fox', movement: 'land', herd: 1, speed: 1.2, flee: 9, wariness: 16, catchChance: 0.3, yields: { fur: 2, bone: 0.5 } }),
  a({ id: 'bear', name: 'Bear', movement: 'land', herd: 1, speed: 1.0, flee: 6, wariness: 12, catchChance: 0.15, dangerous: true, yields: { 'game-meat': 16, fur: 4, bone: 6, 'animal-fat': 8, sinew: 2 } }),
  a({ id: 'seal', name: 'Seal', movement: 'land', herd: 5, speed: 0.6, flee: 3, wariness: 14, catchChance: 0.4, yields: { 'game-meat': 8, fur: 2, 'animal-fat': 8, bone: 2 } }),
  a({ id: 'wild-fowl', name: 'Wild ducks', movement: 'water', herd: 6, speed: 0.5, flee: 4, wariness: 16, catchChance: 0.3, yields: { 'game-meat': 2, feathers: 3, 'animal-fat': 0.5 } }),
  a({ id: 'junglefowl', name: 'Junglefowl', movement: 'land', herd: 5, speed: 0.8, flee: 6, wariness: 12, catchChance: 0.35, yields: { 'game-meat': 1, feathers: 2 }, domestic: { discovery: 'poultry-farming', yields: { eggs: 6, feathers: 3, poultry: 3 } } }),

  // Water
  a({ id: 'river-fish', name: 'River fish', movement: 'water', herd: 12, speed: 0.4, flee: 2, wariness: 4, catchChance: 0.5, yields: { fish: 1 } }),
  a({ id: 'sea-fish', name: 'Sea fish', movement: 'water', herd: 20, speed: 0.6, flee: 2, wariness: 4, catchChance: 0.35, yields: { fish: 1 } }),

  // Fixed sources, placed in the world like plants.
  a({ id: 'wild-bees', name: 'Wild beehive', movement: 'fixed', herd: 1, speed: 0, flee: 0, wariness: 0, catchChance: 1, yields: { honey: 3 }, regrowSeconds: 3600, prop: 'beehive' }),
  a({ id: 'nesting-birds', name: 'Bird nests', movement: 'fixed', herd: 1, speed: 0, flee: 0, wariness: 0, catchChance: 1, yields: { eggs: 4, feathers: 2 }, regrowSeconds: 2400, prop: 'nest' }),
  a({ id: 'shellfish-bed', name: 'Shellfish bed', movement: 'fixed', herd: 1, speed: 0, flee: 0, wariness: 0, catchChance: 1, yields: { shellfish: 5 }, regrowSeconds: 3000, prop: 'shellfish' }),
];

export const FAUNA_BY_ID: ReadonlyMap<string, AnimalSpecies> = new Map(FAUNA.map((x) => [x.id, x]));
