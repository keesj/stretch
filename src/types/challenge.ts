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
  /**
   * Milestone cadence: every Nth day of the challenge (days 10, 20, ...
   * when N is 10) requires the longer milestone hold. 0 disables it.
   */
  milestoneEvery: number;
  /** Seconds of the milestone hold, which upgrades a milestone day to the milestone points */
  milestoneSeconds: number;
  /** Points a milestone day is worth when the milestone hold is completed */
  milestonePoints: number;
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
  /** Days still needing a hold; today counts until it is done */
  daysLeft: number;
  todayDone: boolean;
  todaySeconds: number;
  /** Points earned today (0, 1, 1 + bonus, or milestone points) */
  todayPoints: number;
  /** True when today is a milestone day (every milestoneEvery-th day) */
  todayIsMilestone: boolean;
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

/** One day in the plank point history within the challenge window */
export interface ChallengeDayDetail {
  date: string;
  dayNumber: number;
  /** 1 | 1.5 | 2 (milestone day) | 0 (missed, pending today, or future) */
  plankPoints: number;
  /** A past day with no completed hold (misses earn 0, not negative) */
  isMissed: boolean;
  /** Plank points accumulated through this day */
  runningTotal: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface ChallengeProgress {
  started: boolean;
  days: ChallengeDayDetail[];
  plankTotal: number;
}

/** Points earned on a single day, split by source */
export interface PointsBreakdown {
  plank: number;
  routine: number;
  total: number;
}

/** All-time point totals across planks and routines */
export interface OverallTotals {
  plank: number;
  routine: number;
  total: number;
}

/** One bar in the month chart: one day */
export interface MonthDayBar {
  date: string;
  dayOfMonth: number;
  points: number;
  isToday: boolean;
}

/** One bar in the year chart: one Monday-start week */
export interface YearWeekBar {
  weekStart: string;
  weekNumber: number;
  points: number;
}
