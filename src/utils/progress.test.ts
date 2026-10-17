import { describe, test, expect } from "vitest";
import { addDays } from "./challenge";
import {
  getOverallTotals,
  getPlankSecondsOn,
  getRecentDays,
  getWeekComparison,
  getWindowSummary,
  type ChallengeEntry,
} from "./progress";
import type { CompletedSession } from "./storage";
import type { Challenge, PlankChallengeState } from "../types/challenge";

// The threshold challenge from the app config (kept as a local fixture so
// the tests don't depend on the configured cohort dates).
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

describe("getPlankSecondsOn", () => {
  test("sums each challenge's best hold for the day", () => {
    const entries = entriesWith([
      { date: "2026-10-10", seconds: 120 },
      { date: "2026-10-11", seconds: 200 },
    ]);
    expect(getPlankSecondsOn(entries, "2026-10-10")).toBe(120);
    expect(getPlankSecondsOn(entries, "2026-10-11")).toBe(200);
    expect(getPlankSecondsOn(entries, "2026-10-12")).toBe(0);
  });
});

describe("getWindowSummary", () => {
  test("aggregates points, sessions, plank time, and active days", () => {
    // Two different routines on 10-14 (+2), one on 10-13 (+1), plus a
    // 120s plank each of those days (+1 each, threshold scoring).
    const entries = entriesWith([
      { date: "2026-10-14", seconds: 120 },
      { date: "2026-10-13", seconds: 120 },
    ]);
    const sessions = [
      sessionAt("2026-10-14", "s1", "r1"),
      sessionAt("2026-10-14", "s2", "r2"),
      sessionAt("2026-10-13", "s3", "r1"),
    ];

    const win = getWindowSummary(entries, sessions, "2026-10-13", "2026-10-15", NOW);
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
    const entries = entriesWith([
      { date: "2026-10-08", seconds: 120 },
      { date: "2026-10-09", seconds: 120 },
    ]);
    const { current, previous } = getWeekComparison(entries, [], NOW);

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
  const maxChallenge: Challenge = {
    id: "plank-max-30-day",
    syncId: "plank-max",
    title: "30-Day Plank Max Challenge",
    description: "test",
    exerciseId: "plank-hold",
    totalDays: 30,
    startDate: "2026-10-28",
    scoring: "duration",
    baseSeconds: 120,
    basePoints: 1,
    incrementSeconds: 30,
    incrementPoints: 0.5,
    maxSeconds: 600,
    illustration: "⏱️",
  };

  test("ignores holds outside the challenge window", () => {
    // A day copied over from another challenge (or backdated) lands before
    // the window opens; duration scoring must not score it.
    const entries: ChallengeEntry[] = [
      {
        challenge: maxChallenge,
        state: {
          startedAt: "2026-10-28",
          days: [
            { date: "2026-10-05", seconds: 120 }, // before the window
            { date: "2026-10-29", seconds: 150 }, // in the window: 1.5
          ],
        },
      },
    ];
    expect(getOverallTotals(entries, []).plank).toBe(1.5);
  });
});

describe("getRecentDays", () => {
  test("returns the last 14 days, today first", () => {
    const entries = entriesWith([{ date: TODAY, seconds: 120 }]);
    const sessions = [sessionAt(TODAY, "s1", "r1")];

    const rows = getRecentDays(entries, sessions, 14, NOW);
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
