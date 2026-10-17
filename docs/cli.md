# Admin CLI

`server/cli.ts` records and inspects sync data from the command line. It
talks **directly to the server's SQLite database** (no HTTP, no tokens) —
which makes it an admin tool: running it is equivalent to having write
access to every account's journal.

```
node server/cli.ts <command> [args]
```

## Which database does it touch?

The CLI uses the same path rules as the server: `DATA_DIR/stretch.sqlite`,
defaulting to `~/.stretch/data/stretch.sqlite` **on the machine you run it
on**. There is no network involved, so:

- on the dev machine, `npm run dev` and the CLI share the local database;
- on a production box, run the CLI *there* (or point `DATA_DIR` at the
  production data directory) to act on production accounts.

Ops the CLI writes carry `device: "cli"` and a wall-clock hlc (counter 0),
so they slot into each account's journal like any other op. Devices pick them
up on their next sync round (a full pull), with no special handling.

## Commands

### `accounts`

Lists every account with its op count and linked devices (label + role; the
label is what the device sent at link time, or `device`). Use it to find an
account id, or to see who is linked.

```
$ node server/cli.ts accounts
fdff4c7c-…  ops=15  devices=phone (owner)
```

### `list <accountId>`

Shows an account's journal as a human would: best plank hold per day
(grouped per challenge), challenge start dates, sessions, and settings.

```
$ node server/cli.ts list fdff4c7c-…
Account fdff4c7c-…  (14 ops, 1 active device(s))

Plank days (plank, best hold per day):
  2026-09-28  150s
  2026-10-05  120s

Challenge (plank): started 2026-09-26
Challenge (plank-max): started 2026-10-08

Stretch sessions:
  10/1/2026, 9:21:22 PM  "Shin & Calf Release"  4m 11s

Settings: theme=system
```

With only one challenge's ops, the header is `Challenge:` (no id); with
several, each line is prefixed with its sync id.

### `plank <accountId> <YYYY-MM-DD> <seconds> [--challenge <syncId>]`

Records a plank day (default challenge: `"plank"`, the first cohort). Rules:

- the account id must be a UUIDv4; the date a real calendar date, **not in
  the future** (backdating is the point — it's how old days get onto an
  account);
- `seconds` an integer 1–3600;
- **best per day**: re-recording a day keeps the strongest hold, a shorter
  re-record never lowers it (mirrors the app's max-merge);
- `--challenge <syncId>` targets another known challenge (`plank-max`); the
  `challengeId` field is only written for challenges other than the default
  `"plank"`, matching the app's wire format.

```
$ node server/cli.ts plank fdff4c7c-… 2026-10-07 150
Recorded 150s on 2026-10-07 for fdff4c7c-… (best for the day: 150s)
```

### `planks <accountId> [--challenge <syncId>]`

Lists an account's plank days — the best hold per day, oldest first, with
the challenge each day belongs to (`plank` for days without a `challengeId`,
`plank-max` otherwise). `--challenge` filters to one challenge. Read-only.

```
$ node server/cli.ts planks 23323610-…
2026-09-28  150s  plank
2026-10-05  120s  plank
2026-10-06  120s  plank
2026-10-07  120s  plank
2026-10-11  14s  plank-max
2026-10-15  120s  plank
```

### `challenge <YYYY-MM-DD> <accountId | --all> [--challenge <syncId>]`

Pushes a `challenge` (start-date) op for one account — or **every** account
with `--all` — which is how a cohort's shared start date gets onto devices
before the date arrives, or how a start date gets corrected (last-write-wins
per hlc).

- default challenge: `"plank"`; use `--challenge plank-max` for the second
  cohort;
- a **future** date is accepted only for ids in the server's cohort
  allowlist (`plank-max`) and refused otherwise — the server enforces the
  same rule plus a 60-day-ahead bound on push;
- the date must be a real calendar date.

```
$ node server/cli.ts challenge 2026-10-28 --all --challenge plank-max
Challenge start 2026-10-28 (plank-max) recorded for 3 account(s)
```

### `migrate-planks <accountId | --all> [--from <syncId>] [--to <syncId>]`

Copies an account's plank days from one challenge to another — by default
the `"plank"` cohort to `"plank-max"`. For each source
day it writes one new `plankDay` op under the target challenge, **only when
the target day is missing or holds a weaker best** — a stronger target hold
is never overwritten, and the source records stay untouched. Idempotent:
re-running moves nothing.

This is the tool for retiring a challenge: the app's totals, trophies, and
lifetime stats read the configured challenges only, so once a challenge
leaves `src/data/challenges.json` its history stops counting unless it is
migrated first.

- `--from` / `--to` — any known challenge ids; they must differ;
- `--all` migrates every account on the server.

```
$ node server/cli.ts migrate-planks 23323610-…
Migrated 5 day(s) from plank to plank-max for 23323610-…:
  2026-09-28  150s
  2026-10-05  120s
  2026-10-06  120s
  2026-10-07  120s
  2026-10-15  120s
```

### `squads <list | create | add | remove | delete>`

Manages **squads** — named groups of accounts that scope the social
standings. Squads are server-side rows (not ops), so only this CLI can
change them; the app just reads which squads its account is in and shows
its Squad/Chamber tabs once the account is in at least one.

- `squads list` — every squad with its members;
- `squads create <name>` — name is 1–40 chars, unique (case-insensitive);
  the name may be given unquoted with spaces (`squads create Morning Plankers`);
- `squads add <squad> <accountId>` — `<squad>` may be the name or the id;
  the account must be a UUIDv4 (find it with `accounts`);
- `squads remove <squad> <accountId>` — take an account out again;
- `squads delete <squad>` — remove the squad and its membership (members
  keep all their data; they just lose the tabs until re-added).

```
$ node server/cli.ts squads create Morning Plankers
Created squad "Morning Plankers" (9f2c…)
$ node server/cli.ts squads add Morning Plankers fdff4c7c-…
Added fdff4c7c-… to "Morning Plankers" (1 member)
$ node server/cli.ts squads list
"Morning Plankers" (9f2c…)  members: fdff4c7c-…
```

`list <accountId>` also shows an account's squads (`Squads: Morning
Plankers`) next to its profile.

## Typical flows

**Test the new (cohort) challenge locally without waiting for its date** —
the scratch-account recipe that keeps your real progress untouched:

```
# 1. open the dev app in an incognito window -> it bootstraps a new account
node server/cli.ts accounts                    # find the new account id
node server/cli.ts challenge 2026-10-11 <NEW_ID> --challenge plank-max
# 2. reload the incognito window: the cohort challenge is day 1 and active
```

**Correct a cohort start date after a mistake:**

```
node server/cli.ts challenge 2026-11-01 <accountId> --challenge plank-max
```

The later op wins on every device (LWW per hlc); the stale earlier op can
stay in the journal.

**Hand over to the next cohort while the current one runs to completion**
(the October 2026 switch from `"plank"` to `"plank-max"`):

```
# 1. re-date the outgoing challenge's shared start into the past and set
#    the incoming cohort's start in the future (src/data/challenges.json):
#       plank      startDate 2026-09-26  (window closes 2026-10-25)
#       plank-max  startDate 2026-10-28  (two rest days in between)
# 2. push both start ops — INCOMING FIRST, OUTGOING LAST:
node server/cli.ts challenge 2026-10-28 --all --challenge plank-max
node server/cli.ts challenge 2026-09-26 --all
# 3. deploy the app build with the new challenges.json — before the
#    outgoing window closes, so devices are never left with no active
#    challenge
```

The op order matters: a pre-multi-challenge device folds every `challenge`
op into one last-write-wins slot, so the last-pushed op (the outgoing
cohort's in-progress start) is what makes a running user's current challenge
visible there. On the new build both challenges project to their own
blobs, so the running account finishes `"plank"` on its normal date, sees
the finished card across the rest days, and the card hands over to
`"plank-max"` when it opens.

**Retire a challenge and carry its history into the next one** (when an
entry actually leaves the config, unlike the hand-over above):

```
# 1. copy the history into the successor (idempotent — safe to re-run)
node server/cli.ts migrate-planks --all
# 2. deploy the app build whose challenges.json has dropped the entry
```

Migrating before the config change goes live is the safe order: the old
builds double-count the copied days for a while, which is cosmetic and ends
with the deploy — whereas a missing history would just sit out of the
totals until someone runs the migration.

**Stand up a squad before a cohort challenge starts:**

```
node server/cli.ts accounts                # find the members' account ids
node server/cli.ts squads create Plank Patrol
node server/cli.ts squads add Plank Patrol <accountId>
# …one add per member. The Squad/Chamber tabs appear in their apps as soon
# as the squads request comes back (app reload, or the Standings page's
# Refresh); no server restart needed.
```

## Caveats

- The challenge allowlists (`CHALLENGE_IDS`, `COHORT_CHALLENGE_IDS`) are
  **derived** from `src/data/challenges.json` in `server/challenges.ts` —
  adding a challenge to that file is the only change needed, and a
  malformed file fails the CLI and the server on boot with a clear error.
- Because the CLI writes straight into the database, its validation
  duplicates the server's (`server/cli.ts` checks dates/seconds/ids before
  writing). If you ever bypass those checks (custom script), the server's
  push validation is the second line of defense — but only for ops that
  devices later push, not for rows inserted directly.
- Treat the database file as sensitive: it is the entire account history,
  and direct access needs no credential.
