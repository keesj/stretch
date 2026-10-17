import raw from "./challenges.json";
import type { Challenge } from "../types/challenge";
import { stretches } from "./stretches";
import { validateChallenges } from "./validate";

/**
 * The configured challenges, in start order. Validated at import time
 * (src/data/validate.ts), including that each exerciseId exists in
 * stretches.json. The app picks the one to show per user
 * (src/utils/challenge.ts: activeChallenge); the admin CLI can move a
 * cohort challenge's start date (server/cli.ts `challenge`).
 *
 * The server derives its challenge allowlists from this same file
 * (server/challenges.ts), so adding a challenge here is the only change
 * needed on both sides.
 */
export const challenges: Challenge[] = validateChallenges(raw, stretches);
