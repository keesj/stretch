// @vitest-environment node
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createSyncDb } from './syncDb.js';
import { runCli } from './cli.js';

const ACCOUNT = '11111111-2222-4333-8444-555555555555';

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
    db.close();

    expect(run(['list', ACCOUNT])).toBe(0);
    const text = out.join('\n');
    expect(text).toContain(`Account ${ACCOUNT}`);
    expect(text).toContain(`${dayKey(2)}  45s`); // best of 15/45
    expect(text).toContain('"full routine"');
    expect(text).toContain('7m');
    expect(text).toContain(`Challenge: started ${dayKey(2)}`);
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
