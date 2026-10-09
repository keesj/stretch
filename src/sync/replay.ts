import { compareHlc } from "./hlc";
import type { Op } from "./types";
import type { PlankChallengeState, ChallengeDay } from "../types/challenge";
import type { CompletedSession, Settings } from "../utils/storage";

/** What replayOps returns: the device's full projected state. */
export interface ProjectedState {
  plank: PlankChallengeState;
  sessions: CompletedSession[];
  settings: Settings;
}

// Shape + range check (the server does the full calendar validation on
// push; this only keeps malformed remote data from polluting the state).
function isDateKey(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [, m, d] = v.split("-").map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

/**
 * Deterministically fold a legacy base plus the journal into the current
 * state. This is the single source of truth for "what the data looks
 * like" — every device replays the same ops and gets the same state,
 * which is what makes sync converge.
 *
 * Semantics:
 * - ops apply in total hlc order
 * - plankDay keeps the BEST hold per day (max seconds), so two devices
 *   that both recorded the same day converge to the stronger hold
 * - challenge and settings are last-write-wins per hlc
 * - sessions are immutable creates, deduped by id
 * - reset clears plank and sessions (settings survive)
 */
export function replayOps(
  legacy: { plank: PlankChallengeState; sessions: CompletedSession[]; settings: Settings },
  ops: Op[]
): ProjectedState {
  const sorted = [...ops].sort((a, b) => compareHlc(a.hlc, b.hlc));

  let plank: PlankChallengeState = {
    startedAt: legacy.plank.startedAt,
    days: [...legacy.plank.days],
  };
  let sessions: CompletedSession[] = [...legacy.sessions];
  const sessionIds = new Set(sessions.map((s) => s.id));
  let settings: Settings = { ...legacy.settings };

  for (const op of sorted) {
    switch (op.entity) {
      case "plankDay": {
        const seconds = Number(op.data?.seconds);
        if (!isDateKey(op.entityId) || !Number.isFinite(seconds) || seconds <= 0) break;
        const existing = plank.days.find((d) => d.date === op.entityId);
        if (existing) {
          existing.seconds = Math.max(existing.seconds, seconds);
        } else {
          plank.days.push({ date: op.entityId, seconds } satisfies ChallengeDay);
        }
        break;
      }
      case "challenge": {
        const startedAt = op.data?.startedAt;
        if (isDateKey(startedAt)) plank.startedAt = startedAt;
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
      case "reset": {
        plank = { startedAt: null, days: [] };
        sessions = [];
        sessionIds.clear();
        break;
      }
    }
  }

  plank.days.sort((a, b) => a.date.localeCompare(b.date));
  sessions.sort((a, b) => a.completedAt.localeCompare(b.completedAt));

  return { plank, sessions, settings };
}
