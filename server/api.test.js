// @vitest-environment node
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from './app.js';

// One account per test that needs one — bootstrapping a second token for
// an already-linked account 409s, so accounts must not be shared.
const USER_ID = '11111111-2222-4333-8444-555555555555';
const PAIR_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const BOOTSTRAP_ID = '99999999-8888-4777-8666-555555555555';
const REVOKE_ID = '55345678-1234-4234-8234-123456789abc';
const ROTATE_ID = '22345678-1234-4234-8234-123456789abc';
const SIGNOUT_ID = '12345678-1234-4234-8234-123456789abc';

// A sortable hlc carrying a specific wall-clock time (the anti-cheat
// windows are checked against the hlc's embedded clock).
function hlcFor(ms, device = 'deva0000') {
  return `${ms.toString(36).padStart(8, '0')}000${device}`;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoKey(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let opSeq = 0;
function makeOp(overrides = {}) {
  opSeq += 1;
  return {
    id: `op-${opSeq}-${Math.random().toString(36).slice(2, 10)}`,
    hlc: hlcFor(Date.now()),
    device: 'device-a-0000-0000',
    entity: 'plankDay',
    entityId: todayKey(),
    kind: 'create',
    data: { seconds: 30 },
    ...overrides
  };
}

let server;
let base;
let db;
let token; // a live owner token for USER_ID

beforeAll(async () => {
  const { createSyncDb } = await import('./syncDb.js');
  db = createSyncDb(':memory:');
  const { app } = createApp({ db, rateLimit: false });
  const httpServer = app.listen(0);
  await new Promise((resolve) => httpServer.once('listening', resolve));
  server = httpServer;
  base = `http://127.0.0.1:${server.address().port}`;

  const res = await fetch(`${base}/api/sync/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId: USER_ID, label: 'test device' })
  });
  token = (await res.json()).token;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

async function post(path, body, authToken = token) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

describe('health', () => {
  test('is reachable', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('token auth', () => {
  test('rejects a request without a token', async () => {
    const { status, body } = await post('/api/sync/push', { ops: [makeOp()] }, null);
    expect(status).toBe(401);
    expect(body.error).toContain('token');
  });

  test('rejects a malformed token', async () => {
    const { status } = await post('/api/sync/push', { ops: [makeOp()] }, 'too-short');
    expect(status).toBe(401);
  });

  test('rejects an unknown token', async () => {
    const { status } = await post('/api/sync/pull', {}, 'A'.repeat(43));
    expect(status).toBe(401);
  });

  test('bootstrap mints an owner token once per account', async () => {
    const { status, body } = await post(
      '/api/sync/bootstrap',
      { accountId: BOOTSTRAP_ID },
      null
    );
    expect(status).toBe(200);
    expect(body.role).toBe('owner');

    const again = await post('/api/sync/bootstrap', { accountId: BOOTSTRAP_ID }, null);
    expect(again.status).toBe(409);
  });

  test('bootstrap rejects a non-UUIDv4 account id', async () => {
    const { status } = await post('/api/sync/bootstrap', { accountId: 'nope' }, null);
    expect(status).toBe(400);
  });

  test('a revoked token (after reissue) is rejected', async () => {
    const boot = await post('/api/sync/bootstrap', { accountId: ROTATE_ID }, null);
    expect(boot.status).toBe(200);
    const old = boot.body.token;

    const reissue = await post('/api/sync/token/reissue', {}, old);
    expect(reissue.status).toBe(200);
    expect(reissue.body.role).toBe('owner');
    expect(reissue.body.token).not.toBe(old);

    const { status } = await post('/api/sync/pull', {}, old);
    expect(status).toBe(401);
    // The rotated token works and keeps the role.
    const pull = await post('/api/sync/pull', {}, reissue.body.token);
    expect(pull.status).toBe(200);
  });
});

describe('/api/sync/push', () => {
  test('stores plausible ops for an authenticated account', async () => {
    const op = makeOp();
    const { status, body } = await post('/api/sync/push', { ops: [op] });
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, applied: 1, conflicts: 0 });
  });

  test('is idempotent for retried ops', async () => {
    const op = makeOp();
    await post('/api/sync/push', { ops: [op] });
    const { body } = await post('/api/sync/push', { ops: [op] });
    expect(body).toEqual({ ok: true, applied: 0, conflicts: 0 });
  });

  test('rejects an op with a future date', async () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const future = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const { status, body } = await post('/api/sync/push', { ops: [makeOp({ entityId: future })] });
    expect(status).toBe(400);
    expect(body.error).toContain('future');
  });

  test('accepts a backdated plank day (legacy migration and CLI record old days)', async () => {
    const { status } = await post(
      '/api/sync/push',
      { ops: [makeOp({ entityId: daysAgoKey(10) })] }
    );
    expect(status).toBe(200);
  });

  test('rejects a plank day recorded before its date', async () => {
    // 26h back is before today's midnight no matter when the test runs.
    const { status, body } = await post(
      '/api/sync/push',
      { ops: [makeOp({ hlc: hlcFor(Date.now() - 26 * 3600 * 1000) })] }
    );
    expect(status).toBe(400);
    expect(body.error).toContain('before its date');
  });

  test('rejects inflated or non-integer plank seconds', async () => {
    for (const seconds of [0, 3601, 2.5, 'thirty', null]) {
      const { status } = await post(
        '/api/sync/push',
        { ops: [makeOp({ data: { seconds } })] }
      );
      expect(status, JSON.stringify(seconds)).toBe(400);
    }
  });

  test('rejects an impossible calendar date', async () => {
    const { status } = await post(
      '/api/sync/push',
      { ops: [makeOp({ entityId: '2026-02-30' })] }
    );
    expect(status).toBe(400);
  });

  test('accepts a challenge start op and rejects a future start', async () => {
    const ok = await post(
      '/api/sync/push',
      { ops: [makeOp({ entity: 'challenge', entityId: 'plank', data: { startedAt: daysAgoKey(1) } })] }
    );
    expect(ok.status).toBe(200);

    const d = new Date();
    d.setDate(d.getDate() + 3);
    const future = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const bad = await post(
      '/api/sync/push',
      { ops: [makeOp({ entity: 'challenge', entityId: 'plank', data: { startedAt: future } })] }
    );
    expect(bad.status).toBe(400);
  });

  test('accepts a session op and rejects implausible ones', async () => {
    const ok = await post(
      '/api/sync/push',
      {
        ops: [
          makeOp({
            entity: 'session',
            entityId: 'sess-1',
            data: { routineId: 'full-body', routineTitle: 'Full Body', duration: 900, completedAt: new Date().toISOString() }
          })
        ]
      }
    );
    expect(ok.status).toBe(200);

    const tooLong = await post(
      '/api/sync/push',
      {
        ops: [
          makeOp({
            entity: 'session',
            entityId: 'sess-2',
            data: { routineId: 'full-body', routineTitle: 'Full Body', duration: 999999, completedAt: new Date().toISOString() }
          })
        ]
      }
    );
    expect(tooLong.status).toBe(400);

    const future = await post(
      '/api/sync/push',
      {
        ops: [
          makeOp({
            entity: 'session',
            entityId: 'sess-3',
            data: { routineId: 'full-body', routineTitle: 'Full Body', duration: 900, completedAt: new Date(Date.now() + 3600 * 1000).toISOString() }
          })
        ]
      }
    );
    expect(future.status).toBe(400);

    // Old sessions are accepted: the legacy migration records them.
    const old = await post(
      '/api/sync/push',
      {
        ops: [
          makeOp({
            entity: 'session',
            entityId: 'sess-4',
            data: { routineId: 'full-body', routineTitle: 'Full Body', duration: 900, completedAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString() }
          })
        ]
      }
    );
    expect(old.status).toBe(200);
  });

  test('settings ops are patches with known fields only', async () => {
    const ok = await post(
      '/api/sync/push',
      { ops: [makeOp({ entity: 'settings', entityId: 'app', kind: 'patch', data: { theme: 'dark', soundEnabled: false } })] }
    );
    expect(ok.status).toBe(200);

    const unknownField = await post(
      '/api/sync/push',
      { ops: [makeOp({ entity: 'settings', entityId: 'app', kind: 'patch', data: { admin: true } })] }
    );
    expect(unknownField.status).toBe(400);

    const badTheme = await post(
      '/api/sync/push',
      { ops: [makeOp({ entity: 'settings', entityId: 'app', kind: 'patch', data: { theme: 'neon' } })] }
    );
    expect(badTheme.status).toBe(400);
  });

  test('rejects malformed ops and unknown entities', async () => {
    const badHlc = await post('/api/sync/push', { ops: [makeOp({ hlc: 'nope' })] });
    expect(badHlc.status).toBe(400);
    expect(badHlc.body.error).toContain('malformed');

    const badEntity = await post('/api/sync/push', { ops: [makeOp({ entity: 'warp' })] });
    expect(badEntity.status).toBe(400);
    expect(badEntity.body.error).toContain('malformed');
  });

  test('rejects a whole batch when one op is implausible', async () => {
    const good = makeOp();
    const bad = makeOp({ data: { seconds: 99999 } });
    const { status, body } = await post('/api/sync/push', { ops: [good, bad] });
    expect(status).toBe(400);
    expect(body.invalid.map((i) => i.id)).toEqual([bad.id]);
    // The valid op in the same batch was not stored.
    const pull = await post('/api/sync/pull', {});
    expect(pull.body.ops.some((o) => o.id === good.id)).toBe(false);
  });
});

describe('/api/sync/pull', () => {
  test('returns the account journal in hlc order', async () => {
    // hlc wall times must stay plausible (anti-cheat window).
    const first = makeOp({ hlc: hlcFor(Date.now() - 1000) });
    const second = makeOp({ hlc: hlcFor(Date.now()) });
    await post('/api/sync/push', { ops: [second, first] });
    const { status, body } = await post('/api/sync/pull', {});
    expect(status).toBe(200);
    expect(typeof body.serverTime).toBe('number');
    const pulled = body.ops.map((o) => o.id);
    expect(pulled.indexOf(first.id)).toBeLessThan(pulled.indexOf(second.id));
  });
});

describe('pairing', () => {
  let secondaryToken;

  test('an owner mints a pairing code; a secondary cannot', async () => {
    const boot = await post('/api/sync/bootstrap', { accountId: PAIR_ID }, null);
    // OTHER_ID's first token is the owner; mint a secondary too.
    const pair1 = await post('/api/sync/pair', {}, boot.body.token);
    expect(pair1.status).toBe(200);
    expect(pair1.body.code).toMatch(/^[a-f0-9]{16}$/);

    // Redeem the code to get a secondary token.
    const redeem = await post(
      '/api/sync/pair/redeem',
      { code: pair1.body.code, label: 'second device' },
      null
    );
    expect(redeem.status).toBe(200);
    expect(redeem.body.role).toBe('secondary');
    expect(redeem.body.accountId).toBe(PAIR_ID);
    secondaryToken = redeem.body.token;

    const forbidden = await post('/api/sync/pair', {}, secondaryToken);
    expect(forbidden.status).toBe(403);
  });

  test('a pairing code is single-use', async () => {
    const pair = await post('/api/sync/pair', {}, token);
    const code = pair.body.code;
    const first = await post('/api/sync/pair/redeem', { code }, null);
    expect(first.status).toBe(200);
    const second = await post('/api/sync/pair/redeem', { code }, null);
    expect(second.status).toBe(400);
  });

  test('redeeming a malformed code is rejected', async () => {
    const { status } = await post('/api/sync/pair/redeem', { code: 'xyz' }, null);
    expect(status).toBe(400);
  });
});

describe('token management', () => {
  test('revoke-others is owner-only', async () => {
    const boot = await post('/api/sync/bootstrap', { accountId: REVOKE_ID }, null);
    const owner = boot.body.token;
    const pair = await post('/api/sync/pair', {}, owner);
    const redeem = await post('/api/sync/pair/redeem', { code: pair.body.code }, null);
    const secondary = redeem.body.token;

    const forbidden = await post('/api/sync/token/revoke-others', {}, secondary);
    expect(forbidden.status).toBe(403);

    const ok = await post('/api/sync/token/revoke-others', {}, owner);
    expect(ok.status).toBe(200);
    expect(ok.body.revoked).toBe(1);
    // The revoked secondary is gone; the owner still works.
    const after = await post('/api/sync/pull', {}, secondary);
    expect(after.status).toBe(401);
  });

  test('revoke-self signs the device out', async () => {
    const boot = await post('/api/sync/bootstrap', { accountId: SIGNOUT_ID }, null);
    expect(boot.status).toBe(200);
    const { status } = await post('/api/sync/token/revoke-self', {}, boot.body.token);
    expect(status).toBe(200);
    const after = await post('/api/sync/pull', {}, boot.body.token);
    expect(after.status).toBe(401);
  });
});

describe('SPA isolation', () => {
  test('unknown /api paths get a JSON 404, not the app shell', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Not found');
  });
});
