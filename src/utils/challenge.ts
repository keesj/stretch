import { loadFromStorage } from "./storage";
import { recordChallengeStart, recordPlankDay } from "../sync/record";
import { challengeBlobKey } from "../sync/types";
import { MAX_RECOVERY_DEFICIT } from "../types/challenge";
import type {
  Challenge,
  DurationChallenge,
  ChallengeDay,
  ChallengeDayDetail,
  ChallengeProgress,
  ChallengeStatus,
  PlankChallengeState,
} from "../types/challenge";
import { challenges } from "../data/challenges";

export { challengeBlobKey } from "../sync/types";

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

/**
 * The challenge to show the user, in priority order:
 * 1. a self-start challenge whose window the user is currently inside
 *    (never cut away from a running challenge),
 * 2. the most recently opened cohort challenge — its effective start date
 *    (the account's start op, falling back to the configured cohort date)
 *    must be ≤ today, so an admin can open or delay a cohort per account,
 * 3. the soonest upcoming cohort — shown as an "Opens …" preview — once a
 *    self-start run has finished but no cohort has opened yet,
 * 4. the latest self-start challenge (a fresh user can still start it).
 *
 * Pure on purpose: the state is injected (`stateOf`) so the priority rule
 * is testable without localStorage.
 */
export function selectActiveChallenge(
  challengeList: readonly Challenge[],
  stateOf: (challenge: Challenge) => PlankChallengeState,
  now: Date = new Date()
): Challenge {
  const today = todayKey(now);
  let selfStart: Challenge | null = null;
  let selfStartEnd: string | null = null;
  for (const challenge of challengeList) {
    if (challenge.startDate) continue;
    const state = stateOf(challenge);
    if (!state.startedAt) continue;
    selfStart = challenge;
    selfStartEnd = addDays(state.startedAt, challenge.totalDays - 1);
    if (state.startedAt <= today && today <= selfStartEnd) return challenge;
  }
  let cohort: Challenge | null = null;
  let cohortStart = "";
  for (const challenge of challengeList) {
    if (!challenge.startDate) continue;
    // stateOf (loadChallengeState) already falls back to the configured startDate.
    const opened = stateOf(challenge).startedAt;
    if (!opened || opened > today) continue;
    if (opened > cohortStart) {
      cohortStart = opened;
      cohort = challenge;
    }
  }
  if (cohort) return cohort;
  // A finished self-start run hands the card over to the upcoming cohort
  // instead of sitting on the completed challenge until it opens.
  if (selfStart && selfStartEnd && selfStartEnd < today) {
    let upcoming: Challenge | null = null;
    let upcomingStart = "";
    for (const challenge of challengeList) {
      if (!challenge.startDate) continue;
      const opened = stateOf(challenge).startedAt;
      if (!opened || opened <= today) continue;
      if (!upcomingStart || opened < upcomingStart) {
        upcomingStart = opened;
        upcoming = challenge;
      }
    }
    if (upcoming) return upcoming;
  }
  const selfStarts = challengeList.filter((c) => !c.startDate);
  return selfStarts[selfStarts.length - 1] ?? challengeList[0];
}

/** The challenge to show this user right now (reads the projection blobs). */
export function activeChallenge(now: Date = new Date()): Challenge {
  return selectActiveChallenge(challenges, loadChallengeState, now);
}

/** Every configured challenge with its loaded state (all-time progress). */
export function allChallengeEntries(): {
  challenge: Challenge;
  state: PlankChallengeState;
}[] {
  return challenges.map((challenge) => ({ challenge, state: loadChallengeState(challenge) }));
}

export function loadChallengeState(challenge: Challenge): PlankChallengeState {
  const state = loadFromStorage<PlankChallengeState>(
    challengeBlobKey(challenge.syncId),
    DEFAULT_PLANK_STATE
  );
  if (!state || typeof state !== "object") {
    return { ...DEFAULT_PLANK_STATE, days: [], ...(challenge.startDate ? { startedAt: challenge.startDate } : {}) };
  }
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const storedStartedAt =
    state.startedAt !== null &&
    typeof state.startedAt === "string" &&
    datePattern.test(state.startedAt)
      ? state.startedAt
      : null;
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
  // A cohort challenge's start date comes from its config; a challenge op
  // (e.g. pushed by the admin CLI) overrides it.
  const startedAt = storedStartedAt ?? challenge.startDate ?? null;
  return { startedAt, days };
}

/**
 * Start the challenge. The state change is journaled (src/sync/record)
 * so it syncs across devices; the projection blob is rewritten by the
 * replay, which loadChallengeState reads.
 */
export function startChallenge(
  challenge: Challenge,
  now: Date = new Date()
): PlankChallengeState {
  return recordChallengeStart(challenge, now);
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

/**
 * Record today's hold in the given challenge. Journaled like
 * startChallenge; keeps the best hold per day (the replay's plankDay
 * merge), so re-completing a day upgrades it to the stronger hold.
 */
export function completeChallengeDay(
  challenge: Challenge,
  seconds: number,
  now: Date = new Date()
): PlankChallengeState {
  return recordPlankDay(challenge, seconds, now);
}

/** True when the given day number is a milestone day (day 10, 20, ...). */
export function isMilestoneDay(challenge: Challenge, dayNumber: number): boolean {
  return (
    challenge.scoring === "threshold" &&
    challenge.milestoneEvery > 0 &&
    dayNumber >= 1 &&
    dayNumber <= challenge.totalDays &&
    dayNumber % challenge.milestoneEvery === 0
  );
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
 * Time-based points for a duration challenge: the base points at the
 * base hold, then incrementPoints per full increment above it, capped at
 * maxSeconds.
 */
export function durationChallengePoints(
  challenge: DurationChallenge,
  seconds: number
): number {
  if (seconds < challenge.baseSeconds) return 0;
  const capped = Math.min(seconds, challenge.maxSeconds);
  const increments = Math.floor((capped - challenge.baseSeconds) / challenge.incrementSeconds);
  return challenge.basePoints + increments * challenge.incrementPoints;
}

/** The scoring cap of a duration challenge (its points at maxSeconds). */
export function durationChallengeMaxPoints(challenge: DurationChallenge): number {
  return durationChallengePoints(challenge, challenge.maxSeconds);
}

/**
 * Points for a hold on a given challenge day. Milestone days (threshold
 * challenges only) pay the milestone points total for the full milestone
 * hold, while the regular base hold still pays 1; other threshold days
 * pay 1 at base, 1 + bonus at base + bonusSeconds. Duration challenges
 * pay by hold length.
 */
export function pointsForHold(
  challenge: Challenge,
  seconds: number,
  dayNumber: number
): number {
  // Holds outside the challenge window (day 0) never score — e.g. a
  // backdated record or a day copied over from another challenge.
  if (dayNumber < 1 || dayNumber > challenge.totalDays) return 0;
  if (challenge.scoring === "duration") {
    return durationChallengePoints(challenge, seconds);
  }
  if (isMilestoneDay(challenge, dayNumber)) {
    // The milestone hold upgrades the day to the milestone points total;
    // the regular base hold still completes the day for 1 (the recovery
    // bonus tier does not apply on milestone days).
    if (seconds >= challenge.milestoneSeconds) {
      return challenge.milestonePoints;
    }
    return seconds >= challenge.baseSeconds ? 1 : 0;
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
 * The score is recomputed from scratch, so missed days are picked up
 * automatically whenever a new day arrives.
 */
export function getChallengeStatus(
  challenge: Challenge,
  state: PlankChallengeState,
  now: Date = new Date()
): ChallengeStatus {
  const today = todayKey(now);

  // Not started — or a cohort challenge whose start date has not arrived.
  if (!state.startedAt || state.startedAt > today) {
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

  // The baseline is the number of fully elapsed days. Today's points count
  // toward clearing the deficit, so once the recovery hold is done the user
  // is no longer "behind". The recovery hold itself is only offered while
  // behind the baseline (after at least one miss) and only up to
  // MAX_RECOVERY_DEFICIT points behind. It is not offered on a milestone
  // day, where it could not clear the longer hold — and duration
  // challenges have no recovery mechanic at all.
  const deficit = Math.max(pastDays - pastScore - todayPoints, 0);
  const bonusAvailable =
    challenge.scoring === "threshold" &&
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
    // A past day without the base hold is a miss (0 points, no penalty).
    // Milestone holds are an upgrade, not a requirement. Today is not a
    // miss until it has passed.
    const isMissed =
      !isFuture && !isToday && holdSeconds < challenge.baseSeconds;
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
