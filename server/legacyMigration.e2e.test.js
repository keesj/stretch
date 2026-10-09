// @vitest-environment jsdom
// Full pipeline: pre-sync progress in localStorage -> first sync round
// (legacy migration -> bootstrap -> push) -> server journal -> CLI list.
// Needs jsdom (localStorage) while still hitting a real HTTP server, so
// it lives with the server tests and stubs fetch to point the client's
// origin-relative /api calls at it.
import { describe, test, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApp } from './app.js';
import { createSyncDb } from './syncDb.js';
import { runCli } from './cli.js';
import { useSyncStore } from '../src/sync/useSyncStore';
import { useDeviceIdentity } from '../src/sync/useDeviceIdentity';

const ACCOUNT = '42424242-4242-4242-8242-424242424242';

let dir;
let dbFile;
let db;
let base;
let server;

const realFetch = globalThis.fetch.bind(globalThis);

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stretch-e2e-'));
  dbFile = path.join(dir, 'e2e.sqlite');
  db = createSyncDb(dbFile);
  const { app } = createApp({ db, rateLimit: false, staticDir: dir });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  vi.stubGlobal(
    'fetch',
    (input, init) => realFetch(`${base}${input}`, init)
  );
});

beforeEach(() => {
  localStorage.clear();
  useSyncStore.setState({ lastSyncAt: null, lastError: null, syncing: false });
  useDeviceIdentity.setState({ accountId: ACCOUNT, linked: false, role: null });
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('legacy migration end to end', () => {
  test('pre-sync progress lands in the shared journal and the CLI sees it', async () => {
    localStorage.setItem('stretch.userId', ACCOUNT);
    localStorage.setItem(
      'plankChallenge',
      JSON.stringify({
        startedAt: '2026-09-01',
        days: [
          { date: '2026-09-01', seconds: 30 },
          { date: '2026-09-02', seconds: 60 }
        ]
      })
    );
    localStorage.setItem(
      'completedSessions',
      JSON.stringify([
        {
          id: 'sess-1',
          routineId: 'full',
          routineTitle: 'Full Body',
          duration: 600,
          completedAt: '2026-09-03T10:00:00.000Z'
        }
      ])
    );
    localStorage.setItem(
      'settings',
      JSON.stringify({ theme: 'dark', soundEnabled: true, hapticEnabled: true })
    );

    await useSyncStore.getState().syncNow();
    expect(useSyncStore.getState().lastError).toBeNull();

    const out = [];
    const code = runCli(['list', ACCOUNT], {
      dbPath: dbFile,
      out: (line) => out.push(line),
      warn: () => {}
    });
    expect(code).toBe(0);
    const text = out.join('\n');
    expect(text).toContain('2026-09-01  30s');
    expect(text).toContain('2026-09-02  60s');
    expect(text).toContain('"Full Body"');
    expect(text).toContain('Challenge: started 2026-09-01');
    expect(text).toContain('theme=dark');
  });
});
