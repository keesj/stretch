import raw from "./challenges.json";
import type { Challenge } from "../types/challenge";

/**
 * The configured challenges, in start order. The app picks the one to
 * show per user (src/utils/challenge.ts: activeChallenge); the admin CLI
 * can move a cohort challenge's start date (server/cli.js `challenge`).
 */
export const challenges: Challenge[] = raw as unknown as Challenge[];
