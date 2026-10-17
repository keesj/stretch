import { addDays, dayNumberForDate, pointsForHold, toKey, todayKey } from "./challenge";
import type { CompletedSession } from "./storage";
import type {
  Challenge,
  PlankChallengeState,
  PointsBreakdown,
  OverallTotals,
  MonthDayBar,
  YearWeekBar,
  WindowDay,
  WindowSummary,
} from "../types/challenge";

/** One challenge with its state: the unit of all-time point aggregation. */
export interface ChallengeEntry {
  challenge: Challenge;
  state: PlankChallengeState;
}

/** Unique routine ids per local date, across all completed sessions. */
function routineIdsByDate(
  sessions: CompletedSession[]
): Map<string, Set<string>> {
  const byDate = new Map<string, Set<string>>();
  for (const session of sessions) {
    const completedAt = new Date(session.completedAt);
    if (Number.isNaN(completedAt.getTime())) continue;
    const date = toKey(completedAt);
    const ids = byDate.get(date) ?? new Set<string>();
    ids.add(session.routineId);
    byDate.set(date, ids);
  }
  return byDate;
}

function secondsOn(state: PlankChallengeState, date: string): number {
  return state.days.find((d) => d.date === date)?.seconds ?? 0;
}

/** Plank points on a date, summed over every challenge's holds that day. */
function plankPointsOn(entries: ChallengeEntry[], date: string): number {
  let points = 0;
  for (const { challenge, state } of entries) {
    points += pointsForHold(
      challenge,
      secondsOn(state, date),
      dayNumberForDate(challenge, state, date)
    );
  }
  return points;
}

/** Plank seconds on a date: each challenge's best hold that day, summed. */
export function getPlankSecondsOn(entries: ChallengeEntry[], date: string): number {
  let seconds = 0;
  for (const { state } of entries) {
    seconds += secondsOn(state, date);
  }
  return seconds;
}

/** Completed sessions whose local date falls inside [from, to]. */
function sessionsBetween(sessions: CompletedSession[], from: string, to: string): number {
  let count = 0;
  for (const session of sessions) {
    const completedAt = new Date(session.completedAt);
    if (Number.isNaN(completedAt.getTime())) continue;
    const key = toKey(completedAt);
    if (key >= from && key <= to) count += 1;
  }
  return count;
}

/**
 * Aggregate an inclusive date range into one window: total points,
 * sessions, plank time, active days, and the per-day points for a mini
 * chart. Date-string comparison is safe — keys are zero-padded.
 */
export function getWindowSummary(
  entries: ChallengeEntry[],
  sessions: CompletedSession[],
  start: string,
  end: string,
  now: Date = new Date()
): WindowSummary {
  const today = todayKey(now);
  let points = 0;
  let plankSeconds = 0;
  let activeDays = 0;
  const days: WindowDay[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const breakdown = getDailyPoints(entries, sessions, date);
    const seconds = getPlankSecondsOn(entries, date);
    points += breakdown.total;
    plankSeconds += seconds;
    if (breakdown.total > 0) activeDays += 1;
    days.push({ date, points: breakdown.total, isToday: date === today });
  }
  return {
    start,
    end,
    points,
    sessions: sessionsBetween(sessions, start, end),
    plankSeconds,
    activeDays,
    days,
  };
}

/**
 * Two rolling 7-day windows: the last 7 days (ending today) and the 7
 * days before that. The windows are rolling, not calendar weeks, so the
 * comparison always reads "my last week vs the week before it".
 */
export function getWeekComparison(
  entries: ChallengeEntry[],
  sessions: CompletedSession[],
  now: Date = new Date()
): { current: WindowSummary; previous: WindowSummary } {
  const today = todayKey(now);
  return {
    current: getWindowSummary(entries, sessions, addDays(today, -6), today, now),
    previous: getWindowSummary(entries, sessions, addDays(today, -13), addDays(today, -7), now),
  };
}

/** One row of the "recent days" list. */
export interface RecentDay {
  date: string;
  plank: number;
  routine: number;
  total: number;
  sessions: number;
  plankSeconds: number;
  isToday: boolean;
}

/** The last `count` days, today first, each earlier day after it. */
export function getRecentDays(
  entries: ChallengeEntry[],
  sessions: CompletedSession[],
  count = 14,
  now: Date = new Date()
): RecentDay[] {
  const today = todayKey(now);
  const rows: RecentDay[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(today, -i);
    const breakdown = getDailyPoints(entries, sessions, date);
    rows.push({
      date,
      plank: breakdown.plank,
      routine: breakdown.routine,
      total: breakdown.total,
      sessions: sessionsBetween(sessions, date, date),
      plankSeconds: getPlankSecondsOn(entries, date),
      isToday: date === today,
    });
  }
  return rows;
}

/** Points earned on a single date: the plank holds plus one per unique routine. */
export function getDailyPoints(
  entries: ChallengeEntry[],
  sessions: CompletedSession[],
  date: string
): PointsBreakdown {
  const plank = plankPointsOn(entries, date);
  const routine = routineIdsByDate(sessions).get(date)?.size ?? 0;
  return { plank, routine, total: plank + routine };
}

/** All-time totals: every stored plank hold plus every unique routine per day. */
export function getOverallTotals(
  entries: ChallengeEntry[],
  sessions: CompletedSession[]
): OverallTotals {
  let plank = 0;
  for (const { challenge, state } of entries) {
    for (const day of state.days) {
      plank += pointsForHold(
        challenge,
        day.seconds,
        dayNumberForDate(challenge, state, day.date)
      );
    }
  }
  let routine = 0;
  for (const ids of routineIdsByDate(sessions).values()) {
    routine += ids.size;
  }
  return { plank, routine, total: plank + routine };
}

/** One bar per day of the given month (month is 0-based). */
export function getMonthBuckets(
  entries: ChallengeEntry[],
  sessions: CompletedSession[],
  year: number,
  month: number,
  now: Date = new Date()
): MonthDayBar[] {
  const today = todayKey(now);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const routines = routineIdsByDate(sessions);

  const bars: MonthDayBar[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = toKey(new Date(year, month, day));
    const points = plankPointsOn(entries, date) + (routines.get(date)?.size ?? 0);
    bars.push({ date, dayOfMonth: day, points, isToday: date === today });
  }
  return bars;
}

function mondayOf(d: Date): Date {
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (result.getDay() + 6) % 7; // 0 for Monday
  result.setDate(result.getDate() - offset);
  return result;
}

/** One bar per Monday-start week that touches the given year. */
export function getYearBuckets(
  entries: ChallengeEntry[],
  sessions: CompletedSession[],
  year: number
): YearWeekBar[] {
  const routines = routineIdsByDate(sessions);

  const bars: YearWeekBar[] = [];
  const yearEnd = new Date(year + 1, 0, 1);
  const first = mondayOf(new Date(year, 0, 1));
  let weekNumber = 0;
  // A plain number drives the loop; week k starts on first + 7k days.
  // (A Date in the loop condition is not tracked by lint's mutation check.)
  for (let daysIn = 0; ; daysIn += 7) {
    const cursor = new Date(first);
    cursor.setDate(first.getDate() + daysIn);
    if (cursor >= yearEnd) break;
    weekNumber += 1;
    let points = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + i);
      if (d < yearEnd) {
        const key = toKey(d);
        points += plankPointsOn(entries, key) + (routines.get(key)?.size ?? 0);
      }
    }
    bars.push({ weekStart: toKey(cursor), weekNumber, points });
  }
  return bars;
}
