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

function dateKeyFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
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

  test('plankDay ops can target a known challenge, not an unknown one', async () => {
    const ok = await post(
      '/api/sync/push',
      { ops: [makeOp({ data: { seconds: 150, challengeId: 'plank-max' } })] }
    );
    expect(ok.status).toBe(200);

    const bad = await post(
      '/api/sync/push',
      { ops: [makeOp({ data: { seconds: 150, challengeId: 'warp' } })] }
    );
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('challengeId');
  });

  test('a cohort challenge may open in the future, within the bound', async () => {
    const ok = await post(
      '/api/sync/push',
      { ops: [makeOp({ entity: 'challenge', entityId: 'plank-max', data: { startedAt: dateKeyFromNow(5) } })] }
    );
    expect(ok.status).toBe(200);

    // Farther out than the 60-day bound: rejected even for a cohort.
    const tooFar = await post(
      '/api/sync/push',
      { ops: [makeOp({ entity: 'challenge', entityId: 'plank-max', data: { startedAt: dateKeyFromNow(90) } })] }
    );
    expect(tooFar.status).toBe(400);
    expect(tooFar.body.error).toContain('future');
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

describe('error responses', () => {
  test('malformed JSON gets a JSON 400, not the default HTML page', async () => {
    const res = await fetch(`${base}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{not json'
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('malformed JSON');
  });

  test('an oversized body gets a JSON 400', async () => {
    const res = await fetch(`${base}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: `{"ops": [${'"a'.repeat(2 * 1024 * 1024)}]}`
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('request body too large');
  });
});

describe('trophyCase ops', () => {
  const caseOp = (overrides = {}) =>
    makeOp({ entity: 'trophyCase', entityId: 'me', kind: 'patch', ...overrides });

  test('accepts a background + free-position items patch (overlap allowed)', async () => {
    const items = [
      { item: 'first-plank', x: 10, y: 20 },
      { item: 'gem', x: 11, y: 21 } // deliberately overlapping the trophy
    ];
    const { status } = await post('/api/sync/push', {
      ops: [caseOp({ data: { background: 'midnight', items } })]
    });
    expect(status).toBe(200);
  });

  test('accepts an empty items list (clears the shelf)', async () => {
    const { status } = await post('/api/sync/push', { ops: [caseOp({ data: { items: [] } })] });
    expect(status).toBe(200);
  });

  test('accepts the legacy slots shapes (replay normalizes them)', async () => {
    const grid = Array.from({ length: 16 }, (_, i) => (i === 1 ? 'first-plank' : i === 8 ? 'gem' : null));
    const legacyGrid = await post('/api/sync/push', { ops: [caseOp({ data: { slots: grid } })] });
    expect(legacyGrid.status).toBe(200);
    const legacyCompact = await post('/api/sync/push', { ops: [caseOp({ data: { slots: ['first-plank', 'on-fire'] } })] });
    expect(legacyCompact.status).toBe(200);
  });

  test('rejects unknown fields', async () => {
    const { status, body } = await post('/api/sync/push', {
      ops: [caseOp({ data: { background: 'midnight', theme: 'dark' } })]
    });
    expect(status).toBe(400);
    expect(body.error).toContain('unknown trophyCase field');
  });

  test('rejects more than 24 items and out-of-range positions', async () => {
    const twentyFive = Array.from({ length: 25 }, () => ({ item: 'gem', x: 50, y: 50 }));
    const tooMany = await post('/api/sync/push', { ops: [caseOp({ data: { items: twentyFive } })] });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error).toContain('max 24');
    const offShelf = await post('/api/sync/push', { ops: [caseOp({ data: { items: [{ item: 'gem', x: 101, y: 50 }] } })] });
    expect(offShelf.status).toBe(400);
    expect(offShelf.body.error).toContain('0-100');
  });

  test('accepts grown items (size 2) and rejects other sizes', async () => {
    const grown = await post('/api/sync/push', {
      ops: [caseOp({ data: { items: [{ item: 'gem', x: 50, y: 50, size: 2 }] } })]
    });
    expect(grown.status).toBe(200);
    const legacy = await post('/api/sync/push', {
      ops: [caseOp({ data: { items: [{ item: 'gem', x: 50, y: 50 }] } })]
    });
    expect(legacy.status).toBe(200);
    const triple = await post('/api/sync/push', {
      ops: [caseOp({ data: { items: [{ item: 'gem', x: 50, y: 50, size: 3 }] } })]
    });
    expect(triple.status).toBe(400);
    expect(triple.body.error).toContain('size must be 1 or 2');
    const text = await post('/api/sync/push', {
      ops: [caseOp({ data: { items: [{ item: 'gem', x: 50, y: 50, size: '2' }] } })]
    });
    expect(text.status).toBe(400);
  });

  test('rejects malformed items and bad backgrounds', async () => {
    const notAnObject = await post('/api/sync/push', { ops: [caseOp({ data: { items: ['gem'] } })] });
    expect(notAnObject.status).toBe(400);
    const badItem = await post('/api/sync/push', { ops: [caseOp({ data: { items: [{ item: '', x: 50, y: 50 }] } })] });
    expect(badItem.status).toBe(400);
    const badPos = await post('/api/sync/push', { ops: [caseOp({ data: { items: [{ item: 'gem', x: 'half', y: 50 }] } })] });
    expect(badPos.status).toBe(400);
    const badBg = await post('/api/sync/push', { ops: [caseOp({ data: { background: 42 } })] });
    expect(badBg.status).toBe(400);
  });

  test('rejects a create kind and a wrong entity id', async () => {
    const kind = await post('/api/sync/push', { ops: [caseOp({ kind: 'create', data: { background: 'x' } })] });
    expect(kind.status).toBe(400);
    const id = await post('/api/sync/push', { ops: [caseOp({ entityId: 'nope', data: { background: 'x' } })] });
    expect(id.status).toBe(400);
  });
});

describe('/api/social/squads', () => {
  test('rejects a request without a token', async () => {
    const res = await fetch(`${base}/api/social/squads`);
    expect(res.status).toBe(401);
  });

  test('returns only the caller\'s squads', async () => {
    const mine = db.createSquad('Api Squad');
    db.addSquadMember(mine.id, USER_ID);
    const notMine = db.createSquad('Not Mine');
    db.addSquadMember(notMine.id, PAIR_ID);

    const res = await fetch(`${base}/api/social/squads`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status).toBe(200);
    expect((await res.json()).squads).toEqual([{ id: mine.id, name: 'Api Squad' }]);

    // Clean up so the standings suite starts from a quiet server.
    db.removeSquadMember(mine.id, USER_ID);
    db.deleteSquad(mine.id);
    db.deleteSquad(notMine.id);
  });
});

describe('/api/social/standings', () => {
  const SOLO_A = '33333333-2222-4333-8444-555555555555';
  const SOLO_B = '44444444-2222-4333-8444-555555555555';
  const SOLO_C = '66666666-2222-4333-8444-555555555555';
  let tokenA;
  let tokenB;
  let tokenC;
  let squadA;

  const get = (path, authToken) =>
    fetch(`${base}${path}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined
    });

  const standings = (authToken, challenge = 'plank-max', squad = squadA) =>
    get(`/api/social/standings?challenge=${challenge}&squad=${squad?.id ?? ''}`, authToken);

  beforeAll(async () => {
    for (const [id, slot] of [[SOLO_A, 'a'], [SOLO_B, 'b'], [SOLO_C, 'c']]) {
      const res = await post('/api/sync/bootstrap', { accountId: id, label: `standings ${slot}` }, null);
      expect(res.status).toBe(200);
      if (slot === 'a') tokenA = res.body.token;
      else if (slot === 'b') tokenB = res.body.token;
      else tokenC = res.body.token;
    }
    // A + B share one squad; C sits in a squad of its own (the outsider).
    squadA = db.createSquad('Alphas');
    db.addSquadMember(squadA.id, SOLO_A);
    db.addSquadMember(squadA.id, SOLO_B);
    const squadC = db.createSquad('Gammas');
    db.addSquadMember(squadC.id, SOLO_C);
  });

  test('rejects a request without a token', async () => {
    const res = await get(`/api/social/standings?challenge=plank-max&squad=${squadA.id}`);
    expect(res.status).toBe(401);
  });

  test('rejects an unknown challenge', async () => {
    const res = await get(`/api/social/standings?challenge=nope&squad=${squadA.id}`, tokenA);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('challenge');
  });

  test('requires a squad and a membership in it', async () => {
    const missing = await get('/api/social/standings?challenge=plank-max', tokenA);
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toContain('squad');

    const outsiders = db.createSquad('Outsiders');
    const stranger = await get(`/api/social/standings?challenge=plank-max&squad=${outsiders.id}`, tokenA);
    expect(stranger.status).toBe(403);
    expect((await stranger.json()).error).toContain('member');
    db.deleteSquad(outsiders.id);
  });

  test('returns the group roster with profile, start, and best holds per day', async () => {
    const now = Date.now();
    const ops = [
      // Profile: two name writes (last wins), one avatar write.
      makeOp({
        id: 'stand-a-name1', hlc: hlcFor(now - 2000, 'standa01'), device: 'standa01',
        entity: 'profile', entityId: 'me', kind: 'patch', data: { name: 'Ana' }
      }),
      makeOp({
        id: 'stand-a-avatar', hlc: hlcFor(now - 1500, 'standa02'), device: 'standa02',
        entity: 'profile', entityId: 'me', kind: 'patch', data: { avatar: '🐢' }
      }),
      makeOp({
        id: 'stand-a-name2', hlc: hlcFor(now - 1000, 'standa03'), device: 'standa03',
        entity: 'profile', entityId: 'me', kind: 'patch', data: { name: 'Anika' }
      }),
      // Cohort start (an account op overriding the config date).
      makeOp({
        id: 'stand-a-start', hlc: hlcFor(now - 900, 'standa04'), device: 'standa04',
        entity: 'challenge', entityId: 'plank-max', kind: 'create',
        data: { startedAt: daysAgoKey(10) }
      }),
      // Best hold per day: two ops the same day (max wins), one yesterday,
      // one today (today must be withheld), and a legacy-day (other challenge).
      makeOp({
        id: 'stand-a-day-weak', hlc: hlcFor(now - 800, 'standa05'), device: 'standa05',
        entityId: daysAgoKey(2), data: { seconds: 90, challengeId: 'plank-max' }
      }),
      makeOp({
        id: 'stand-a-day-strong', hlc: hlcFor(now - 700, 'standa06'), device: 'standa06',
        entityId: daysAgoKey(2), data: { seconds: 200, challengeId: 'plank-max' }
      }),
      makeOp({
        id: 'stand-a-day-yesterday', hlc: hlcFor(now - 600, 'standa07'), device: 'standa07',
        entityId: daysAgoKey(1), data: { seconds: 120, challengeId: 'plank-max' }
      }),
      makeOp({
        id: 'stand-a-day-today', hlc: hlcFor(now - 500, 'standa08'), device: 'standa08',
        entityId: todayKey(), data: { seconds: 400, challengeId: 'plank-max' }
      }),
      makeOp({
        id: 'stand-a-day-legacy', hlc: hlcFor(now - 400, 'standa09'), device: 'standa09',
        entityId: daysAgoKey(1), data: { seconds: 60 }
      })
    ];
    const push = await post('/api/sync/push', { ops }, tokenA);
    expect(push.status).toBe(200);

    const res = await standings(tokenA);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.asOf).toBe(todayKey());
    const me = body.roster.find((r) => r.accountId === SOLO_A);
    expect(me).toEqual({
      accountId: SOLO_A,
      name: 'Anika',
      avatar: '🐢',
      startedAt: daysAgoKey(10),
      days: [
        { date: daysAgoKey(2), seconds: 200 },
        { date: daysAgoKey(1), seconds: 120 }
      ]
    });
  });

  test('scopes the roster to the squad (other squads stay invisible)', async () => {
    const now = Date.now();
    const push = await post(
      '/api/sync/push',
      {
        ops: [
          makeOp({
            id: 'stand-c-day',
            hlc: hlcFor(now - 100, 'standc01'),
            device: 'standc01',
            entityId: daysAgoKey(1),
            data: { seconds: 500, challengeId: 'plank-max' }
          })
        ]
      },
      tokenC
    );
    expect(push.status).toBe(200);

    // C has plenty of data, but it lives in another squad.
    const res = await standings(tokenA);
    const body = await res.json();
    const ids = body.roster.map((r) => r.accountId);
    expect(ids).toContain(SOLO_A);
    expect(ids).not.toContain(SOLO_C);

    // …and from C's own squad the roster is just C.
    const resC = await standings(tokenC, 'plank-max', { id: db.listSquads().find((s) => s.members.includes(SOLO_C)).id });
    const bodyC = await resC.json();
    expect(bodyC.roster.map((r) => r.accountId)).toEqual([SOLO_C]);
  });

  test('withholds today and the future (the quiet-day rule)', async () => {
    // tokenA already has a plankDay for today (pushed above) — it must not
    // appear in the feed for either account.
    const resA = await standings(tokenA);
    const resB = await standings(tokenB);
    for (const res of [resA, resB]) {
      const body = await res.json();
      for (const member of body.roster) {
        for (const day of member.days) {
          expect(day.date < body.asOf).toBe(true);
        }
      }
    }
  });

  test('legacy plank days show in the legacy feed, not the cohort feed', async () => {
    const res = await standings(tokenA, 'plank');
    expect(res.status).toBe(200);
    const body = await res.json();
    const me = body.roster.find((r) => r.accountId === SOLO_A);
    expect(me.days).toEqual([{ date: daysAgoKey(1), seconds: 60 }]);
    // And the same account is absent from the cohort feed's days list above
    // (its only cohort day is daysAgoKey(1) at 120 s — the legacy 60 s must
    // not leak into it).
    const cohort = await (await standings(tokenA)).json();
    const cohortMe = cohort.roster.find((r) => r.accountId === SOLO_A);
    expect(cohortMe.days.find((d) => d.date === daysAgoKey(1))).toEqual({
      date: daysAgoKey(1),
      seconds: 120
    });
  });
});

describe('SPA isolation', () => {
  test('unknown /api paths get a JSON 404, not the app shell', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Not found');
  });
});
