import { describe, it, expect } from "vitest";
import {
  getDailyPoints,
  getMonthBuckets,
  getOverallTotals,
  getYearBuckets,
} from "../progress";
import type { Challenge, PlankChallengeState } from "../../types/challenge";
import type { CompletedSession } from "../storage";

const challenge: Challenge = {
  id: "plank-30-day",
  title: "30-Day Plank Challenge",
  description: "test",
  exerciseId: "plank-hold",
  totalDays: 30,
  baseSeconds: 120,
  bonusSeconds: 30,
  bonusPoints: 0.5,
  illustration: "💪",
};

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
  it("combines the plank hold with one point per unique routine per day", () => {
    const state: PlankChallengeState = {
      startedAt: "2026-03-01",
      days: [{ date: "2026-03-02", seconds: 120 }],
    };
    const sessions = [
      session("a", new Date(2026, 2, 2, 8)),
      session("a", new Date(2026, 2, 2, 9)), // same routine again: still 1
      session("b", new Date(2026, 2, 2, 12)), // second routine: +1
    ];

    expect(getDailyPoints(challenge, state, sessions, "2026-03-02")).toEqual({
      plank: 1,
      routine: 2,
      total: 3,
    });
    expect(getDailyPoints(challenge, state, sessions, "2026-03-03")).toEqual({
      plank: 0,
      routine: 0,
      total: 0,
    });
  });
});

describe("getOverallTotals", () => {
  it("sums plank points (including bonus) and unique routines across all days", () => {
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

    expect(getOverallTotals(challenge, state, sessions)).toEqual({
      plank: 2.5,
      routine: 2,
      total: 4.5,
    });
  });

  it("ignores sessions with malformed dates", () => {
    const bad: CompletedSession = {
      id: "bad",
      routineId: "a",
      routineTitle: "A",
      duration: 10,
      completedAt: "not-a-date",
    };
    expect(getOverallTotals(challenge, { startedAt: null, days: [] }, [bad])).toEqual(
      { plank: 0, routine: 0, total: 0 }
    );
  });
});

describe("getMonthBuckets", () => {
  it("builds one bar per day with points and a today flag", () => {
    const state: PlankChallengeState = {
      startedAt: "2026-02-01",
      days: [{ date: "2026-02-03", seconds: 120 }],
    };
    const sessions = [
      session("a", new Date(2026, 1, 3, 8)),
      session("b", new Date(2026, 1, 7, 8)),
    ];

    const bars = getMonthBuckets(
      challenge,
      state,
      sessions,
      2026,
      1,
      new Date(2026, 1, 7, 12)
    );

    expect(bars).toHaveLength(28); // February 2026
    expect(bars[0]).toMatchObject({ date: "2026-02-01", points: 0, isToday: false });
    expect(bars[2]).toMatchObject({ dayOfMonth: 3, points: 2, isToday: false });
    expect(bars[6]).toMatchObject({ dayOfMonth: 7, points: 1, isToday: true });
  });

  it("returns 31 bars for a 31-day month", () => {
    const bars = getMonthBuckets(
      challenge,
      { startedAt: null, days: [] },
      [],
      2026,
      7
    );
    expect(bars).toHaveLength(31);
  });
});

describe("getYearBuckets", () => {
  it("buckets points into Monday-start weeks of the year", () => {
    // 2026-01-01 is a Thursday: week 1 starts Monday 2025-12-29.
    const state: PlankChallengeState = {
      startedAt: "2026-01-01",
      days: [
        { date: "2026-01-03", seconds: 120 }, // Saturday, week of Dec 29
        { date: "2026-01-05", seconds: 150 }, // Monday, week of Jan 5
      ],
    };
    const sessions = [session("a", new Date(2026, 0, 9, 8))]; // Friday Jan 9

    const bars = getYearBuckets(challenge, state, sessions, 2026);

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
