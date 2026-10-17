interface ChallengeBase {
  id: string;
  /**
   * Identity of this challenge in the sync journal (the entity id of its
   * ops). The legacy self-start challenge keeps "plank"; new challenges
   * use their own id so both can live in one account's history.
   */
  syncId: string;
  title: string;
  description: string;
  exerciseId: string;
  totalDays: number;
  /**
   * Cohort start date (YYYY-MM-DD). When set, the challenge opens for
   * everyone on this date and day N is startDate + N - 1 for all users
   * (a shared clock, for social features). Self-start challenges omit it
   * and each user's window begins on their first recorded day.
   */
  startDate?: string;
  /** Seconds a hold needs to count as a completed (point-earning) day */
  baseSeconds: number;
  illustration: string;
}

/** The original challenge: fixed hold lengths, fixed point tiers. */
export interface ThresholdChallenge extends ChallengeBase {
  scoring: "threshold";
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
}

/** The reversed challenge: hold as long as you can, time-based points. */
export interface DurationChallenge extends ChallengeBase {
  scoring: "duration";
  /** Points for reaching the base hold (the first point) */
  basePoints: number;
  /** Each full increment of this many seconds above the base earns incrementPoints */
  incrementSeconds: number;
  incrementPoints: number;
  /** Holds past this earn no extra points (the scoring cap) */
  maxSeconds: number;
}

export type Challenge = ThresholdChallenge | DurationChallenge;

/** Holds shorter than this are not recorded (an accidental stop) */
export const MIN_VALID_HOLD_SECONDS = 10;

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
  /** Points earned today (challenge-specific: tiers for threshold, time-based for duration) */
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
  /** Points for the day (challenge-specific) | 0 (missed, pending today, or future) */
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

/** One day inside a windowed (e.g. 7-day) summary */
export interface WindowDay {
  date: string;
  points: number;
  isToday: boolean;
}

/** Aggregate over an inclusive date range — the "this week vs last week" view */
export interface WindowSummary {
  start: string;
  end: string;
  points: number;
  /** Completed stretch sessions inside the window */
  sessions: number;
  /** Sum of the daily best plank holds inside the window */
  plankSeconds: number;
  /** Days in the window that earned at least one point */
  activeDays: number;
  days: WindowDay[];
}
