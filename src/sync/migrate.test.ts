import { describe, test, expect, beforeEach } from "vitest";
import { legacyToOps, migrateLegacyIfNeeded } from "./migrate";
import { freezeLegacyIfNeeded, loadJournal } from "./journal";
import { compareHlc } from "./hlc";
import type { LegacyBase } from "./types";

const LEGACY: LegacyBase = {
  plank: {
    startedAt: "2026-09-01",
    days: [
      { date: "2026-09-01", seconds: 30 },
      { date: "2026-09-02", seconds: 60 },
    ],
  },
  sessions: [
    {
      id: "sess-1",
      routineId: "full",
      routineTitle: "Full Body",
      duration: 600,
      completedAt: "2026-09-03T10:00:00.000Z",
    },
  ],
  settings: { theme: "dark", soundEnabled: true, hapticEnabled: true },
};

function seedLegacy(legacy: LegacyBase): void {
  localStorage.setItem("plankChallenge", JSON.stringify(legacy.plank));
  localStorage.setItem("completedSessions", JSON.stringify(legacy.sessions));
  localStorage.setItem("settings", JSON.stringify(legacy.settings));
}

beforeEach(() => {
  localStorage.clear();
});

describe("migrateLegacyIfNeeded", () => {
  test("does nothing on a device with no pre-sync progress", () => {
    migrateLegacyIfNeeded();
    expect(loadJournal()).toEqual([]);
    expect(localStorage.getItem("stretch.legacyMigrated")).toBe("1");
  });

  test("turns pre-sync progress into journal ops", () => {
    seedLegacy(LEGACY);
    migrateLegacyIfNeeded();

    const ids = loadJournal().map((op) => op.id);
    expect(ids).toContain("legacy-plank-2026-09-01-30");
    expect(ids).toContain("legacy-plank-2026-09-02-60");
    expect(ids).toContain("legacy-challenge-2026-09-01");
    expect(ids).toContain("legacy-session-sess-1");
    expect(ids).toContain("legacy-settings-dark-1-1");

    const journal = loadJournal();
    const plank = journal.find((op) => op.id === "legacy-plank-2026-09-02-60");
    expect(plank).toMatchObject({
      entity: "plankDay",
      entityId: "2026-09-02",
      kind: "create",
      data: { seconds: 60 },
    });
    expect(plank!.hlc).toMatch(/^[0-9a-z]{19}$/);
    const session = journal.find((op) => op.id === "legacy-session-sess-1");
    expect(session).toMatchObject({
      entity: "session",
      entityId: "sess-1",
      data: { routineId: "full", routineTitle: "Full Body", duration: 600 },
    });
  });

  test("stamps ops at the data's own time, in order", () => {
    seedLegacy(LEGACY);
    migrateLegacyIfNeeded();

    const journal = loadJournal();
    const hlcOf = (id: string) => journal.find((op) => op.id === id)!.hlc;
    expect(compareHlc(hlcOf("legacy-plank-2026-09-01-30"), hlcOf("legacy-plank-2026-09-02-60"))).toBe(
      -1
    );
    expect(compareHlc(hlcOf("legacy-plank-2026-09-02-60"), hlcOf("legacy-session-sess-1"))).toBe(
      -1
    );
    // The settings layer is the oldest.
    expect(compareHlc(hlcOf("legacy-settings-dark-1-1"), hlcOf("legacy-plank-2026-09-01-30"))).toBe(
      -1
    );
  });

  test("runs only once (flag) and is duplicate-free if the flag is lost", () => {
    seedLegacy(LEGACY);
    migrateLegacyIfNeeded();
    const first = loadJournal().length;
    expect(first).toBeGreaterThan(0);

    migrateLegacyIfNeeded(); // flag set: no-op
    expect(loadJournal().length).toBe(first);

    localStorage.removeItem("stretch.legacyMigrated"); // flag lost
    migrateLegacyIfNeeded(); // deterministic ids dedupe
    expect(loadJournal().length).toBe(first);
  });

  test("default-only legacy yields no settings op and no ops for an empty base", () => {
    freezeLegacyIfNeeded(); // nothing seeded: empty base
    const ops = legacyToOps(freezeLegacyIfNeeded(), "device-1");
    expect(ops).toEqual([]);
  });
});

describe("legacyToOps", () => {
  test("is deterministic for the same data and device", () => {
    expect(legacyToOps(LEGACY, "device-1")).toEqual(legacyToOps(LEGACY, "device-1"));
  });

  test("keeps the best hold when a day is recorded twice in the legacy blob", () => {
    const legacy: LegacyBase = {
      ...LEGACY,
      plank: {
        startedAt: null,
        days: [
          { date: "2026-09-01", seconds: 30 },
          { date: "2026-09-01", seconds: 45 },
        ],
      },
    };
    const ops = legacyToOps(legacy, "device-1");
    const plankOps = ops.filter((op) => op.entity === "plankDay");
    expect(plankOps).toHaveLength(1);
    expect(plankOps[0].data).toEqual({ seconds: 45 });
  });

  test("skips malformed days and sessions", () => {
    const legacy: LegacyBase = {
      plank: {
        startedAt: "2026-02-30",
        days: [
          { date: "2026-02-30", seconds: 30 },
          { date: "not-a-date", seconds: 30 },
          { date: "2026-09-01", seconds: -5 },
        ],
      },
      sessions: [{ id: "ok", routineId: "r", routineTitle: "t", duration: 10, completedAt: "2026-09-01T08:00:00.000Z" }],
      settings: { theme: "system", soundEnabled: true, hapticEnabled: true },
    };
    const ops = legacyToOps(legacy, "device-1");
    expect(ops.map((op) => op.id)).toEqual(["legacy-session-ok"]);
  });
});
