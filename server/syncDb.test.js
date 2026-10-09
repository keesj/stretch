// @vitest-environment node
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createSyncDb } from './syncDb.js';

function makeOp(overrides = {}) {
  return {
    id: `op-${Math.random().toString(36).slice(2, 10)}`,
    hlc: `a0${Math.floor(Math.random() * 1e10).toString(36).padStart(17, '0')}`,
    device: 'device-a-0000-0000',
    entity: 'plankDay',
    entityId: '2026-10-01',
    kind: 'create',
    data: { seconds: 30 },
    ...overrides
  };
}

let dir;
let db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stretch-sync-'));
  db = createSyncDb(path.join(dir, 'sync.sqlite'));
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('syncDb push', () => {
  test('stores ops and reports how many were applied', () => {
    const ops = [makeOp(), makeOp({ entityId: '2026-10-02' })];
    const result = db.push('user-1', ops);
    expect(result.applied).toBe(2);
    expect(result.conflicts).toEqual([]);
    expect(db.opCount('user-1')).toBe(2);
  });

  test('is idempotent: re-pushing the same ops applies nothing', () => {
    const ops = [makeOp()];
    db.push('user-1', ops);
    const result = db.push('user-1', ops);
    expect(result.applied).toBe(0);
    expect(result.conflicts).toEqual([]);
    expect(db.opCount('user-1')).toBe(1);
  });

  test('flags a same-id payload mismatch as a conflict', () => {
    const op = makeOp();
    db.push('user-1', [op]);
    const result = db.push('user-1', [{ ...op, data: { seconds: 99 } }]);
    expect(result.applied).toBe(0);
    expect(result.conflicts).toEqual([op.id]);
  });

  test('keeps different users isolated', () => {
    db.push('user-1', [makeOp()]);
    db.push('user-2', [makeOp()]);
    expect(db.opCount('user-1')).toBe(1);
    expect(db.opCount('user-2')).toBe(1);
    expect(db.pull('user-1')).toHaveLength(1);
  });
});

describe('syncDb pull', () => {
  test('returns ops in hlc order without a cursor', () => {
    db.push('user-1', [
      makeOp({ hlc: 'c000000000000000000' }),
      makeOp({ hlc: 'a000000000000000000', id: 'early' }),
      makeOp({ hlc: 'b000000000000000000' })
    ]);
    const ops = db.pull('user-1', null);
    expect(ops.map((op) => op.hlc[0])).toEqual(['a', 'b', 'c']);
  });

  test('returns only ops after the cursor with a since hlc', () => {
    db.push('user-1', [
      makeOp({ hlc: 'a000000000000000000' }),
      makeOp({ hlc: 'b000000000000000000' }),
      makeOp({ hlc: 'c000000000000000000' })
    ]);
    const tail = db.pull('user-1', 'b000000000000000000');
    expect(tail.map((op) => op.hlc[0])).toEqual(['c']);
  });

  test('round-trips op payloads, dropping empty data objects', () => {
    const created = makeOp();
    const plain = makeOp({ id: 'plain-1', entity: 'reset', entityId: 'all', data: undefined });
    db.push('user-1', [created, plain]);
    const ops = db.pull('user-1', null);
    expect(ops.find((op) => op.id === created.id).data).toEqual(created.data);
    const reset = ops.find((op) => op.id === 'plain-1');
    expect(reset.data).toBeUndefined();
    expect(reset.kind).toBe('create');
  });
});

describe('syncDb tokens', () => {
  test('mints tokens with a role and resolves them back', () => {
    const token = db.mintToken('user-1', 'first phone', 'owner');
    expect(db.findAccountByToken(token)).toEqual({ userId: 'user-1', role: 'owner' });

    const other = db.mintToken('user-1', 'second phone', 'secondary');
    expect(db.findAccountByToken(other)).toEqual({ userId: 'user-1', role: 'secondary' });
    expect(db.findAccountByToken('unknown')).toBeNull();
  });

  test('rejects an unknown role', () => {
    expect(() => db.mintToken('user-1', '', 'wizard')).toThrow(/unknown token role/);
    expect(() => db.mintPairCode('user-1', 'wizard')).toThrow(/unknown token role/);
  });

  test('a pairing code mints a token of the code\'s role', () => {
    const { code } = db.mintPairCode('user-1', 'secondary');
    const result = db.redeemPairCode(code);
    expect(result.role).toBe('secondary');
    expect(db.findAccountByToken(result.token).role).toBe('secondary');
  });

  test('a pairing code is single-use', () => {
    const { code } = db.mintPairCode('user-1');
    expect(db.redeemPairCode(code)).not.toBeNull();
    expect(db.redeemPairCode(code)).toBeNull();
  });

  test('an expired pairing code cannot be redeemed', () => {
    const short = createSyncDb(path.join(dir, 'short-ttl.sqlite'), { codeTtlMs: -1000 });
    const { code } = short.mintPairCode('user-1');
    expect(short.redeemPairCode(code)).toBeNull();
    short.close();
  });

  test('revoking a token hides it from lookups', () => {
    const token = db.mintToken('user-1', '', 'secondary');
    expect(db.revokeToken(token)).toBe(true);
    expect(db.findAccountByToken(token)).toBeNull();
  });

  test('revokeOtherTokens keeps the caller and revokes the rest', () => {
    const keep = db.mintToken('user-1', 'keeper', 'owner');
    db.mintToken('user-1', 'other-1', 'secondary');
    db.mintToken('user-1', 'other-2', 'secondary');
    db.mintToken('user-2', 'alien', 'secondary');
    expect(db.revokeOtherTokens('user-1', keep)).toBe(2);
    expect(db.findAccountByToken(keep)).not.toBeNull();
  });

  test('countActiveTokens ignores revoked tokens', () => {
    const a = db.mintToken('user-1', '', 'owner');
    db.mintToken('user-1', '', 'secondary');
    expect(db.countActiveTokens('user-1')).toBe(2);
    db.revokeToken(a);
    expect(db.countActiveTokens('user-1')).toBe(1);
    db.revokeToken(db.mintToken('user-1', '', 'secondary'));
  });

  test('listTokens returns all tokens, oldest first, revoked ones included', () => {
    const a = db.mintToken('user-1', 'old phone', 'owner');
    const b = db.mintToken('user-2', 'tablet', 'secondary');
    const c = db.mintToken('user-1', 'new phone', 'secondary');
    db.revokeToken(a);

    const rows = db.listTokens();
    expect(rows.map((r) => r.token)).toEqual([a, b, c]);
    expect(rows[0].revoked_at).not.toBeNull();
    expect(rows[2].revoked_at).toBeNull();
    expect(rows[1].role).toBe('secondary');
    expect(rows[1].label).toBe('tablet');
  });
});

describe('syncDb accountIds', () => {
  test('unions accounts from tokens and ops', () => {
    db.mintToken('user-b', '', 'owner');
    db.push('user-a', [makeOp()]);
    expect(db.accountIds()).toEqual(['user-a', 'user-b']);
  });

  test('is empty on a fresh db', () => {
    expect(db.accountIds()).toEqual([]);
  });
});
