import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import os from 'os';
import path from 'path';
import { createSyncDb } from './syncDb.js';

const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HLC_RE = /^[0-9a-z]{19}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
const PAIR_CODE_RE = /^[a-f0-9]{16}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ENTITIES = new Set(['plankDay', 'challenge', 'session', 'settings', 'reset']);
const KINDS = new Set(['create', 'patch']);
const MAX_PUSH_OPS = 1000;

// Anti-cheat limits. The app itself only ever records what the timer
// actually ran, so these bounds are generous for honest use and just
// enough to stop fabricated data (inflated holds, future dates, bulk
// backfill) from entering the shared journal.
const PLANK_SECONDS_MAX = 3600; // one hour of plank is already a world record
const SESSION_DURATION_MAX = 4 * 60 * 60; // 4 hours of stretching
// A plank day / session may be recorded up to this long after the fact
// (offline phone, late sync). It may never be recorded before it
// happened (beyond a small clock-skew allowance) or in the future.
const RECORD_RETRO_MS = 48 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 60 * 1000;
const COMPLETED_AT_FUTURE_MS = 5 * 60 * 1000;

// Rate limits (the DoS surface). `unauth` guards the anonymous endpoints
// (brute force), `auth` is keyed per token so one leaked/abused token
// cannot flood the shared journal, `health` is for monitoring.
const DEFAULT_LIMITS = {
  unauth: { windowMs: 60 * 1000, limit: 10 },
  auth: { windowMs: 60 * 60 * 1000, limit: 600 },
  health: { windowMs: 60 * 1000, limit: 60 }
};

// Data lives OUTSIDE the repo tree by default (~/.stretch/data) so a
// `git clean -x -f -d` in the working copy can never touch the journal.
export function defaultDataDir() {
  return process.env.DATA_DIR || path.join(os.homedir(), '.stretch', 'data');
}

export function defaultDataPath() {
  return path.join(defaultDataDir(), 'stretch.sqlite');
}

function badRequest(res, message, extra = {}) {
  res.status(400).json({ error: message, ...extra });
  return true;
}

function unauthorized(res, message) {
  console.warn(`[api] 401 ${res.req?.socket?.remoteAddress ?? '?'} ${res.req?.path ?? ''}: ${message}`);
  res.status(401).json({ error: message });
  return true;
}

function forbidden(res, message) {
  res.status(403).json({ error: message });
  return true;
}

// --- op validation ----------------------------------------------------

const MS_WIDTH = 8;

function hlcMs(hlc) {
  return parseInt(hlc.slice(0, MS_WIDTH), 36) || 0;
}

// Local-midnight ms of a YYYY-MM-DD key, or null when the key is not a
// real calendar date (Feb 30 etc.) or older than the app could exist.
// Existence is checked with a noon round-trip (midnight can skip an hour
// on DST transitions, which would make the date "disappear").
function dateStartMs(key) {
  if (!DATE_RE.test(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || y < 2020) return null;
  const probe = new Date(y, m - 1, d, 12);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function isValidDate(key, nowMs = Date.now()) {
  const start = dateStartMs(key);
  return start !== null && start <= nowMs;
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}

/**
 * Per-entity anti-cheat validation. Returns an error string, or null when
 * the op is plausible. `nowMs` is injectable for tests.
 */
export function validateStretchOp(op, nowMs = Date.now()) {
  if (op.entity === 'plankDay') {
    if (op.kind !== 'create') return 'plankDay ops must be create';
    if (!isValidDate(op.entityId, nowMs)) return 'plankDay date is invalid or in the future';
    if (!isPlainObject(op.data) || !isInt(op.data.seconds, 1, PLANK_SECONDS_MAX)) {
      return `plankDay seconds must be an integer between 1 and ${PLANK_SECONDS_MAX}`;
    }
    const start = dateStartMs(op.entityId);
    // The window is measured from the END of the day (DST shifts it by an
    // hour at most, which the skew allowance absorbs): a hold on day D
    // synced at any point on D+2 is still legitimate.
    const end = start + 86400000;
    if (hlcMs(op.hlc) < start - CLOCK_SKEW_MS) return 'plankDay was recorded before its date';
    if (hlcMs(op.hlc) > end + RECORD_RETRO_MS + CLOCK_SKEW_MS) return 'plankDay was recorded too long after its date';
    return null;
  }

  if (op.entity === 'challenge') {
    if (op.kind !== 'create') return 'challenge ops must be create';
    if (op.entityId !== 'plank') return 'unknown challenge id';
    if (!isPlainObject(op.data) || typeof op.data.startedAt !== 'string') {
      return 'challenge data must carry startedAt';
    }
    if (!isValidDate(op.data.startedAt, nowMs)) return 'challenge start date is invalid or in the future';
    return null;
  }

  if (op.entity === 'session') {
    if (op.kind !== 'create') return 'session ops must be create';
    if (!isPlainObject(op.data)) return 'session data must be an object';
    if (typeof op.data.routineId !== 'string' || op.data.routineId.length === 0 || op.data.routineId.length > 64) {
      return 'session routineId must be a string (1-64)';
    }
    if (typeof op.data.routineTitle !== 'string' || op.data.routineTitle.length === 0 || op.data.routineTitle.length > 120) {
      return 'session routineTitle must be a string (1-120)';
    }
    if (!isInt(op.data.duration, 1, SESSION_DURATION_MAX)) {
      return `session duration must be an integer between 1 and ${SESSION_DURATION_MAX}`;
    }
    if (typeof op.data.completedAt !== 'string' || Number.isNaN(Date.parse(op.data.completedAt))) {
      return 'session completedAt must be an ISO date-time';
    }
    const completed = Date.parse(op.data.completedAt);
    if (completed > nowMs + COMPLETED_AT_FUTURE_MS) return 'session completedAt is in the future';
    if (completed < nowMs - RECORD_RETRO_MS) return 'session completedAt is too long ago';
    return null;
  }

  if (op.entity === 'settings') {
    if (op.kind !== 'patch') return 'settings ops must be patch';
    if (op.entityId !== 'app') return 'unknown settings id';
    if (!isPlainObject(op.data) || Object.keys(op.data).length === 0) return 'settings data must be a non-empty object';
    for (const [key, value] of Object.entries(op.data)) {
      if (key === 'theme') {
        if (value !== 'light' && value !== 'dark' && value !== 'system') return 'settings theme is invalid';
      } else if (key === 'soundEnabled' || key === 'hapticEnabled') {
        if (typeof value !== 'boolean') return `settings ${key} must be a boolean`;
      } else {
        return `unknown settings field: ${key}`;
      }
    }
    return null;
  }

  if (op.entity === 'reset') {
    if (op.kind !== 'create') return 'reset ops must be create';
    if (op.entityId !== 'all') return 'unknown reset id';
    if (op.data !== undefined && !isPlainObject(op.data)) return 'reset data must be an object';
    return null;
  }

  return `unknown entity: ${op.entity}`;
}

function validOp(op) {
  return (
    op &&
    typeof op.id === 'string' && op.id.length <= 64 &&
    typeof op.hlc === 'string' && HLC_RE.test(op.hlc) &&
    typeof op.device === 'string' && op.device.length <= 64 &&
    ENTITIES.has(op.entity) &&
    typeof op.entityId === 'string' && op.entityId.length <= 64 &&
    KINDS.has(op.kind) &&
    (op.data === undefined ||
      (typeof op.data === 'object' && op.data !== null && !Array.isArray(op.data)))
  );
}

function bearerToken(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '');
  return match ? match[1].trim() : null;
}

// LAST entry of X-Forwarded-For, else the direct socket address. The first
// entry is client-controlled (spoofable) and must never be trusted; the
// haproxy TLS front appends the real client address at the end, so the
// last entry is the one it vouches for. Read explicitly rather than via
// req.ip so the keying behaves identically when this app is mounted under
// the vite dev server (no proxy, direct socket) and under production
// haproxy.
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const list = (Array.isArray(fwd) ? fwd : String(fwd ?? '').split(','))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return list[list.length - 1] || req.socket.remoteAddress || 'unknown';
}

function buildLimiter({ windowMs, limit }, keyGenerator, what) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator,
    handler: (req, res) => {
      console.warn(`[api] 429 ${clientIp(req)} ${req.path}: ${what} limit hit`);
      res.status(429).json({ error: 'too many requests' });
    }
  });
}

/**
 * The sync API as a standalone express app, mounted at /api by whoever
 * serves the app: the production server (server.js) and the vite dev
 * server. A full app (not a bare Router) so the res.json/res.status
 * extensions work under a plain connect stack too.
 *
 * Auth: `Authorization: Bearer <token>` where the token is a revocable
 * device token (RFC 6750 bearer). The account id (UUIDv4) addresses the
 * journal but is never a credential.
 *
 * Tokens carry a role: the bootstrap mint is `owner` (may also link
 * devices, merge accounts, and revoke others); pairing codes mint
 * `secondary` (full device).
 *
 * `rateLimit` is `true`/`undefined` for production defaults, `false` for
 * tests, or a partial `{ unauth, auth, health }` override for tests that
 * exercise the limits themselves.
 *
 * The database lives for the lifetime of the host process.
 * `db` is injectable for tests; by default SQLite opens under DATA_DIR
 * (or ~/.stretch/data).
 */
export function createApiApp(options = {}) {
  const db = options.db ?? createSyncDb(defaultDataPath());
  const api = express();
  const limits = { ...DEFAULT_LIMITS, ...(options.rateLimit === false ? {} : options.rateLimit ?? {}) };
  const limited = options.rateLimit !== false;

  api.set('trust proxy', 1);
  api.use(helmet({ contentSecurityPolicy: false }));
  api.use(express.json({ limit: '1mb' }));

  const unauthLimiter = buildLimiter(limits.unauth, (req) => clientIp(req), 'unauth');
  const authLimiter = buildLimiter(limits.auth, (req) => req.token, 'auth');
  const healthLimiter = buildLimiter(limits.health, (req) => clientIp(req), 'health');

  const requireAuth = (req, res, next) => {
    const token = bearerToken(req);
    if (!token || !TOKEN_RE.test(token)) {
      return unauthorized(res, 'missing or malformed token');
    }
    const account = db.findAccountByToken(token);
    if (!account) return unauthorized(res, 'unknown or revoked token');
    req.userId = account.userId;
    req.token = token;
    req.role = account.role;
    db.touchToken(token);
    next();
  };

  api.get('/health', (req, res, next) => (limited ? healthLimiter(req, res, next) : next()), (_, res) => {
    res.json({ status: 'ok' });
  });

  // Idempotent: re-pushing an op (same id + payload) changes nothing.
  // Anti-cheat: every op must pass validateStretchOp before anything is
  // stored; a batch with any implausible op is rejected whole, and the
  // offending op ids are returned so the client can quarantine them.
  api.post(
    '/sync/push',
    requireAuth,
    (req, res, next) => (limited ? authLimiter(req, res, next) : next()),
    (req, res) => {
      if (!Array.isArray(req.body?.ops)) return badRequest(res, 'ops must be an array');
      const ops = req.body.ops;
      if (ops.length > MAX_PUSH_OPS) return badRequest(res, `too many ops (max ${MAX_PUSH_OPS})`);
      const invalid = [];
      for (const op of ops) {
        if (!validOp(op)) {
          invalid.push({ id: op?.id ?? '?', error: 'malformed op' });
          continue;
        }
        const why = validateStretchOp(op);
        if (why) invalid.push({ id: op.id, error: why });
      }
      if (invalid.length > 0) {
        console.warn(`[sync] rejected ${invalid.length} op(s) for user ${req.userId}: ${JSON.stringify(invalid).slice(0, 300)}`);
        return badRequest(res, `invalid op: ${invalid[0].error}`, { invalid });
      }

      const { applied, conflicts } = db.push(req.userId, ops);
      if (conflicts.length > 0) {
        console.warn(`[sync] ${conflicts.length} op id conflict(s) for user ${req.userId}`);
      }
      res.json({ ok: true, applied, conflicts: conflicts.length });
    }
  );

  // Full snapshot (since omitted) or tail (since = last hlc you know).
  // The client currently always pulls the full snapshot: with skewed
  // wall clocks a tail cursor can skip ops, and journals are small.
  api.post(
    '/sync/pull',
    requireAuth,
    (req, res, next) => (limited ? authLimiter(req, res, next) : next()),
    (req, res) => {
      const { since } = req.body ?? {};
      const cursor = typeof since === 'string' && HLC_RE.test(since) ? since : null;
      res.json({ ops: db.pull(req.userId, cursor), serverTime: Date.now() });
    }
  );

  // Mint a one-time pairing code for linking a new device. Owner-only:
  // only the first device decides who joins the account.
  api.post(
    '/sync/pair',
    requireAuth,
    (req, res, next) => (limited ? authLimiter(req, res, next) : next()),
    (req, res) => {
      if (req.role !== 'owner') return forbidden(res, 'only the account owner can link new devices');
      const { label } = req.body ?? {};
      if (label !== undefined && (typeof label !== 'string' || label.length > 64)) {
        return badRequest(res, 'label must be a string (max 64)');
      }
      res.json(db.mintPairCode(req.userId, 'secondary'));
    }
  );

  // A new device redeems a pairing code for its own token. Anonymous but
  // rate-limited, single-use and 5-minute-TTL; a leaked code is worthless.
  api.post(
    '/sync/pair/redeem',
    (req, res, next) => (limited ? unauthLimiter(req, res, next) : next()),
    (req, res) => {
      const { code, label } = req.body ?? {};
      if (typeof label === 'string' && label.length > 64) return badRequest(res, 'label must be a string (max 64)');
      if (!PAIR_CODE_RE.test(code ?? '')) return badRequest(res, 'invalid code');
      const result = db.redeemPairCode(code, typeof label === 'string' ? label : '');
      if (!result) return badRequest(res, 'invalid or expired code');
      res.json({ token: result.token, accountId: result.userId, role: result.role });
    }
  );

  // One-time bootstrap: an account with zero active tokens can present
  // its account id once to mint the first device token. After that the
  // account id is just an identifier. This is also the recovery path if
  // all device tokens are lost.
  api.post(
    '/sync/bootstrap',
    (req, res, next) => (limited ? unauthLimiter(req, res, next) : next()),
    (req, res) => {
      const { accountId, label } = req.body ?? {};
      if (typeof label === 'string' && label.length > 64) return badRequest(res, 'label must be a string (max 64)');
      if (!USER_ID_RE.test(accountId ?? '')) return badRequest(res, 'accountId must be a UUIDv4');
      if (db.countActiveTokens(accountId) > 0) {
        return res.status(409).json({ error: 'account already has active tokens' });
      }
      // The first token of an account (or of its rebirth) is the owner.
      const token = db.mintToken(accountId, typeof label === 'string' ? label : '', 'owner');
      res.json({ token, role: 'owner' });
    }
  );

  // Rotate this device's token: new token out, current one revoked.
  api.post(
    '/sync/token/reissue',
    requireAuth,
    (req, res, next) => (limited ? authLimiter(req, res, next) : next()),
    (req, res) => {
      const next = db.mintToken(req.userId, 'reissued', req.role);
      db.revokeToken(req.token);
      res.json({ token: next, role: req.role });
    }
  );

  // Revoke every other device; this token stays valid. Owner-only — a
  // lost secondary cannot lock the account out.
  api.post(
    '/sync/token/revoke-others',
    requireAuth,
    (req, res, next) => (limited ? authLimiter(req, res, next) : next()),
    (req, res) => {
      if (req.role !== 'owner') return forbidden(res, 'only the account owner can revoke other devices');
      const revoked = db.revokeOtherTokens(req.userId, req.token);
      res.json({ ok: true, revoked });
    }
  );

  // Sign out this device: revoke its own token. The journal is unaffected
  // (ops belong to the account, not to the token).
  api.post(
    '/sync/token/revoke-self',
    requireAuth,
    (req, res, next) => (limited ? authLimiter(req, res, next) : next()),
    (req, res) => {
      db.revokeToken(req.token);
      res.json({ ok: true });
    }
  );

  // Mint a one-time code that lets THIS account's journal be copied into
  // another account. Owner-only. The code names the source; the target
  // redeems it (below), so the merge always flows source -> redeemer.
  api.post(
    '/sync/merge/mint',
    requireAuth,
    (req, res, next) => (limited ? authLimiter(req, res, next) : next()),
    (req, res) => {
      if (req.role !== 'owner') return forbidden(res, 'only the account owner can merge accounts');
      res.json(db.mintMergeCode(req.userId));
    }
  );

  // Copy the source account's journal into this account's. Owner-only on
  // the target: merging foreign data in is a big deal, and only the
  // owner does big deals. Idempotent — re-merging adds nothing.
  api.post(
    '/sync/merge/redeem',
    requireAuth,
    (req, res, next) => (limited ? authLimiter(req, res, next) : next()),
    (req, res) => {
      if (req.role !== 'owner') return forbidden(res, 'only the account owner can merge accounts');
      const { code } = req.body ?? {};
      if (!PAIR_CODE_RE.test(code ?? '')) return badRequest(res, 'invalid code');
      const source = db.redeemMergeCode(code);
      if (!source) return badRequest(res, 'invalid or expired code');
      if (source === req.userId) return badRequest(res, 'that code belongs to this account');
      const copied = db.copyJournal(source, req.userId);
      console.warn(`[sync] account ${source} merged into ${req.userId} (${copied} ops)`);
      res.json({ ok: true, source, copied });
    }
  );

  // Unknown /api paths get a real 404 (and, in production, never the
  // SPA fallback).
  api.use((_, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return { api, db };
}
