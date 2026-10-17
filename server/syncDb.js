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
 *   squads(id PK, name UNIQUE) + squad_members(squad_id, account_id)
 *   Named groups of accounts, managed server-side (admin CLI only — there
 *   is no squad op and no client-side mutation). Membership scopes the
 *   social feed; the app only ever reads which squads its account is in.
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
      user_id     TEXT    NOT NULL,
      role        TEXT    NOT NULL DEFAULT 'secondary',
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL,
      redeemed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS squads (
      id   TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS squad_members (
      squad_id   TEXT NOT NULL,
      account_id TEXT NOT NULL,
      PRIMARY KEY (squad_id, account_id)
    );
    CREATE INDEX IF NOT EXISTS idx_squad_members_account ON squad_members (account_id);
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

  // --- squads --------------------------------------------------------

  const createSquad = (name) => {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (trimmed.length < 1 || trimmed.length > 40) {
      throw new Error('squad name must be 1-40 characters');
    }
    const dupe = db.prepare('SELECT id FROM squads WHERE lower(name) = lower(?)').get(trimmed);
    if (dupe) throw new Error(`a squad named "${trimmed}" already exists`);
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO squads (id, name) VALUES (?, ?)').run(id, trimmed);
    return { id, name: trimmed };
  };

  // Resolve a squad reference: its id, or its name (case-insensitive).
  const findSquad = (ref) => {
    if (typeof ref !== 'string' || ref.length === 0) return null;
    return db
      .prepare('SELECT id, name FROM squads WHERE id = ? OR lower(name) = lower(?)')
      .get(ref, ref) ?? null;
  };

  const squadMembers = (squadId) =>
    db
      .prepare('SELECT account_id FROM squad_members WHERE squad_id = ? ORDER BY account_id')
      .all(squadId)
      .map((row) => row.account_id);

  const listSquads = () =>
    db
      .prepare('SELECT id, name FROM squads ORDER BY lower(name)')
      .all()
      .map((row) => ({ id: row.id, name: row.name, members: squadMembers(row.id) }));

  const addSquadMember = (squadId, accountId) => {
    if (!db.prepare('SELECT id FROM squads WHERE id = ?').get(squadId)) {
      throw new Error('no such squad');
    }
    db.prepare('INSERT OR IGNORE INTO squad_members (squad_id, account_id) VALUES (?, ?)').run(
      squadId,
      accountId
    );
    return squadMembers(squadId).length;
  };

  const removeSquadMember = (squadId, accountId) =>
    db
      .prepare('DELETE FROM squad_members WHERE squad_id = ? AND account_id = ?')
      .run(squadId, accountId).changes > 0;

  const deleteSquad = (squadId) => {
    db.prepare('DELETE FROM squad_members WHERE squad_id = ?').run(squadId);
    return db.prepare('DELETE FROM squads WHERE id = ?').run(squadId).changes > 0;
  };

  const squadsForAccount = (accountId) =>
    db
      .prepare(
        'SELECT s.id, s.name FROM squads s ' +
          'JOIN squad_members m ON m.squad_id = s.id ' +
          'WHERE m.account_id = ? ORDER BY lower(s.name)'
      )
      .all(accountId);

  const isSquadMember = (squadId, accountId) =>
    db
      .prepare('SELECT 1 FROM squad_members WHERE squad_id = ? AND account_id = ?')
      .get(squadId, accountId) !== undefined;

  // Social feed for one challenge: per account, the profile (LWW), the
  // challenge start (LWW), and the best hold per day. Dates on/after
  // asOfKey are withheld — the quiet-day rule (the reveal is next day).
  // Read-only derivation for the standings endpoint; the client computes
  // points from the raw seconds. memberIds (a Set of account ids) scopes
  // the feed to one squad's roster when given.
  const socialFeed = (challengeId, asOfKey, memberIds) => {
    const rows = db
      .prepare("SELECT * FROM ops WHERE entity IN ('plankDay','challenge','profile')")
      .all();
    const byUser = new Map();
    const entry = () => ({
      profile: { name: '', avatar: '' },
      profileHlc: '',
      startedAt: null,
      challengeHlc: '',
      days: new Map()
    });
    const dataOf = (row) => (row.data === '{}' ? {} : JSON.parse(row.data));
    for (const row of rows) {
      if (memberIds && !memberIds.has(row.user_id)) continue;
      const e = byUser.get(row.user_id) ?? entry();
      byUser.set(row.user_id, e);
      if (row.entity === 'profile') {
        if (row.hlc > e.profileHlc) {
          e.profileHlc = row.hlc;
          const data = dataOf(row);
          if (typeof data.name === 'string') e.profile.name = data.name;
          if (typeof data.avatar === 'string') e.profile.avatar = data.avatar;
        }
      } else if (row.entity === 'challenge' && row.entity_id === challengeId) {
        if (row.hlc > e.challengeHlc) {
          e.challengeHlc = row.hlc;
          const data = dataOf(row);
          if (typeof data.startedAt === 'string') e.startedAt = data.startedAt;
        }
      } else if (row.entity === 'plankDay' && row.entity_id < asOfKey) {
        const data = dataOf(row);
        // Ops without a challengeId belong to the legacy "plank" challenge
        // (mirrors the client replay routing).
        const owns = data.challengeId === challengeId || (data.challengeId === undefined && challengeId === 'plank');
        if (!owns || !Number.isFinite(data.seconds) || data.seconds <= 0) continue;
        e.days.set(row.entity_id, Math.max(e.days.get(row.entity_id) ?? 0, data.seconds));
      }
    }
    const roster = [];
    for (const [accountId, e] of byUser) {
      const hasPresence =
        e.days.size > 0 || e.startedAt !== null || e.profile.name !== '' || e.profile.avatar !== '';
      if (!hasPresence) continue;
      const days = [...e.days.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, seconds]) => ({ date, seconds }));
      roster.push({ accountId, name: e.profile.name, avatar: e.profile.avatar, startedAt: e.startedAt, days });
    }
    roster.sort((a, b) => a.accountId.localeCompare(b.accountId));
    return roster;
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
    socialFeed,
    createSquad,
    findSquad,
    listSquads,
    squadMembers,
    addSquadMember,
    removeSquadMember,
    deleteSquad,
    squadsForAccount,
    isSquadMember,
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
