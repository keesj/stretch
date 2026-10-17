/**
 * Squad display helpers: the curated avatar set, deterministic per-account
 * name colors, and name/avatar fallbacks. The color is derived from the
 * account id, so it needs no storage and is the same on every device.
 */

export const DEFAULT_AVATAR = "🧍";

/** The avatar set people can pick (single-codepoint emoji only). */
export const AVATARS = [
  "💪", "🦾", "🐢", "🦈", "🐘", "🦖", "🐙", "🐸", "🦁", "🐳",
  "🦉", "🐝", "🦀", "🦄", "🐲", "👾", "🤖", "👽", "🥷", "🐯",
] as const;

/** A palette with enough separation to read names at a glance. */
const NAME_COLORS = [
  "#dc2626", // red
  "#ea580c", // orange
  "#ca8a04", // yellow
  "#16a34a", // green
  "#0d9488", // teal
  "#0284c7", // sky
  "#2563eb", // blue
  "#7c3aed", // violet
  "#c026d3", // fuchsia
  "#db2777", // pink
  "#92400e", // brown
  "#475569", // slate
] as const;

/** A stable pseudo-hash so the color never changes for an account. */
function hashAccount(accountId: string): number {
  let h = 0;
  for (let i = 0; i < accountId.length; i++) {
    h = (h * 31 + accountId.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function nameColor(accountId: string): string {
  return NAME_COLORS[hashAccount(accountId) % NAME_COLORS.length];
}

/** The name shown in squad views; empty names read as "Anonymous". */
export function displayName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed : "Anonymous";
}

/** The avatar shown in squad views; unknown/empty ids fall back to the default. */
export function displayAvatar(avatar: string | null | undefined): string {
  const value = (avatar ?? "").trim();
  return value.length > 0 ? value : DEFAULT_AVATAR;
}
