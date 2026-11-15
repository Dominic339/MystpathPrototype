// The game clock. Minecraft-style cycle from the design doc:
//   day 10 min + night 10 min = one in-game day (20 real minutes at 1x speed)
//   10 days per season, 4 seasons per year (a year is 800 real minutes)

export const DAY_SECONDS = 600;
export const NIGHT_SECONDS = 600;
export const CYCLE_SECONDS = DAY_SECONDS + NIGHT_SECONDS;
export const DAYS_PER_SEASON = 10;
export const SEASONS_PER_YEAR = 4;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS_PER_YEAR;

export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
export type Season = (typeof SEASONS)[number];

export interface CalendarInfo {
  /** Whole in-game days elapsed since the world began. */
  dayIndex: number;
  /** Seconds into the current day-night cycle. */
  cycleSeconds: number;
  isDay: boolean;
  /** 0 → 1 across the daylight half (sunrise → sunset), or across the night half. */
  phaseProgress: number;
  /** Day within the season, 1-based. */
  dayOfSeason: number;
  season: Season;
  /** Year, 1-based. */
  year: number;
}

/** Game time is stored as total elapsed game seconds; speed multiplies real time. */
export class GameClock {
  totalSeconds: number;
  speed: number;

  constructor(totalSeconds = DAY_SECONDS * 0.3, speed = 1) {
    this.totalSeconds = totalSeconds;
    this.speed = speed;
  }

  advance(realSeconds: number): void {
    this.totalSeconds += realSeconds * this.speed;
  }

  info(): CalendarInfo {
    return calendar(this.totalSeconds);
  }
}

export function calendar(totalSeconds: number): CalendarInfo {
  const t = Math.max(0, totalSeconds);
  const dayIndex = Math.floor(t / CYCLE_SECONDS);
  const cycleSeconds = t - dayIndex * CYCLE_SECONDS;
  const isDay = cycleSeconds < DAY_SECONDS;
  const phaseProgress = isDay ? cycleSeconds / DAY_SECONDS : (cycleSeconds - DAY_SECONDS) / NIGHT_SECONDS;
  const dayOfYear = dayIndex % DAYS_PER_YEAR;
  const seasonIndex = Math.floor(dayOfYear / DAYS_PER_SEASON);
  return {
    dayIndex,
    cycleSeconds,
    isDay,
    phaseProgress,
    dayOfSeason: (dayOfYear % DAYS_PER_SEASON) + 1,
    season: SEASONS[seasonIndex],
    year: Math.floor(dayIndex / DAYS_PER_YEAR) + 1,
  };
}
