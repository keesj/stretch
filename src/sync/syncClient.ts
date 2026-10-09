import type { InvalidOp, Op } from "./types";
import { getToken, type SyncRole } from "./identity";

export interface PushResult {
  ok: boolean;
  applied: number;
  conflicts: number;
}

export interface PullResult {
  ops: Op[];
  serverTime: number;
}

/** A failed sync call, carrying the HTTP status so callers can react to
 *  specific outcomes (a 401 means the token died server-side). A 400 push
 *  also carries the ids of the ops the server rejected. */
export class SyncError extends Error {
  status: number;
  invalid?: InvalidOp[];

  constructor(status: number, message: string, invalid?: InvalidOp[]) {
    super(message);
    this.status = status;
    this.invalid = invalid;
  }
}

/**
 * Thin fetch client for the sync endpoints. The default base is the
 * current origin: the app and the API are served by the same server.
 * Tests pass an explicit base to hit a real server instance.
 *
 * Authenticated endpoints read the device token from identity
 * (localStorage) and send it as `Authorization: Bearer <token>`
 * (RFC 6750). The account id is never part of routine requests.
 */
async function post<T>(
  path: string,
  body: unknown,
  { baseUrl = "", auth = true }: { baseUrl?: string; auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (!token) throw new Error("This device is not linked to a sync account");
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as {
      error?: string;
      invalid?: InvalidOp[];
    } | null;
    const message =
      res.status === 401
        ? "Token invalid or revoked — sign out and link this device again"
        : detail?.error ?? `sync ${path} failed (${res.status})`;
    throw new SyncError(res.status, message, res.status === 400 ? detail?.invalid : undefined);
  }
  return res.json() as Promise<T>;
}

/** Push the whole local journal. Idempotent — safe to retry blindly. */
export function pushOps(ops: Op[], baseUrl = ""): Promise<PushResult> {
  return post<PushResult>("/api/sync/push", { ops }, { baseUrl });
}

/**
 * Pull the account's full journal (no cursor). A tail cursor (`since`) is
 * supported by the server but deliberately unused: with skewed wall clocks
 * a cursor can skip ops, and the journals are small enough that a full
 * snapshot is simpler and always correct.
 */
export function pullOps(baseUrl = ""): Promise<PullResult> {
  return post<PullResult>("/api/sync/pull", {}, { baseUrl });
}

/**
 * Mint a one-time pairing code (5-minute TTL). Owner-only on the server.
 */
export function mintPairCode(
  label?: string,
  baseUrl = ""
): Promise<{ code: string; expiresAt: number }> {
  return post<{ code: string; expiresAt: number }>("/api/sync/pair", { label }, { baseUrl });
}

/**
 * Redeem a pairing code for this device's own token (and the account id).
 * Anonymous — the code itself is the credential, single-use and time-boxed.
 */
export function redeemPairCode(
  code: string,
  label?: string,
  baseUrl = ""
): Promise<{ token: string; accountId: string; role: SyncRole }> {
  return post<{ token: string; accountId: string; role: SyncRole }>(
    "/api/sync/pair/redeem",
    { code, label },
    { baseUrl, auth: false }
  );
}

/**
 * One-time bootstrap: an account with zero active tokens mints its first
 * device token (the owner) from its account id. Also the recovery path
 * when all device tokens are lost.
 */
export function bootstrap(
  accountId: string,
  label?: string,
  baseUrl = ""
): Promise<{ token: string; role: SyncRole }> {
  return post<{ token: string; role: SyncRole }>(
    "/api/sync/bootstrap",
    { accountId, label },
    { baseUrl, auth: false }
  );
}

/** Rotate this device's token: new token out, current one revoked (role preserved). */
export function reissueToken(baseUrl = ""): Promise<{ token: string; role: SyncRole }> {
  return post<{ token: string; role: SyncRole }>("/api/sync/token/reissue", {}, { baseUrl });
}

/** Revoke every other device's token; this device stays linked. Owner-only. */
export function revokeOtherTokens(baseUrl = ""): Promise<{ ok: boolean; revoked: number }> {
  return post<{ ok: boolean; revoked: number }>("/api/sync/token/revoke-others", {}, { baseUrl });
}

/** Sign out this device: revoke its own token. The journal is unaffected. */
export function revokeSelf(baseUrl = ""): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>("/api/sync/token/revoke-self", {}, { baseUrl });
}
