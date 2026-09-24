export interface Challenge {
  id: string;
  title: string;
  description: string;
  exerciseId: string;
  totalDays: number;
  /** Seconds required to complete a day */
  baseSeconds: number;
  /** Extra seconds that earn the bonus points */
  bonusSeconds: number;
  bonusPoints: number;
  illustration: string;
}

export interface ChallengeDay {
  /** Local calendar date, YYYY-MM-DD */
  date: string;
  /** Best hold that day, in seconds */
  seconds: number;
}

export interface PlankChallengeState {
  /** Local calendar date the challenge started, or null if not started */
  startedAt: string | null;
  days: ChallengeDay[];
}

export interface ChallengeStatus {
  status: "not-started" | "active" | "complete";
  /** 1-based current day within the challenge window */
  dayNumber: number;
  daysLeft: number;
  todayDone: boolean;
  todaySeconds: number;
  /** Points earned today (0, 1, or 1 + bonus) */
  todayPoints: number;
  /** Current plank score, including today's points */
  score: number;
  /** Fully elapsed days in the challenge window (the baseline) */
  baseline: number;
  /** How many points behind the baseline (0 when at/above it) */
  deficit: number;
  /**
   * Whether the +30s recovery hold is offered: only after at least one
   * missed day, while behind the baseline, and only up to 2 points behind.
   */
  bonusAvailable: boolean;
  completedDays: number;
  missedDays: number;
}

/** Beyond this deficit the +30s recovery hold is no longer offered */
export const MAX_RECOVERY_DEFICIT = 2;

/** A routine completion, as recorded in completedSessions */
export interface SessionCompletion {
  routineId: string;
  completedAt: string;
}

/** One day in the combined (plank + routines) point history */
export interface ChallengeDayDetail {
  date: string;
  dayNumber: number;
  /** 1 | 1.5 | 0 (missed, pending today, or future) */
  plankPoints: number;
  /** A past day with no completed hold (misses earn 0, not negative) */
  isMissed: boolean;
  /** +1 per unique routine completed that day */
  routinePoints: number;
  totalPoints: number;
  /** Combined points accumulated through this day */
  runningTotal: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface ChallengeProgress {
  started: boolean;
  days: ChallengeDayDetail[];
  plankTotal: number;
  routineTotal: number;
  combinedTotal: number;
}
