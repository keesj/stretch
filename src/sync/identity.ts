import { newUuid, UUID_V4_RE } from "../utils/uuid";

// Single source of truth for the account-id shape (utils/uuid).
export { UUID_V4_RE };

const USER_ID_KEY = "stretch.userId";
const TOKEN_KEY = "stretch.token";
const ROLE_KEY = "stretch.role";
const DEVICE_ID_KEY = "stretch.deviceId";

// 16 hex chars, as minted by the server's pairing flow.
export const PAIR_CODE_RE = /^[a-f0-9]{16}$/i;

/**
 * The token's privilege class: the owner is the first device (links new
 * devices, revokes the others), a secondary is a regular linked device.
 * The server enforces the role; this copy only drives local behavior.
 */
export type SyncRole = "owner" | "secondary";
export const SYNC_ROLES: readonly SyncRole[] = ["owner", "secondary"];

/**
 * The sync account id (UUIDv4). It addresses the journal and doubles as
 * the one-shot bootstrap/recovery credential; routine requests carry a
 * revocable device token instead. Generated once, shared across all of
 * the user's devices, and never sent except to bootstrap.
 */
export function getUserId(): string {
  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing && UUID_V4_RE.test(existing)) return existing;
  // No id yet — or a legacy fallback id from before the secure-context
  // fix (e.g. "1759…-abc123"), which the server rejects. Such an id can
  // never have been linked (bootstrap requires a UUIDv4), so regenerate.
  const id = newUuid();
  localStorage.setItem(USER_ID_KEY, id);
  return id;
}

/**
 * Create a fresh account. The old account's data (and its tokens) stay on
 * the server — nothing is deleted. The next sync bootstraps the new
 * account automatically (it has no tokens yet).
 */
export function regenerateUserId(): string {
  const id = newUuid();
  localStorage.setItem(USER_ID_KEY, id);
  return id;
}

/**
 * Adopt an existing account id (pairing a new device). Returns the adopted
 * id, or null when the input is not a valid UUIDv4.
 */
export function adoptUserId(raw: string): string | null {
  const id = raw.trim();
  if (!UUID_V4_RE.test(id)) return null;
  localStorage.setItem(USER_ID_KEY, id);
  return id;
}

/** This device's own id (not shared): goes into ops and hlc device slots. */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = newUuid();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/** Stable, human-glanceable label for this device. */
export function deviceLabel(): string {
  return `device-${getDeviceId().slice(0, 8)}`;
}

/** This device's revocable sync credential, or null when not linked yet. */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Drop this device's token (e.g. when the account rotates — the next
 *  sync bootstraps a fresh token for the new account). */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getRole(): SyncRole | null {
  const role = localStorage.getItem(ROLE_KEY);
  return (SYNC_ROLES as readonly string[]).includes(role ?? "") ? (role as SyncRole) : null;
}

export function setRole(role: SyncRole): void {
  localStorage.setItem(ROLE_KEY, role);
}

export function clearRole(): void {
  localStorage.removeItem(ROLE_KEY);
}

export function getCredentials(): { accountId: string; token: string | null } {
  return { accountId: getUserId(), token: getToken() };
}
