#!/usr/bin/env node
// Admin CLI for the stretch sync journal. Records plank days for an
// account and inspects what is stored, so data can be entered or fixed
// from the server machine without touching a phone. It opens the same
// SQLite file the API uses (WAL mode makes concurrent access safe), so
// new records show up on every linked device at its next sync.
//
//   node server/cli.ts accounts
//   node server/cli.ts list <accountId>
//   node server/cli.ts plank <accountId> <YYYY-MM-DD> <seconds>
//   node server/cli.ts planks <accountId> [--challenge <syncId>]
//   node server/cli.ts challenge <YYYY-MM-DD> <accountId | --all> [--challenge <syncId>]
//   node server/cli.ts migrate-planks <accountId | --all> [--from <syncId>] [--to <syncId>]
//   node server/cli.ts squads <list | create <name> | add <squad> <accountId> | remove <squad> <accountId> | delete <squad>>
//
// The database lives in DATA_DIR (default ~/.stretch/data), same as the
// server. Backfilling old days is its main use (the API accepts
// backdated records too, for the same legacy-migration reason). It still
// refuses malformed dates, future dates, and out-of-range seconds. The
// `challenge` command sets a challenge's (cohort) start date for one
// account or all of them — that is how the shared start date of the
// cohort challenge gets created. The `squads` command manages squads —
// named groups of accounts that scope the social standings; the app only
// shows its Squad/Chamber tabs to accounts in at least one squad.
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import { createSyncDb, type SyncDb } from './syncDb.ts';
import { USER_ID_RE, dateStartMs, defaultDataPath } from './api.ts';
import { CHALLENGE_IDS, CHALLENGE_START_AHEAD_MS, COHORT_CHALLENGE_IDS } from './challenges.ts';
import type { Op } from '../src/sync/types.ts';

const CLI_DEVICE = 'cli';
const PLANK_SECONDS_MAX = 3600;

type Out = (line: string) => void;

// Same layout as the app's hlc (src/sync/hlc.ts):
// <ms:8 base36><counter:3><device:8>. The CLI never receives remote ops,
// so a wall-clock ms with counter 0 is always unique enough.
function cliHlc(nowMs: number = Date.now()): string {
  return `${nowMs.toString(36).padStart(8, '0')}000${CLI_DEVICE.padEnd(8, '0')}`;
}

function usage(): string {
  return `Usage:
  node server/cli.ts accounts
  node server/cli.ts list <accountId>
  node server/cli.ts plank <accountId> <date> <s>
  node server/cli.ts planks <accountId> [--challenge <syncId>]
   node server/cli.ts challenge <date> <accountId | --all> [--challenge <syncId>]
   node server/cli.ts migrate-planks <accountId | --all> [--from <syncId>] [--to <syncId>]
   node server/cli.ts squads <list | create <name> | add <squad> <accountId>
                             | remove <squad> <accountId> | delete <squad>>

Commands:
  accounts                       list the accounts on this server
  list <accountId>               show an account's records (best plank
                                 hold per day, sessions, challenge,
                                 effective settings, squad profile,
                                 squads, trophy case)
  plank <accountId> <date> <s>   record a plank hold for a date
  planks <accountId>             list an account's plank days (best hold
                                 per day, with the challenge each belongs
                                 to); --challenge filters to one
  challenge <date> <acct|--all>  set a challenge's start date for one
                                 account or for all accounts (how a
                                 cohort challenge's shared start date
                                 is created). Defaults to the legacy
                                 "plank" challenge; use
                                 --challenge plank-max for the cohort
                                 one. Future dates are only accepted
                                 for cohort challenges.
   migrate-planks <acct|--all>    copy an account's plank days from one
                                  challenge to another (defaults: the
                                  legacy "plank" to the cohort
                                  "plank-max"). Only days missing from
                                  the target — or weaker there — get a
                                  new record; the source stays put.
                                  Idempotent: re-running moves nothing.
                                  Use it when retiring a challenge so
                                  its history keeps counting toward
                                  totals and trophies.
    squads list                    list the squads and their members
   squads create <name>           create a squad (name 1-40 chars, unique)
   squads add <squad> <accountId>  add an account to a squad (a member then
                                  sees the Squad and Chamber tabs and the
                                  squad's standings)
   squads remove <squad> <acct>   remove an account from a squad
   squads delete <squad>          delete a squad (members keep their data;
                                  they just lose the tabs until re-added)
                                  <squad> may be the squad's name or its id

Environment:
  DATA_DIR   database directory (default ~/.stretch/data)
`;
}

function bestPerDay(ops: Op[]): Map<string, number> {
  // Best hold per day, grouped by challenge (ops without a challengeId
  // belong to the legacy "plank" challenge).
  const best = new Map<string, number>();
  for (const op of ops) {
    if (op.entity !== 'plankDay') continue;
    const challengeId = typeof op.data?.challengeId === 'string' ? op.data.challengeId : 'plank';
    const key = `${challengeId}\u0000${op.entityId}`;
    const seconds = typeof op.data?.seconds === 'number' ? op.data.seconds : 0;
    if (seconds > (best.get(key) ?? 0)) best.set(key, seconds);
  }
  return best;
}

function lastWriteProfile(ops: Op[]): { name: string; avatar: string } {
  // Last-write-wins per field across profile patch ops (mirrors replay).
  const fields: Record<string, unknown> = {};
  const hlcOf: Record<string, string> = {};
  for (const op of ops) {
    if (op.entity !== 'profile') continue;
    for (const [field, value] of Object.entries(op.data ?? {})) {
      if (hlcOf[field] === undefined || op.hlc > hlcOf[field]) {
        hlcOf[field] = op.hlc;
        fields[field] = value;
      }
    }
  }
  return {
    name: typeof fields.name === 'string' ? fields.name : '',
    avatar: typeof fields.avatar === 'string' ? fields.avatar : ''
  };
}

interface PlacedItemView {
  item: string;
  x?: number;
  y?: number;
  size?: number;
}

function lastWriteTrophyCase(ops: Op[]): { background: string; items: PlacedItemView[] } {
  // Last-write-wins per field across trophyCase patch ops (mirrors replay).
  let background = 'classic';
  let items: PlacedItemView[] = [];
  let bgHlc = '';
  let itemsHlc = '';
  for (const op of ops) {
    if (op.entity !== 'trophyCase') continue;
    const data = op.data ?? {};
    if (typeof data.background === 'string' && op.hlc > bgHlc) {
      bgHlc = op.hlc;
      background = data.background;
    }
    let opItems: PlacedItemView[] | null = null;
    if (Array.isArray(data.items)) {
      opItems = (data.items as unknown[]).filter(
        (it): it is PlacedItemView => !!it && typeof (it as PlacedItemView).item === 'string'
      );
    } else if (Array.isArray(data.slots)) {
      // Legacy shape: position unknown to this listing; ids only.
      opItems = (data.slots as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .map((item) => ({ item }));
    }
    if (opItems !== null && op.hlc > itemsHlc) {
      itemsHlc = op.hlc;
      items = opItems;
    }
  }
  return { background, items };
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function accounts(db: SyncDb, out: Out): number {
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

function list([accountId]: string[], db: SyncDb, out: Out, warn: Out): number {
  if (!USER_ID_RE.test(accountId ?? '')) {
    warn('list needs a valid accountId (UUIDv4). Try: node server/cli.ts accounts');
    return 1;
  }
  const ops = db.pull(accountId, null);
  if (ops.length === 0 && db.countActiveTokens(accountId) === 0) {
    warn(`no such account: ${accountId} (no records, no devices). Try: node server/cli.ts accounts`);
    return 1;
  }
  out(`Account ${accountId}  (${ops.length} ops, ${db.countActiveTokens(accountId)} active device(s))`);
  if (ops.length === 0) {
    out('No records yet.');
    return 0;
  }

  const days = bestPerDay(ops);
  if (days.size > 0) {
    const byChallenge = new Map<string, [string, number][]>();
    for (const [key, seconds] of days) {
      const [challengeId, day] = key.split('\u0000');
      if (!byChallenge.has(challengeId)) byChallenge.set(challengeId, []);
      byChallenge.get(challengeId)!.push([day, seconds]);
    }
    for (const [challengeId, entries] of [...byChallenge.entries()].sort()) {
      out(`\nPlank days (${challengeId}, best hold per day):`);
      for (const [day, seconds] of entries.sort()) out(`  ${day}  ${seconds}s`);
    }
  }

  const challengeOps = ops.filter((op) => op.entity === 'challenge');
  for (const op of challengeOps) {
    const label = challengeOps.length > 1 ? `Challenge (${op.entityId})` : 'Challenge';
    out(`\n${label}: started ${op.data?.startedAt}`);
  }

  const sessions = ops
    .filter((op) => op.entity === 'session')
    .sort((a, b) => String(a.data?.completedAt ?? '').localeCompare(String(b.data?.completedAt ?? '')));
  if (sessions.length > 0) {
    out('\nStretch sessions:');
    for (const op of sessions) {
      const completedAt = typeof op.data?.completedAt === 'string' ? op.data.completedAt : null;
      const when = completedAt ? new Date(completedAt).toLocaleString() : '?';
      out(`  ${when}  ${JSON.stringify(op.data?.routineTitle ?? '?')}  ${formatDuration(typeof op.data?.duration === 'number' ? op.data.duration : 0)}`);
    }
  }

  const settings: Record<string, unknown> = {};
  for (const op of ops.filter((o) => o.entity === 'settings')) Object.assign(settings, op.data ?? {});
  const entries = Object.entries(settings);
  if (entries.length > 0) {
    out(`\nSettings: ${entries.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }

  const profile = lastWriteProfile(ops);
  if (profile.name || profile.avatar) {
    out(`\nProfile: name=${profile.name || '(unset)'}  avatar=${profile.avatar || '(default)'}`);
  }

  const mySquads = db.squadsForAccount(accountId);
  if (mySquads.length > 0) {
    out(`Squads: ${mySquads.map((s) => s.name).join(', ')}`);
  }

  const caseState = lastWriteTrophyCase(ops);
  if (caseState.background !== 'classic' || caseState.items.length > 0) {
    const placed = caseState.items.map((it) =>
      typeof it.x === 'number' && Number.isFinite(it.x)
        ? `${it.item}@(${Math.round(it.x)},${Math.round(it.y ?? 0)})${it.size === 2 ? ' ×2' : ''}`
        : it.item
    );
    out(`\nTrophy case: background=${caseState.background}  shelf=[${placed.join(', ')}]`);
  }
  return 0;
}

function planks([accountId, ...flags]: string[], db: SyncDb, out: Out, warn: Out): number {
  if (!accountId) {
    warn(usage());
    return 1;
  }
  if (!USER_ID_RE.test(accountId)) {
    warn('planks needs a valid accountId (UUIDv4). Try: node server/cli.ts accounts');
    return 1;
  }
  let challengeId: string | null = null;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] !== '--challenge' || flags[i + 1] === undefined) {
      warn(`unknown flag: ${flags[i]}\n\n${usage()}`);
      return 1;
    }
    challengeId = flags[i + 1];
    i++;
  }
  if (challengeId !== null && !CHALLENGE_IDS.has(challengeId)) {
    warn(`unknown challenge: ${challengeId} (known: ${[...CHALLENGE_IDS].join(', ')})`);
    return 1;
  }

  const best = bestPerDay(db.pull(accountId, null));
  const rows: [string, string, number][] = [];
  for (const [key, seconds] of best) {
    const [id, date] = key.split('\u0000');
    if (challengeId !== null && id !== challengeId) continue;
    rows.push([date, id, seconds]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  if (rows.length === 0) {
    out(`No plank days for ${accountId}${challengeId ? ` (${challengeId})` : ''}.`);
    return 0;
  }
  for (const [date, id, seconds] of rows) out(`${date}  ${seconds}s  ${id}`);
  return 0;
}

function plank([accountId, date, secondsArg, ...flags]: string[], db: SyncDb, out: Out, warn: Out): number {
  if (!accountId || !date || secondsArg === undefined) {
    warn(usage());
    return 1;
  }
  let challengeId = 'plank';
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] !== '--challenge' || flags[i + 1] === undefined) {
      warn(`unknown flag: ${flags[i]}\n\n${usage()}`);
      return 1;
    }
    challengeId = flags[i + 1];
    i++;
  }
  if (!CHALLENGE_IDS.has(challengeId)) {
    warn(`unknown challenge: ${challengeId} (known: ${[...CHALLENGE_IDS].join(', ')})`);
    return 1;
  }
  if (!USER_ID_RE.test(accountId)) {
    warn('accountId must be a UUIDv4. Try: node server/cli.ts accounts');
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

  const data: Record<string, unknown> = { seconds };
  if (challengeId !== 'plank') data.challengeId = challengeId;
  const op: Op = {
    id: crypto.randomUUID(),
    hlc: cliHlc(),
    device: CLI_DEVICE,
    entity: 'plankDay',
    entityId: date,
    kind: 'create',
    data
  };
  db.push(accountId, [op]);
  if (db.countActiveTokens(accountId) === 0) {
    warn(`note: account ${accountId} has no linked devices — the record will only appear once one links`);
  }
  const best = bestPerDay(db.pull(accountId, null)).get(`${challengeId}\u0000${date}`);
  out(`Recorded ${seconds}s on ${date} for ${accountId} (best for the day: ${best}s)`);
  return 0;
}

function challenge([date, accountArg, ...flags]: string[], db: SyncDb, out: Out, warn: Out): number {
  if (!date || !accountArg) {
    warn(usage());
    return 1;
  }
  let challengeId = 'plank';
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] !== '--challenge' || flags[i + 1] === undefined) {
      warn(`unknown flag: ${flags[i]}\n\n${usage()}`);
      return 1;
    }
    challengeId = flags[i + 1];
    i++;
  }
  if (!CHALLENGE_IDS.has(challengeId)) {
    warn(`unknown challenge: ${challengeId} (known: ${[...CHALLENGE_IDS].join(', ')})`);
    return 1;
  }
  const start = dateStartMs(date);
  if (start === null) {
    warn(`"${date}" is not a real calendar date (use YYYY-MM-DD)`);
    return 1;
  }
  // Same rule as the API (server/api.ts): only cohort challenges may
  // open in the future, and never more than CHALLENGE_START_AHEAD_MS ahead.
  if (start > Date.now() && !COHORT_CHALLENGE_IDS.has(challengeId)) {
    warn('a future start date is only allowed for cohort challenges');
    return 1;
  }
  if (start > Date.now() + CHALLENGE_START_AHEAD_MS) {
    warn('the start date is more than 60 days in the future');
    return 1;
  }

  const isAll = accountArg === '--all';
  const accountIds = isAll ? db.accountIds() : [accountArg];
  if (!isAll && !USER_ID_RE.test(accountArg)) {
    warn('accountId must be a UUIDv4 (or use --all). Try: node server/cli.ts accounts');
    return 1;
  }
  if (accountIds.length === 0) {
    warn('no accounts on this server');
    return 1;
  }

  const op: Op = {
    id: crypto.randomUUID(),
    hlc: cliHlc(),
    device: CLI_DEVICE,
    entity: 'challenge',
    entityId: challengeId,
    kind: 'create',
    data: { startedAt: date }
  };
  for (const id of accountIds) db.push(id, [op]);
  out(`Challenge start ${date} (${challengeId}) recorded for ${accountIds.length} account(s)`);
  return 0;
}

function migratePlanks([accountArg, ...flags]: string[], db: SyncDb, out: Out, warn: Out): number {
  if (!accountArg) {
    warn(usage());
    return 1;
  }
  let from = 'plank';
  let to = 'plank-max';
  for (let i = 0; i < flags.length; i++) {
    if ((flags[i] !== '--from' && flags[i] !== '--to') || flags[i + 1] === undefined) {
      warn(`unknown flag: ${flags[i]}\n\n${usage()}`);
      return 1;
    }
    if (flags[i] === '--from') from = flags[i + 1];
    else to = flags[i + 1];
    i++;
  }
  if (!CHALLENGE_IDS.has(from) || !CHALLENGE_IDS.has(to)) {
    warn(`--from/--to must be known challenges (${[...CHALLENGE_IDS].join(', ')})`);
    return 1;
  }
  if (from === to) {
    warn('--from and --to must name different challenges');
    return 1;
  }

  const isAll = accountArg === '--all';
  if (!isAll && !USER_ID_RE.test(accountArg)) {
    warn('accountId must be a UUIDv4 (or use --all). Try: node server/cli.ts accounts');
    return 1;
  }
  const accountIds = isAll ? db.accountIds() : [accountArg];
  if (accountIds.length === 0) {
    warn('no accounts on this server');
    return 1;
  }

  for (const id of accountIds) {
    const best = bestPerDay(db.pull(id, null));
    const now = Date.now();
    const newOps: Op[] = [];
    const moved: string[] = [];
    let seq = 0;
    let skipped = 0;
    for (const [key, seconds] of best) {
      const [challengeId, date] = key.split('\u0000');
      if (challengeId !== from) continue;
      // Idempotent: keep the better of the two records, never overwrite.
      if ((best.get(`${to}\u0000${date}`) ?? 0) >= seconds) {
        skipped += 1;
        continue;
      }
      seq += 1;
      const data: Record<string, unknown> = { seconds };
      if (to !== 'plank') data.challengeId = to;
      newOps.push({
        id: crypto.randomUUID(),
        hlc: cliHlc(now + seq),
        device: CLI_DEVICE,
        entity: 'plankDay',
        entityId: date,
        kind: 'create',
        data
      });
      moved.push(`${date}  ${seconds}s`);
    }
    const fromCount = [...best.keys()].filter((k) => k.startsWith(`${from}\u0000`)).length;
    if (newOps.length === 0) {
      out(
        fromCount === 0
          ? `No ${from} days for ${id}.`
          : `Nothing to migrate for ${id}: every ${from} day is already in ${to}.`
      );
      continue;
    }
    db.push(id, newOps);
    out(`Migrated ${newOps.length} day(s) from ${from} to ${to} for ${id}:`);
    for (const line of moved) out(`  ${line}`);
    if (skipped > 0) out(`Skipped ${skipped} day(s) already at least as strong in ${to}`);
  }
  return 0;
}

function squads([sub, ...args]: string[], db: SyncDb, out: Out, warn: Out): number {
  if (!sub) {
    warn(usage());
    return 1;
  }

  if (sub === 'list') {
    const all = db.listSquads();
    if (all.length === 0) {
      out('No squads yet. Create one: node server/cli.ts squads create <name>');
      return 0;
    }
    for (const s of all) {
      const members = s.members.length ? s.members.join(', ') : 'no members';
      out(`"${s.name}" (${s.id})  members: ${members}`);
    }
    return 0;
  }

  if (sub === 'create') {
    const name = args.join(' ');
    try {
      const squad = db.createSquad(name);
      out(`Created squad "${squad.name}" (${squad.id})`);
      return 0;
    } catch (err) {
      warn(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  if (sub === 'add' || sub === 'remove' || sub === 'delete') {
    const [ref, accountId] = args;
    if (!ref) {
      warn(usage());
      return 1;
    }
    const squad = db.findSquad(ref);
    if (!squad) {
      warn(`no such squad: ${ref}. Try: node server/cli.ts squads list`);
      return 1;
    }
    if (sub === 'delete') {
      db.deleteSquad(squad.id);
      out(`Deleted squad "${squad.name}"`);
      return 0;
    }
    if (!accountId || !USER_ID_RE.test(accountId)) {
      warn('add/remove need a valid accountId (UUIDv4). Try: node server/cli.ts accounts');
      return 1;
    }
    if (sub === 'add') {
      const n = db.addSquadMember(squad.id, accountId);
      out(`Added ${accountId} to "${squad.name}" (${n} member${n === 1 ? '' : 's'})`);
      return 0;
    }
    if (!db.removeSquadMember(squad.id, accountId)) {
      warn(`${accountId} is not in "${squad.name}"`);
      return 1;
    }
    out(`Removed ${accountId} from "${squad.name}"`);
    return 0;
  }

  warn(`unknown squads command: ${sub}\n\n${usage()}`);
  return 1;
}

export interface RunCliOptions {
  dbPath?: string;
  out?: Out;
  warn?: Out;
}

/**
 * Run one CLI invocation. Returns the process exit code. `out`/`warn` are
 * injectable for tests; `dbPath` defaults to the server's data path.
 */
export function runCli(argv: string[], options: RunCliOptions = {}): number {
  const { dbPath = defaultDataPath(), out = console.log, warn = console.warn } = options;
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
      case 'planks':
        return planks(rest, db, out, warn);
      case 'challenge':
        return challenge(rest, db, out, warn);
      case 'migrate-planks':
        return migratePlanks(rest, db, out, warn);
      case 'squad':
      case 'squads':
        return squads(rest, db, out, warn);
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
