import { hlcAt } from "./hlc";
import { getDeviceId } from "./identity";
import { appendOps, freezeLegacyIfNeeded, readLegacy } from "./journal";
import type { LegacyBase, Op } from "./types";
import { DEFAULT_SETTINGS } from "../utils/storage";

const MIGRATED_KEY = "stretch.legacyMigrated";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Local noon of a YYYY-MM-DD key, or null when it is not a real date. */
function localNoonMs(dateKey: string): number | null {
  const [y, m, d] = dateKey.split("-").map(Number);
  const probe = new Date(y, m - 1, d, 12);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return null;
  return probe.getTime();
}

interface PendingOp extends Op {
  timeMs: number;
}

/**
 * Convert a frozen legacy base into journal ops. Ids are deterministic
 * (content-derived) and each op is stamped with the data's own time, so
 * re-running the migration — or two devices migrating their own copies of
 * the same data — converges via the usual dedupe/max/LWW semantics
 * instead of duplicating or conflicting.
 */
export function legacyToOps(legacy: LegacyBase, device: string): Op[] {
  const pending: PendingOp[] = [];

  // Plank days, best hold per date.
  const best = new Map<string, number>();
  for (const day of legacy.plank.days) {
    if (!DATE_RE.test(day.date) || !Number.isFinite(day.seconds) || day.seconds <= 0) continue;
    best.set(day.date, Math.max(best.get(day.date) ?? 0, Math.trunc(day.seconds)));
  }
  for (const [date, seconds] of best) {
    const timeMs = localNoonMs(date);
    if (timeMs == null) continue;
    pending.push({
      id: `legacy-plank-${date}-${seconds}`,
      hlc: "",
      device,
      entity: "plankDay",
      entityId: date,
      kind: "create",
      data: { seconds },
      timeMs,
    });
  }

  if (legacy.plank.startedAt && DATE_RE.test(legacy.plank.startedAt)) {
    const timeMs = localNoonMs(legacy.plank.startedAt);
    if (timeMs != null) {
      pending.push({
        id: `legacy-challenge-${legacy.plank.startedAt}`,
        hlc: "",
        device,
        entity: "challenge",
        entityId: "plank",
        kind: "create",
        data: { startedAt: legacy.plank.startedAt },
        timeMs,
      });
    }
  }

  for (const s of legacy.sessions) {
    if (!s || typeof s.id !== "string" || s.id.length === 0) continue;
    const timeMs = Date.parse(s.completedAt);
    if (Number.isNaN(timeMs)) continue;
    pending.push({
      id: `legacy-session-${s.id}`.slice(0, 64),
      hlc: "",
      device,
      entity: "session",
      entityId: s.id.slice(0, 64),
      kind: "create",
      data: {
        routineId: typeof s.routineId === "string" && s.routineId.length > 0 ? s.routineId : "unknown",
        routineTitle:
          typeof s.routineTitle === "string" && s.routineTitle.length > 0
            ? s.routineTitle.slice(0, 120)
            : "session",
        duration: Number.isFinite(s.duration) && s.duration > 0 ? Math.trunc(s.duration) : 1,
        completedAt: s.completedAt,
      },
      timeMs,
    });
  }

  // Settings that differ from the defaults, as the oldest layer: any
  // settings op recorded after the upgrade has a newer hlc and wins.
  const settingsData: Record<string, string | boolean> = {};
  if (legacy.settings.theme !== DEFAULT_SETTINGS.theme) settingsData.theme = legacy.settings.theme;
  if (legacy.settings.soundEnabled !== DEFAULT_SETTINGS.soundEnabled) {
    settingsData.soundEnabled = legacy.settings.soundEnabled;
  }
  if (legacy.settings.hapticEnabled !== DEFAULT_SETTINGS.hapticEnabled) {
    settingsData.hapticEnabled = legacy.settings.hapticEnabled;
  }
  if (Object.keys(settingsData).length > 0) {
    pending.push({
      id: `legacy-settings-${legacy.settings.theme}-${legacy.settings.soundEnabled ? 1 : 0}-${legacy.settings.hapticEnabled ? 1 : 0}`,
      hlc: "",
      device,
      entity: "settings",
      entityId: "app",
      kind: "patch",
      data: settingsData,
      timeMs: 0, // the settings layer is always the oldest
    });
  }

  // Chronological (id breaks ties); the counter keeps equal ms ordered.
  pending.sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id));
  return pending.map(({ timeMs, ...op }, i) => ({ ...op, hlc: hlcAt(timeMs, device, i) }));
}

/**
 * One-shot migration of pre-sync progress: the legacy base frozen by
 * freezeLegacyIfNeeded becomes real journal ops, so it reaches the server
 * and every other device (and the CLI) like any other record. Runs on the
 * first sync round after the upgrade; the flag plus the deterministic op
 * ids make repeated calls harmless.
 */
export function migrateLegacyIfNeeded(): void {
  try {
    if (localStorage.getItem(MIGRATED_KEY) != null) return;
    freezeLegacyIfNeeded();
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    return;
  }
  const ops = legacyToOps(readLegacy(), getDeviceId());
  if (ops.length > 0) appendOps(ops);
}
