import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  addDays,
  completeChallengeDay,
  DEFAULT_PLANK_STATE,
  durationChallengeMaxPoints,
  durationChallengePoints,
  getChallengeProgress,
  getChallengeStatus,
  activeChallenge,
  loadChallengeState,
  mergePlankDay,
  pointsForHold,
  startChallenge,
  todayKey,
} from "./challenge";
import type {
  Challenge,
  DurationChallenge,
  PlankChallengeState,
} from "../types/challenge";

const challenge: Challenge = {
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

/** Same challenge with milestones disabled, for plain-day scoring tests. */
const plain: Challenge = { ...challenge, milestoneEvery: 0 };

const maxChallenge: DurationChallenge = {
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

beforeEach(() => {
  localStorage.clear();
});

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
    expect(pointsForHold(challenge, 119, 1)).toBe(0);
  });

  it("scores 1 at the base hold", () => {
    expect(pointsForHold(challenge, 120, 1)).toBe(1);
  });

  it("scores 1 for holds between base and bonus", () => {
    expect(pointsForHold(challenge, 149, 1)).toBe(1);
  });

  it("scores 1.5 at the bonus hold and caps it", () => {
    expect(pointsForHold(challenge, 150, 1)).toBe(1.5);
    expect(pointsForHold(challenge, 300, 1)).toBe(1.5);
  });

  it("scores 0 outside the challenge window", () => {
    expect(pointsForHold(challenge, 150, 0)).toBe(0);
    expect(pointsForHold(challenge, 150, 31)).toBe(0);
  });
});

describe("duration scoring", () => {
  it("scores 0 below the base hold", () => {
    expect(pointsForHold(maxChallenge, 119, 1)).toBe(0);
    expect(pointsForHold(maxChallenge, 0, 1)).toBe(0);
  });

  it("scores the base points at the base hold", () => {
    expect(pointsForHold(maxChallenge, 120, 1)).toBe(1);
    expect(pointsForHold(maxChallenge, 149, 1)).toBe(1);
  });

  it("scores +0.5 per full extra 30 seconds", () => {
    expect(pointsForHold(maxChallenge, 150, 1)).toBe(1.5);
    expect(pointsForHold(maxChallenge, 179, 1)).toBe(1.5);
    expect(pointsForHold(maxChallenge, 180, 1)).toBe(2);
    expect(pointsForHold(maxChallenge, 300, 1)).toBe(4);
    expect(pointsForHold(maxChallenge, 599, 1)).toBe(8.5);
  });

  it("caps the points at maxSeconds", () => {
    expect(pointsForHold(maxChallenge, 600, 1)).toBe(9);
    expect(pointsForHold(maxChallenge, 3599, 1)).toBe(9);
    expect(durationChallengeMaxPoints(maxChallenge)).toBe(9);
  });

  it("does not depend on the day number", () => {
    expect(durationChallengePoints(maxChallenge, 240)).toBe(3);
    expect(pointsForHold(maxChallenge, 240, 10)).toBe(3);
    expect(pointsForHold(maxChallenge, 240, 30)).toBe(3);
  });

  it("scores 0 outside the challenge window", () => {
    // A duration hold has no milestone day to hide behind — the window
    // guard is what keeps out-of-window days (e.g. a day copied over from
    // another challenge) from scoring.
    expect(pointsForHold(maxChallenge, 150, 0)).toBe(0);
    expect(pointsForHold(maxChallenge, 150, 31)).toBe(0);
  });
});

describe("pointsForHold on milestone days", () => {
  it("still scores the regular day for a hold below the milestone hold", () => {
    expect(pointsForHold(challenge, 179, 10)).toBe(1);
    expect(pointsForHold(challenge, 120, 10)).toBe(1);
    expect(pointsForHold(challenge, 60, 10)).toBe(0);
  });

  it("scores the milestone points at the milestone hold and caps them", () => {
    expect(pointsForHold(challenge, 180, 10)).toBe(2);
    expect(pointsForHold(challenge, 180, 20)).toBe(2);
    expect(pointsForHold(challenge, 180, 30)).toBe(2);
    expect(pointsForHold(challenge, 300, 10)).toBe(2);
  });

  it("scores normally on the days before and after a milestone", () => {
    expect(pointsForHold(challenge, 120, 9)).toBe(1);
    expect(pointsForHold(challenge, 150, 9)).toBe(1.5);
    expect(pointsForHold(challenge, 180, 11)).toBe(1.5);
  });

  it("scores 0 outside the challenge window, even at the milestone hold", () => {
    expect(pointsForHold(challenge, 180, 0)).toBe(0);
    expect(pointsForHold(challenge, 180, 31)).toBe(0);
  });
});

describe("activeChallenge", () => {
  // Config: two shared-clock cohorts — plank opens 2026-09-26 and runs
  // until 2026-10-25, then two rest days, then plank-max opens 2026-10-28.
  const statusOn = (now: Date) => {
    const c = activeChallenge(now);
    return getChallengeStatus(c, loadChallengeState(c), now);
  };

  it("shows the first cohort as upcoming before it opens", () => {
    expect(activeChallenge(new Date(2026, 8, 1)).id).toBe("plank-30-day"); // Sep 1
    expect(statusOn(new Date(2026, 8, 1)).status).toBe("not-started");
  });

  it("runs the plank cohort from its start through its last day", () => {
    expect(statusOn(new Date(2026, 8, 26)).status).toBe("active"); // Sep 26, day 1
    expect(statusOn(new Date(2026, 9, 25)).status).toBe("active"); // Oct 25, day 30
  });

  it("keeps the finished plank cohort on the card during the rest gap", () => {
    expect(activeChallenge(new Date(2026, 9, 26)).id).toBe("plank-30-day"); // Oct 26
    expect(statusOn(new Date(2026, 9, 26)).status).toBe("complete");
    expect(statusOn(new Date(2026, 9, 27)).status).toBe("complete"); // Oct 27
  });

  it("hands the card over to plank-max when it opens", () => {
    expect(activeChallenge(new Date(2026, 9, 28)).id).toBe("plank-max-30-day"); // Oct 28
    expect(statusOn(new Date(2026, 9, 28)).status).toBe("active");
    expect(statusOn(new Date(2026, 10, 10)).status).toBe("active"); // Nov 10
    expect(statusOn(new Date(2026, 11, 26)).status).toBe("complete"); // Dec 26
  });

  it("opens a cohort early when the account has an earlier start op", () => {
    // plank-max is configured for 2026-10-28, but this account's start op
    // (e.g. pushed by the admin CLI) opens it on 2026-10-01.
    localStorage.setItem(
      "challenge:plank-max",
      JSON.stringify({ startedAt: "2026-10-01", days: [] })
    );
    // Nothing opened yet: the fallback is the first configured cohort.
    expect(activeChallenge(new Date(2026, 8, 15)).id).toBe("plank-30-day"); // Sep 15
    expect(statusOn(new Date(2026, 8, 15)).status).toBe("not-started");
    // The early op opens plank-max ahead of the configured date…
    expect(activeChallenge(new Date(2026, 9, 5)).id).toBe("plank-max-30-day"); // Oct 5
    // …and once both are open, the most recently opened cohort wins.
    expect(statusOn(new Date(2026, 9, 15)).status).toBe("active"); // Oct 15
  });

  it("keeps a cohort closed when the account's start op is in the future", () => {
    localStorage.setItem(
      "challenge:plank-max",
      JSON.stringify({ startedAt: "2026-12-01", days: [] })
    );
    // The configured date has arrived (Oct 29) but this account opens Dec 1:
    // the card stays on the finished plank cohort.
    expect(activeChallenge(new Date(2026, 9, 29)).id).toBe("plank-30-day"); // Oct 29
    expect(statusOn(new Date(2026, 9, 29)).status).toBe("complete");
    expect(statusOn(new Date(2026, 11, 5)).status).toBe("active"); // Dec 5
  });

  it("lets the most recently opened cohort win when windows overlap", () => {
    // An account whose plank run was re-started later (window 10-20 – 11-18).
    localStorage.setItem(
      "plankChallenge",
      JSON.stringify({ startedAt: "2026-10-20", days: [{ date: "2026-10-20", seconds: 120 }] })
    );
    expect(activeChallenge(new Date(2026, 9, 25)).id).toBe("plank-30-day"); // Oct 25
    // plank-max opens Oct 28, which is more recent than this 10-20 start.
    expect(activeChallenge(new Date(2026, 10, 10)).id).toBe("plank-max-30-day"); // Nov 10
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

  it("stops counting today once it is done", () => {
    const pending = getChallengeStatus(challenge, mkState(START, []), onDay(0));
    expect(pending.daysLeft).toBe(30);

    const done = getChallengeStatus(challenge, mkState(START, [[START, 120]]), onDay(0));
    expect(done.dayNumber).toBe(1);
    expect(done.todayDone).toBe(true);
    expect(done.daysLeft).toBe(29);
  });

  it("scores a bonus day at 1.5", () => {
    const state = mkState(START, [[START, 150]]);
    const status = getChallengeStatus(challenge, state, onDay(0));
    expect(status.todayPoints).toBe(1.5);
    expect(status.score).toBe(1.5);
  });

  it("scores a milestone day at 2 for the full hold", () => {
    // Days 1-9 done at 2:00, day 10 (today) at 3:00
    const entries: Array<[string, number]> = [];
    for (let i = 0; i < 9; i++) entries.push([addDays(START, i), 120]);
    entries.push([addDays(START, 9), 180]);
    const status = getChallengeStatus(
      challenge,
      mkState(START, entries),
      onDay(9)
    );
    expect(status.dayNumber).toBe(10);
    expect(status.todayIsMilestone).toBe(true);
    expect(status.todayDone).toBe(true);
    expect(status.todayPoints).toBe(2);
    expect(status.score).toBeCloseTo(11);
  });

  it("scores a regular hold on a milestone day as done for 1 point", () => {
    const state = mkState(START, [[addDays(START, 9), 120]]);
    const status = getChallengeStatus(challenge, state, onDay(9));
    expect(status.todayIsMilestone).toBe(true);
    expect(status.todayPoints).toBe(1);
    expect(status.todayDone).toBe(true);
  });

  it("a hold below the base on a milestone day does not count as done", () => {
    const state = mkState(START, [[addDays(START, 9), 60]]);
    const status = getChallengeStatus(challenge, state, onDay(9));
    expect(status.todayIsMilestone).toBe(true);
    expect(status.todayPoints).toBe(0);
    expect(status.todayDone).toBe(false);
  });

  it("does not offer the recovery hold on a milestone day", () => {
    // Day 1 missed, days 2-9 done => deficit 1, but day 10 is a milestone
    const entries: Array<[string, number]> = [];
    for (let i = 1; i <= 8; i++) entries.push([addDays(START, i), 120]);
    const status = getChallengeStatus(
      challenge,
      mkState(START, entries),
      onDay(9)
    );
    expect(status.missedDays).toBe(1);
    expect(status.deficit).toBe(1);
    expect(status.bonusAvailable).toBe(false);
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

  it("a missed day is fully cleared by a single bonus hold", () => {
    // Day 1 done (+1), day 2 missed (0), day 3 at 2:30 (+1.5)
    const state = mkState(START, [
      [START, 120],
      [addDays(START, 2), 150],
    ]);

    // On day 3, once the 2:30 hold is done, today's points count toward the
    // deficit: the 1.5 earned covers the 1.0 missed, so the user is on pace.
    const onDay3 = getChallengeStatus(challenge, state, onDay(2));
    expect(onDay3.todayDone).toBe(true);
    expect(onDay3.score).toBeCloseTo(2.5);
    expect(onDay3.baseline).toBe(2);
    expect(onDay3.deficit).toBe(0);
    expect(onDay3.bonusAvailable).toBe(false);

    // On day 4 before its hold, the baseline has grown by one, so a
    // transient 0.5 is owed until day 4's hold is completed.
    const onDay4 = getChallengeStatus(challenge, state, onDay(3));
    expect(onDay4.todayDone).toBe(false);
    expect(onDay4.deficit).toBeCloseTo(0.5);
    expect(onDay4.bonusAvailable).toBe(true);
  });

  it("two consecutive bonus days leave the user ahead of the baseline", () => {
    // Day 1 done (+1), day 2 missed (0), days 3-4 at 2:30 (+1.5 each)
    const state = mkState(START, [
      [START, 120],
      [addDays(START, 2), 150],
      [addDays(START, 3), 150],
    ]);

    const onDay5 = getChallengeStatus(challenge, state, onDay(4));
    expect(onDay5.completedDays).toBe(3);
    expect(onDay5.missedDays).toBe(1);
    expect(onDay5.score).toBeCloseTo(4);
    expect(onDay5.deficit).toBe(0);
    expect(onDay5.bonusAvailable).toBe(false);
  });

  it("completes after the 30th day has passed", () => {
    // Milestone days (10, 20, 30) hold the full 3:00, the rest 2:00:
    // 27 pts + 3 x 2 pts = 33
    const allDays = Array.from({ length: 30 }, (_, i) => [
      addDays(START, i),
      (i + 1) % 10 === 0 ? 180 : 120,
    ] as [string, number]);
    const state = mkState(START, allDays);

    const lastDay = getChallengeStatus(challenge, state, onDay(29));
    expect(lastDay.status).toBe("active");
    expect(lastDay.dayNumber).toBe(30);
    expect(lastDay.daysLeft).toBe(0);
    expect(lastDay.todayIsMilestone).toBe(true);
    expect(lastDay.score).toBeCloseTo(33);

    const lastDayPending = getChallengeStatus(
      challenge,
      mkState(START, allDays.slice(0, 29)),
      onDay(29)
    );
    expect(lastDayPending.daysLeft).toBe(1);

    const after = getChallengeStatus(challenge, state, onDay(30));
    expect(after.status).toBe("complete");
    expect(after.todayIsMilestone).toBe(false);
    expect(after.score).toBeCloseTo(33);
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

describe("cohort (duration) challenge status", () => {
  const COHORT_START = "2026-11-01";

  function onCohortDay(day: number): Date {
    const d = new Date(2026, 10, 1 + (day - 1), 12);
    return d;
  }

  it("is not started before the cohort start date", () => {
    const status = getChallengeStatus(
      maxChallenge,
      { startedAt: COHORT_START, days: [] },
      new Date(2026, 9, 15)
    );
    expect(status.status).toBe("not-started");
    expect(status.daysLeft).toBe(30);
  });

  it("opens for everyone on the cohort start date, on the shared clock", () => {
    const status = getChallengeStatus(
      maxChallenge,
      { startedAt: COHORT_START, days: [] },
      onCohortDay(1)
    );
    expect(status.status).toBe("active");
    expect(status.dayNumber).toBe(1);
    expect(status.daysLeft).toBe(30);
  });

  it("scores days by hold length without milestones or recovery", () => {
    // Day 1 at 2:00 (+1), day 2 at 2:30 (+1.5); today is day 3 with no hold.
    const state = {
      startedAt: COHORT_START,
      days: [
        { date: COHORT_START, seconds: 120 },
        { date: addDays(COHORT_START, 1), seconds: 150 },
      ],
    };
    const status = getChallengeStatus(maxChallenge, state, onCohortDay(3));
    expect(status.score).toBeCloseTo(2.5);
    expect(status.todayIsMilestone).toBe(false);
    expect(status.bonusAvailable).toBe(false);
    expect(status.missedDays).toBe(0);
  });

  it("counts a short hold as a missed day once it has passed", () => {
    const state = {
      startedAt: COHORT_START,
      days: [{ date: COHORT_START, seconds: 45 }],
    };
    const status = getChallengeStatus(maxChallenge, state, onCohortDay(2));
    expect(status.missedDays).toBe(1);
    expect(status.score).toBe(0);
    expect(status.deficit).toBe(1);
  });

  it("a day with a point-earning hold is done, even on milestone days", () => {
    const state = {
      startedAt: COHORT_START,
      days: [{ date: addDays(COHORT_START, 9), seconds: 180 }], // day 10
    };
    const status = getChallengeStatus(maxChallenge, state, onCohortDay(10));
    expect(status.todayIsMilestone).toBe(false);
    expect(status.todayPoints).toBe(2);
    expect(status.todayDone).toBe(true);
  });

  it("completes for everyone after the 30th cohort day", () => {
    const state = { startedAt: COHORT_START, days: [] };
    const lastDay = getChallengeStatus(maxChallenge, state, onCohortDay(30));
    expect(lastDay.status).toBe("active");
    const after = getChallengeStatus(maxChallenge, state, onCohortDay(31));
    expect(after.status).toBe("complete");
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
    const status = getChallengeStatus(plain, state, onDay(15));
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
    const status = getChallengeStatus(plain, state, onDay(15));
    expect(status.score).toBeCloseTo(12);
    expect(status.deficit).toBeCloseTo(3);
    expect(status.bonusAvailable).toBe(false);
  });
});

describe("getChallengeProgress", () => {
  it("returns an empty progress when the challenge has not started", () => {
    const progress = getChallengeProgress(challenge, DEFAULT_PLANK_STATE, onDay(0));
    expect(progress.started).toBe(false);
    expect(progress.days).toEqual([]);
    expect(progress.plankTotal).toBe(0);
  });

  it("tracks plank points per day with a running total", () => {
    // Day 1: plank 2:00 (+1); Day 2 (today): no plank yet (pending, not a miss)
    const state = mkState(START, [[START, 120]]);
    const progress = getChallengeProgress(challenge, state, onDay(1));

    expect(progress.started).toBe(true);
    expect(progress.days).toHaveLength(30);

    const day1 = progress.days[0];
    expect(day1).toMatchObject({
      dayNumber: 1,
      plankPoints: 1,
      runningTotal: 1,
      isToday: false,
      isFuture: false,
    });

    const day2 = progress.days[1];
    expect(day2).toMatchObject({
      dayNumber: 2,
      plankPoints: 0, // today: pending until the hold is done or the day passes
      runningTotal: 1,
      isToday: true,
    });

    expect(progress.days[2].isFuture).toBe(true);
    expect(progress.days[2].runningTotal).toBe(1);
    expect(progress.plankTotal).toBe(1);
  });

  it("marks a past day as missed (0 points) only after it has passed", () => {
    // Day 1 completed, day 2 missed; on day 3 the miss is settled
    const state = mkState(START, [[START, 120]]);
    const progress = getChallengeProgress(challenge, state, onDay(2));
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

  it("scores milestone days at 2 points with a running total", () => {
    // Day 9 at 2:00 (+1), day 10 at 3:00 (+2), day 11 at 2:00 (+1);
    // today is day 12
    const state = mkState(START, [
      [addDays(START, 8), 120],
      [addDays(START, 9), 180],
      [addDays(START, 10), 120],
    ]);
    const progress = getChallengeProgress(challenge, state, onDay(11));

    expect(progress.days[8]).toMatchObject({ dayNumber: 9, plankPoints: 1 });
    expect(progress.days[9]).toMatchObject({
      dayNumber: 10,
      plankPoints: 2,
      isMissed: false,
      runningTotal: 3,
    });
    expect(progress.days[10]).toMatchObject({ dayNumber: 11, plankPoints: 1 });
    expect(progress.plankTotal).toBe(4);
  });

  it("counts a regular hold on a past milestone day for 1 point", () => {
    // Day 10 held the regular 2:00 (no 3:00 milestone); today is day 11
    const state = mkState(START, [[addDays(START, 9), 120]]);
    const progress = getChallengeProgress(challenge, state, onDay(10));
    expect(progress.days[9]).toMatchObject({
      dayNumber: 10,
      plankPoints: 1,
      isMissed: false,
    });
  });

  it("marks a past milestone day without the base hold as missed", () => {
    // Day 10 held only 1:00, below the 2:00 base; today is day 11
    const state = mkState(START, [[addDays(START, 9), 60]]);
    const progress = getChallengeProgress(challenge, state, onDay(10));
    expect(progress.days[9]).toMatchObject({
      dayNumber: 10,
      plankPoints: 0,
      isMissed: true,
    });
  });

  it("scores duration holds per day with a running total", () => {
    // Day 1 at 2:30 (+1.5), day 2 at 5:00 (+4); today is day 3
    const state = {
      startedAt: "2026-11-01",
      days: [
        { date: "2026-11-01", seconds: 150 },
        { date: "2026-11-02", seconds: 300 },
      ],
    };
    const progress = getChallengeProgress(
      maxChallenge,
      state,
      new Date(2026, 10, 2, 12)
    );
    expect(progress.days[0]).toMatchObject({ plankPoints: 1.5, runningTotal: 1.5, isMissed: false });
    expect(progress.days[1]).toMatchObject({ plankPoints: 4, runningTotal: 5.5 });
    expect(progress.plankTotal).toBe(5.5);
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
  it("startChallenge starts on today and saves", () => {
    const state = startChallenge(challenge, new Date(2026, 0, 5));
    expect(state).toEqual({ startedAt: "2026-01-05", days: [] });
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "plankChallenge",
      JSON.stringify(state)
    );
  });

  it("completeChallengeDay records today's hold", () => {
    const state = completeChallengeDay(challenge, 120, new Date(2026, 0, 5));
    expect(state.startedAt).toBe("2026-01-05");
    expect(state.days).toEqual([{ date: "2026-01-05", seconds: 120 }]);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "plankChallenge",
      JSON.stringify(state)
    );
  });

  it("saves a cohort challenge to its own blob key", () => {
    const state = completeChallengeDay(maxChallenge, 150, new Date(2026, 10, 5));
    expect(state.days).toEqual([{ date: "2026-11-05", seconds: 150 }]);
    const setItem = localStorage.setItem as ReturnType<typeof vi.fn>;
    const cohortCall = setItem.mock.calls.find(([key]) => key === "challenge:plank-max");
    expect(cohortCall).toBeDefined();
    expect(JSON.parse(cohortCall![1]).days).toEqual([{ date: "2026-11-05", seconds: 150 }]);
  });
});
