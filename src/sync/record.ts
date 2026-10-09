import { makeHlc, maxHlc } from "./hlc";
import { getDeviceId, getToken } from "./identity";
import { appendOps, freezeLegacyIfNeeded, loadJournal, projectWith } from "./journal";
import { replayOps } from "./replay";
import type { LegacyBase, Op, EntityKind, OpKind } from "./types";
import { newUuid } from "../utils/uuid";
import { useSyncStore } from "./useSyncStore";
import { toKey } from "../utils/challenge";
import type { PlankChallengeState } from "../types/challenge";
import type { CompletedSession, Settings } from "../utils/storage";

/**
 * The only way app state changes: every mutation appends an op to the
 * local journal, rewrites the projection blobs, and schedules a sync.
 * The app's UI keeps reading the projection blobs, so no other part of
 * the app knows a journal exists.
 */

function scheduleSync(): void {
  // No token yet (fresh device): the App-level sync trigger bootstraps
  // and pushes this journal; calling syncNow here would race the boot.
  if (getToken()) void useSyncStore.getState().syncNow();
}

/** Build the next op, chained after the highest hlc already seen. */
function nextOp(
  entity: EntityKind,
  entityId: string,
  kind: OpKind,
  data: Record<string, unknown> | undefined,
  lastHlc: string | null
): Op {
  const hlc = makeHlc(lastHlc, Date.now(), getDeviceId());
  return { id: newUuid(), hlc, device: getDeviceId(), entity, entityId, kind, data };
}

/**
 * One mutation transaction: freeze the legacy base, read the journal,
 * append the given ops (chained after its highest hlc), and project the
 * result into the app-state blobs. Returns the projected state.
 */
function mutate(
  ops: (legacy: LegacyBase, journal: Op[], lastHlc: string | null) => Op[]
): ReturnType<typeof replayOps> {
  const legacy = freezeLegacyIfNeeded();
  const journal = loadJournal();
  const lastHlc = maxHlc(journal.map((op) => op.hlc));
  const newOps = ops(legacy, journal, lastHlc);
  const merged = appendOps(newOps);
  return projectWith(merged, legacy);
}

/** Start the plank challenge (challenge op). Returns the new plank state. */
export function recordChallengeStart(now: Date = new Date()): PlankChallengeState {
  const state = mutate((_legacy, _journal, lastHlc) => [
    nextOp("challenge", "plank", "create", { startedAt: toKey(now) }, lastHlc),
  ]);
  scheduleSync();
  return state.plank;
}

/**
 * Record a plank hold for `now`'s date. If the challenge has no start
 * date yet, one is recorded too (first completion starts the challenge,
 * matching the pre-sync behavior). Returns the new plank state.
 */
export function recordPlankDay(seconds: number, now: Date = new Date()): PlankChallengeState {
  const date = toKey(now);
  const state = mutate((legacy, journal, lastHlc) => {
    const current = replayOps(legacy, journal);
    let last = lastHlc;
    const newOps: Op[] = [];
    if (!current.plank.startedAt) {
      const startOp = nextOp("challenge", "plank", "create", { startedAt: date }, last);
      newOps.push(startOp);
      last = startOp.hlc;
    }
    newOps.push(nextOp("plankDay", date, "create", { seconds }, last));
    return newOps;
  });
  scheduleSync();
  return state.plank;
}

/** Record a completed routine session. Returns the new session list. */
export function recordSession(session: CompletedSession): CompletedSession[] {
  const state = mutate((_legacy, _journal, lastHlc) => [
    nextOp(
      "session",
      session.id,
      "create",
      {
        routineId: session.routineId,
        routineTitle: session.routineTitle,
        duration: session.duration,
        completedAt: session.completedAt,
      },
      lastHlc
    ),
  ]);
  scheduleSync();
  return state.sessions;
}

/** Persist a settings change (settings patch op). Returns the new settings. */
export function patchSettings(patch: Partial<Settings>): Settings {
  const data: Record<string, unknown> = {};
  if (patch.theme !== undefined) data.theme = patch.theme;
  if (patch.soundEnabled !== undefined) data.soundEnabled = patch.soundEnabled;
  if (patch.hapticEnabled !== undefined) data.hapticEnabled = patch.hapticEnabled;
  if (Object.keys(data).length === 0) {
    const legacy = freezeLegacyIfNeeded();
    return replayOps(legacy, loadJournal()).settings;
  }
  const state = mutate((_legacy, _journal, lastHlc) => [
    nextOp("settings", "app", "patch", data, lastHlc),
  ]);
  scheduleSync();
  return state.settings;
}

/**
 * Reset progress: a reset op clears plank and sessions on every device
 * that syncs it (settings survive). Returns the projected state.
 */
export function resetProgress(): { plank: PlankChallengeState; sessions: CompletedSession[] } {
  const state = mutate((_legacy, _journal, lastHlc) => [
    nextOp("reset", "all", "create", undefined, lastHlc),
  ]);
  scheduleSync();
  return { plank: state.plank, sessions: state.sessions };
}
