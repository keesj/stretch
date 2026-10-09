#!/usr/bin/env node
// Admin CLI for the stretch sync journal. Records plank days for an
// account and inspects what is stored, so data can be entered or fixed
// from the server machine without touching a phone. It opens the same
// SQLite file the API uses (WAL mode makes concurrent access safe), so
// new records show up on every linked device at its next sync.
//
//   node server/cli.js accounts
//   node server/cli.js list <accountId>
//   node server/cli.js plank <accountId> <YYYY-MM-DD> <seconds>
//
// The database lives in DATA_DIR (default ~/.stretch/data), same as the
// server. Backfilling old days is its main use (the API accepts
// backdated records too, for the same legacy-migration reason). It still
// refuses malformed dates, future dates, and out-of-range seconds.
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import { createSyncDb } from './syncDb.js';
import { USER_ID_RE, dateStartMs, defaultDataPath } from './api.js';

const CLI_DEVICE = 'cli';
const PLANK_SECONDS_MAX = 3600;

// Same layout as the app's hlc (src/sync/hlc.ts):
// <ms:8 base36><counter:3><device:8>. The CLI never receives remote ops,
// so a wall-clock ms with counter 0 is always unique enough.
function cliHlc(nowMs = Date.now()) {
  return `${nowMs.toString(36).padStart(8, '0')}000${CLI_DEVICE.padEnd(8, '0')}`;
}

function usage() {
  return `Usage:
  node server/cli.js accounts
  node server/cli.js list <accountId>
  node server/cli.js plank <accountId> <YYYY-MM-DD> <seconds>

Commands:
  accounts                       list the accounts on this server
  list <accountId>               show an account's records (best plank
                                 hold per day, sessions, challenge,
                                 effective settings)
  plank <accountId> <date> <s>   record a plank hold for a date

Environment:
  DATA_DIR   database directory (default ~/.stretch/data)
`;
}

function bestPerDay(ops) {
  const best = new Map();
  for (const op of ops) {
    if (op.entity !== 'plankDay') continue;
    const seconds = op.data?.seconds ?? 0;
    if (seconds > (best.get(op.entityId) ?? 0)) best.set(op.entityId, seconds);
  }
  return best;
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function accounts(db, out) {
  const ids = db.accountIds();
  if (ids.length === 0) {
    out('No accounts yet.');
    return 0;
  }
  const tokens = db.listTokens().filter((t) => t.revoked_at === null);
  for (const id of ids) {
    const devices = tokens.filter((t) => t.user_id === id).map((t) => `${t.label || 'device'} (${t.role})`);
    out(`${id}  ops=${db.opCount(id)}  devices=${devices.length ? devices.join(', ') : 'none'}`);
  }
  return 0;
}

function list([accountId], db, out, warn) {
  if (!USER_ID_RE.test(accountId ?? '')) {
    warn('list needs a valid accountId (UUIDv4). Try: node server/cli.js accounts');
    return 1;
  }
  const ops = db.pull(accountId, null);
  if (ops.length === 0 && db.countActiveTokens(accountId) === 0) {
    warn(`no such account: ${accountId} (no records, no devices). Try: node server/cli.js accounts`);
    return 1;
  }
  out(`Account ${accountId}  (${ops.length} ops, ${db.countActiveTokens(accountId)} active device(s))`);
  if (ops.length === 0) {
    out('No records yet.');
    return 0;
  }

  const days = bestPerDay(ops);
  if (days.size > 0) {
    out('\nPlank days (best hold per day):');
    for (const [day, seconds] of [...days.entries()].sort()) out(`  ${day}  ${seconds}s`);
  }

  const challenge = ops.find((op) => op.entity === 'challenge');
  if (challenge) out(`\nChallenge: started ${challenge.data?.startedAt}`);

  const sessions = ops
    .filter((op) => op.entity === 'session')
    .sort((a, b) => (a.data?.completedAt ?? '').localeCompare(b.data?.completedAt ?? ''));
  if (sessions.length > 0) {
    out('\nStretch sessions:');
    for (const op of sessions) {
      const when = op.data?.completedAt ? new Date(op.data.completedAt).toLocaleString() : '?';
      out(`  ${when}  ${JSON.stringify(op.data?.routineTitle ?? '?')}  ${formatDuration(op.data?.duration ?? 0)}`);
    }
  }

  const settings = {};
  for (const op of ops.filter((o) => o.entity === 'settings')) Object.assign(settings, op.data ?? {});
  const entries = Object.entries(settings);
  if (entries.length > 0) {
    out(`\nSettings: ${entries.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  return 0;
}

function plank([accountId, date, secondsArg], db, out, warn) {
  if (!accountId || !date || secondsArg === undefined) {
    warn(usage());
    return 1;
  }
  if (!USER_ID_RE.test(accountId)) {
    warn('accountId must be a UUIDv4. Try: node server/cli.js accounts');
    return 1;
  }
  const start = dateStartMs(date);
  if (start === null) {
    warn(`"${date}" is not a real calendar date (use YYYY-MM-DD)`);
    return 1;
  }
  if (start > Date.now()) {
    warn('the date is in the future');
    return 1;
  }
  const seconds = Number(secondsArg);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > PLANK_SECONDS_MAX) {
    warn(`seconds must be an integer between 1 and ${PLANK_SECONDS_MAX}`);
    return 1;
  }

  const op = {
    id: crypto.randomUUID(),
    hlc: cliHlc(),
    device: CLI_DEVICE,
    entity: 'plankDay',
    entityId: date,
    kind: 'create',
    data: { seconds }
  };
  db.push(accountId, [op]);
  if (db.countActiveTokens(accountId) === 0) {
    warn(`note: account ${accountId} has no linked devices — the record will only appear once one links`);
  }
  const best = bestPerDay(db.pull(accountId, null)).get(date);
  out(`Recorded ${seconds}s on ${date} for ${accountId} (best for the day: ${best}s)`);
  return 0;
}

/**
 * Run one CLI invocation. Returns the process exit code. `out`/`warn` are
 * injectable for tests; `dbPath` defaults to the server's data path.
 */
export function runCli(argv, { dbPath = defaultDataPath(), out = console.log, warn = console.warn } = {}) {
  const [cmd, ...rest] = argv;
  if (cmd === undefined || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    out(usage());
    return cmd === undefined ? 1 : 0;
  }

  const db = createSyncDb(dbPath);
  try {
    switch (cmd) {
      case 'accounts':
        return accounts(db, out);
      case 'list':
        return list(rest, db, out, warn);
      case 'plank':
        return plank(rest, db, out, warn);
      default:
        warn(`unknown command: ${cmd}\n\n${usage()}`);
        return 1;
    }
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli(process.argv.slice(2));
}
