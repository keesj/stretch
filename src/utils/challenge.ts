import { loadFromStorage, saveToStorage } from "./storage";
import { MAX_RECOVERY_DEFICIT } from "../types/challenge";
import type {
  Challenge,
  ChallengeDay,
  ChallengeDayDetail,
  ChallengeProgress,
  ChallengeStatus,
  PlankChallengeState,
} from "../types/challenge";

export const DEFAULT_PLANK_STATE: PlankChallengeState = {
  startedAt: null,
  days: [],
};

export function todayKey(now: Date = new Date()): string {
  return toKey(now);
}

export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, amount: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + amount);
  return toKey(d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86400000);
}

export function loadPlankState(): PlankChallengeState {
  const state = loadFromStorage<PlankChallengeState>(
    "plankChallenge",
    DEFAULT_PLANK_STATE
  );
  if (!state || typeof state !== "object") {
    return { ...DEFAULT_PLANK_STATE, days: [] };
  }
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (
    state.startedAt !== null &&
    (typeof state.startedAt !== "string" || !datePattern.test(state.startedAt))
  ) {
    return { ...DEFAULT_PLANK_STATE, days: [] };
  }
  const days = Array.isArray(state.days)
    ? state.days.filter(
        (d): d is ChallengeDay =>
          !!d &&
          typeof d.date === "string" &&
          datePattern.test(d.date) &&
          typeof d.seconds === "number" &&
          d.seconds > 0
      )
    : [];
  return { startedAt: state.startedAt, days };
}

export function savePlankState(state: PlankChallengeState): void {
  saveToStorage("plankChallenge", state);
}

export function startPlankChallenge(now: Date = new Date()): PlankChallengeState {
  const state: PlankChallengeState = { startedAt: todayKey(now), days: [] };
  savePlankState(state);
  return state;
}

/** Merge a completed hold into the state, keeping the best hold per day. */
export function mergePlankDay(
  state: PlankChallengeState,
  date: string,
  seconds: number
): PlankChallengeState {
  const existing = state.days.find((d) => d.date === date);
  const days: ChallengeDay[] = existing
    ? state.days.map((d) =>
        d.date === date ? { ...d, seconds: Math.max(d.seconds, seconds) } : d
      )
    : [...state.days, { date, seconds }];
  return { startedAt: state.startedAt ?? date, days };
}

export function completePlankDay(
  seconds: number,
  now: Date = new Date()
): PlankChallengeState {
  const next = mergePlankDay(loadPlankState(), todayKey(now), seconds);
  savePlankState(next);
  return next;
}

/** True when the given day number is a milestone day (day 10, 20, ...). */
export function isMilestoneDay(challenge: Challenge, dayNumber: number): boolean {
  return (
    challenge.milestoneEvery > 0 &&
    dayNumber >= 1 &&
    dayNumber <= challenge.totalDays &&
    dayNumber % challenge.milestoneEvery === 0
  );
}

/** Seconds required to complete the given day (milestone days are longer). */
export function holdSecondsForDay(
  challenge: Challenge,
  dayNumber: number
): number {
  return isMilestoneDay(challenge, dayNumber)
    ? challenge.milestoneSeconds
    : challenge.baseSeconds;
}

/**
 * 1-based day number for a date, or 0 when the challenge has no start
 * date or the date falls outside the challenge window.
 */
export function dayNumberForDate(
  challenge: Challenge,
  state: PlankChallengeState,
  date: string
): number {
  if (!state.startedAt) return 0;
  const dayNumber = daysBetween(state.startedAt, date) + 1;
  return dayNumber >= 1 && dayNumber <= challenge.totalDays ? dayNumber : 0;
}

/**
 * Points for a hold on a given challenge day. Milestone days require the
 * full milestone hold and pay the milestone points total; other days pay
 * 1 at base, 1 + bonus at base + bonusSeconds.
 */
export function pointsForHold(
  challenge: Challenge,
  seconds: number,
  dayNumber: number
): number {
  if (isMilestoneDay(challenge, dayNumber)) {
    return seconds >= challenge.milestoneSeconds ? challenge.milestonePoints : 0;
  }
  if (seconds >= challenge.baseSeconds + challenge.bonusSeconds) {
    return 1 + challenge.bonusPoints;
  }
  if (seconds >= challenge.baseSeconds) {
    return 1;
  }
  return 0;
}

/**
 * Derive the full challenge status from start date + completed days.
 * The score is recomputed from scratch, so missed days (−penalty) are
 * picked up automatically whenever a new day arrives.
 */
export function getChallengeStatus(
  challenge: Challenge,
  state: PlankChallengeState,
  now: Date = new Date()
): ChallengeStatus {
  const today = todayKey(now);

  if (!state.startedAt) {
    return {
      status: "not-started",
      dayNumber: 1,
      daysLeft: challenge.totalDays,
      todayDone: false,
      todaySeconds: 0,
      todayPoints: 0,
      todayIsMilestone: false,
      score: 0,
      baseline: 0,
      deficit: 0,
      bonusAvailable: false,
      completedDays: 0,
      missedDays: 0,
    };
  }

  const start = state.startedAt;
  const end = addDays(start, challenge.totalDays - 1);
  // The latest day that is fully in the past (can be completed or missed)
  const lastFullDay = today > end ? end : addDays(today, -1);

  const secondsByDate = new Map<string, number>(
    state.days.map((d) => [d.date, d.seconds])
  );

  let pastScore = 0;
  let pastDays = 0;
  let pastCompletedDays = 0;
  let missedDays = 0;

  let cursor = start;
  while (cursor <= lastFullDay) {
    pastDays += 1;
    const cursorDay = daysBetween(start, cursor) + 1;
    const points = pointsForHold(challenge, secondsByDate.get(cursor) ?? 0, cursorDay);
    if (points > 0) {
      pastScore += points;
      pastCompletedDays += 1;
    } else {
      // A missed day earns 0 (no penalty) — it just widens the deficit.
      missedDays += 1;
    }
    cursor = addDays(cursor, 1);
  }

  const todayInWindow = today >= start && today <= end;
  const todaySeconds = todayInWindow ? (secondsByDate.get(today) ?? 0) : 0;
  const dayNumber = Math.min(
    Math.max(daysBetween(start, today) + 1, 1),
    challenge.totalDays
  );
  const todayIsMilestone = todayInWindow && isMilestoneDay(challenge, dayNumber);
  const todayPoints = todayInWindow
    ? pointsForHold(challenge, todaySeconds, dayNumber)
    : 0;

  // The baseline is the number of fully elapsed days. The recovery hold is
  // only offered while behind the baseline (after at least one miss) and
  // only up to MAX_RECOVERY_DEFICIT points behind. It is not offered on a
  // milestone day, where it could not clear the longer hold.
  const deficit = Math.max(pastDays - pastScore, 0);
  const bonusAvailable =
    !todayIsMilestone &&
    missedDays > 0 &&
    deficit > 0 &&
    deficit <= MAX_RECOVERY_DEFICIT;

  return {
    status: today > end ? "complete" : "active",
    dayNumber,
    daysLeft: Math.max(
      challenge.totalDays - dayNumber + (todayPoints > 0 ? 0 : 1),
      0
    ),
    todayDone: todayPoints > 0,
    todaySeconds,
    todayPoints,
    todayIsMilestone,
    score: pastScore + todayPoints,
    baseline: pastDays,
    deficit,
    bonusAvailable,
    completedDays: pastCompletedDays + (todayPoints > 0 ? 1 : 0),
    missedDays,
  };
}

/**
 * Day-by-day plank point history across the challenge window. Future
 * days are included so charts can show the full 30-day window.
 */
export function getChallengeProgress(
  challenge: Challenge,
  state: PlankChallengeState,
  now: Date = new Date()
): ChallengeProgress {
  const empty: ChallengeProgress = {
    started: false,
    days: [],
    plankTotal: 0,
  };
  if (!state.startedAt) {
    return empty;
  }

  const today = todayKey(now);
  const start = state.startedAt;
  const end = addDays(start, challenge.totalDays - 1);

  const secondsByDate = new Map<string, number>(
    state.days.map((d) => [d.date, d.seconds])
  );

  const days: ChallengeDayDetail[] = [];
  let runningTotal = 0;
  let plankTotal = 0;

  let cursor = start;
  let dayNumber = 0;
  while (cursor <= end) {
    dayNumber += 1;
    const isFuture = cursor > today;
    const isToday = cursor === today;
    const holdSeconds = secondsByDate.get(cursor) ?? 0;

    let plankPoints = 0;
    // A past day without the required hold is a miss (0 points, no
    // penalty). Today is not a miss until it has passed.
    const requiredSeconds = holdSecondsForDay(challenge, dayNumber);
    const isMissed = !isFuture && !isToday && holdSeconds < requiredSeconds;
    if (!isFuture && !isMissed) {
      plankPoints =
        holdSeconds > 0 ? pointsForHold(challenge, holdSeconds, dayNumber) : 0;
    }

    if (!isFuture) {
      runningTotal += plankPoints;
      plankTotal += plankPoints;
    }

    days.push({
      date: cursor,
      dayNumber,
      plankPoints,
      isMissed,
      runningTotal,
      isToday,
      isFuture,
    });
    cursor = addDays(cursor, 1);
  }

  return {
    started: true,
    days,
    plankTotal,
  };
}
