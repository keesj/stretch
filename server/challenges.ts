import challengesJson from "../src/data/challenges.json" with { type: "json" };

/**
 * The known challenges — derived from the app's own config file
 * (src/data/challenges.json), the single source of truth. The server
 * stays deliberately dumb about challenge *rules* (scoring, milestones);
 * it only rejects challenge ids no app build could have produced, and it
 * must not learn about a new challenge before the app ships with it.
 *
 * Deriving the sets here (instead of mirroring them in api.js/cli.js)
 * means adding a challenge to the JSON is the only change needed.
 */
export interface ChallengeConfig {
  syncId: string;
  /**
   * Cohort start date (YYYY-MM-DD) or null for self-start challenges.
   * A cohort challenge opens for everyone on its shared start date, so
   * the CLI may record that start date *before* it arrives.
   */
  startDate: string | null;
}

function toConfigs(raw: unknown): ChallengeConfig[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("src/data/challenges.json must be a non-empty array");
  }
  return raw.map((entry, i) => {
    const c = entry as Record<string, unknown>;
    if (typeof c?.syncId !== "string" || c.syncId.length === 0) {
      throw new Error(`src/data/challenges.json[${i}] is missing a syncId`);
    }
    const startDate = c.startDate;
    if (startDate !== undefined && startDate !== null && typeof startDate !== "string") {
      throw new Error(`src/data/challenges.json[${i}].startDate must be a string or null`);
    }
    return { syncId: c.syncId, startDate: (startDate as string | null) ?? null };
  });
}

const configs = toConfigs(challengesJson);

/** Every challenge id an op may name (entityId of `challenge` ops, data.challengeId of `plankDay` ops). */
export const CHALLENGE_IDS: ReadonlySet<string> = new Set(configs.map((c) => c.syncId));

/**
 * Cohort challenges (the ones with a configured start date). Only their
 * start op may be dated in the future — the admin CLI pushes the shared
 * start date ahead of time.
 */
export const COHORT_CHALLENGE_IDS: ReadonlySet<string> = new Set(
  configs.filter((c) => c.startDate !== null).map((c) => c.syncId)
);

/** How far ahead a cohort's start date may be pre-announced (60 days). */
export const CHALLENGE_START_AHEAD_MS = 60 * 24 * 3600 * 1000;
