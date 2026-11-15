// The eight eras. A civilization enters an era after 5 discoveries from it.

export const ERAS = ['hunter-gatherer', 'stone', 'iron', 'medieval', 'renaissance', 'industrial', 'modern', 'techno-magic'] as const;
export type EraId = (typeof ERAS)[number];

export const ERA_NAMES: Record<EraId, string> = {
  'hunter-gatherer': 'Hunter-gatherer',
  stone: 'Stone',
  iron: 'Iron',
  medieval: 'Medieval',
  renaissance: 'Renaissance',
  industrial: 'Industrial',
  modern: 'Modern',
  'techno-magic': 'Techno-magic',
};

export function eraIndex(era: EraId): number {
  return ERAS.indexOf(era);
}
