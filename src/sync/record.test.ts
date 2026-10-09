import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  patchSettings,
  recordChallengeStart,
  recordPlankDay,
  recordSession,
  resetProgress,
} from "./record";
import { loadJournal } from "./journal";
import type { CompletedSession, Settings } from "../utils/storage";

function seedPlank(state: unknown): void {
  localStorage.setItem("plankChallenge", JSON.stringify(state));
}

const session: CompletedSession = {
  id: "sess-1",
  routineId: "full-body",
  routineTitle: "Full Body",
  duration: 900,
  completedAt: "2026-01-05T09:00:00.000Z",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recordChallengeStart", () => {
  test("records a challenge op and projects the start date", () => {
    const state = recordChallengeStart(new Date(2026, 0, 5));

    expect(state).toEqual({ startedAt: "2026-01-05", days: [] });
    const journal = loadJournal();
    expect(journal).toHaveLength(1);
    expect(journal[0].entity).toBe("challenge");
    expect(journal[0].entityId).toBe("plank");
    expect(journal[0].data).toEqual({ startedAt: "2026-01-05" });
    expect(JSON.parse(localStorage.getItem("plankChallenge")!)).toEqual(state);
  });
});

describe("recordPlankDay", () => {
  test("starts an unstarted challenge on the first completion", () => {
    const state = recordPlankDay(120, new Date(2026, 0, 5));

    expect(state).toEqual({ startedAt: "2026-01-05", days: [{ date: "2026-01-05", seconds: 120 }] });
    const entities = loadJournal().map((o) => o.entity);
    expect(entities).toEqual(["challenge", "plankDay"]);
  });

  test("adds a day to an existing challenge without a second challenge op", () => {
    seedPlank({ startedAt: "2026-01-01", days: [{ date: "2026-01-01", seconds: 60 }] });
    const state = recordPlankDay(150, new Date(2026, 0, 3));

    expect(state).toEqual({
      startedAt: "2026-01-01",
      days: [
        { date: "2026-01-01", seconds: 60 },
        { date: "2026-01-03", seconds: 150 },
      ],
    });
    expect(loadJournal().map((o) => o.entity)).toEqual(["plankDay"]);
  });

  test("keeps the best hold per day (legacy 60 beats a new 45)", () => {
    seedPlank({ startedAt: "2026-01-01", days: [{ date: "2026-01-01", seconds: 60 }] });
    const state = recordPlankDay(45, new Date(2026, 0, 1));

    expect(state.days).toEqual([{ date: "2026-01-01", seconds: 60 }]);
  });

  test("re-completing a journaled day upgrades to the stronger hold", () => {
    recordPlankDay(60, new Date(2026, 0, 5));
    const state = recordPlankDay(90, new Date(2026, 0, 5));

    expect(state.days).toEqual([{ date: "2026-01-05", seconds: 90 }]);
    // Both ops are kept in the journal; the replay picks the max.
    expect(loadJournal().filter((o) => o.entity === "plankDay")).toHaveLength(2);
  });
});

describe("recordSession", () => {
  test("records a session op and projects the session list", () => {
    const sessions = recordSession(session);

    expect(sessions).toEqual([session]);
    const journal = loadJournal();
    expect(journal).toHaveLength(1);
    expect(journal[0].entity).toBe("session");
    expect(journal[0].entityId).toBe("sess-1");
    expect(JSON.parse(localStorage.getItem("completedSessions")!)).toEqual([session]);
  });

  test("keeps existing sessions (no duplicates on re-record)", () => {
    recordSession(session);
    const sessions = recordSession(session);
    expect(sessions).toEqual([session]);
  });
});

describe("patchSettings", () => {
  test("records a settings patch op and projects the change", () => {
    const settings = patchSettings({ theme: "dark" });

    expect(settings).toEqual({ theme: "dark", soundEnabled: true, hapticEnabled: true });
    const journal = loadJournal();
    expect(journal[0]).toMatchObject({ entity: "settings", entityId: "app", kind: "patch" });
    expect(journal[0].data).toEqual({ theme: "dark" });
  });

  test("ignores unknown fields", () => {
    patchSettings({ theme: "light", admin: true } as Partial<Settings>);
    const data = loadJournal()[0].data as Record<string, unknown>;
    expect(data).toEqual({ theme: "light" });
  });
});

describe("resetProgress", () => {
  test("clears plank and sessions (settings survive)", () => {
    seedPlank({ startedAt: "2026-01-01", days: [{ date: "2026-01-01", seconds: 60 }] });
    localStorage.setItem("completedSessions", JSON.stringify([session]));
    localStorage.setItem(
      "settings",
      JSON.stringify({ theme: "dark", soundEnabled: false, hapticEnabled: true })
    );

    const { plank, sessions } = resetProgress();

    expect(plank).toEqual({ startedAt: null, days: [] });
    expect(sessions).toEqual([]);
    expect(JSON.parse(localStorage.getItem("settings")!).theme).toBe("dark");
    expect(loadJournal().map((o) => o.entity)).toEqual(["reset"]);
  });
});

describe("sync scheduling", () => {
  test("does not call the network while unlinked", () => {
    recordPlankDay(30, new Date(2026, 0, 5));
    expect(fetch).not.toHaveBeenCalled();
  });
});
