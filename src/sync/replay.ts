import { compareHlc } from "./hlc";
import { LEGACY_PLANK_SYNC_ID, SYNC_ID_RE, DEFAULT_PROFILE, DEFAULT_TROPHY_CASE } from "./types";
import type { Op, PlacedItem, Profile, TrophyCaseState } from "./types";
import type { PlankChallengeState, ChallengeDay } from "../types/challenge";
import type { CompletedSession, Settings } from "../utils/storage";

/** What replayOps returns: the device's full projected state. */
export interface ProjectedState {
  /** Challenge state keyed by the challenge's syncId */
  challenges: Record<string, PlankChallengeState>;
  sessions: CompletedSession[];
  settings: Settings;
  profile: Profile;
  trophyCase: TrophyCaseState;
}

// Shape + range check (the server does the full calendar validation on
// push; this only keeps malformed remote data from polluting the state).
function isDateKey(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [, m, d] = v.split("-").map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

function emptyChallengeState(): PlankChallengeState {
  return { startedAt: null, days: [] };
}

const MAX_ITEMS = 24;

/**
 * Validate + normalize a trophyCase items field (the current free-position
 * shape). Returns null when malformed so the previous value is kept.
 */
function normalizeItems(raw: unknown): PlacedItem[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ITEMS) return null;
  const items: PlacedItem[] = [];
  for (const cell of raw) {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) return null;
    const it = cell as Record<string, unknown>;
    if (typeof it.item !== "string" || it.item.length < 1 || it.item.length > 24) return null;
    if (typeof it.x !== "number" || !Number.isFinite(it.x) || it.x < 0 || it.x > 100) return null;
    if (typeof it.y !== "number" || !Number.isFinite(it.y) || it.y < 0 || it.y > 100) return null;
    // Older ops carry no size: they are normal-sized items.
    const size = it.size === undefined ? 1 : it.size;
    if (size !== 1 && size !== 2) return null;
    items.push({ item: it.item, x: it.x, y: it.y, size });
  }
  return items;
}

/**
 * Legacy shelf shapes, normalized to free positions:
 * - a compact list of ids (no nulls): left-to-right across the shelf;
 * - a 4x4 grid with nulls: each cell maps to its cell-center position.
 */
function legacySlotsToItems(raw: unknown): PlacedItem[] | null {
  if (!Array.isArray(raw) || raw.length > 16) return null;
  const items: PlacedItem[] = [];
  raw.forEach((cell, i) => {
    if (cell === null) return;
    if (typeof cell !== "string" || cell.length < 1 || cell.length > 24) return;
    items.push({
      item: cell,
      x: (((i % 4) + 0.5) / 4) * 100,
      y: ((Math.floor(i / 4) + 0.5) / 4) * 100,
      size: 1,
    });
  });
  return items;
}

/**
 * Normalize a trophyCase *blob* (the projected state read from storage) to
 * the current shape. Blobs written by older builds carry the legacy `slots`
 * field instead of `items`; mapping them here (instead of trusting the raw
 * blob) is what keeps an upgrade from a shelf build from crashing on a
 * missing `items`. Never throws — any garbage falls back to the default.
 */
export function normalizeTrophyCaseState(raw: unknown): TrophyCaseState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { background: DEFAULT_TROPHY_CASE.background, items: [] };
  }
  const r = raw as Record<string, unknown>;
  const background =
    typeof r.background === "string" && r.background.length >= 1 && r.background.length <= 24
      ? r.background
      : DEFAULT_TROPHY_CASE.background;
  if (r.items !== undefined) {
    const items = normalizeItems(r.items);
    if (items) return { background, items };
  }
  if (Array.isArray(r.slots)) {
    const items = legacySlotsToItems(r.slots);
    if (items) return { background, items };
  }
  return { background, items: [] };
}

function challengeOf(
  challenges: Record<string, PlankChallengeState>,
  syncId: string
): PlankChallengeState {
  let state = challenges[syncId];
  if (!state) {
    state = emptyChallengeState();
    challenges[syncId] = state;
  }
  return state;
}

/**
 * Deterministically fold a legacy base plus the journal into the current
 * state. This is the single source of truth for "what the data looks
 * like" — every device replays the same ops and gets the same state,
 * which is what makes sync converge.
 *
 * Semantics:
 * - ops apply in total hlc order
 * - plankDay keeps the BEST hold per day (max seconds) within its
 *   challenge (data.challengeId; ops without one belong to the legacy
 *   "plank"), so two devices that both recorded the same day converge to
 *   the stronger hold
 * - challenge and settings are last-write-wins per hlc (each challenge
 *   op only touches its own challenge)
 * - sessions are immutable creates, deduped by id
 * - profile and trophyCase are last-write-wins per field, like settings
 * - reset clears all challenges and sessions (settings, profile, and the
 *   trophy case survive — they are identity/preferences, not progress)
 */
export function replayOps(
  legacy: {
    plank: PlankChallengeState;
    sessions: CompletedSession[];
    settings: Settings;
    profile: Profile;
    trophyCase: TrophyCaseState;
  },
  ops: Op[]
): ProjectedState {
  const sorted = [...ops].sort((a, b) => compareHlc(a.hlc, b.hlc));

  // The frozen legacy base is the legacy self-start challenge's state.
  const challenges: Record<string, PlankChallengeState> = {
    [LEGACY_PLANK_SYNC_ID]: {
      startedAt: legacy.plank.startedAt,
      days: [...legacy.plank.days],
    },
  };
  let sessions: CompletedSession[] = [...legacy.sessions];
  const sessionIds = new Set(sessions.map((s) => s.id));
  let settings: Settings = { ...legacy.settings };
  let profile: Profile = { ...DEFAULT_PROFILE, ...legacy.profile };
  // A legacy base frozen by an older build may still carry the pre-canvas
  // `slots` shape; normalize it so that decoration survives re-projection.
  let trophyCase: TrophyCaseState = normalizeTrophyCaseState(legacy.trophyCase);

  for (const op of sorted) {
    switch (op.entity) {
      case "plankDay": {
        const seconds = Number(op.data?.seconds);
        const challengeId =
          typeof op.data?.challengeId === "string" && SYNC_ID_RE.test(op.data.challengeId)
            ? op.data.challengeId
            : LEGACY_PLANK_SYNC_ID;
        if (!isDateKey(op.entityId) || !Number.isFinite(seconds) || seconds <= 0) break;
        const plank = challengeOf(challenges, challengeId);
        const existing = plank.days.find((d) => d.date === op.entityId);
        if (existing) {
          existing.seconds = Math.max(existing.seconds, seconds);
        } else {
          plank.days.push({ date: op.entityId, seconds } satisfies ChallengeDay);
        }
        break;
      }
      case "challenge": {
        if (!SYNC_ID_RE.test(op.entityId)) break;
        const startedAt = op.data?.startedAt;
        if (isDateKey(startedAt)) challengeOf(challenges, op.entityId).startedAt = startedAt;
        break;
      }
      case "session": {
        // The session id is the entity id; data carries the fields.
        const id = op.entityId;
        const d = op.data as Partial<CompletedSession> | undefined;
        if (
          !d ||
          typeof d.routineId !== "string" ||
          typeof d.routineTitle !== "string" ||
          typeof d.completedAt !== "string" ||
          typeof d.duration !== "number" ||
          sessionIds.has(id)
        ) {
          break;
        }
        sessions.push({
          id,
          routineId: d.routineId,
          routineTitle: d.routineTitle,
          duration: d.duration,
          completedAt: d.completedAt,
        });
        sessionIds.add(id);
        break;
      }
      case "settings": {
        const d = op.data;
        if (!d || typeof d !== "object" || Array.isArray(d)) break;
        if (d.theme === "light" || d.theme === "dark" || d.theme === "system") {
          settings.theme = d.theme;
        }
        if (typeof d.soundEnabled === "boolean") settings.soundEnabled = d.soundEnabled;
        if (typeof d.hapticEnabled === "boolean") settings.hapticEnabled = d.hapticEnabled;
        break;
      }
      case "profile": {
        // Last-write-wins per field, like settings. (The server enforces
        // the length bounds; this only keeps malformed data out.)
        const d = op.data;
        if (!d || typeof d !== "object" || Array.isArray(d)) break;
        if (typeof d.name === "string" && d.name.length <= 24) profile.name = d.name;
        if (typeof d.avatar === "string" && d.avatar.length <= 8) profile.avatar = d.avatar;
        break;
      }
      case "trophyCase": {
        // Last-write-wins per field. Items are the current free-position
        // shape; ops that only carry the legacy `slots` field normalize
        // to cell-center positions. Unknown item ids are kept in the
        // layout and simply never render — the shelf shows what it knows.
        const d = op.data;
        if (!d || typeof d !== "object" || Array.isArray(d)) break;
        if (typeof d.background === "string" && d.background.length <= 24) {
          trophyCase.background = d.background;
        }
        if (d.items !== undefined) {
          const items = normalizeItems(d.items);
          if (items) trophyCase.items = items;
        } else if (Array.isArray(d.slots)) {
          const items = legacySlotsToItems(d.slots);
          if (items) trophyCase.items = items;
        }
        break;
      }
      case "reset": {
        for (const state of Object.values(challenges)) {
          state.startedAt = null;
          state.days = [];
        }
        sessions = [];
        sessionIds.clear();
        break;
      }
    }
  }

  for (const state of Object.values(challenges)) {
    state.days.sort((a, b) => a.date.localeCompare(b.date));
  }
  sessions.sort((a, b) => a.completedAt.localeCompare(b.completedAt));

  return { challenges, sessions, settings, profile, trophyCase };
}
