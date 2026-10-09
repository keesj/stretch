import { describe, test, expect } from "vitest";
import { replayOps } from "./replay";
import type { Op } from "./types";
import type { PlankChallengeState } from "../types/challenge";
import type { CompletedSession, Settings } from "../utils/storage";

const DEFAULT_SETTINGS: Settings = { theme: "system", soundEnabled: true, hapticEnabled: true };

function legacy(overrides: {
  plank?: PlankChallengeState;
  sessions?: CompletedSession[];
  settings?: Settings;
} = {}) {
  return {
    plank: { startedAt: null as string | null, days: [] },
    sessions: [],
    settings: { ...DEFAULT_SETTINGS },
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
    expect(replayOps(base, [])).toEqual(base);
  });

  test("keeps the best hold when a day is recorded twice", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", data: { seconds: 30 } }),
      op({ id: "b", hlc: "b0", data: { seconds: 60 } }),
      op({ id: "c", hlc: "c0", data: { seconds: 45 } }),
    ]);
    expect(state.plank.days).toEqual([{ date: "2026-10-01", seconds: 60 }]);
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
    expect(a.plank.days).toEqual(b.plank.days);
  });

  test("a challenge op sets the start date; the later one wins", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", entity: "challenge", entityId: "plank", data: { startedAt: "2026-10-01" } }),
      op({ id: "b", hlc: "b0", entity: "challenge", entityId: "plank", data: { startedAt: "2026-10-05" } }),
    ]);
    expect(state.plank.startedAt).toBe("2026-10-05");
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
    expect(state.settings).toEqual({ theme: "light", soundEnabled: false, hapticEnabled: true });
  });

  test("a reset clears plank and sessions but keeps settings", () => {
    const state = replayOps(
      legacy({
        plank: { startedAt: "2026-10-01", days: [{ date: "2026-10-01", seconds: 60 }] },
        sessions: [session("s1", "2026-10-01T08:00:00Z")],
        settings: { ...DEFAULT_SETTINGS, theme: "dark" },
      }),
      [
        op({ id: "r", hlc: "b0", entity: "reset", entityId: "all", data: undefined }),
        op({ id: "p", hlc: "c0", data: { seconds: 90 } }),
      ]
    );
    expect(state.plank.startedAt).toBeNull();
    expect(state.plank.days).toEqual([{ date: "2026-10-01", seconds: 90 }]);
    expect(state.sessions).toEqual([]);
    expect(state.settings.theme).toBe("dark");
  });

  test("ignores malformed ops instead of crashing", () => {
    const state = replayOps(legacy(), [
      op({ id: "a", hlc: "a0", data: { seconds: -5 } }),
      op({ id: "b", hlc: "b0", entityId: "2026-99-99", data: { seconds: 10 } }),
      op({ id: "c", hlc: "c0", entity: "session", entityId: "s", data: { routineId: 42 } }),
      op({ id: "d", hlc: "d0", entity: "settings", entityId: "app", kind: "patch", data: { theme: "neon", nope: 1 } }),
    ]);
    expect(state.plank.days).toEqual([]);
    expect(state.sessions).toEqual([]);
    expect(state.settings).toEqual(DEFAULT_SETTINGS);
  });
});
