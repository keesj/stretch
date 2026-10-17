import type { Challenge, PlankChallengeState } from "../types/challenge";
import { dayNumberForDate, pointsForHold, addDays } from "./challenge";
import type { CompletedSession } from "./storage";
import { formatTime } from "./timer";

/**
 * The trophy chamber's derived data. Trophies are never stored: they are
 * recomputed from the ops' projection (challenge days + sessions) on every
 * render, so a reset or a new device converges to the same shelf of
 * earned trophies. What IS stored (and synced) is the decoration — the
 * background and the shelf layout — in the `trophyCase` projection.
 */

/** Lifetime stats across all challenges and sessions. */
export interface TrophyStats {
  /** Longest single hold (seconds), across all challenges. */
  bestHoldSeconds: number;
  /** Days on which at least one challenge earned points. */
  totalPlankDays: number;
  /** Longest run of consecutive completed days (any challenge). */
  longestStreak: number;
  /** Most point-earning days in a single challenge. */
  bestChallengeDays: number;
  /** Total stretch sessions completed. */
  sessionsCompleted: number;
}

export type TrophyUnit = "days" | "seconds" | "sessions";

/** One lifetime achievement. */
export interface Trophy {
  id: string;
  title: string;
  emoji: string;
  description: string;
  /** The value needed to earn it. */
  target: number;
  unit: TrophyUnit;
  value(stats: TrophyStats): number;
}

export const TROPHIES: Trophy[] = [
  {
    id: "first-plank",
    title: "First Plank",
    emoji: "🐣",
    description: "Complete your first plank day.",
    target: 1,
    unit: "days",
    value: (s) => s.totalPlankDays,
  },
  {
    id: "two-minute-club",
    title: "Two-Minute Club",
    emoji: "⏱️",
    description: "Hold a plank for 2 minutes in one go.",
    target: 120,
    unit: "seconds",
    value: (s) => s.bestHoldSeconds,
  },
  {
    id: "five-minute-wall",
    title: "Five-Minute Wall",
    emoji: "🛡️",
    description: "Hold a plank for 5 minutes in one go.",
    target: 300,
    unit: "seconds",
    value: (s) => s.bestHoldSeconds,
  },
  {
    id: "iron-ten",
    title: "Iron Ten",
    emoji: "⚙️",
    description: "Hold a plank for a full 10 minutes — the scoring cap.",
    target: 600,
    unit: "seconds",
    value: (s) => s.bestHoldSeconds,
  },
  {
    id: "on-fire",
    title: "On Fire",
    emoji: "🔥",
    description: "Complete 7 days of planks in a row.",
    target: 7,
    unit: "days",
    value: (s) => s.longestStreak,
  },
  {
    id: "half-marathon",
    title: "Half Marathon",
    emoji: "📅",
    description: "Complete 15 plank days in total.",
    target: 15,
    unit: "days",
    value: (s) => s.totalPlankDays,
  },
  {
    id: "finisher",
    title: "Finisher",
    emoji: "🏁",
    description: "Complete all 30 days of a single challenge — no misses.",
    target: 30,
    unit: "days",
    value: (s) => s.bestChallengeDays,
  },
  {
    id: "session-one",
    title: "Session One",
    emoji: "🧘",
    description: "Complete your first stretch session.",
    target: 1,
    unit: "sessions",
    value: (s) => s.sessionsCompleted,
  },
  {
    id: "regular",
    title: "Regular",
    emoji: "🎖️",
    description: "Complete 10 stretch sessions.",
    target: 10,
    unit: "sessions",
    value: (s) => s.sessionsCompleted,
  },
];

/** Shelf points earned per completed stretch session. */
export const SESSION_POINTS = 20;

/**
 * Free shelf decorations: small items anyone can place, no achievement
 * required. They are the "creative" half of the chamber — trophies are
 * earned, these are purely taste. Each one has a point cost and the shelf
 * works as a value cap: the total cost of placed items may never exceed
 * the points earned from sessions, so the shelf grows slowly on purpose.
 * The total item cap (MAX_ITEMS in sync/types) is a hard backstop on top.
 * Listed cheapest-first.
 */
export interface FreeItem {
  id: string;
  emoji: string;
  label: string;
  /** Shelf points one copy of this item draws from the value cap. */
  cost: number;
}

export const FREE_ITEMS: FreeItem[] = [
  { id: "note", emoji: "🎵", label: "Music note", cost: 10 },
  { id: "clover", emoji: "🍀", label: "Clover", cost: 10 },
  { id: "plant", emoji: "🌿", label: "Plant", cost: 20 },
  { id: "star", emoji: "⭐", label: "Star", cost: 20 },
  { id: "moon", emoji: "🌙", label: "Moon", cost: 30 },
  { id: "candle", emoji: "🕯️", label: "Candle", cost: 40 },
  { id: "books", emoji: "📚", label: "Books", cost: 60 },
  { id: "vase", emoji: "🏺", label: "Vase", cost: 80 },
  { id: "frame", emoji: "🖼️", label: "Frame", cost: 100 },
  { id: "crystal", emoji: "🔮", label: "Crystal ball", cost: 250 },
  { id: "gem", emoji: "💎", label: "Gem", cost: 500 },
  { id: "ruby", emoji: "💠", label: "Ruby", cost: 1000 },
];

const freeItemById = new Map(FREE_ITEMS.map((f) => [f.id, f]));

/** Shelf points earned so far: one derived, never-stored number. */
export function shelfPoints(stats: TrophyStats): number {
  return stats.sessionsCompleted * SESSION_POINTS;
}

/**
 * Point cost of an item id at a given size: free decorations cost their
 * `cost` (doubled when grown), trophies (and unknown ids) are free —
 * achievements are earned, not bought.
 */
export function costOf(id: string | null | undefined, size: 1 | 2 = 1): number {
  if (!id) return 0;
  return (freeItemById.get(id)?.cost ?? 0) * size;
}

/** Total points the placed items draw from the value cap (size-aware). */
export function shelfCost(items: { item: string; size?: 1 | 2 }[]): number {
  return items.reduce((sum, it) => sum + costOf(it.item, it.size ?? 1), 0);
}

/**
 * Resolve a shelf item's id to display info — works for both earned
 * trophies and free decorations. `kind` drives the render size: trophies
 * are the big pieces on the shelf, decorations the small ones. Unknown
 * ids (from a newer build) resolve to null; the item renders empty and
 * the id is kept in the saved layout.
 */
export function itemFor(
  id: string | null | undefined
): { emoji: string; label: string; kind: "trophy" | "free" } | null {
  if (!id) return null;
  const trophy = TROPHIES.find((t) => t.id === id);
  if (trophy) return { emoji: trophy.emoji, label: trophy.title, kind: "trophy" };
  const free = freeItemById.get(id);
  if (free) return { emoji: free.emoji, label: free.label, kind: "free" };
  return null;
}

export function isEarned(trophy: Trophy, stats: TrophyStats): boolean {
  return trophy.value(stats) >= trophy.target;
}

/** 0..1 progress for the list UI (1 = earned). */
export function trophyProgress(trophy: Trophy, stats: TrophyStats): number {
  if (trophy.target <= 0) return 1;
  return Math.min(trophy.value(stats) / trophy.target, 1);
}

/**
 * Earned titles: a short rank shown next to a name in the squad views and
 * in the chamber header. Like the trophies they are pure derivations of
 * the stats — never stored, so they converge everywhere. The list is in
 * precedence order; the first match wins, and session-based checks are
 * simply never true for squad members (the feed carries no sessions).
 */
export interface Title {
  id: string;
  label: string;
  emoji: string;
  check(stats: TrophyStats): boolean;
}

export const TITLES: Title[] = [
  { id: "finisher", label: "Finisher", emoji: "🏆", check: (s) => s.bestChallengeDays >= 30 },
  { id: "iron", label: "Iron", emoji: "⚙️", check: (s) => s.bestHoldSeconds >= 600 },
  { id: "endurance", label: "Endurance", emoji: "🛡️", check: (s) => s.bestHoldSeconds >= 300 },
  { id: "on-fire", label: "On Fire", emoji: "🔥", check: (s) => s.longestStreak >= 7 },
  { id: "marathoner", label: "Marathoner", emoji: "📅", check: (s) => s.totalPlankDays >= 15 },
  { id: "steady", label: "Steady", emoji: "⏱️", check: (s) => s.bestHoldSeconds >= 120 },
  { id: "novice", label: "Novice", emoji: "🐣", check: (s) => s.totalPlankDays >= 1 },
];

/** The account's current title (its highest earned), or null. */
export function titleFor(stats: TrophyStats): Title | null {
  return TITLES.find((t) => t.check(stats)) ?? null;
}

/** A short "value / target" line for the trophy list. */
export function trophyProgressLabel(trophy: Trophy, stats: TrophyStats): string {
  const value = trophy.value(stats);
  if (trophy.unit === "seconds") {
    return `${formatTime(Math.min(value, trophy.target))} / ${formatTime(trophy.target)}`;
  }
  const noun = trophy.unit === "sessions" ? "sessions" : "days";
  return `${Math.min(value, trophy.target)} / ${trophy.target} ${noun}`;
}

/** Fold every challenge's days + the sessions into lifetime stats. */
export function computeTrophyStats(
  all: { challenge: Challenge; state: PlankChallengeState }[],
  sessions: CompletedSession[]
): TrophyStats {
  let bestHoldSeconds = 0;
  let bestChallengeDays = 0;
  const completedDates = new Set<string>();
  for (const { challenge, state } of all) {
    let completedInThisChallenge = 0;
    for (const day of state.days) {
      if (day.seconds > bestHoldSeconds) bestHoldSeconds = day.seconds;
      const dayNumber = dayNumberForDate(challenge, state, day.date);
      if (pointsForHold(challenge, day.seconds, dayNumber) > 0) {
        completedDates.add(day.date);
        completedInThisChallenge += 1;
      }
    }
    if (completedInThisChallenge > bestChallengeDays) {
      bestChallengeDays = completedInThisChallenge;
    }
  }
  return {
    bestHoldSeconds,
    totalPlankDays: completedDates.size,
    longestStreak: longestConsecutive(completedDates),
    bestChallengeDays,
    sessionsCompleted: sessions.length,
  };
}

/** Longest run of consecutive dates in the set (0 when empty). */
export function longestConsecutive(dates: Set<string>): number {
  let best = 0;
  for (const date of dates) {
    // Only start counting from a run's first day.
    if (dates.has(addDays(date, -1))) continue;
    let run = 1;
    let cursor = addDays(date, 1);
    while (dates.has(cursor)) {
      run += 1;
      cursor = addDays(cursor, 1);
    }
    if (run > best) best = run;
  }
  return best;
}

/** A chamber background theme (the decoration part of the trophy case). */
export interface TrophyBackground {
  id: string;
  label: string;
  /** Classes for the chamber canvas (light + dark variants). */
  className: string;
  /** Small swatch for the picker. */
  swatchClassName: string;
}

export const TROPHY_BACKGROUNDS: TrophyBackground[] = [
  {
    id: "classic",
    label: "Classic",
    className:
      "bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100 dark:from-amber-950/50 dark:via-stone-900 dark:to-amber-950/30",
    swatchClassName: "bg-gradient-to-b from-amber-100 to-amber-300",
  },
  {
    id: "midnight",
    label: "Midnight",
    className:
      "bg-gradient-to-b from-slate-100 via-indigo-100 to-slate-200 dark:from-slate-900 dark:via-indigo-950 dark:to-slate-900",
    swatchClassName: "bg-gradient-to-b from-indigo-300 to-slate-600",
  },
  {
    id: "garden",
    label: "Garden",
    className:
      "bg-gradient-to-b from-emerald-50 via-lime-50 to-emerald-100 dark:from-emerald-950/50 dark:via-green-950 dark:to-emerald-950/30",
    swatchClassName: "bg-gradient-to-b from-emerald-200 to-emerald-500",
  },
  {
    id: "sunset",
    label: "Sunset",
    className:
      "bg-gradient-to-b from-rose-50 via-orange-100 to-pink-100 dark:from-rose-950/50 dark:via-orange-950 dark:to-pink-950/40",
    swatchClassName: "bg-gradient-to-b from-rose-300 to-orange-500",
  },
  {
    id: "ocean",
    label: "Ocean",
    className:
      "bg-gradient-to-b from-sky-50 via-cyan-50 to-blue-100 dark:from-sky-950/50 dark:via-cyan-950 dark:to-blue-950/40",
    swatchClassName: "bg-gradient-to-b from-sky-300 to-blue-600",
  },
];

/** Unknown ids fall back to the first theme (a bad remote op can't blank the room). */
export function backgroundById(id: string): TrophyBackground {
  return TROPHY_BACKGROUNDS.find((b) => b.id === id) ?? TROPHY_BACKGROUNDS[0];
}
