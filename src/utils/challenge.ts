import { loadFromStorage, saveToStorage } from "./storage";
import { MAX_RECOVERY_DEFICIT } from "../types/challenge";
import type {
  Challenge,
  ChallengeDay,
  ChallengeDayDetail,
  ChallengeProgress,
  ChallengeStatus,
  PlankChallengeState,
  SessionCompletion,
} from "../types/challenge";

export const DEFAULT_PLANK_STATE: PlankChallengeState = {
  startedAt: null,
  days: [],
};

export function todayKey(now: Date = new Date()): string {
  return toKey(now);
}

function toKey(d: Date): string {
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

/** Points for a hold: 0 below base, 1 at base, 1 + bonus at base + bonusSeconds. */
export function pointsForHold(challenge: Challenge, seconds: number): number {
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
    const points = pointsForHold(challenge, secondsByDate.get(cursor) ?? 0);
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
  const todayPoints = todayInWindow ? pointsForHold(challenge, todaySeconds) : 0;
  const dayNumber = Math.min(
    Math.max(daysBetween(start, today) + 1, 1),
    challenge.totalDays
  );

  // The baseline is the number of fully elapsed days. The recovery hold is
  // only offered while behind the baseline (after at least one miss) and
  // only up to MAX_RECOVERY_DEFICIT points behind.
  const deficit = Math.max(pastDays - pastScore, 0);
  const bonusAvailable =
    missedDays > 0 && deficit > 0 && deficit <= MAX_RECOVERY_DEFICIT;

  return {
    status: today > end ? "complete" : "active",
    dayNumber,
    daysLeft: Math.max(challenge.totalDays - dayNumber + 1, 0),
    todayDone: todayPoints > 0,
    todaySeconds,
    todayPoints,
    score: pastScore + todayPoints,
    baseline: pastDays,
    deficit,
    bonusAvailable,
    completedDays: pastCompletedDays + (todayPoints > 0 ? 1 : 0),
    missedDays,
  };
}

/**
 * Combined day-by-day point history: the plank challenge keeps its own
 * scoring, routines earn their own +1 per unique routine per day, and the
 * running total merges both. Future days are included so charts can show
 * the full 30-day window.
 */
export function getChallengeProgress(
  challenge: Challenge,
  state: PlankChallengeState,
  completions: SessionCompletion[],
  now: Date = new Date()
): ChallengeProgress {
  const empty: ChallengeProgress = {
    started: false,
    days: [],
    plankTotal: 0,
    routineTotal: 0,
    combinedTotal: 0,
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

  const routinesByDate = new Map<string, Set<string>>();
  for (const completion of completions) {
    try {
      const date = toKey(new Date(completion.completedAt));
      if (date < start || date > end) continue;
      const ids = routinesByDate.get(date) ?? new Set<string>();
      ids.add(completion.routineId);
      routinesByDate.set(date, ids);
    } catch {
      // ignore malformed completion dates
    }
  }

  const days: ChallengeDayDetail[] = [];
  let runningTotal = 0;
  let plankTotal = 0;
  let routineTotal = 0;

  let cursor = start;
  let dayNumber = 0;
  while (cursor <= end) {
    dayNumber += 1;
    const isFuture = cursor > today;
    const isToday = cursor === today;
    const holdSeconds = secondsByDate.get(cursor) ?? 0;

    let plankPoints = 0;
    // A past day without a completed hold is a miss (0 points, no penalty).
    // Today is not a miss until it has passed.
    const isMissed = !isFuture && !isToday && holdSeconds < challenge.baseSeconds;
    if (!isFuture && !isMissed) {
      plankPoints = holdSeconds > 0 ? pointsForHold(challenge, holdSeconds) : 0;
    }
    const routinePoints = isFuture
      ? 0
      : (routinesByDate.get(cursor)?.size ?? 0);
    const totalPoints = isFuture ? 0 : plankPoints + routinePoints;

    if (!isFuture) {
      runningTotal += totalPoints;
      plankTotal += plankPoints;
      routineTotal += routinePoints;
    }

    days.push({
      date: cursor,
      dayNumber,
      plankPoints,
      isMissed,
      routinePoints,
      totalPoints,
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
    routineTotal,
    combinedTotal: plankTotal + routineTotal,
  };
}
