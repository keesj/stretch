import { describe, test, expect, beforeEach } from "vitest";
import {
  appendOps,
  freezeLegacyIfNeeded,
  loadJournal,
  projectWith,
  quarantineOps,
  readLegacy,
} from "./journal";
import type { Op } from "./types";
import type { PlankChallengeState } from "../types/challenge";

function op(id: string, hlc: string, overrides: Partial<Op> = {}): Op {
  return {
    id,
    hlc,
    device: "dev",
    entity: "plankDay",
    entityId: "2026-10-01",
    kind: "create",
    data: { seconds: 30 },
    ...overrides,
  };
}

function seedPlank(state: PlankChallengeState): void {
  localStorage.setItem("plankChallenge", JSON.stringify(state));
}

beforeEach(() => {
  localStorage.clear();
});

describe("legacy freeze", () => {
  test("freezes pre-existing progress exactly once", () => {
    seedPlank({ startedAt: "2026-10-01", days: [{ date: "2026-10-01", seconds: 60 }] });
    localStorage.setItem(
      "completedSessions",
      JSON.stringify([{ id: "s1", routineId: "r", routineTitle: "T", duration: 60, completedAt: "2026-10-01T08:00:00Z" }])
    );

    const first = freezeLegacyIfNeeded();
    expect(first.plank.days).toEqual([{ date: "2026-10-01", seconds: 60 }]);
    expect(first.sessions).toHaveLength(1);

    // The blob changes later — the frozen legacy must not follow it.
    seedPlank({ startedAt: null, days: [] });
    const second = freezeLegacyIfNeeded();
    expect(second.plank).toEqual(first.plank);
  });

  test("freezes defaults when there is no pre-existing progress", () => {
    const legacy = freezeLegacyIfNeeded();
    expect(legacy.plank).toEqual({ startedAt: null, days: [] });
    expect(legacy.sessions).toEqual([]);
    expect(legacy.settings).toEqual({ theme: "system", soundEnabled: true, hapticEnabled: true });
    expect(readLegacy()).toEqual(legacy);
  });

  test("drops malformed legacy plank days", () => {
    seedPlank({
      startedAt: "garbage",
      days: [
        { date: "2026-10-01", seconds: 60 },
        { date: "not-a-date", seconds: 10 },
        { date: "2026-10-02", seconds: -1 },
      ],
    });
    const legacy = freezeLegacyIfNeeded();
    expect(legacy.plank.startedAt).toBeNull();
    expect(legacy.plank.days).toEqual([{ date: "2026-10-01", seconds: 60 }]);
  });
});

describe("journal", () => {
  test("is empty for a fresh device", () => {
    expect(loadJournal()).toEqual([]);
  });

  test("appendOps dedupes by id and keeps hlc order", () => {
    appendOps([op("b", "b0"), op("a", "a0")]);
    const journal = appendOps([op("a", "a0"), op("c", "c0")]);
    expect(journal.map((o) => o.id)).toEqual(["a", "b", "c"]);
    expect(loadJournal().map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  test("quarantineOps moves ops out of the journal into the rejected list", () => {
    appendOps([op("a", "a0"), op("b", "b0"), op("c", "c0")]);
    const journal = quarantineOps(["b"]);
    expect(journal.map((o) => o.id)).toEqual(["a", "c"]);
    // Re-quarantining is idempotent.
    expect(quarantineOps(["b"]).map((o) => o.id)).toEqual(["a", "c"]);
    expect(loadJournal().map((o) => o.id)).toEqual(["a", "c"]);
  });
});

describe("projectWith", () => {
  test("writes the projection blobs the app reads", () => {
    freezeLegacyIfNeeded();
    const journal = appendOps([
      op("a", "a0", { entity: "challenge", entityId: "plank", data: { startedAt: "2026-10-01" } }),
      op("b", "b0", { data: { seconds: 45 } }),
    ]);
    projectWith(journal);

    const plank = JSON.parse(localStorage.getItem("plankChallenge")!);
    expect(plank).toEqual({
      startedAt: "2026-10-01",
      days: [{ date: "2026-10-01", seconds: 45 }],
    });
    expect(localStorage.getItem("completedSessions")).toBe("[]");
    expect(JSON.parse(localStorage.getItem("settings")!)).toEqual({
      theme: "system",
      soundEnabled: true,
      hapticEnabled: true,
    });
  });
});
