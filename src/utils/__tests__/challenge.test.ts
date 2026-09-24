import { describe, it, expect } from "vitest";
import {
  addDays,
  completePlankDay,
  DEFAULT_PLANK_STATE,
  getChallengeProgress,
  getChallengeStatus,
  mergePlankDay,
  pointsForHold,
  startPlankChallenge,
  todayKey,
} from "../challenge";
import type {
  Challenge,
  PlankChallengeState,
  SessionCompletion,
} from "../../types/challenge";

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

const START = "2026-01-05";

function mkState(
  startedAt: string | null,
  entries: Array<[string, number]>
): PlankChallengeState {
  return {
    startedAt,
    days: entries.map(([date, seconds]) => ({ date, seconds })),
  };
}

function onDay(offset: number, hour = 12): Date {
  const d = new Date(2026, 0, 5 + offset, hour, 0, 0);
  return d;
}

describe("date helpers", () => {
  it("addDays crosses month boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("todayKey formats a local date as YYYY-MM-DD", () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(todayKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("pointsForHold", () => {
  it("scores 0 below the base hold", () => {
    expect(pointsForHold(challenge, 119)).toBe(0);
  });

  it("scores 1 at the base hold", () => {
    expect(pointsForHold(challenge, 120)).toBe(1);
  });

  it("scores 1 for holds between base and bonus", () => {
    expect(pointsForHold(challenge, 149)).toBe(1);
  });

  it("scores 1.5 at the bonus hold and caps it", () => {
    expect(pointsForHold(challenge, 150)).toBe(1.5);
    expect(pointsForHold(challenge, 300)).toBe(1.5);
  });
});

describe("getChallengeStatus", () => {
  it("reports not-started when there is no start date", () => {
    const status = getChallengeStatus(challenge, DEFAULT_PLANK_STATE, onDay(0));
    expect(status.status).toBe("not-started");
    expect(status.dayNumber).toBe(1);
    expect(status.daysLeft).toBe(30);
    expect(status.score).toBe(0);
  });

  it("scores the current day as it is completed", () => {
    const state = mkState(START, [[START, 120]]);
    const status = getChallengeStatus(challenge, state, onDay(0));
    expect(status.status).toBe("active");
    expect(status.dayNumber).toBe(1);
    expect(status.todayDone).toBe(true);
    expect(status.todayPoints).toBe(1);
    expect(status.score).toBe(1);
    expect(status.missedDays).toBe(0);
  });

  it("scores a bonus day at 1.5", () => {
    const state = mkState(START, [[START, 150]]);
    const status = getChallengeStatus(challenge, state, onDay(0));
    expect(status.todayPoints).toBe(1.5);
    expect(status.score).toBe(1.5);
  });

  it("earns no points for a missed day once it has passed", () => {
    // Day 1 done, day 2 missed, now on day 3
    const state = mkState(START, [[START, 120]]);
    const status = getChallengeStatus(challenge, state, onDay(2));
    expect(status.dayNumber).toBe(3);
    expect(status.missedDays).toBe(1);
    expect(status.score).toBeCloseTo(1);
    expect(status.deficit).toBe(1);
    expect(status.todayDone).toBe(false);
  });

  it("today is not a miss until the next day", () => {
    const state = mkState(START, [[addDays(START, 1), 120]]);
    const status = getChallengeStatus(challenge, state, onDay(0));
    expect(status.missedDays).toBe(0);
    expect(status.score).toBe(0);
  });

  it("counts each missed day when the app is opened after several days", () => {
    const state = mkState(START, [[START, 120]]);
    const status = getChallengeStatus(challenge, state, onDay(4));
    expect(status.missedDays).toBe(3);
    expect(status.score).toBeCloseTo(1);
    expect(status.deficit).toBe(3);
  });

  it("a missed day is fully recoverable with two bonus days", () => {
    // Day 1 done (+1), day 2 missed (0), days 3-4 at 2:30 (+1.5 each)
    const state = mkState(START, [
      [START, 120],
      [addDays(START, 2), 150],
      [addDays(START, 3), 150],
    ]);

    const afterFirstBonus = getChallengeStatus(challenge, state, onDay(3));
    expect(afterFirstBonus.deficit).toBeCloseTo(0.5);
    expect(afterFirstBonus.bonusAvailable).toBe(true);

    const afterSecondBonus = getChallengeStatus(challenge, state, onDay(4));
    expect(afterSecondBonus.completedDays).toBe(3);
    expect(afterSecondBonus.missedDays).toBe(1);
    expect(afterSecondBonus.score).toBeCloseTo(4);
    expect(afterSecondBonus.deficit).toBe(0);
    expect(afterSecondBonus.bonusAvailable).toBe(false);
  });

  it("completes after the 30th day has passed", () => {
    const allDays = Array.from({ length: 30 }, (_, i) => [
      addDays(START, i),
      120,
    ] as [string, number]);
    const state = mkState(START, allDays);

    const lastDay = getChallengeStatus(challenge, state, onDay(29));
    expect(lastDay.status).toBe("active");
    expect(lastDay.dayNumber).toBe(30);
    expect(lastDay.daysLeft).toBe(1);
    expect(lastDay.score).toBeCloseTo(30);

    const after = getChallengeStatus(challenge, state, onDay(30));
    expect(after.status).toBe("complete");
    expect(after.score).toBeCloseTo(30);
  });

  it("completes with a zero score when every day is missed", () => {
    const state = mkState(START, []);
    const status = getChallengeStatus(challenge, state, onDay(30));
    expect(status.status).toBe("complete");
    expect(status.missedDays).toBe(30);
    expect(status.score).toBe(0);
  });

  it("ignores holds outside the challenge window", () => {
    const state = mkState(START, [
      [addDays(START, -1), 120],
      [addDays(START, 30), 120],
      [START, 120],
    ]);
    const status = getChallengeStatus(challenge, state, onDay(0));
    expect(status.score).toBeCloseTo(1);
  });
});

describe("recovery bonus availability", () => {
  it("is not offered on a perfect run", () => {
    const state = mkState(START, [[START, 120]]);
    const status = getChallengeStatus(challenge, state, onDay(1));
    expect(status.baseline).toBe(1);
    expect(status.deficit).toBe(0);
    expect(status.bonusAvailable).toBe(false);
  });

  it("is offered the day after a miss (deficit 1)", () => {
    const state = mkState(START, []);
    const status = getChallengeStatus(challenge, state, onDay(1));
    expect(status.baseline).toBe(1);
    expect(status.deficit).toBe(1);
    expect(status.bonusAvailable).toBe(true);
  });

  it("stays offered while recovering and stops once the baseline is reached", () => {
    // Day 1 missed; days 2-3 at 2:30 (+1.5 each)
    const d2 = addDays(START, 1);
    const d3 = addDays(START, 2);

    const afterDay2 = getChallengeStatus(challenge, mkState(START, [[d2, 150]]), onDay(2));
    expect(afterDay2.deficit).toBeCloseTo(0.5);
    expect(afterDay2.bonusAvailable).toBe(true);

    const afterDay3 = getChallengeStatus(
      challenge,
      mkState(START, [[d2, 150], [d3, 150]]),
      onDay(3)
    );
    expect(afterDay3.deficit).toBeCloseTo(0);
    expect(afterDay3.bonusAvailable).toBe(false);
  });

  it("is offered when exactly 2 points behind the baseline", () => {
    // 15 past days: 13x 2:00, 2 missed => 13 pts (deficit 2)
    const entries: Array<[string, number]> = [];
    for (let i = 0; i < 13; i++) entries.push([addDays(START, i), 120]);
    const state = mkState(START, entries);
    const status = getChallengeStatus(challenge, state, onDay(15));
    expect(status.baseline).toBe(15);
    expect(status.score).toBeCloseTo(13);
    expect(status.deficit).toBeCloseTo(2);
    expect(status.bonusAvailable).toBe(true);
  });

  it("is no longer offered more than 2 points behind (out of luck)", () => {
    // 15 past days: 12x 2:00, 3 missed => 12 pts (deficit 3)
    const entries: Array<[string, number]> = [];
    for (let i = 0; i < 12; i++) entries.push([addDays(START, i), 120]);
    const state = mkState(START, entries);
    const status = getChallengeStatus(challenge, state, onDay(15));
    expect(status.score).toBeCloseTo(12);
    expect(status.deficit).toBeCloseTo(3);
    expect(status.bonusAvailable).toBe(false);
  });
});

describe("getChallengeProgress", () => {
  function at(dateKey: string, hour = 8): string {
    const [y, m, d] = dateKey.split("-").map(Number);
    return new Date(y, m - 1, d, hour, 0, 0).toISOString();
  }

  function completions(entries: Array<[string, string[]]>): SessionCompletion[] {
    return entries.flatMap(([date, routineIds]) =>
      routineIds.map((routineId) => ({ routineId, completedAt: at(date) }))
    );
  }

  it("returns an empty progress when the challenge has not started", () => {
    const progress = getChallengeProgress(
      challenge,
      DEFAULT_PLANK_STATE,
      completions([[START, ["wake-up-workout"]]]),
      onDay(0)
    );
    expect(progress.started).toBe(false);
    expect(progress.days).toEqual([]);
    expect(progress.combinedTotal).toBe(0);
  });

  it("combines plank and routine points per day with a running total", () => {
    // Day 1: plank 2:00 (+1) + wake-up-workout (x2) + midday-decompress (+2 unique routines)
    // Day 2 (today): no plank yet (pending, not a miss) + evening-unwind (+1)
    const state = mkState(START, [[START, 120]]);
    const progress = getChallengeProgress(
      challenge,
      state,
      completions([
        [START, ["wake-up-workout", "wake-up-workout", "midday-decompress"]],
        [addDays(START, 1), ["evening-unwind"]],
        [addDays(START, -1), ["wake-up-workout"]], // before the window: ignored
      ]),
      onDay(1)
    );

    expect(progress.started).toBe(true);
    expect(progress.days).toHaveLength(30);

    const day1 = progress.days[0];
    expect(day1).toMatchObject({
      dayNumber: 1,
      plankPoints: 1,
      routinePoints: 2,
      totalPoints: 3,
      runningTotal: 3,
      isToday: false,
      isFuture: false,
    });

    const day2 = progress.days[1];
    expect(day2).toMatchObject({
      dayNumber: 2,
      plankPoints: 0, // today: pending until the hold is done or the day passes
      routinePoints: 1,
      totalPoints: 1,
      runningTotal: 4,
      isToday: true,
    });

    expect(progress.days[2].isFuture).toBe(true);
    expect(progress.days[2].runningTotal).toBe(4);
    expect(progress.plankTotal).toBe(1);
    expect(progress.routineTotal).toBe(3);
    expect(progress.combinedTotal).toBe(4);
  });

  it("marks a past day as missed (0 points) only after it has passed", () => {
    // Day 1 completed, day 2 missed; on day 3 the miss is settled
    const state = mkState(START, [[START, 120]]);
    const progress = getChallengeProgress(
      challenge,
      state,
      [],
      onDay(2)
    );
    expect(progress.days[1]).toMatchObject({
      plankPoints: 0,
      isMissed: true,
    });
    // Today (day 3) is still pending, not a miss
    expect(progress.days[2]).toMatchObject({
      plankPoints: 0,
      isMissed: false,
      isToday: true,
    });
    expect(progress.plankTotal).toBe(1);
  });

  it("ignores routine completions outside the challenge window", () => {
    const state = mkState(START, []);
    const lastDay = addDays(START, 29);
    const progress = getChallengeProgress(
      challenge,
      state,
      completions([
        [addDays(START, -1), ["wake-up-workout"]],
        [addDays(START, 30), ["wake-up-workout"]], // after the 30th day
      ]),
      new Date(2026, 0, 5)
    );
    expect(progress.routineTotal).toBe(0);
    expect(progress.days.find((d) => d.date === lastDay)?.routinePoints).toBe(0);
  });
});

describe("mergePlankDay / completion", () => {
  it("appends a day when it is not present yet", () => {
    const next = mergePlankDay(
      { startedAt: START, days: [] },
      START,
      120
    );
    expect(next.days).toEqual([{ date: START, seconds: 120 }]);
    expect(next.startedAt).toBe(START);
  });

  it("keeps the best hold when the same day is completed twice", () => {
    let state = mergePlankDay({ startedAt: START, days: [] }, START, 120);
    state = mergePlankDay(state, START, 150);
    expect(state.days).toEqual([{ date: START, seconds: 150 }]);

    state = mergePlankDay(state, START, 120);
    expect(state.days).toEqual([{ date: START, seconds: 150 }]);
  });

  it("starts the challenge on the first completion when it was not started", () => {
    const next = mergePlankDay(DEFAULT_PLANK_STATE, "2026-02-01", 120);
    expect(next.startedAt).toBe("2026-02-01");
  });
});

describe("persistence helpers", () => {
  it("startPlankChallenge starts on today and saves", () => {
    const state = startPlankChallenge(new Date(2026, 0, 5));
    expect(state).toEqual({ startedAt: "2026-01-05", days: [] });
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "plankChallenge",
      JSON.stringify(state)
    );
  });

  it("completePlankDay records today's hold", () => {
    const state = completePlankDay(120, new Date(2026, 0, 5));
    expect(state.startedAt).toBe("2026-01-05");
    expect(state.days).toEqual([{ date: "2026-01-05", seconds: 120 }]);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "plankChallenge",
      JSON.stringify(state)
    );
  });
});
