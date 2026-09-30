import { dayNumberForDate, pointsForHold, toKey, todayKey } from "./challenge";
import type { CompletedSession } from "./storage";
import type {
  Challenge,
  PlankChallengeState,
  PointsBreakdown,
  OverallTotals,
  MonthDayBar,
  YearWeekBar,
} from "../types/challenge";

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

function secondsByDate(state: PlankChallengeState): Map<string, number> {
  return new Map(state.days.map((d) => [d.date, d.seconds]));
}

/** Points earned on a single date: the plank hold plus one per unique routine. */
export function getDailyPoints(
  challenge: Challenge,
  plankState: PlankChallengeState,
  sessions: CompletedSession[],
  date: string
): PointsBreakdown {
  const dayNumber = dayNumberForDate(challenge, plankState, date);
  const plank = pointsForHold(
    challenge,
    secondsByDate(plankState).get(date) ?? 0,
    dayNumber
  );
  const routine = routineIdsByDate(sessions).get(date)?.size ?? 0;
  return { plank, routine, total: plank + routine };
}

/** All-time totals: every stored plank hold plus every unique routine per day. */
export function getOverallTotals(
  challenge: Challenge,
  plankState: PlankChallengeState,
  sessions: CompletedSession[]
): OverallTotals {
  let plank = 0;
  for (const day of plankState.days) {
    plank += pointsForHold(
      challenge,
      day.seconds,
      dayNumberForDate(challenge, plankState, day.date)
    );
  }
  let routine = 0;
  for (const ids of routineIdsByDate(sessions).values()) {
    routine += ids.size;
  }
  return { plank, routine, total: plank + routine };
}

/** One bar per day of the given month (month is 0-based). */
export function getMonthBuckets(
  challenge: Challenge,
  plankState: PlankChallengeState,
  sessions: CompletedSession[],
  year: number,
  month: number,
  now: Date = new Date()
): MonthDayBar[] {
  const today = todayKey(now);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const plank = secondsByDate(plankState);
  const routines = routineIdsByDate(sessions);

  const bars: MonthDayBar[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = toKey(new Date(year, month, day));
    const points =
      pointsForHold(
        challenge,
        plank.get(date) ?? 0,
        dayNumberForDate(challenge, plankState, date)
      ) +
      (routines.get(date)?.size ?? 0);
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
  challenge: Challenge,
  plankState: PlankChallengeState,
  sessions: CompletedSession[],
  year: number
): YearWeekBar[] {
  const plank = secondsByDate(plankState);
  const routines = routineIdsByDate(sessions);
  const pointsOn = (date: Date) => {
    const key = toKey(date);
    return (
      pointsForHold(
        challenge,
        plank.get(key) ?? 0,
        dayNumberForDate(challenge, plankState, key)
      ) +
      (routines.get(key)?.size ?? 0)
    );
  };

  const bars: YearWeekBar[] = [];
  const yearEnd = new Date(year + 1, 0, 1);
  let cursor = mondayOf(new Date(year, 0, 1));
  let weekNumber = 0;
  while (cursor < yearEnd) {
    weekNumber += 1;
    let points = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + i);
      if (d < yearEnd) {
        points += pointsOn(d);
      }
    }
    bars.push({ weekStart: toKey(cursor), weekNumber, points });
    cursor.setDate(cursor.getDate() + 7);
  }
  return bars;
}
