// @vitest-environment node
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createSyncDb } from './syncDb.js';
import { runCli } from './cli.js';

const ACCOUNT = '11111111-2222-4333-8444-555555555555';
const ACCOUNT_2 = '33333333-4444-5555-8666-777777777777';

function dayKey(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let dir;
let dbPath;
let out;
let warns;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stretch-cli-'));
  dbPath = path.join(dir, 'cli.sqlite');
  out = [];
  warns = [];
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function run(argv) {
  return runCli(argv, { dbPath, out: (line) => out.push(line), warn: (line) => warns.push(line) });
}

describe('cli plank', () => {
  test('records a plank day for an account', async () => {
    const db = createSyncDb(dbPath);
    db.mintToken(ACCOUNT, 'phone', 'owner');
    db.close();

    expect(run(['plank', ACCOUNT, dayKey(1), '90'])).toBe(0);
    expect(out.join('\n')).toContain('Recorded 90s on');

    const check = createSyncDb(dbPath);
    const ops = check.pull(ACCOUNT, null);
    check.close();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entity: 'plankDay', entityId: dayKey(1), data: { seconds: 90 } });
    expect(ops[0].device).toBe('cli');
  });

  test('keeps the best hold per day across multiple records', () => {
    expect(run(['plank', ACCOUNT, dayKey(0), '60'])).toBe(0);
    expect(run(['plank', ACCOUNT, dayKey(0), '90'])).toBe(0);
    expect(out[out.length - 1]).toContain('best for the day: 90s');
    // A shorter re-record does not lower the best.
    expect(run(['plank', ACCOUNT, dayKey(0), '30'])).toBe(0);
    expect(out[out.length - 1]).toContain('best for the day: 90s');
  });

  test('warns when the account has no linked devices', () => {
    expect(run(['plank', ACCOUNT, dayKey(0), '30'])).toBe(0);
    expect(warns.join('\n')).toContain('no linked devices');
  });

  test('refuses malformed account ids, dates, and second counts', () => {
    expect(run(['plank', 'not-a-uuid', dayKey(0), '30'])).toBe(1);
    expect(run(['plank', ACCOUNT, '2026-02-30', '30'])).toBe(1);
    expect(run(['plank', ACCOUNT, dayKey(-2), '30'])).toBe(1); // future
    expect(run(['plank', ACCOUNT, dayKey(0), '0'])).toBe(1);
    expect(run(['plank', ACCOUNT, dayKey(0), '99999'])).toBe(1);
    expect(run(['plank', ACCOUNT, dayKey(0), '12.5'])).toBe(1);
    expect(warns).toHaveLength(6);
  });

  test('missing arguments print the usage and exit 1', () => {
    expect(run(['plank', ACCOUNT, dayKey(0)])).toBe(1);
    expect(warns.join('\n')).toContain('Usage:');
  });

  test('records the day under the given challenge', () => {
    const db = createSyncDb(dbPath);
    db.mintToken(ACCOUNT, 'phone', 'owner');
    db.close();

    expect(run(['plank', ACCOUNT, dayKey(1), '150', '--challenge', 'plank-max'])).toBe(0);

    const check = createSyncDb(dbPath);
    const ops = check.pull(ACCOUNT, null);
    check.close();
    expect(ops[0]).toMatchObject({
      entity: 'plankDay',
      entityId: dayKey(1),
      data: { seconds: 150, challengeId: 'plank-max' }
    });
  });

  test('refuses an unknown challenge id', () => {
    expect(run(['plank', ACCOUNT, dayKey(0), '150', '--challenge', 'nope'])).toBe(1);
    expect(warns.join('\n')).toContain('unknown challenge');
  });
});

describe('cli planks', () => {
  function seed() {
    const db = createSyncDb(dbPath);
    db.mintToken(ACCOUNT, 'phone', 'owner');
    db.push(ACCOUNT, [
      {
        id: 'p1',
        hlc: 'a000000000000000001',
        device: 'cli00000',
        entity: 'plankDay',
        entityId: dayKey(3),
        kind: 'create',
        data: { seconds: 150 }
      },
      {
        id: 'p2',
        hlc: 'a000000000000000002',
        device: 'cli00000',
        entity: 'plankDay',
        entityId: dayKey(1),
        kind: 'create',
        data: { seconds: 90, challengeId: 'plank-max' }
      }
    ]);
    db.close();
  }

  test('lists plank days with their challenge, oldest first', () => {
    seed();
    expect(run(['planks', ACCOUNT])).toBe(0);
    expect(out).toEqual([
      `${dayKey(3)}  150s  plank`,
      `${dayKey(1)}  90s  plank-max`
    ]);
  });

  test('keeps the best hold per day', () => {
    seed();
    const db = createSyncDb(dbPath);
    db.push(ACCOUNT, [
      {
        id: 'p3',
        hlc: 'a000000000000000003',
        device: 'cli00000',
        entity: 'plankDay',
        entityId: dayKey(3),
        kind: 'create',
        data: { seconds: 60 }
      }
    ]);
    db.close();

    expect(run(['planks', ACCOUNT, '--challenge', 'plank'])).toBe(0);
    expect(out).toEqual([`${dayKey(3)}  150s  plank`]);
  });

  test('filters by challenge', () => {
    seed();
    expect(run(['planks', ACCOUNT, '--challenge', 'plank'])).toBe(0);
    expect(out).toEqual([`${dayKey(3)}  150s  plank`]);

    expect(run(['planks', ACCOUNT, '--challenge', 'plank-max'])).toBe(0);
    expect(out[out.length - 1]).toBe(`${dayKey(1)}  90s  plank-max`);
  });

  test('reports an account without plank days', () => {
    const db = createSyncDb(dbPath);
    db.mintToken(ACCOUNT, 'phone', 'owner');
    db.close();

    expect(run(['planks', ACCOUNT])).toBe(0);
    expect(out[out.length - 1]).toBe(`No plank days for ${ACCOUNT}.`);
  });

  test('refuses bad account ids, challenges, and flags', () => {
    expect(run(['planks', 'not-a-uuid'])).toBe(1);
    expect(warns.join('\n')).toContain('UUIDv4');
    expect(run(['planks', ACCOUNT, '--challenge', 'nope'])).toBe(1);
    expect(warns.join('\n')).toContain('unknown challenge');
    expect(run(['planks', ACCOUNT, '--bogus'])).toBe(1);
    expect(warns.join('\n')).toContain('unknown flag');
  });
});

describe('cli migrate-planks', () => {
  function seed(days) {
    const db = createSyncDb(dbPath);
    db.mintToken(ACCOUNT, 'phone', 'owner');
    db.push(
      ACCOUNT,
      days.map(([id, date, data], i) => ({
        id,
        hlc: `a0000000000000000${i + 1}`,
        device: 'cli00000',
        entity: 'plankDay',
        entityId: date,
        kind: 'create',
        data
      }))
    );
    db.close();
  }

  test('copies legacy days to the cohort challenge, keeping the source', () => {
    seed([
      ['m1', dayKey(3), { seconds: 150 }],
      ['m2', dayKey(1), { seconds: 90, challengeId: 'plank-max' }]
    ]);

    expect(run(['migrate-planks', ACCOUNT])).toBe(0);
    expect(out.join('\n')).toContain(`Migrated 1 day(s) from plank to plank-max for ${ACCOUNT}:`);
    expect(out.join('\n')).toContain(`${dayKey(3)}  150s`);

    const check = createSyncDb(dbPath);
    const ops = check.pull(ACCOUNT, null);
    check.close();
    // Source records untouched; the new record carries the target challenge.
    expect(ops).toHaveLength(3);
    const moved = ops.find((o) => o.id !== 'm1' && o.id !== 'm2');
    expect(moved).toMatchObject({
      entity: 'plankDay',
      entityId: dayKey(3),
      data: { seconds: 150, challengeId: 'plank-max' }
    });
    expect(moved.device).toBe('cli');
  });

  test('is idempotent: re-running moves nothing', () => {
    seed([['m1', dayKey(3), { seconds: 150 }]]);

    expect(run(['migrate-planks', ACCOUNT])).toBe(0);
    expect(run(['migrate-planks', ACCOUNT])).toBe(0);
    expect(out[out.length - 1]).toBe(`Nothing to migrate for ${ACCOUNT}: every plank day is already in plank-max.`);

    const check = createSyncDb(dbPath);
    expect(check.pull(ACCOUNT, null)).toHaveLength(2); // original + one migration
    check.close();
  });

  test('never overwrites a stronger hold in the target challenge', () => {
    seed([
      ['m1', dayKey(2), { seconds: 120 }],
      ['m2', dayKey(2), { seconds: 180, challengeId: 'plank-max' }]
    ]);

    expect(run(['migrate-planks', ACCOUNT])).toBe(0);
    expect(out[out.length - 1]).toBe(`Nothing to migrate for ${ACCOUNT}: every plank day is already in plank-max.`);

    const check = createSyncDb(dbPath);
    const ops = check.pull(ACCOUNT, null);
    check.close();
    expect(ops).toHaveLength(2);
    expect(ops.find((o) => o.data.challengeId === 'plank-max').data.seconds).toBe(180);
  });

  test('migrates every account with --all and reports accounts with nothing to move', () => {
    seed([['m1', dayKey(3), { seconds: 150 }]]);
    const db = createSyncDb(dbPath);
    db.mintToken(ACCOUNT_2, 'tablet', 'owner');
    db.close();

    expect(run(['migrate-planks', '--all'])).toBe(0);
    expect(out.join('\n')).toContain(`Migrated 1 day(s) from plank to plank-max for ${ACCOUNT}:`);
    expect(out.join('\n')).toContain(`No plank days for ${ACCOUNT_2}.`);
  });

  test('moves days between arbitrary challenges via --from/--to', () => {
    seed([['m1', dayKey(3), { seconds: 150, challengeId: 'plank-max' }]]);

    expect(run(['migrate-planks', ACCOUNT, '--from', 'plank-max', '--to', 'plank'])).toBe(0);
    expect(out.join('\n')).toContain(`Migrated 1 day(s) from plank-max to plank for ${ACCOUNT}:`);

    const check = createSyncDb(dbPath);
    const moved = check.pull(ACCOUNT, null).find((o) => o.id !== 'm1');
    check.close();
    // The legacy challenge is the default, so no challengeId is written.
    expect(moved).toMatchObject({ entityId: dayKey(3), data: { seconds: 150 } });
  });

  test('refuses bad arguments', () => {
    expect(run(['migrate-planks'])).toBe(1);
    expect(warns.join('\n')).toContain('Usage:');
    expect(run(['migrate-planks', 'not-a-uuid'])).toBe(1);
    expect(warns.join('\n')).toContain('UUIDv4');
    expect(run(['migrate-planks', ACCOUNT, '--from', 'nope'])).toBe(1);
    expect(warns.join('\n')).toContain('known challenges');
    expect(run(['migrate-planks', ACCOUNT, '--from', 'plank', '--to', 'plank'])).toBe(1);
    expect(warns.join('\n')).toContain('different challenges');
    expect(run(['migrate-planks', ACCOUNT, '--bogus'])).toBe(1);
    expect(warns.join('\n')).toContain('unknown flag');
  });
});

describe('cli challenge', () => {
  const START = '2026-11-01';

  test('sets a challenge start date for one account', () => {
    const db = createSyncDb(dbPath);
    db.mintToken(ACCOUNT, 'phone', 'owner');
    db.close();

    expect(run(['challenge', START, ACCOUNT, '--challenge', 'plank-max'])).toBe(0);
    expect(out.join('\n')).toContain(`Challenge start ${START} (plank-max) recorded for 1 account(s)`);

    const check = createSyncDb(dbPath);
    const ops = check.pull(ACCOUNT, null);
    check.close();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      entity: 'challenge',
      entityId: 'plank-max',
      data: { startedAt: START }
    });
    expect(ops[0].device).toBe('cli');
  });

  test('applies the shared start to every account with --all', () => {
    const db = createSyncDb(dbPath);
    db.mintToken(ACCOUNT, 'phone', 'owner');
    db.mintToken(ACCOUNT_2, 'tablet', 'owner');
    db.close();

    expect(run(['challenge', START, '--all', '--challenge', 'plank-max'])).toBe(0);
    expect(out.join('\n')).toContain('recorded for 2 account(s)');

    const check = createSyncDb(dbPath);
    for (const id of [ACCOUNT, ACCOUNT_2]) {
      const ops = check.pull(id, null);
      expect(ops).toEqual([expect.objectContaining({ entity: 'challenge', entityId: 'plank-max', data: { startedAt: START } })]);
    }
    check.close();
  });

  test('refuses a future start for a non-cohort challenge and unknown ids', () => {
    const db = createSyncDb(dbPath);
    db.mintToken(ACCOUNT, 'phone', 'owner');
    db.close();

    expect(run(['challenge', '2030-01-01', ACCOUNT])).toBe(1);
    expect(warns.join('\n')).toContain('future start date');

    expect(run(['challenge', START, ACCOUNT, '--challenge', 'nope'])).toBe(1);
    expect(warns.join('\n')).toContain('unknown challenge');
  });
});

describe('cli list', () => {
  test('shows plank days as best-per-day plus sessions and settings', () => {
    const db = createSyncDb(dbPath);
    db.mintToken(ACCOUNT, 'phone', 'owner');
    db.push(ACCOUNT, [
      {
        id: 'p1',
        hlc: 'a000000000000000001',
        device: 'cli00000',
        entity: 'plankDay',
        entityId: dayKey(2),
        kind: 'create',
        data: { seconds: 15 }
      },
      {
        id: 'p2',
        hlc: 'a000000000000000002',
        device: 'cli00000',
        entity: 'plankDay',
        entityId: dayKey(2),
        kind: 'create',
        data: { seconds: 45 }
      },
      {
        id: 's1',
        hlc: 'a000000000000000003',
        device: 'phone',
        entity: 'session',
        entityId: 'sess-1',
        kind: 'create',
        data: { routineId: 'full', routineTitle: 'full routine', duration: 420, completedAt: new Date().toISOString() }
      },
      {
        id: 'c1',
        hlc: 'a000000000000000004',
        device: 'phone',
        entity: 'challenge',
        entityId: 'plank',
        kind: 'create',
        data: { startedAt: dayKey(2) }
      }
    ]);
    const squad = db.createSquad('List Squad');
    db.addSquadMember(squad.id, ACCOUNT);
    db.close();

    expect(run(['list', ACCOUNT])).toBe(0);
    const text = out.join('\n');
    expect(text).toContain(`Account ${ACCOUNT}`);
    expect(text).toContain(`${dayKey(2)}  45s`); // best of 15/45
    expect(text).toContain('"full routine"');
    expect(text).toContain('7m');
    expect(text).toContain(`Challenge: started ${dayKey(2)}`);
    expect(text).toContain('Squads: List Squad');
  });

  test('rejects unknown accounts', () => {
    expect(run(['list', '99999999-8888-4777-8666-555555555555'])).toBe(1);
    expect(warns.join('\n')).toContain('no such account');
  });
});

describe('cli accounts', () => {
  test('lists every account with its devices and op count', () => {
    const db = createSyncDb(dbPath);
    db.mintToken(ACCOUNT, 'wife phone', 'owner');
    db.mintToken('22222222-3333-4444-8555-666666666666', '', 'owner');
    db.push(ACCOUNT, [
      {
        id: 'p1',
        hlc: 'a0000000000000000001',
        device: 'cli',
        entity: 'plankDay',
        entityId: dayKey(1),
        kind: 'create',
        data: { seconds: 30 }
      }
    ]);
    db.close();

    expect(run(['accounts'])).toBe(0);
    const text = out.join('\n');
    expect(text).toContain(`${ACCOUNT}  ops=1  devices=wife phone (owner)`);
    expect(text).toContain('22222222-3333-4444-8555-666666666666  ops=0  devices=device (owner)');
  });

  test('reports an empty server', () => {
    expect(run(['accounts'])).toBe(0);
    expect(out.join('\n')).toContain('No accounts yet.');
  });
});

describe('cli squads', () => {
  // A second, valid UUIDv4 (the shared ACCOUNT_2 is not one).
  const MEMBER_2 = '44444444-4444-4555-8666-777777777777';

  test('create, list, add, remove, and delete a squad', () => {
    expect(run(['squads', 'list'])).toBe(0);
    expect(out.join('\n')).toContain('No squads yet');

    expect(run(['squads', 'create', 'Morning Plankers'])).toBe(0);
    expect(out[out.length - 1]).toContain('Created squad "Morning Plankers"');

    expect(run(['squads', 'add', 'Morning Plankers', ACCOUNT])).toBe(0);
    expect(out[out.length - 1]).toContain(`Added ${ACCOUNT} to "Morning Plankers" (1 member)`);
    expect(run(['squads', 'add', 'Morning Plankers', MEMBER_2])).toBe(0);
    expect(out[out.length - 1]).toContain('2 members');

    expect(run(['squads', 'list'])).toBe(0);
    const listText = out.join('\n');
    expect(listText).toContain('"Morning Plankers"');
    expect(listText).toContain(`${ACCOUNT}, ${MEMBER_2}`);

    expect(run(['squads', 'remove', 'Morning Plankers', ACCOUNT])).toBe(0);
    expect(out[out.length - 1]).toContain(`Removed ${ACCOUNT} from "Morning Plankers"`);

    expect(run(['squads', 'delete', 'Morning Plankers'])).toBe(0);
    expect(out[out.length - 1]).toContain('Deleted squad "Morning Plankers"');

    expect(run(['squads', 'list'])).toBe(0);
    expect(out.join('\n')).toContain('No squads yet');
  });

  test('resolves a squad by id as well as by name', () => {
    const db = createSyncDb(dbPath);
    const squad = db.createSquad('By Id');
    db.close();

    expect(run(['squads', 'add', squad.id, ACCOUNT])).toBe(0);
    expect(out[out.length - 1]).toContain(`Added ${ACCOUNT} to "By Id" (1 member)`);
  });

  test('removing a non-member and a missing squad both fail', () => {
    const db = createSyncDb(dbPath);
    const squad = db.createSquad('Quiet');
    db.close();

    expect(run(['squads', 'remove', 'Quiet', ACCOUNT])).toBe(1);
    expect(warns.join('\n')).toContain(`is not in "Quiet"`);

    expect(run(['squads', 'delete', 'Ghost'])).toBe(1);
    expect(warns.join('\n')).toContain('no such squad');
  });

  test('refuses duplicate names (case-insensitive) and bad names', () => {
    expect(run(['squads', 'create', 'Twins'])).toBe(0);
    expect(run(['squads', 'create', 'twins'])).toBe(1);
    expect(warns.join('\n')).toContain('already exists');
    expect(run(['squads', 'create', '   '])).toBe(1);
    expect(warns.join('\n')).toContain('1-40 characters');
    expect(run(['squads', 'create', 'x'.repeat(41)])).toBe(1);
    expect(warns.join('\n')).toContain('1-40 characters');
  });

  test('refuses unknown squads, bad account ids, and unknown subcommands', () => {
    expect(run(['squads', 'add', 'Nope', ACCOUNT])).toBe(1);
    expect(warns.join('\n')).toContain('no such squad');

    expect(run(['squads', 'create', 'Morning Plankers'])).toBe(0);
    expect(run(['squads', 'add', 'Morning Plankers', 'not-a-uuid'])).toBe(1);
    expect(warns.join('\n')).toContain('UUIDv4');
    expect(run(['squads', 'frobnicate'])).toBe(1);
    expect(warns.join('\n')).toContain('unknown squads command');
    expect(run(['squads'])).toBe(1);
    expect(warns.join('\n')).toContain('Usage:');
  });
});

describe('cli help', () => {
  test('no command prints usage and exits 1', () => {
    expect(run([])).toBe(1);
    expect(out.join('\n')).toContain('Usage:');
  });

  test('unknown commands exit 1', () => {
    expect(run(['vibrate'])).toBe(1);
    expect(warns.join('\n')).toContain('unknown command');
  });
});
