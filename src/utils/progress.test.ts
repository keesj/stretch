import { describe, test, expect } from "vitest";
import { addDays } from "./challenge";
import {
  getDailyPoints,
  getMonthBuckets,
  getOverallTotals,
  getPlankSecondsOn,
  getRecentDays,
  getWeekComparison,
  getWindowSummary,
  getYearBuckets,
  type ChallengeEntry,
} from "./progress";
import type { CompletedSession } from "./storage";
import type { Challenge, PlankChallengeState } from "../types/challenge";

// The threshold challenge (kept as a local fixture so the tests don't
// depend on the configured cohort dates).
const legacy: Challenge = {
  id: "plank-30-day",
  syncId: "plank",
  title: "30-Day Plank Challenge",
  description: "test",
  exerciseId: "plank-hold",
  totalDays: 30,
  scoring: "threshold",
  baseSeconds: 120,
  bonusSeconds: 30,
  bonusPoints: 0.5,
  milestoneEvery: 10,
  milestoneSeconds: 180,
  milestonePoints: 2,
  illustration: "💪",
};

// The duration challenge; the tests that score its days pin
// state.startedAt explicitly, so only the scoring fields matter here.
const durationChallenge: Challenge = {
  id: "plank-max-30-day",
  syncId: "plank-max",
  title: "30-Day Plank Max Challenge",
  description: "test",
  exerciseId: "plank-hold",
  totalDays: 30,
  startDate: "2026-11-01",
  scoring: "duration",
  baseSeconds: 120,
  basePoints: 1,
  incrementSeconds: 30,
  incrementPoints: 0.5,
  maxSeconds: 600,
  illustration: "⏱️",
};

// A fixed "now" so the rolling windows are stable: 2026-10-15 (a
// Thursday), so the current window is 10-09..10-15 and the previous
// one is 10-02..10-08.
const NOW = new Date(2026, 9, 15);
const TODAY = "2026-10-15";

function entriesWith(days: { date: string; seconds: number }[]): ChallengeEntry[] {
  // The window (10-02 .. 10-31) covers every date the tests use.
  const state: PlankChallengeState = { startedAt: "2026-10-02", days };
  return [{ challenge: legacy, state }];
}

function sessionAt(date: string, id: string, routineId: string): CompletedSession {
  const [y, m, d] = date.split("-").map(Number);
  return {
    id,
    routineId,
    routineTitle: "T",
    duration: 60,
    completedAt: new Date(y, m - 1, d, 8, 0, 0).toISOString(),
  };
}

function entries(...states: PlankChallengeState[]): ChallengeEntry[] {
  return [
    { challenge: legacy, state: states[0] ?? { startedAt: null, days: [] } },
    ...(states[1] ? [{ challenge: durationChallenge, state: states[1] }] : []),
  ];
}

function session(routineId: string, date: Date): CompletedSession {
  return {
    id: `${routineId}-${date.getTime()}`,
    routineId,
    routineTitle: routineId,
    duration: 60,
    completedAt: date.toISOString(),
  };
}

describe("getDailyPoints", () => {
  test("combines the plank hold with one point per unique routine per day", () => {
    const state: PlankChallengeState = {
      startedAt: "2026-03-01",
      days: [{ date: "2026-03-02", seconds: 120 }],
    };
    const sessions = [
      session("a", new Date(2026, 2, 2, 8)),
      session("a", new Date(2026, 2, 2, 9)), // same routine again: still 1
      session("b", new Date(2026, 2, 2, 12)), // second routine: +1
    ];

    expect(getDailyPoints(entries(state), sessions, "2026-03-02")).toEqual({
      plank: 1,
      routine: 2,
      total: 3,
    });
    expect(getDailyPoints(entries(state), sessions, "2026-03-03")).toEqual({
      plank: 0,
      routine: 0,
      total: 0,
    });
  });

  test("sums holds from different challenges on the same date", () => {
    const stateA: PlankChallengeState = {
      startedAt: "2026-03-01",
      days: [{ date: "2026-03-01", seconds: 120 }], // +1
    };
    const stateB: PlankChallengeState = {
      startedAt: "2026-03-01",
      days: [{ date: "2026-03-01", seconds: 180 }], // 1 + 2x0.5 = +2
    };
    expect(getDailyPoints(entries(stateA, stateB), [], "2026-03-01")).toEqual({
      plank: 3,
      routine: 0,
      total: 3,
    });
  });
});

describe("getPlankSecondsOn", () => {
  test("sums each challenge's best hold for the day", () => {
    const entriesList = entriesWith([
      { date: "2026-10-10", seconds: 120 },
      { date: "2026-10-11", seconds: 200 },
    ]);
    expect(getPlankSecondsOn(entriesList, "2026-10-10")).toBe(120);
    expect(getPlankSecondsOn(entriesList, "2026-10-11")).toBe(200);
    expect(getPlankSecondsOn(entriesList, "2026-10-12")).toBe(0);
  });
});

describe("getWindowSummary", () => {
  test("aggregates points, sessions, plank time, and active days", () => {
    // Two different routines on 10-14 (+2), one on 10-13 (+1), plus a
    // 120s plank each of those days (+1 each, threshold scoring).
    const entriesList = entriesWith([
      { date: "2026-10-14", seconds: 120 },
      { date: "2026-10-13", seconds: 120 },
    ]);
    const sessions = [
      sessionAt("2026-10-14", "s1", "r1"),
      sessionAt("2026-10-14", "s2", "r2"),
      sessionAt("2026-10-13", "s3", "r1"),
    ];

    const win = getWindowSummary(entriesList, sessions, "2026-10-13", "2026-10-15", NOW);
    expect(win.points).toBe(5); // (1+2) + (1+1) + 0
    expect(win.sessions).toBe(3);
    expect(win.plankSeconds).toBe(240);
    expect(win.activeDays).toBe(2);
    expect(win.days).toHaveLength(3);
    expect(win.days.map((d) => d.points)).toEqual([2, 3, 0]);
    // The window ends on 10-15 — the fixed "now" — so only its last day
    // is today.
    expect(win.days.map((d) => d.isToday)).toEqual([false, false, true]);
  });

  test("flags today inside the window", () => {
    const win = getWindowSummary([], [], TODAY, TODAY, NOW);
    expect(win.days[0].isToday).toBe(true);
  });
});

describe("getWeekComparison", () => {
  test("splits the last 14 days into two rolling 7-day windows", () => {
    // A plank on 10-08 (last day of the previous window) and one on
    // 10-09 (first day of the current window).
    const entriesList = entriesWith([
      { date: "2026-10-08", seconds: 120 },
      { date: "2026-10-09", seconds: 120 },
    ]);
    const { current, previous } = getWeekComparison(entriesList, [], NOW);

    expect(current.start).toBe("2026-10-09");
    expect(current.end).toBe(TODAY);
    expect(previous.start).toBe("2026-10-02");
    expect(previous.end).toBe("2026-10-08");
    expect(current.points).toBe(1);
    expect(previous.points).toBe(1);
    expect(current.days).toHaveLength(7);
    expect(previous.days).toHaveLength(7);
  });

  test("a session exactly 7 days ago belongs to the previous window", () => {
    const sessions = [sessionAt(addDays(TODAY, -7), "s1", "r1")];
    const { current, previous } = getWeekComparison([], sessions, NOW);
    expect(current.sessions).toBe(0);
    expect(previous.sessions).toBe(1);
    expect(previous.points).toBe(1);
  });
});

describe("getOverallTotals", () => {
  test("sums plank points (including bonus) and unique routines across all days", () => {
    const state: PlankChallengeState = {
      startedAt: "2026-03-01",
      days: [
        { date: "2026-03-01", seconds: 120 }, // +1
        { date: "2026-03-02", seconds: 150 }, // +1.5
        { date: "2026-03-03", seconds: 60 }, // +0 (below base)
      ],
    };
    const sessions = [
      session("a", new Date(2026, 2, 1, 8)),
      session("a", new Date(2026, 2, 1, 9)), // deduped
      session("b", new Date(2026, 2, 3, 8)),
    ];

    expect(getOverallTotals(entries(state), sessions)).toEqual({
      plank: 2.5,
      routine: 2,
      total: 4.5,
    });
  });

  test("adds the duration challenge's capped points to the all-time total", () => {
    const stateB: PlankChallengeState = {
      startedAt: "2026-11-01",
      days: [
        { date: "2026-11-01", seconds: 600 }, // capped at 9
        { date: "2026-11-02", seconds: 60 }, // +0 (below base)
      ],
    };
    expect(getOverallTotals(entries({ startedAt: null, days: [] }, stateB), [])).toEqual({
      plank: 9,
      routine: 0,
      total: 9,
    });
  });

  test("ignores holds outside the challenge window", () => {
    // A day copied over from another challenge (or backdated) lands before
    // the window opens; duration scoring must not score it.
    const list: ChallengeEntry[] = [
      {
        challenge: durationChallenge,
        state: {
          startedAt: "2026-10-28",
          days: [
            { date: "2026-10-05", seconds: 120 }, // before the window
            { date: "2026-10-29", seconds: 150 }, // in the window: 1.5
          ],
        },
      },
    ];
    expect(getOverallTotals(list, []).plank).toBe(1.5);
  });

  test("ignores sessions with malformed dates", () => {
    const bad: CompletedSession = {
      id: "bad",
      routineId: "a",
      routineTitle: "A",
      duration: 10,
      completedAt: "not-a-date",
    };
    expect(getOverallTotals(entries(), [bad])).toEqual({
      plank: 0,
      routine: 0,
      total: 0,
    });
  });
});

describe("getMonthBuckets", () => {
  test("builds one bar per day with points and a today flag", () => {
    const state: PlankChallengeState = {
      startedAt: "2026-02-01",
      days: [{ date: "2026-02-03", seconds: 120 }],
    };
    const sessions = [
      session("a", new Date(2026, 1, 3, 8)),
      session("b", new Date(2026, 1, 7, 8)),
    ];

    const bars = getMonthBuckets(entries(state), sessions, 2026, 1, new Date(2026, 1, 7, 12));

    expect(bars).toHaveLength(28); // February 2026
    expect(bars[0]).toMatchObject({ date: "2026-02-01", points: 0, isToday: false });
    expect(bars[2]).toMatchObject({ dayOfMonth: 3, points: 2, isToday: false });
    expect(bars[6]).toMatchObject({ dayOfMonth: 7, points: 1, isToday: true });
  });

  test("returns 31 bars for a 31-day month", () => {
    const bars = getMonthBuckets(entries(), [], 2026, 7);
    expect(bars).toHaveLength(31);
  });
});

describe("getYearBuckets", () => {
  test("buckets points into Monday-start weeks of the year", () => {
    // 2026-01-01 is a Thursday: week 1 starts Monday 2025-12-29.
    const state: PlankChallengeState = {
      startedAt: "2026-01-01",
      days: [
        { date: "2026-01-03", seconds: 120 }, // Saturday, week of Dec 29
        { date: "2026-01-05", seconds: 150 }, // Monday, week of Jan 5
      ],
    };
    const sessions = [session("a", new Date(2026, 0, 9, 8))]; // Friday Jan 9

    const bars = getYearBuckets(entries(state), sessions, 2026);

    expect(bars).toHaveLength(53);
    expect(bars[0]).toMatchObject({
      weekStart: "2025-12-29",
      weekNumber: 1,
      points: 1,
    });
    expect(bars[1]).toMatchObject({
      weekStart: "2026-01-05",
      weekNumber: 2,
      points: 2.5,
    });

    for (const bar of bars) {
      const [y, m, d] = bar.weekStart.split("-").map(Number);
      expect(new Date(y, m - 1, d).getDay()).toBe(1); // every week starts Monday
    }
    const [ly, lm, ld] = bars[bars.length - 1].weekStart.split("-").map(Number);
    expect(new Date(ly, lm - 1, ld) < new Date(2027, 0, 1)).toBe(true);
  });
});

describe("milestone days", () => {
  test("scores a milestone day's 3-minute hold at 2 points", () => {
    // Day 10 of a challenge started 2026-03-01
    const state: PlankChallengeState = {
      startedAt: "2026-03-01",
      days: [
        { date: "2026-03-10", seconds: 180 }, // day 10: +2
        { date: "2026-03-11", seconds: 120 }, // day 11: +1
      ],
    };

    expect(getDailyPoints(entries(state), [], "2026-03-10")).toEqual({
      plank: 2,
      routine: 0,
      total: 2,
    });
    expect(getDailyPoints(entries(state), [], "2026-03-11")).toEqual({
      plank: 1,
      routine: 0,
      total: 1,
    });
    expect(getOverallTotals(entries(state), [])).toEqual({
      plank: 3,
      routine: 0,
      total: 3,
    });
  });

  test("scores a regular hold on a milestone day at 1 point", () => {
    const state: PlankChallengeState = {
      startedAt: "2026-03-01",
      days: [{ date: "2026-03-10", seconds: 120 }],
    };
    expect(getDailyPoints(entries(state), [], "2026-03-10")).toEqual({
      plank: 1,
      routine: 0,
      total: 1,
    });
    expect(getOverallTotals(entries(state), [])).toEqual({
      plank: 1,
      routine: 0,
      total: 1,
    });
  });
});

describe("getRecentDays", () => {
  test("returns the last 14 days, today first", () => {
    const entriesList = entriesWith([{ date: TODAY, seconds: 120 }]);
    const sessions = [sessionAt(TODAY, "s1", "r1")];

    const rows = getRecentDays(entriesList, sessions, 14, NOW);
    expect(rows).toHaveLength(14);
    expect(rows[0].date).toBe(TODAY);
    expect(rows[0].isToday).toBe(true);
    expect(rows.slice(1).every((r) => !r.isToday)).toBe(true);
    // Today: 1 plank point + 1 routine point, 2:00 held, 1 session.
    expect(rows[0]).toMatchObject({ total: 2, plank: 1, routine: 1, sessions: 1, plankSeconds: 120 });
    // A quiet day reads zero.
    expect(rows[1]).toMatchObject({ total: 0, sessions: 0, plankSeconds: 0 });
  });
});
