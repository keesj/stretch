import { compareHlc } from "./hlc";
import { replayOps, type ProjectedState } from "./replay";
import type { LegacyBase, Op } from "./types";
import {
  loadFromStorage,
  DEFAULT_SETTINGS,
  type CompletedSession,
  type Settings,
} from "../utils/storage";
import type { PlankChallengeState } from "../types/challenge";

const JOURNAL_KEY = "stretch.journal";
const REJECTED_KEY = "stretch.rejected";
const LEGACY_KEY = "stretch.legacy";
const MIGRATED_KEY = "stretch.migrated";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage full or unavailable: the journal degrades to memory-only
    // for this session; sync will re-derive it from the server.
  }
}

function readJson<T>(key: string): T | null {
  const raw = safeGet(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isPlausibleOp(v: unknown): v is Op {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const op = v as Partial<Op>;
  return (
    typeof op.id === "string" &&
    typeof op.hlc === "string" &&
    typeof op.device === "string" &&
    typeof op.entity === "string" &&
    typeof op.entityId === "string" &&
    typeof op.kind === "string"
  );
}

/**
 * The legacy base: progress from before the sync build, frozen once. It
 * is the base layer of the replay and is never pushed to the server —
 * it stays on this device forever (a reset op still clears it in the
 * projected state). Returns the live legacy base so callers can use it
 * without a second store read.
 */
export function freezeLegacyIfNeeded(): LegacyBase {
  if (safeGet(MIGRATED_KEY) != null) return readLegacy();
  try {
    if (safeGet(JOURNAL_KEY) == null) {
      const legacy: LegacyBase = {
        plank: readRawPlank(),
        sessions: loadFromStorage<CompletedSession[]>("completedSessions", []),
        settings: loadFromStorage<Settings>("settings", DEFAULT_SETTINGS),
      };
      safeSet(LEGACY_KEY, JSON.stringify(legacy));
      safeSet(MIGRATED_KEY, "1");
      return legacy;
    }
    safeSet(MIGRATED_KEY, "1");
  } catch {
    // storage unavailable: retry on the next call
  }
  return readLegacy();
}

function readRawPlank(): PlankChallengeState {
  const raw = readJson<PlankChallengeState>("plankChallenge");
  const empty: PlankChallengeState = { startedAt: null, days: [] };
  if (!raw || typeof raw !== "object") return empty;
  const startedAt =
    typeof raw.startedAt === "string" && DATE_RE.test(raw.startedAt) ? raw.startedAt : null;
  const days = Array.isArray(raw.days)
    ? raw.days.filter(
        (d): d is { date: string; seconds: number } =>
          !!d &&
          typeof d === "object" &&
          typeof d.date === "string" &&
          DATE_RE.test(d.date) &&
          typeof d.seconds === "number" &&
          d.seconds > 0
      )
    : [];
  return { startedAt, days };
}

export function readLegacy(): LegacyBase {
  const legacy = readJson<LegacyBase>(LEGACY_KEY);
  if (legacy && typeof legacy === "object" && legacy.plank && Array.isArray(legacy.sessions)) {
    return legacy;
  }
  return {
    plank: { startedAt: null, days: [] },
    sessions: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** The device's full known journal (local + absorbed remote ops). */
export function loadJournal(): Op[] {
  freezeLegacyIfNeeded();
  const raw = readJson<Op[]>(JOURNAL_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPlausibleOp).sort((a, b) => compareHlc(a.hlc, b.hlc));
}

/** Add ops to the journal (deduped by id, kept in hlc order). */
export function appendOps(ops: Op[]): Op[] {
  freezeLegacyIfNeeded();
  const journal = loadJournal();
  const seen = new Set(journal.map((op) => op.id));
  const merged = [...journal];
  for (const op of ops) {
    if (!seen.has(op.id)) {
      seen.add(op.id);
      merged.push(op);
    }
  }
  merged.sort((a, b) => compareHlc(a.hlc, b.hlc));
  safeSet(JOURNAL_KEY, JSON.stringify(merged));
  return merged;
}

/**
 * Move server-rejected ops out of the journal into a quarantine list so
 * they stop being re-pushed (and stop showing in the projection). They
 * never reach any other device or the server journal.
 */
export function quarantineOps(ids: string[]): Op[] {
  const drop = new Set(ids);
  const journal = loadJournal().filter((op) => !drop.has(op.id));
  const rejected = readJson<string[]>(REJECTED_KEY);
  const rejectedSet = new Set(Array.isArray(rejected) ? rejected : []);
  for (const id of ids) rejectedSet.add(id);
  safeSet(REJECTED_KEY, JSON.stringify([...rejectedSet]));
  safeSet(JOURNAL_KEY, JSON.stringify(journal));
  return journal;
}

/**
 * Replay legacy + `journal` into the app state and write the projection
 * blobs the rest of the app reads (plankChallenge / completedSessions /
 * settings). Returns the projected state. Callers pass the journal they
 * just built (appendOps' result) so the projection never depends on a
 * second store read.
 */
export function projectWith(journal: Op[], legacy?: LegacyBase): ProjectedState {
  const base = legacy ?? freezeLegacyIfNeeded();
  const state = replayOps(base, journal);
  safeSet("plankChallenge", JSON.stringify(state.plank));
  safeSet("completedSessions", JSON.stringify(state.sessions));
  safeSet("settings", JSON.stringify(state.settings));
  return state;
}

/** Project from the store's current journal (e.g. after a sync pull). */
export function projectNow(): ProjectedState {
  return projectWith(loadJournal());
}
