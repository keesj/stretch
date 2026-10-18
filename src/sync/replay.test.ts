import { describe, test, expect } from "vitest";
import { replayOps } from "./replay";
import { DEFAULT_PROFILE, DEFAULT_TROPHY_CASE, type Op, type TrophyCaseState } from "./types";
import type { PlankChallengeState } from "../types/challenge";
import type { CompletedSession, Settings } from "../utils/storage";

const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  soundEnabled: true,
  hapticEnabled: true,
  notificationsEnabled: false,
  remindEnabled: false,
  remindTime: "19:00",
};

function legacy(overrides: {
  plank?: PlankChallengeState;
  sessions?: CompletedSession[];
  settings?: Settings;
  trophyCase?: TrophyCaseState;
} = {}) {
  return {
    plank: { startedAt: null as string | null, days: [] },
    sessions: [],
    settings: { ...DEFAULT_SETTINGS },
    profile: { ...DEFAULT_PROFILE },
    trophyCase: { ...DEFAULT_TROPHY_CASE },
    ...overrides,
  };
}

function op(overrides: Partial<Op>): Op {
  return {
    id: "op",
    hlc: "a000000000000000000",
    device: "dev",
    entity: "plankDay",
    entityId: "2026-10-01",
    kind: "create",
    data: { seconds: 30 },
    ...overrides,
  };
}

function session(id: string, at: string): CompletedSession {
  return { id, routineId: "r1", routineTitle: "T", duration: 60, completedAt: at };
}

/** The session op's data (fields only; the id is the entity id). */
function sessionData(at: string): Record<string, unknown> {
  return { routineId: "r1", routineTitle: "T", duration: 60, completedAt: at };
}

describe("replayOps", () => {
  test("returns the legacy base unchanged for an empty journal", () => {
    const base = legacy({
      plank: { startedAt: "2026-10-01", days: [{ date: "2026-10-01", seconds: 60 }] },
      sessions: [session("s1", "2026-10-01T08:00:00Z")],
      settings: { ...DEFAULT_SETTINGS, theme: "dark" },
    });
    const state = replayOps(base, []);
    // The legacy base lives on as the legacy "plank" challenge.
    expect(Object.keys(state.challenges)).toEqual(["plank"]);
    expect(state.challenges.plank).toEqual(base.plank);
    expect(state.sessions).toEqual(base.sessions);
    expect(state.settings).toEqual(base.settings);
  });

  test("keeps the best hold when a day is recorded twice", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", data: { seconds: 30 } }),
      op({ id: "b", hlc: "b0", data: { seconds: 60 } }),
      op({ id: "c", hlc: "c0", data: { seconds: 45 } }),
    ]);
    expect(state.challenges.plank.days).toEqual([{ date: "2026-10-01", seconds: 60 }]);
  });

  test("plank day ops are order-independent (max merge)", () => {
    const a = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", data: { seconds: 30 } }),
      op({ id: "b", hlc: "b0", data: { seconds: 60 } }),
    ]);
    const b = replayOps(legacy(), [
      op({ id: "b", hlc: "b0", data: { seconds: 60 } }),
      op({ id: "a", hlc: "a0", data: { seconds: 30 } }),
    ]);
    expect(a.challenges.plank.days).toEqual(b.challenges.plank.days);
  });

  test("a challenge op sets the start date; the later one wins", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", entity: "challenge", entityId: "plank", data: { startedAt: "2026-10-01" } }),
      op({ id: "b", hlc: "b0", entity: "challenge", entityId: "plank", data: { startedAt: "2026-10-05" } }),
    ]);
    expect(state.challenges.plank.startedAt).toBe("2026-10-05");
  });

  test("days and start dates of different challenges do not mix", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", data: { seconds: 30 } }),
      op({ id: "b", hlc: "b0", data: { seconds: 90, challengeId: "plank-max" } }),
      op({ id: "c", hlc: "c0", entity: "challenge", entityId: "plank-max", data: { startedAt: "2026-11-01" } }),
      op({ id: "d", hlc: "d0", entity: "challenge", entityId: "plank", data: { startedAt: "2026-10-01" } }),
      // Same date, stronger hold in the other challenge: no cross-upgrade.
      op({ id: "e", hlc: "e0", data: { seconds: 150, challengeId: "plank-max" } }),
    ]);
    expect(state.challenges.plank).toEqual({
      startedAt: "2026-10-01",
      days: [{ date: "2026-10-01", seconds: 30 }],
    });
    expect(state.challenges["plank-max"]).toEqual({
      startedAt: "2026-11-01",
      days: [{ date: "2026-10-01", seconds: 150 }],
    });
  });

  test("ops without (or with an invalid) challengeId belong to the legacy challenge", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", data: { seconds: 30 } }),
      op({ id: "b", hlc: "b0", data: { seconds: 60, challengeId: 42 } }),
    ]);
    expect(Object.keys(state.challenges)).toEqual(["plank"]);
    expect(state.challenges.plank.days).toEqual([{ date: "2026-10-01", seconds: 60 }]);
  });

  test("sessions are deduped by id and sorted by completedAt", () => {
    const state = replayOps(legacy({ sessions: [session("s0", "2026-10-02T08:00:00Z")] }), [
      op({ id: "a", hlc: "a0", entity: "session", entityId: "s2", data: sessionData("2026-10-03T08:00:00Z") }),
      op({ id: "b", hlc: "b0", entity: "session", entityId: "s1", data: sessionData("2026-10-01T08:00:00Z") }),
      // duplicate create of s1 (a retried push)
      op({ id: "c", hlc: "c0", entity: "session", entityId: "s1", data: sessionData("2026-10-01T08:00:00Z") }),
    ]);
    expect(state.sessions.map((s) => s.id)).toEqual(["s1", "s0", "s2"]);
  });

  test("settings patches are last-write-wins per hlc, field by field", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", entity: "settings", entityId: "app", kind: "patch", data: { theme: "dark" } }),
      op({ id: "b", hlc: "b0", entity: "settings", entityId: "app", kind: "patch", data: { soundEnabled: false } }),
      op({ id: "c", hlc: "c0", entity: "settings", entityId: "app", kind: "patch", data: { theme: "light" } }),
    ]);
    expect(state.settings).toEqual({
      theme: "light",
      soundEnabled: false,
      hapticEnabled: true,
      notificationsEnabled: false,
      remindEnabled: false,
      remindTime: "19:00",
    });
  });

  test("a settings patch with the notification fields is applied; malformed times are dropped", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", entity: "settings", entityId: "app", kind: "patch", data: { notificationsEnabled: true, remindEnabled: true, remindTime: "07:30" } }),
      op({ id: "b", hlc: "b0", entity: "settings", entityId: "app", kind: "patch", data: { remindTime: "25:99" } }),
    ]);
    expect(state.settings.notificationsEnabled).toBe(true);
    expect(state.settings.remindEnabled).toBe(true);
    // The malformed time is rejected; the earlier valid one survives.
    expect(state.settings.remindTime).toBe("07:30");
  });

  test("a legacy base frozen by an older build gains the notification defaults", () => {
    const state = replayOps(
      legacy({
        // An older build's frozen base: no notification fields.
        settings: { theme: "dark", soundEnabled: true, hapticEnabled: true } as unknown as Settings,
      }),
      []
    );
    expect(state.settings).toEqual({
      theme: "dark",
      soundEnabled: true,
      hapticEnabled: true,
      notificationsEnabled: false,
      remindEnabled: false,
      remindTime: "19:00",
    });
  });

  test("a reset clears every challenge and the sessions but keeps settings", () => {
    const state = replayOps(
      legacy({
        plank: { startedAt: "2026-10-01", days: [{ date: "2026-10-01", seconds: 60 }] },
        sessions: [session("s1", "2026-10-01T08:00:00Z")],
        settings: { ...DEFAULT_SETTINGS, theme: "dark" },
      }),
      [
        op({ id: "m", hlc: "a0", data: { seconds: 90, challengeId: "plank-max" } }),
        op({ id: "r", hlc: "b0", entity: "reset", entityId: "all", data: undefined }),
        op({ id: "p", hlc: "c0", data: { seconds: 90 } }),
      ]
    );
    expect(state.challenges.plank.startedAt).toBeNull();
    expect(state.challenges.plank.days).toEqual([{ date: "2026-10-01", seconds: 90 }]);
    expect(state.challenges["plank-max"]).toEqual({ startedAt: null, days: [] });
    expect(state.sessions).toEqual([]);
    expect(state.settings.theme).toBe("dark");
  });

  test("profile patches are last-write-wins per field", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", entity: "profile", entityId: "me", kind: "patch", data: { name: "Ana" } }),
      op({ id: "b", hlc: "b0", entity: "profile", entityId: "me", kind: "patch", data: { avatar: "🐢" } }),
      op({ id: "c", hlc: "c0", entity: "profile", entityId: "me", kind: "patch", data: { name: "Anika" } }),
    ]);
    expect(state.profile).toEqual({ name: "Anika", avatar: "🐢" });
  });

  test("an empty string clears a profile field", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", entity: "profile", entityId: "me", kind: "patch", data: { name: "Ana" } }),
      op({ id: "b", hlc: "b0", entity: "profile", entityId: "me", kind: "patch", data: { name: "" } }),
    ]);
    expect(state.profile).toEqual({ name: "", avatar: "" });
  });

  test("ignores malformed profile ops instead of crashing", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", entity: "profile", entityId: "me", kind: "patch", data: { name: 42 } }),
      op({ id: "b", hlc: "b0", entity: "profile", entityId: "me", kind: "patch", data: { avatar: ["🐢"] } }),
      op({ id: "c", hlc: "c0", entity: "profile", entityId: "me", kind: "patch", data: { name: "x".repeat(25) } }),
      op({ id: "d", hlc: "d0", entity: "profile", entityId: "me", kind: "patch", data: { avatar: "y".repeat(9) } }),
    ]);
    expect(state.profile).toEqual({ name: "", avatar: "" });
  });

  test("a reset keeps the profile (identity is not progress)", () => {
    const state = replayOps(
      legacy(),
      [
        op({ id: "a", hlc: "a0", entity: "profile", entityId: "me", kind: "patch", data: { name: "Ana" } }),
        op({ id: "r", hlc: "b0", entity: "reset", entityId: "all", data: undefined }),
      ]
    );
    expect(state.profile).toEqual({ name: "Ana", avatar: "" });
    expect(state.sessions).toEqual([]);
  });

  test("returns the legacy profile for an empty journal", () => {
    const state = replayOps(legacy({}), []);
    expect(state.profile).toEqual({ name: "", avatar: "" });
    expect(state.trophyCase).toEqual({ background: "classic", items: [] });
  });

  test("a legacy-base trophy case (slots) normalizes on replay", () => {
    // A legacy base frozen by a pre-canvas build carries the old shape.
    const base = legacy({
      trophyCase: { background: "sunset", slots: ["gem", "plant"] } as unknown as TrophyCaseState,
    });
    const state = replayOps(base, []);
    expect(state.trophyCase).toEqual({
      background: "sunset",
      items: [
        { item: "gem", x: 12.5, y: 12.5, size: 1 },
        { item: "plant", x: 37.5, y: 12.5, size: 1 },
      ],
    });
  });

  test("trophy case patches are last-write-wins per field", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", entity: "trophyCase", entityId: "me", kind: "patch", data: { background: "midnight" } }),
      op({ id: "b", hlc: "b0", entity: "trophyCase", entityId: "me", kind: "patch", data: { items: [{ item: "first-plank", x: 10, y: 20 }, { item: "on-fire", x: 60, y: 70, size: 2 }] } }),
      op({ id: "c", hlc: "c0", entity: "trophyCase", entityId: "me", kind: "patch", data: { background: "garden", items: [{ item: "on-fire", x: 40, y: 40 }] } }),
    ]);
    expect(state.trophyCase).toEqual({ background: "garden", items: [{ item: "on-fire", x: 40, y: 40, size: 1 }] });
  });

  test("a grown item keeps its size, and size defaults to 1 for older ops", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", entity: "trophyCase", entityId: "me", kind: "patch", data: { items: [{ item: "gem", x: 50, y: 50, size: 2 }] } }),
    ]);
    expect(state.trophyCase.items).toEqual([{ item: "gem", x: 50, y: 50, size: 2 }]);
  });

  test("an out-of-range item size drops the whole items field", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", entity: "trophyCase", entityId: "me", kind: "patch", data: { items: [{ item: "gem", x: 50, y: 50, size: 2 }] } }),
      op({ id: "b", hlc: "b0", entity: "trophyCase", entityId: "me", kind: "patch", data: { items: [{ item: "gem", x: 50, y: 50, size: 3 }] } }),
    ]);
    expect(state.trophyCase.items).toEqual([{ item: "gem", x: 50, y: 50, size: 2 }]);
  });

  test("a legacy compact slots array maps to shelf positions", () => {
    // Pre-free-placement ops carried a plain list of ids (no position).
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", entity: "trophyCase", entityId: "me", kind: "patch", data: { slots: ["first-plank", "gem"] } }),
    ]);
    expect(state.trophyCase.items).toEqual([
      { item: "first-plank", x: 12.5, y: 12.5, size: 1 },
      { item: "gem", x: 37.5, y: 12.5, size: 1 },
    ]);
  });

  test("a legacy grid slots array maps each cell to its center", () => {
    const cells = Array(16).fill(null);
    cells[1] = "gem";
    cells[9] = "plant";
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", entity: "trophyCase", entityId: "me", kind: "patch", data: { slots: cells } }),
    ]);
    expect(state.trophyCase.items).toEqual([
      { item: "gem", x: 37.5, y: 12.5, size: 1 },
      { item: "plant", x: 37.5, y: 62.5, size: 1 },
    ]);
  });

  test("a reset keeps the trophy case (decoration is not progress)", () => {
    const state = replayOps(
      legacy(),
      [
        op({ id: "a", hlc: "a0", entity: "trophyCase", entityId: "me", kind: "patch", data: { background: "sunset" } }),
        op({ id: "r", hlc: "b0", entity: "reset", entityId: "all", data: undefined }),
      ]
    );
    expect(state.trophyCase.background).toBe("sunset");
    expect(state.sessions).toEqual([]);
  });

  test("ignores malformed trophy case ops instead of crashing", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", entity: "trophyCase", entityId: "me", kind: "patch", data: { background: 42 } }),
      op({ id: "b", hlc: "b0", entity: "trophyCase", entityId: "me", kind: "patch", data: { items: "nope" } }),
      op({ id: "c", hlc: "c0", entity: "trophyCase", entityId: "me", kind: "patch", data: { items: [{ item: "gem", x: -1, y: 50 }] } }),
      op({ id: "d", hlc: "d0", entity: "trophyCase", entityId: "me", kind: "patch", data: { items: [{ item: "", x: 5, y: 5 }, ...Array(24).fill({ item: "gem", x: 5, y: 5 })] } }),
      op({ id: "e", hlc: "e0", entity: "trophyCase", entityId: "me", kind: "patch", data: { slots: ["", 2] } }),
    ]);
    expect(state.trophyCase).toEqual({ background: "classic", items: [] });
  });

  test("ignores malformed ops instead of crashing", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", data: { seconds: -5 } }),
      op({ id: "b", hlc: "b0", entityId: "2026-99-99", data: { seconds: 10 } }),
      op({ id: "c", hlc: "c0", entity: "session", entityId: "s", data: { routineId: 42 } }),
      op({ id: "d", hlc: "d0", entity: "settings", entityId: "app", kind: "patch", data: { theme: "neon", nope: 1 } }),
      op({ id: "e", hlc: "e0", entity: "challenge", entityId: "bad id!", data: { startedAt: "2026-10-01" } }),
    ]);
    expect(state.challenges.plank.days).toEqual([]);
    expect(state.sessions).toEqual([]);
    expect(state.settings).toEqual(DEFAULT_SETTINGS);
  });
});
