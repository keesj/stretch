import { makeHlc, maxHlc } from "./hlc";
import { getDeviceId, getToken } from "./identity";
import { appendOps, freezeLegacyIfNeeded, loadJournal, projectWith } from "./journal";
import { replayOps } from "./replay";
import {
  MAX_ITEMS,
  type LegacyBase,
  type Op,
  type EntityKind,
  type OpKind,
  type PlacedItem,
  type Profile,
  type TrophyCaseState,
} from "./types";
import { newUuid } from "../utils/uuid";
import { useSyncStore } from "./useSyncStore";
import { toKey } from "../utils/challenge";
import type { Challenge, PlankChallengeState } from "../types/challenge";
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

/**
 * The effective state of a challenge: the projection plus, for cohort
 * challenges without a start op yet, the start date from their config.
 */
function stateFor(
  state: ReturnType<typeof replayOps>,
  challenge: Challenge
): PlankChallengeState {
  const projected = state.challenges[challenge.syncId] ?? { startedAt: null, days: [] };
  return {
    startedAt: projected.startedAt ?? challenge.startDate ?? null,
    days: projected.days,
  };
}

/** Start a self-start challenge (challenge op). Returns the new state. */
export function recordChallengeStart(
  challenge: Challenge,
  now: Date = new Date()
): PlankChallengeState {
  const syncId = challenge.syncId;
  const state = mutate((_legacy, _journal, lastHlc) => [
    nextOp("challenge", syncId, "create", { startedAt: toKey(now) }, lastHlc),
  ]);
  scheduleSync();
  return stateFor(state, challenge);
}

/**
 * Record a hold for `now`'s date in the given challenge. Self-start
 * challenges without a start date yet get one recorded too (first
 * completion starts the challenge, matching the pre-sync behavior);
 * cohort challenges derive their start date from their config, so no
 * start op is needed. Returns the new challenge state.
 */
export function recordPlankDay(
  challenge: Challenge,
  seconds: number,
  now: Date = new Date()
): PlankChallengeState {
  const syncId = challenge.syncId;
  const date = toKey(now);
  const state = mutate((legacy, journal, lastHlc) => {
    const current = replayOps(legacy, journal);
    let last = lastHlc;
    const newOps: Op[] = [];
    if (!challenge.startDate && !current.challenges[syncId]?.startedAt) {
      const startOp = nextOp("challenge", syncId, "create", { startedAt: date }, last);
      newOps.push(startOp);
      last = startOp.hlc;
    }
    newOps.push(
      nextOp("plankDay", date, "create", { seconds, challengeId: syncId }, last)
    );
    return newOps;
  });
  scheduleSync();
  return stateFor(state, challenge);
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
  if (patch.notificationsEnabled !== undefined) data.notificationsEnabled = patch.notificationsEnabled;
  if (patch.remindEnabled !== undefined) data.remindEnabled = patch.remindEnabled;
  if (patch.remindTime !== undefined) data.remindTime = patch.remindTime;
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
 * Update the display identity (profile patch op, last-write-wins per
 * field). Only the provided fields are written; an empty string clears
 * the field back to the default (anonymous / no avatar). Returns the new
 * profile.
 */
export function recordProfile(patch: Partial<Profile>): Profile {
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name.slice(0, 24);
  if (patch.avatar !== undefined) data.avatar = patch.avatar.slice(0, 8);
  if (Object.keys(data).length === 0) {
    const legacy = freezeLegacyIfNeeded();
    return replayOps(legacy, loadJournal()).profile;
  }
  const state = mutate((_legacy, _journal, lastHlc) => [
    nextOp("profile", "me", "patch", data, lastHlc),
  ]);
  scheduleSync();
  return state.profile;
}

function clampPct(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 50;
}

/**
 * Decorate the trophy chamber (trophyCase op, last-write-wins per field):
 * the background theme and the placed items (free positions, overlap
 * allowed). The UI only ever offers earned trophies and the curated free
 * items; unknown ids are kept but never render. Returns the projected
 * trophy case.
 */
export function recordTrophyCase(patch: Partial<TrophyCaseState>): TrophyCaseState {
  const data: Record<string, unknown> = {};
  if (patch.background !== undefined) data.background = patch.background.slice(0, 24);
  if (patch.items !== undefined) {
    data.items = patch.items.slice(0, MAX_ITEMS).map<PlacedItem>((it) => ({
      item: String(it.item).slice(0, 24),
      x: clampPct(it.x),
      y: clampPct(it.y),
      size: it.size === 2 ? 2 : 1,
    }));
  }
  if (Object.keys(data).length === 0) {
    const legacy = freezeLegacyIfNeeded();
    return replayOps(legacy, loadJournal()).trophyCase;
  }
  const state = mutate((_legacy, _journal, lastHlc) => [
    nextOp("trophyCase", "me", "patch", data, lastHlc),
  ]);
  scheduleSync();
  return state.trophyCase;
}

/**
 * Reset progress: a reset op clears every challenge and the sessions on
 * all devices that sync it (settings, profile, and the trophy case
 * survive). Returns the projected state.
 */
export function resetProgress(): ReturnType<typeof replayOps> {
  const state = mutate((_legacy, _journal, lastHlc) => [
    nextOp("reset", "all", "create", undefined, lastHlc),
  ]);
  scheduleSync();
  return state;
}
