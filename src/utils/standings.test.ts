import { describe, test, expect } from "vitest";
import { computeStandings, podiumTaunt, type SquadMember } from ".//standings";
import { displayName, displayAvatar, nameColor, AVATARS } from ".//display";
import type { StandingsFeed } from "../sync/types";

// A duration challenge shaped like the cohort one: 1 pt at 120 s, +0.5 per
// 30 s to a 600 s cap (9 pts).
const CHALLENGE = {
  id: "plank-max-30-day",
  syncId: "plank-max",
  title: "Max Plank",
  description: "Hold as long as you can.",
  exerciseId: "plank-hold",
  illustration: "⏱️",
  scoring: "duration",
  startDate: "2026-11-01",
  totalDays: 30,
  baseSeconds: 120,
  basePoints: 1,
  incrementSeconds: 30,
  incrementPoints: 0.5,
  maxSeconds: 600,
} as const;

function feed(roster: StandingsFeed["roster"], asOf = "2026-11-05"): StandingsFeed {
  return { asOf, roster };
}

describe("computeStandings", () => {
  test("computes total points from raw seconds using the challenge rules", () => {
    const view = computeStandings(
      CHALLENGE,
      feed([
        {
          accountId: "a",
          name: "Ana",
          avatar: "🐢",
          startedAt: "2026-11-01",
          days: [
            { date: "2026-11-01", seconds: 120 }, // 1 pt
            { date: "2026-11-02", seconds: 180 }, // 2 pts
            { date: "2026-11-03", seconds: 100 }, // 0 pts (below base)
            { date: "2026-11-04", seconds: 600 }, // 9 pts (capped)
          ],
        },
      ]),
      "me"
    );
    const m = view.members[0];
    expect(m.totalPoints).toBe(1 + 2 + 0 + 9);
    expect(m.daysDone).toBe(4); // 100 s is below the base but still a hold
    expect(m.isMe).toBe(false);
    expect(m.rank).toBe(1);
  });

  test("ranks by total points, then days done, then name", () => {
    const view = computeStandings(
      CHALLENGE,
      feed([
        { accountId: "c", name: "Cleo", avatar: "", startedAt: "2026-11-01", days: [{ date: "2026-11-01", seconds: 120 }] },
        { accountId: "a", name: "Ana", avatar: "", startedAt: "2026-11-01", days: [{ date: "2026-11-01", seconds: 120 }] },
        { accountId: "b", name: "Bob", avatar: "", startedAt: "2026-11-01", days: [{ date: "2026-11-01", seconds: 600 }] },
      ]),
      "me"
    );
    expect(view.members.map((m) => m.name)).toEqual(["Bob", "Ana", "Cleo"]);
    expect(view.members.map((m) => m.rank)).toEqual([1, 2, 3]);
  });

  test("computes yesterday's podium from the day before asOf", () => {
    const view = computeStandings(
      CHALLENGE,
      feed([
        { accountId: "a", name: "Ana", avatar: "", startedAt: "2026-11-01", days: [{ date: "2026-11-04", seconds: 300 }] },
        { accountId: "b", name: "Bob", avatar: "", startedAt: "2026-11-01", days: [{ date: "2026-11-04", seconds: 240 }] },
        // No hold yesterday: not on the podium.
        { accountId: "c", name: "Cleo", avatar: "", startedAt: "2026-11-01", days: [{ date: "2026-11-01", seconds: 600 }] },
      ]),
      "me"
    );
    expect(view.yesterday).toBe("2026-11-04");
    expect(view.podium.map((m) => m.name)).toEqual(["Ana", "Bob"]);
    expect(view.podium[0].yesterdaySeconds).toBe(300);
    expect(view.podium[0].yesterdayPoints).toBe(4);
  });

  test("an empty podium taunts quietly instead of crowning", () => {
    const view = computeStandings(CHALLENGE, feed([]), "me");
    expect(view.podium).toEqual([]);
    expect(view.taunt).toMatch(/Quiet day/);
  });

  test("streak counts consecutive days ending on yesterday", () => {
    const view = computeStandings(
      CHALLENGE,
      feed([
        {
          accountId: "a",
          name: "Ana",
          avatar: "",
          startedAt: "2026-11-01",
          // 11-01..11-03 done, gap on 11-03? No: 01,02,04,05 — gap at 03,
          // streak from yesterday (04) back is 2 (04, 05 is today not counted).
          days: [
            { date: "2026-11-01", seconds: 120 },
            { date: "2026-11-02", seconds: 120 },
            { date: "2026-11-04", seconds: 120 },
            { date: "2026-11-05", seconds: 120 },
          ],
        },
      ]),
      "me"
    );
    expect(view.members[0].streak).toBe(1);
  });

  test("a full consecutive run counts the whole revealed run", () => {
    const view = computeStandings(
      CHALLENGE,
      feed([
        {
          accountId: "a",
          name: "Ana",
          avatar: "",
          startedAt: "2026-11-01",
          days: [
            { date: "2026-11-01", seconds: 120 },
            { date: "2026-11-02", seconds: 120 },
            { date: "2026-11-03", seconds: 120 },
            { date: "2026-11-04", seconds: 120 },
          ],
        },
      ]),
      "me"
    );
    expect(view.members[0].streak).toBe(4);
  });

  test("flags the current account", () => {
    const view = computeStandings(
      CHALLENGE,
      feed([
        { accountId: "me", name: "Me", avatar: "", startedAt: null, days: [] },
        { accountId: "a", name: "Ana", avatar: "", startedAt: null, days: [] },
      ]),
      "me"
    );
    expect(view.members.find((m) => m.accountId === "me")?.isMe).toBe(true);
    expect(view.members.find((m) => m.accountId === "a")?.isMe).toBe(false);
  });

  test("derives each member's title from their revealed holds", () => {
    const view = computeStandings(
      CHALLENGE,
      feed([
        { accountId: "a", name: "Ana", avatar: "", startedAt: "2026-11-01", days: [{ date: "2026-11-04", seconds: 300 }] },
        { accountId: "b", name: "Bob", avatar: "", startedAt: "2026-11-01", days: [{ date: "2026-11-04", seconds: 120 }] },
        { accountId: "c", name: "Cleo", avatar: "", startedAt: "2026-11-01", days: [] },
      ]),
      "me"
    );
    expect(view.members.find((m) => m.accountId === "a")?.title).toMatchObject({ id: "endurance" });
    expect(view.members.find((m) => m.accountId === "b")?.title).toMatchObject({ id: "steady" });
    expect(view.members.find((m) => m.accountId === "c")?.title).toBeNull();
  });
});

describe("podiumTaunt", () => {
  const member = (name: string, seconds: number, points = 1): SquadMember => ({
    accountId: name,
    name,
    avatar: "🐢",
    color: "#000",
    startedAt: "2026-11-01",
    daysDone: 1,
    totalPoints: points,
    yesterdaySeconds: seconds,
    yesterdayPoints: points,
    streak: 1,
    isMe: false,
    rank: 1,
    title: null,
  });

  test("a lone planker takes the crown", () => {
    expect(podiumTaunt([member("Ana", 120)])).toMatch(/Ana planked alone/);
  });

  test("a big margin is called out", () => {
    expect(podiumTaunt([member("Ana", 300), member("Bob", 200)])).toMatch(/out-planked.*by 100s/);
  });

  test("a close finish lands in the group chat", () => {
    expect(podiumTaunt([member("Ana", 125), member("Bob", 120)])).toMatch(/group chat/);
  });

  test("holds below the base mark earn a different line", () => {
    expect(podiumTaunt([member("Ana", 60, 0)])).toMatch(/nobody reached the base mark/);
  });
});

describe("display helpers", () => {
  test("displayName falls back to Anonymous", () => {
    expect(displayName("")).toBe("Anonymous");
    expect(displayName("   ")).toBe("Anonymous");
    expect(displayName(null)).toBe("Anonymous");
    expect(displayName("Ana")).toBe("Ana");
  });

  test("displayAvatar falls back to the default", () => {
    expect(displayAvatar("")).toBe("🧍");
    expect(displayAvatar(undefined)).toBe("🧍");
    expect(displayAvatar("🐢")).toBe("🐢");
  });

  test("nameColor is stable and within the palette", () => {
    const a = nameColor("fdff4c7c-a4f7-4eb0-9542-de8a23fe9ff7");
    expect(a).toBe(nameColor("fdff4c7c-a4f7-4eb0-9542-de8a23fe9ff7"));
    expect(a).toMatch(/^#[0-9a-f]{6}$/);
    expect(a).not.toBe(nameColor("00000000-0000-4000-8000-000000000000"));
  });

  test("the avatar set holds only single-codepoint emoji", () => {
    for (const a of AVATARS) {
      expect([...a].length).toBe(1);
    }
  });
});
