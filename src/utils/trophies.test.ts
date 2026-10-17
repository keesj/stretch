import { describe, test, expect } from "vitest";
import {
  TROPHIES,
  FREE_ITEMS,
  TITLES,
  computeTrophyStats,
  isEarned,
  trophyProgress,
  trophyProgressLabel,
  titleFor,
  TROPHY_BACKGROUNDS,
  backgroundById,
  costOf,
  itemFor,
  shelfCost,
  shelfPoints,
  type TrophyStats,
} from "./trophies";
import { MAX_ITEMS } from "../sync/types";

function stats(overrides: Partial<TrophyStats> = {}): TrophyStats {
  return {
    bestHoldSeconds: 0,
    totalPlankDays: 0,
    longestStreak: 0,
    bestChallengeDays: 0,
    sessionsCompleted: 0,
    ...overrides,
  };
}
import { addDays } from "./challenge";
import type { Challenge, PlankChallengeState } from "../types/challenge";
import type { CompletedSession } from "./storage";

const DURATION: Challenge = {
  id: "plank-max-30-day",
  syncId: "plank-max",
  title: "Max Plank",
  description: "",
  exerciseId: "plank-hold",
  illustration: "⏱️",
  startDate: "2026-11-01",
  totalDays: 30,
  scoring: "duration",
  baseSeconds: 120,
  basePoints: 1,
  incrementSeconds: 30,
  incrementPoints: 0.5,
  maxSeconds: 600,
};

const THRESHOLD: Challenge = {
  id: "plank-30-day",
  syncId: "plank",
  title: "30-Day Plank",
  description: "",
  exerciseId: "plank-hold",
  illustration: "💪",
  totalDays: 30,
  scoring: "threshold",
  baseSeconds: 120,
  bonusSeconds: 30,
  bonusPoints: 0.5,
  milestoneEvery: 10,
  milestoneSeconds: 180,
  milestonePoints: 2,
};

function state(days: { date: string; seconds: number }[], startedAt: string | null = "2026-11-01"): PlankChallengeState {
  return { startedAt, days };
}

function sessions(n: number): CompletedSession[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    routineId: "r",
    routineTitle: "T",
    duration: 60,
    completedAt: `2026-10-${String((i % 28) + 1).padStart(2, "0")}T08:00:00.000Z`,
  }));
}

const trophy = (id: string) => TROPHIES.find((t) => t.id === id)!;

describe("computeTrophyStats", () => {
  test("empty account has zero stats and no earned trophies", () => {
    const stats = computeTrophyStats(
      [{ challenge: DURATION, state: state([]) }],
      []
    );
    expect(stats).toEqual({
      bestHoldSeconds: 0,
      totalPlankDays: 0,
      longestStreak: 0,
      bestChallengeDays: 0,
      sessionsCompleted: 0,
    });
    for (const t of TROPHIES) expect(isEarned(t, stats)).toBe(false);
  });

  test("tracks the best hold across challenges", () => {
    const stats = computeTrophyStats(
      [
        { challenge: DURATION, state: state([{ date: "2026-11-01", seconds: 300 }]) },
        { challenge: THRESHOLD, state: state([{ date: "2026-10-01", seconds: 120 }]) },
      ],
      []
    );
    expect(stats.bestHoldSeconds).toBe(300);
    expect(isEarned(trophy("two-minute-club"), stats)).toBe(true);
    expect(isEarned(trophy("five-minute-wall"), stats)).toBe(true);
    expect(isEarned(trophy("iron-ten"), stats)).toBe(false);
  });

  test("a hold below the base earns no completed day", () => {
    const stats = computeTrophyStats(
      [{ challenge: DURATION, state: state([{ date: "2026-11-01", seconds: 100 }]) }],
      []
    );
    expect(stats.totalPlankDays).toBe(0);
    expect(stats.bestHoldSeconds).toBe(100); // the hold still counts as a hold
    expect(isEarned(trophy("first-plank"), stats)).toBe(false);
  });

  test("streak counts consecutive days and breaks on a gap", () => {
    const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-05", "2026-11-06"].map(
      (date) => ({ date, seconds: 120 })
    );
    const stats = computeTrophyStats([{ challenge: DURATION, state: state(days) }], []);
    expect(stats.longestStreak).toBe(3);
    expect(stats.totalPlankDays).toBe(5);
  });

  test("a streak can span multiple challenges", () => {
    const stats = computeTrophyStats(
      [
        {
          challenge: THRESHOLD,
          state: state(
            [
              { date: "2026-10-01", seconds: 120 },
              { date: "2026-10-02", seconds: 120 },
            ],
            "2026-10-01"
          ),
        },
        {
          challenge: DURATION,
          state: state([{ date: "2026-10-03", seconds: 120 }], "2026-10-03"),
        },
      ],
      []
    );
    expect(stats.longestStreak).toBe(3);
  });

  test("bestChallengeDays is the most completed days in a single challenge", () => {
    const a = state(
      ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map((date) => ({ date, seconds: 120 }))
    );
    const b = state(
      ["2026-10-01", "2026-10-02", "2026-10-03"].map((date) => ({ date, seconds: 120 })),
      "2026-10-01"
    );
    const stats = computeTrophyStats(
      [
        { challenge: DURATION, state: a },
        { challenge: THRESHOLD, state: b },
      ],
      []
    );
    expect(stats.bestChallengeDays).toBe(5);
    expect(isEarned(trophy("finisher"), stats)).toBe(false);
  });

  test("completing all 30 days of one challenge earns the finisher", () => {
    const days = Array.from({ length: 30 }, (_, i) => ({
      date: addDays("2026-11-01", i),
      seconds: 120,
    }));
    const stats = computeTrophyStats([{ challenge: DURATION, state: state(days) }], []);
    expect(stats.bestChallengeDays).toBe(30);
    expect(isEarned(trophy("finisher"), stats)).toBe(true);
    expect(isEarned(trophy("half-marathon"), stats)).toBe(true);
  });

  test("milestone holds still count as one completed day", () => {
    // Day 10 of the threshold challenge: a 180s milestone hold = 2 points,
    // but only a single completed day.
    const days = Array.from({ length: 10 }, (_, i) => ({
      date: addDays("2026-10-01", i),
      seconds: i === 9 ? 180 : 120,
    }));
    const stats = computeTrophyStats(
      [{ challenge: THRESHOLD, state: state(days, "2026-10-01") }],
      []
    );
    expect(stats.bestChallengeDays).toBe(10);
    expect(stats.totalPlankDays).toBe(10);
  });

  test("counts stretch sessions", () => {
    const stats = computeTrophyStats(
      [{ challenge: DURATION, state: state([]) }],
      sessions(3)
    );
    expect(stats.sessionsCompleted).toBe(3);
    expect(isEarned(trophy("session-one"), stats)).toBe(true);
    expect(isEarned(trophy("regular"), stats)).toBe(false);

    const full = computeTrophyStats(
      [{ challenge: DURATION, state: state([]) }],
      sessions(10)
    );
    expect(isEarned(trophy("regular"), full)).toBe(true);
  });
});

describe("trophy progress", () => {
  const stats: TrophyStats = {
    bestHoldSeconds: 200,
    totalPlankDays: 5,
    longestStreak: 7,
    bestChallengeDays: 5,
    sessionsCompleted: 2,
  };

  test("earned trophies report full progress", () => {
    expect(trophyProgress(trophy("on-fire"), stats)).toBe(1);
    expect(trophyProgress(trophy("first-plank"), stats)).toBe(1);
  });

  test("unearned progress is clamped at the target", () => {
    // 200s hold toward the 300s wall.
    expect(trophyProgress(trophy("five-minute-wall"), stats)).toBe(200 / 300);
    expect(trophyProgressLabel(trophy("five-minute-wall"), stats)).toBe("3:20 / 5:00");
  });

  test("progress labels read as value / target", () => {
    expect(trophyProgressLabel(trophy("half-marathon"), stats)).toBe("5 / 15 days");
    expect(trophyProgressLabel(trophy("regular"), stats)).toBe("2 / 10 sessions");
  });
});

describe("backgrounds", () => {
  test("the default id is in the set", () => {
    expect(TROPHY_BACKGROUNDS.some((b) => b.id === "classic")).toBe(true);
  });

  test("unknown ids fall back to the first theme", () => {
    expect(backgroundById("nope").id).toBe(TROPHY_BACKGROUNDS[0].id);
  });

  test("the shelf holds a capped number of placed items", () => {
    expect(MAX_ITEMS).toBe(24);
  });
});

describe("free items", () => {
  test("every free item resolves through itemFor", () => {
    expect(FREE_ITEMS.length).toBeGreaterThanOrEqual(10);
    for (const f of FREE_ITEMS) {
      expect(itemFor(f.id)).toEqual({ emoji: f.emoji, label: f.label, kind: "free" });
    }
  });

  test("trophies resolve as the big shelf pieces, decorations as the small ones", () => {
    for (const t of TROPHIES) {
      expect(itemFor(t.id)?.kind).toBe("trophy");
    }
    for (const f of FREE_ITEMS) {
      expect(itemFor(f.id)?.kind).toBe("free");
    }
    // The medal moved from decorations to the Regular trophy.
    expect(TROPHIES.find((t) => t.id === "regular")?.emoji).toBe("🎖️");
    expect(FREE_ITEMS.some((f) => f.id === "medal")).toBe(false);
  });

  test("free item ids do not collide with trophy ids", () => {
    const trophyIds = new Set(TROPHIES.map((t) => t.id));
    const freeIds = new Set(FREE_ITEMS.map((f) => f.id));
    const collision = [...freeIds].filter((id) => trophyIds.has(id));
    expect(collision).toEqual([]);
    expect(freeIds.size).toBe(FREE_ITEMS.length);
  });

  test("itemFor resolves trophies and rejects unknowns", () => {
    expect(itemFor("first-plank")).toEqual({ emoji: "🐣", label: "First Plank", kind: "trophy" });
    expect(itemFor("no-such-item")).toBeNull();
    expect(itemFor(null)).toBeNull();
    expect(itemFor(undefined)).toBeNull();
  });
});

describe("shelf points (scarcity)", () => {
  test("every free item has a positive cost, listed cheapest-first", () => {
    for (let i = 0; i < FREE_ITEMS.length; i++) {
      expect(FREE_ITEMS[i].cost).toBeGreaterThan(0);
      if (i > 0) {
        expect(FREE_ITEMS[i].cost).toBeGreaterThanOrEqual(FREE_ITEMS[i - 1].cost);
      }
    }
  });

  test("the cost table matches the agreed tiers", () => {
    expect(costOf("note")).toBe(10);
    expect(costOf("clover")).toBe(10);
    expect(costOf("plant")).toBe(20);
    expect(costOf("star")).toBe(20);
    expect(costOf("moon")).toBe(30);
    expect(costOf("candle")).toBe(40);
    expect(costOf("books")).toBe(60);
    expect(costOf("vase")).toBe(80);
    expect(costOf("frame")).toBe(100);
    expect(costOf("crystal")).toBe(250);
    expect(costOf("gem")).toBe(500);
    expect(costOf("ruby")).toBe(1000);
  });

  test("trophies and unknown ids are free", () => {
    expect(costOf("first-plank")).toBe(0);
    expect(costOf("finisher")).toBe(0);
    expect(costOf("medal")).toBe(0); // retired decoration id
    expect(costOf("no-such-item")).toBe(0);
    expect(costOf(null)).toBe(0);
    expect(costOf(undefined)).toBe(0);
  });

  test("shelf points are 20 per completed session", () => {
    expect(shelfPoints(stats())).toBe(0);
    expect(shelfPoints(stats({ sessionsCompleted: 3 }))).toBe(60);
    expect(shelfPoints(stats({ sessionsCompleted: 50 }))).toBe(1000); // a ruby
  });

  test("shelfCost sums placed items; trophies add nothing", () => {
    expect(shelfCost([])).toBe(0);
    expect(shelfCost([{ item: "gem" }, { item: "gem" }, { item: "first-plank" }])).toBe(1000);
    expect(shelfCost([{ item: "note" }, { item: "clover" }])).toBe(20);
  });

  test("grown items draw double the points", () => {
    expect(costOf("gem", 2)).toBe(1000);
    expect(costOf("plant", 2)).toBe(40);
    expect(costOf("first-plank", 2)).toBe(0); // trophies stay free, grown or not
    expect(shelfCost([{ item: "plant", size: 2 }, { item: "note" }])).toBe(50);
    // An item without a size (pre-growth ops) counts as normal.
    expect(shelfCost([{ item: "plant" }])).toBe(20);
  });
});

describe("titles", () => {
  test("title ids are unique", () => {
    expect(new Set(TITLES.map((t) => t.id)).size).toBe(TITLES.length);
  });

  test("no achievements, no title", () => {
    expect(titleFor(stats())).toBeNull();
  });

  test("the first plank earns the novice", () => {
    expect(titleFor(stats({ bestHoldSeconds: 100, totalPlankDays: 1 }))).toMatchObject({
      id: "novice",
    });
  });

  test("a 120s hold beats the novice (steady)", () => {
    expect(titleFor(stats({ bestHoldSeconds: 120, totalPlankDays: 1 }))).toMatchObject({
      id: "steady",
    });
  });

  test("precedence: the highest earned title wins", () => {
    // Full 30-day challenge + everything else: finisher on top.
    expect(
      titleFor(
        stats({
          bestHoldSeconds: 600,
          totalPlankDays: 30,
          longestStreak: 30,
          bestChallengeDays: 30,
          sessionsCompleted: 5,
        })
      )
    ).toMatchObject({ id: "finisher" });
    // No finisher but a 10-minute hold: iron (above on-fire and endurance).
    expect(
      titleFor(
        stats({ bestHoldSeconds: 600, totalPlankDays: 5, longestStreak: 10, bestChallengeDays: 5 })
      )
    ).toMatchObject({ id: "iron" });
    // 5-minute hold beats a 8-day streak.
    expect(
      titleFor(stats({ bestHoldSeconds: 300, totalPlankDays: 3, longestStreak: 8, bestChallengeDays: 3 }))
    ).toMatchObject({ id: "endurance" });
    // 7-day streak beats a 120s hold.
    expect(
      titleFor(stats({ bestHoldSeconds: 120, totalPlankDays: 7, longestStreak: 7, bestChallengeDays: 7 }))
    ).toMatchObject({ id: "on-fire" });
    // 15 days (no long streak) earns the marathoner.
    expect(
      titleFor(stats({ bestHoldSeconds: 120, totalPlankDays: 15, longestStreak: 3, bestChallengeDays: 15 }))
    ).toMatchObject({ id: "marathoner" });
  });

  test("session trophies do not affect titles", () => {
    // 10 sessions but no planks at all: still no title.
    expect(titleFor(stats({ sessionsCompleted: 10 }))).toBeNull();
  });
});
