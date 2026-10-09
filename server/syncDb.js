import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

/**
 * The server's side of sync: a dumb, idempotent store of op journals per
 * account plus the revocable device tokens that address those journals.
 * It never interprets op payloads beyond the anti-cheat validation in
 * api.js — the client replays them. Storage layout:
 *
 *   ops(user_id, op_id, hlc, device, entity, entity_id, kind, data)
 *   PRIMARY KEY (user_id, op_id)   -> push is idempotent (INSERT OR IGNORE)
 *   INDEX (user_id, hlc)           -> tail pulls
 *
 *   tokens(token PK, user_id, role, label, created_at, last_seen_at, revoked_at)
 *   A request's Authorization: Bearer <token> resolves to user_id; the
 *   account id itself is never a credential.
 *
 *   role is the token's privilege class:
 *     owner     - the first device; may also link new devices and revoke
 *                 the others
 *     secondary - a regular linked device; syncs but cannot link or revoke
 *   Roles are minted, never escalated: bootstrap -> owner, a pairing code
 *   carries the role it was minted with, reissue preserves it.
 *
 *   pair_codes(code PK, user_id, role, created_at, expires_at, redeemed_at)
 *   One-time, short-lived codes that let a new device mint a token.
 *
 * hlc is a fixed-width sortable string, so plain lexicographic comparison
 * gives the same total order as the client's compareHlc.
 */
const ROLES = new Set(['owner', 'secondary']);
export function createSyncDb(dbPath, options = {}) {
  // One-time code TTL; overridable so tests can mint already-expired codes.
  const CODE_TTL_MS = options.codeTtlMs ?? 5 * 60 * 1000;
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS ops (
      op_id     TEXT    NOT NULL,
      user_id   TEXT    NOT NULL,
      hlc       TEXT    NOT NULL,
      device    TEXT    NOT NULL,
      entity    TEXT    NOT NULL,
      entity_id TEXT    NOT NULL,
      kind      TEXT    NOT NULL,
      data      TEXT    NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, op_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ops_user_hlc ON ops (user_id, hlc);
    CREATE TABLE IF NOT EXISTS tokens (
      token        TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      role         TEXT    NOT NULL DEFAULT 'secondary',
      label        TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL,
      last_seen_at INTEGER,
      revoked_at   INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens (user_id);
    CREATE TABLE IF NOT EXISTS pair_codes (
      code        TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      role        TEXT    NOT NULL DEFAULT 'secondary',
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL,
      redeemed_at INTEGER
    );
  `);

  // --- device tokens -------------------------------------------------

  const mintToken = (userId, label = '', role = 'secondary') => {
    if (!ROLES.has(role)) throw new Error(`unknown token role: ${role}`);
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare(
      'INSERT INTO tokens (token, user_id, role, label, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(token, userId, role, label.slice(0, 64), Date.now());
    return token;
  };

  const findAccountByToken = (token) => {
    const row = db
      .prepare('SELECT user_id, role FROM tokens WHERE token = ? AND revoked_at IS NULL')
      .get(token);
    return row ? { userId: row.user_id, role: row.role } : null;
  };

  const touchToken = db.prepare(
    'UPDATE tokens SET last_seen_at = ? WHERE token = ? AND revoked_at IS NULL'
  );

  const revokeToken = (token) =>
    db
      .prepare('UPDATE tokens SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL')
      .run(Date.now(), token).changes > 0;

  const revokeOtherTokens = (userId, keepToken) =>
    db
      .prepare(
        'UPDATE tokens SET revoked_at = ? WHERE user_id = ? AND token != ? AND revoked_at IS NULL'
      )
      .run(Date.now(), userId, keepToken).changes;

  const countActiveTokens = (userId) =>
    db
      .prepare('SELECT COUNT(*) AS n FROM tokens WHERE user_id = ? AND revoked_at IS NULL')
      .get(userId).n;

  // Admin/inspection: every token of every account, in mint order.
  const listTokens = () =>
    db
      .prepare(
        'SELECT token, user_id, role, label, created_at, last_seen_at, revoked_at ' +
          'FROM tokens ORDER BY rowid ASC'
      )
      .all();

  // --- one-time pairing codes ----------------------------------------

  const mintPairCode = (userId, role = 'secondary') => {
    if (!ROLES.has(role)) throw new Error(`unknown token role: ${role}`);
    const code = crypto.randomBytes(8).toString('hex');
    const now = Date.now();
    db.prepare(
      'INSERT INTO pair_codes (code, user_id, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(code, userId, role, now, now + CODE_TTL_MS);
    return { code, expiresAt: now + CODE_TTL_MS };
  };

  // Single-use and time-boxed. Returns the account id, or null when the
  // code is unknown, already used, or expired.
  const redeemPairCode = (code, label = '') => {
    return db.transaction(() => {
      db.prepare('DELETE FROM pair_codes WHERE expires_at < ?').run(Date.now());
      const row = db.prepare('SELECT * FROM pair_codes WHERE code = ?').get(code);
      if (!row || row.redeemed_at !== null || row.expires_at < Date.now()) return null;
      db.prepare('UPDATE pair_codes SET redeemed_at = ? WHERE code = ?').run(Date.now(), code);
      const token = mintToken(row.user_id, label, row.role);
      return { userId: row.user_id, token, role: row.role };
    })();
  };

  const insertOp = db.prepare(`
    INSERT OR IGNORE INTO ops
      (op_id, user_id, hlc, device, entity, entity_id, kind, data, created_at)
    VALUES
      (@op_id, @user_id, @hlc, @device, @entity, @entity_id, @kind, @data, @created_at)
  `);

  const pushMany = db.transaction((userId, ops) => {
    const inserted = [];
    const conflicts = [];
    for (const op of ops) {
      const info = insertOp.run({
        op_id: op.id,
        user_id: userId,
        hlc: op.hlc,
        device: op.device,
        entity: op.entity,
        entity_id: op.entityId,
        kind: op.kind,
        data: JSON.stringify(op.data ?? {}),
        created_at: Date.now()
      });
      if (info.changes === 0) {
        // op_id already stored: same payload is a harmless retry, a
        // different payload is a client bug worth surfacing
        const existing = db
          .prepare('SELECT data FROM ops WHERE user_id = ? AND op_id = ?')
          .get(userId, op.id);
        if (existing && existing.data !== JSON.stringify(op.data ?? {})) {
          conflicts.push(op.id);
        }
      } else {
        inserted.push(op.id);
      }
    }
    return { applied: inserted.length, conflicts };
  });

  const pull = (userId, since) => {
    const rows = since
      ? db
          .prepare('SELECT * FROM ops WHERE user_id = ? AND hlc > ? ORDER BY hlc ASC')
          .all(userId, since)
      : db.prepare('SELECT * FROM ops WHERE user_id = ? ORDER BY hlc ASC').all(userId);
    return rows.map((row) => ({
      id: row.op_id,
      hlc: row.hlc,
      device: row.device,
      entity: row.entity,
      entityId: row.entity_id,
      kind: row.kind,
      data: row.data === '{}' ? undefined : JSON.parse(row.data)
    }));
  };

  // Every account that has a token or any journal data (for the CLI's
  // `accounts` command).
  const accountIds = () =>
    db
      .prepare(
        'SELECT DISTINCT user_id FROM tokens ' +
          'UNION SELECT DISTINCT user_id FROM ops ORDER BY user_id'
      )
      .all()
      .map((row) => row.user_id);

  return {
    push: (userId, ops) => pushMany(userId, ops),
    pull,
    opCount: (userId) =>
      db.prepare('SELECT COUNT(*) AS n FROM ops WHERE user_id = ?').get(userId).n,
    accountIds,
    mintToken,
    findAccountByToken,
    touchToken: (token) => touchToken.run(Date.now(), token),
    revokeToken,
    revokeOtherTokens,
    countActiveTokens,
    listTokens,
    mintPairCode,
    redeemPairCode,
    close: () => db.close()
  };
}
