// World features: individual wild sources placed in the world, such as beehives and bird
// nests. Unlike tile resources they are few, small and slow to recover — scaling up needs
// a discovery (beekeeping, poultry farming).

export interface Feature {
  id: string;
  name: string;
  /** Stock when full. */
  yields: Readonly<Record<string, number>>;
  /** Game seconds to regrow from empty to full. */
  regrowSeconds: number;
}

export const FEATURES: readonly Feature[] = [
  { id: 'wild-hive', name: 'Wild beehive', yields: { honey: 3 }, regrowSeconds: 3600 },
  { id: 'bird-nests', name: 'Bird nests', yields: { eggs: 4, feathers: 2 }, regrowSeconds: 2400 },
  { id: 'herb-patch', name: 'Wild herb patch', yields: { herbs: 2, 'dye-plants': 1 }, regrowSeconds: 2400 },
];

export const FEATURE_BY_ID: ReadonlyMap<string, Feature> = new Map(FEATURES.map((f) => [f.id, f]));
