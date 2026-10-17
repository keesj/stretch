# Sync Protocol

How Stretch keeps multiple devices in sync: plank challenge progress, stretch
sessions, and settings. The design goals are **convergence without a smart
server**, **no clock agreement between devices**, and **forward compatibility**
(the server stores ops it does not interpret).

## Big picture

```
 Device A (phone)                Device B (desktop)
     |                                  |
     |  push ops   +--------+   pull ops|
     +------------>  Server  <----------+
     |            (SQLite,   |
     |             dumb)     |
     +-----------------------+   pairing code / bootstrap
```

- A **device** is a browser profile. It owns a device id and a revocable
  device token.
- An **account** (UUIDv4) addresses one shared op journal. The account id is
  an identifier, never a credential.
- The **server** (`server/`) stores journals per account and validates each op
  for plausibility (anti-cheat). It never merges, scores, or interprets data
  beyond that — all meaning lives in the client.
- **State on any device = `replay(legacyBase, journal)`** — see
  `src/sync/replay.ts`. Every device folds the same ops in the same total
  order and gets the same state, which is what makes sync converge.

```
 state = replay(frozen legacy base, journal ops)
 journal = local ops ⊕ server ops   (deduped by op id, ordered by hlc)
```

## The op

The unit of sync (`src/sync/types.ts`). Ops are immutable; retries are safe
because they are deduped by `id`.

```ts
interface Op {
  id: string;       // UUIDv4, idempotency key (created by the authoring device)
  hlc: string;      // hybrid logical clock — a sortable string, see below
  device: string;   // authoring device id
  entity: "plankDay" | "challenge" | "session" | "settings" | "reset";
  entityId: string; // meaning depends on entity, see the table below
  kind: "create" | "patch";
  data?: Record<string, unknown>;
}
```

## Ordering: the hybrid logical clock

`src/sync/hlc.ts` encodes the clock as a **fixed-width base36 string** so
plain lexicographic comparison is a total order:

```
 <ms:8 base36><counter:3 base36><device:8>
```

- **ms** — wall-clock milliseconds at the moment the op was created.
- **counter** — incremented for ops in the same millisecond (local or seen
  remotely), so same-ms ops still have a stable order.
- **device** — 8 alphanumerics of the device id; breaks ties between
  different devices at equal time+counter.

`makeHlc(lastHlc, now, device)` stamps **at least the wall clock and strictly
after the highest clock this device has seen** (local or remote). Receiving a
later remote op advances the local clock, so skewed wall clocks self-correct —
no NTP, no server time dependency. The server only reads the embedded time for
anti-cheat bounds (see below); it never reorders.

## Entities and replay semantics

`replayOps` (src/sync/replay.ts) folds ops in hlc order. Each entity has
deliberately simple merge rules:

| entity    | entityId            | data                                   | merge rule |
| --------- | ------------------- | -------------------------------------- | ---------- |
| `plankDay`| `YYYY-MM-DD`        | `{ seconds, challengeId? }`            | **best hold per day** (max seconds) within its challenge |
| `challenge` | the challenge's `syncId` | `{ startedAt: "YYYY-MM-DD" }`     | last-write-wins per hlc, per challenge |
| `session` | session id          | `{ routineId, routineTitle, duration, completedAt }` | immutable creates, deduped by id |
| `settings`| `"app"`             | `{ theme?, soundEnabled?, hapticEnabled? }` (patch) | last-write-wins **per field** |
| `profile` | `"me"`              | `{ name?, avatar? }` (patch)         | last-write-wins **per field**; an empty string clears the field |
| `trophyCase` | `"me"`           | `{ background?, items? }` (patch)    | last-write-wins **per field**; `items` is the shelf layout — up to 24 placed items, each `{ item, x, y, size? }` (an item id, a free position in 0–100 percent of the shelf, and an optional size 1 or 2 — a grown item renders 2× larger and costs 2× the points; older ops default to 1), overlap allowed |
| `reset`   | `"all"`             | —                                      | clears every challenge + all sessions; settings, profile, and the trophy case survive |

Notes:

- `plankDay` ops **without** `challengeId` belong to the `plank` challenge
  (`syncId "plank"`). This is what keeps pre-multi-challenge journals valid.
- A `plankDay` and a `challenge` op with the same date commute (different
  entities), and two `plankDay` ops for the same day commute via max — the
  replay is order-insensitive where it matters, which is what makes the
  push-then-pull round race-free.
- Malformed ops (bad date shape, non-numeric seconds, unknown `challengeId`
  shape) are **skipped, not fatal** — a bad remote op must not poison a
  device's state.

## Multiple challenges

Challenges are configured in `src/data/challenges.json`; the server derives
the allowed sync ids from the same file (`server/challenges.ts`), so adding
a challenge is a single-file change. The config currently holds two
cohort challenges that form a hand-over: `plank-30-day` (`syncId: "plank"`,
threshold scoring, opens 2026-09-26 and runs to 2026-10-25) and
`plank-max-30-day` (`syncId: "plank-max"`, duration scoring, opens
2026-10-28 after two rest days). The self-start shape (an entry without
`startDate`) is still fully supported but no longer in use.

- **Self-start challenges** (entries without `startDate`): the user starts
  it; a `challenge` op records the start date on first use. While the user
  is inside its 30-day window it is the active challenge — the app never
  cuts away from a running challenge.
- **Cohort challenges** (both of the current ones): a shared start date in
  the config so every account runs on the same clock. The effective start
  date is **the account's `challenge` op if present, else the configured
  date** (last-write-wins). The admin CLI (`docs/cli.md`) is how a start op
  gets onto accounts — including before the date arrives, which the server
  allows for cohort ids up to 60 days ahead.
- **Which challenge is shown** — `activeChallenge()`
  (src/utils/challenge.ts), in priority order:
  1. a self-start challenge whose window the user is currently inside;
  2. the most recently opened cohort challenge (effective start ≤ today) —
     a **finished** one included: during the rest gap the completed cohort
     stays on the card ("Challenge complete") until the next one opens, and
     only then does the card hand over;
  3. the soonest upcoming cohort — shown as an "Opens …" preview — once a
     self-start run has finished but no cohort has opened yet;
  4. the latest self-start challenge (a fresh account can still start it) —
     or, when the config has no self-start challenge (today's case), the
     first configured cohort, as an "Opens …" preview before its date.
- **Storage**: each challenge projects to its own blob — the first
  challenge keeps the historical key `plankChallenge`, all others use
  `challenge:<syncId>` (`challengeBlobKey`).
- **Handing over to the next cohort**: the outgoing challenge stays in the
  config with its (now past) start date so mid-run accounts can finish
  their window; the incoming cohort's start date is set in the future.
  Push the start ops **incoming first, outgoing last** — a
  pre-multi-challenge device folds every `challenge` op into one
  last-write-wins slot, and the final op should be the outgoing cohort's
  in-progress start so a running user's current challenge is what shows.
  Deploy the new build before the outgoing window closes (see
  `docs/cli.md`).
- **Retiring a challenge**: removing an entry from the config stops the UI
  from seeing it — the config-driven readers (totals, trophies,
  `activeChallenge`) no longer include its days — but the replay keeps
  projecting its blob and `plankDay` ops without a `challengeId` still route
  to it, so the data stays on the device and in the journal. To carry that
  history into another challenge (so it still counts toward totals,
  trophies, and standings), copy the days with the admin CLI:
  `node server/cli.ts migrate-planks <account | --all>` (see `docs/cli.md`).

## Social layer: identity and the quiet-day reveal

The small-group features (squad standings, and later the trophy chamber) ride
on the same ops. Two rules keep it honest and friendly:

- **Identity is an op, not an account property.** `profile` (above) holds the
  display `name` and the `avatar` (a single-codepoint emoji from the curated
  set in `src/utils/display.ts`). Name colors are *not* stored — they are
  derived deterministically from the account id, so they are identical on
  every device with nothing to sync or conflict. A `reset` never clears the
  profile: identity is not progress.
- **The server is deliberately read-only for the group.** It does not score,
  rank, or hide anything after the fact. `GET /api/social/standings` returns
  a **raw feed** — one entry per account with the LWW profile, the LWW cohort
  start, and the best hold per day — computed straight from stored ops. All
  scoring and ranking happens client-side in `src/utils/standings.ts`, so the
  app keeps the single source of truth for points.

**Squads** scope the social layer. A squad is a named group of accounts
stored in plain server tables (`squads` + `squad_members`) and managed
**only** from the admin CLI (`node server/cli.ts squads …`) — there is no
squad op, so nothing about group membership is synced, conflicted, or
visible in a journal. The standings feed is restricted to the requested
squad's members, and a non-member gets a 403; `GET /api/social/squads`
returns the caller's own squads, and the app uses it to decide whether the
**Squad** and **Chamber** nav tabs exist at all (an account in no squad sees
a "join a squad" state on `/standings`). With several squads the Standings
page shows a selector and fetches the feed per selected squad.

**The quiet-day rule.** The feed withholds today's and any future date
(`date < asOf`, enforced in `socialFeed`). The group is compared on *completed*
days only: you cannot see anyone's in-progress hold during the day, and the
next day's standings are the reveal. This is what lets people compete without
a live race — nobody can watch your timer, and the daily podium is published
once, the morning after.

The `Standings` page shows yesterday's podium (top 3 by points, with a short
generated taunt line) and the overall leaderboard.

**The trophy chamber** (`/chamber`) is the personal half of the social layer.
Trophies are **derived, never stored**: `src/utils/trophies.ts` recomputes
lifetime stats (best hold, streaks, days, sessions) from the projected ops on
every render, and each `TROPHIES` entry is a pure `value(stats) >= target`
check — so a reset or a fresh device converges to the exact same earned set.
What *is* synced is only the **decoration**: the `trophyCase` op holds the
chosen `background` theme and the shelf layout.

The shelf is a **free-form canvas**: tap an item to pick it up, tap the
shelf to place it at that spot, drag placed items to move them, tap one to
select it and ✕ to remove it. Items may **overlap** — the shelf is a little
diorama, not a grid — with a total cap of 24 placed items. Positions are
stored as 0–100 percent of the shelf, so the layout scales with the screen.
Trophies render as the big shelf pieces, decorations as the small ones (a
client-side size tier on `itemFor`, not part of the stored layout). An item
can be **grown to 2×** with a double-tap (`size: 2` in the stored layout);
a grown item draws twice its points from the value cap, so growing is
blocked while the budget would be exceeded, and shrinking it back frees the
capacity again.
Besides the nine earned trophies there is a set of **free decorations**
(`FREE_ITEMS` — gems, plants, candles, …) with no achievement attached. The
UI only ever offers earned trophies, and unknown item ids (from a newer
build) are kept in the layout but render empty, never fatal. Like `profile`,
a `reset` never clears the trophy case — it is preference, not progress.

**Shelf points** add scarcity on top of the free canvas. Each completed
stretch session earns 20 points (`SESSION_POINTS`), and the shelf is a
**value cap**: the total cost of the placed items may never exceed the
points earned, so a fresh account starts with an empty shelf and grows it
session by session. Removing an item frees its capacity again. Points and
costs are pure derivations — the points come from the session count, the
costs from a client-side table on `FREE_ITEMS` (10 → 1000 across 12 items,
topped by the ruby) — so no new entity or op exists, the server never
validates costs, and every device converges on the same budget. Trophies
stay free (achievements are earned, not bought), and a `reset` keeps the
shelf but resets the budget with it, since the sessions that earned the
points are gone.

**Titles** (Iron, On Fire, Finisher, …) are the same idea at name scale:
`titleFor(stats)` picks the highest-precedence title the stats earn. They are
derived, never stored — in the squad views each member's title is computed
from their revealed holds in the feed (their sessions are not in the feed, so
session-based checks simply never apply there), and in the chamber your title
comes from your full lifetime stats.

## Client: journal, projections, and a sync round

All app mutations go through `src/sync/record.ts`, which in one transaction:

1. appends the new op(s) to the local journal (`stretch.journal` in
   localStorage, hlc-ordered, deduped by id);
2. projects `replay(legacy, journal)` into the **projection blobs** the UI
   reads (one per challenge + `completedSessions` + `settings`);
3. schedules a sync round (only when a token exists — a fresh device waits for
   the app-level bootstrap).

The UI never touches the journal; it reads blobs and listens for the
`stretch:data` event, which a sync round fires after absorbing remote ops
(same-tab refresh; cross-tab comes via the `storage` event).

A **sync round** (`src/sync/useSyncStore.ts`):

```
freeze legacy base (once)
convert frozen legacy base to ops (once, see migration)
ensure a device token (bootstrap when the account has none)
push the whole local journal          <- idempotent, safe to retry
pull the account's FULL journal       <- no cursor, see below
merge unseen remote ops (by id) -> re-project -> dispatch "stretch:data"
```

Pushing **before** pulling means a pull that races a local edit still sees the
local edit. The client pulls a **full snapshot, not a tail**: with skewed wall
clocks a `since` cursor can skip ops that arrive out of order, and the
journals are small enough that a snapshot is simpler and always correct.
(The server still supports `since`.)

**Error handling:**

- **400 push** — the server rejects the whole batch and returns the offending
  op ids. The client **quarantines** them (`stretch.rejected`, removed from
  the journal so they stop re-pushing and drop out of the projection) and
  re-pushes the rest.
- **401** — the token died server-side (revoked, or the account's tokens were
  reset). The client drops its token and retries once: bootstrap succeeds when
  the account has no live tokens (this device becomes the owner) and fails
  with the pairing-code hint otherwise.
- **Network failure** — `lastError` surfaces in the Sync card; nothing local
  is lost, the next round retries.

## Legacy migration (pre-sync data)

Progress recorded before the sync build existed lived only in localStorage.
On first use the device **freezes** it once into `stretch.legacy`
(`freezeLegacyIfNeeded`) — the base layer of every local replay. On the first
sync round, `migrate.ts` converts that frozen base into real journal ops:

- op ids are **content-derived and deterministic**
  (`legacy-plank-2026-01-02-150`, …), so re-running the migration — or two
  devices migrating their own copies of the same data — converges via the
  normal dedupe/max/LWW rules instead of duplicating;
- each op's hlc is stamped with **the data's own time** (local noon of the
  date; `timeMs 0` for the settings layer, which must stay the oldest), so
  migrated history sorts where it happened, ahead of everything recorded
  after the upgrade.

## Server

`server/syncDb.ts` + `server/api.ts`. SQLite (WAL), layout:

```
ops(user_id, op_id, hlc, device, entity, entity_id, kind, data, created_at)
    PRIMARY KEY (user_id, op_id)  -> push is INSERT OR IGNORE (idempotent)
    INDEX (user_id, hlc)          -> ordered pulls

tokens(token PK, user_id, role, label, created_at, last_seen_at, revoked_at)
pair_codes(code PK, user_id, role, created_at, expires_at, redeemed_at)
squads(id PK, name UNIQUE)
squad_members(squad_id, account_id)  PRIMARY KEY (squad_id, account_id)
```

`squads`/`squad_members` are the one piece of the social layer that lives
outside the op journals: plain server-side rows, writable only by the admin
CLI (no endpoint mutates them), read by `/api/social/squads` and used to
scope `/api/social/standings` to a squad's members.

A push of an op id the server already has is a no-op; the same id with a
*different* payload is reported as a **conflict** (a client bug worth seeing
in the response, not an error state).

### Anti-cheat validation (`validateStretchOp`)

Every op must be plausible before anything is stored; a batch with one bad op
is rejected **whole** (the app only ever pushes what its timers actually
produced). Backdated records are deliberately allowed — the legacy migration
and the admin CLI legitimately record old days. What is refused:

| op | rules |
| -- | ----- |
| all  | `hlc` matches `^[0-9a-z]{19}$`; entity/kind known; `id`/`entityId` ≤ 64 chars; `data` a plain object; ≤ 1000 ops per push |
| `plankDay` | real calendar date, **not in the future**; `seconds` an integer 1–3600; hlc time ≥ start of that day − 1 h (clock skew); `challengeId` (when present) a known sync id |
| `challenge` | `entityId` a known sync id; `startedAt` a real date; a **future** start only for cohort ids, and only ≤ 60 days ahead |
| `session` | `duration` integer 1–14400 s; `completedAt` parseable and not > 5 min in the future (old sessions allowed) |
| `settings` | `entityId "app"`, `kind "patch"`, known fields only (`theme`, `soundEnabled`, `hapticEnabled`) |
| `profile`  | `entityId "me"`, `kind "patch"`, known fields only; `name` a string ≤ 24, `avatar` a string ≤ 8, at least one field |
| `trophyCase` | `entityId "me"`, `kind "patch"`, known fields only; `background` a string 1–24, `items` an array (max 24) of `{ item: string 1–24, x: number 0–100, y: number 0–100, size?: 1 | 2 }`; the legacy `slots` field (null or strings 1–24, max 16) is still accepted for normalization; at least one field |
| `reset`  | `entityId "all"`, `kind "create"` |

Rate limits: anonymous endpoints 10/min per IP, authenticated 600/h per
token, health 60/min per IP. Bodies cap at 1 MB.

## Identity and tokens

- **Account id** — UUIDv4, generated once per browser profile
  (`stretch.userId`). It addresses the journal; presenting it does nothing
  unless the account has zero active tokens.
- **Bootstrap** (`POST /api/sync/bootstrap`) — an account with no active
  tokens mints its first device token, role `owner`, from its account id.
  This is the fresh-install path *and* the recovery path when all tokens are
  lost. Returns 409 while the account has active tokens (→ use a pairing
  code instead).
- **Pairing** — the owner mints a 16-hex code (`POST /api/sync/pair`, 5-min
  TTL, single-use). A new device redeems it anonymously
  (`POST /api/sync/pair/redeem`) and receives its own token (role
  `secondary`) plus the account id. A leaked code expires in five minutes.
- **Roles** — `owner` (the bootstrap mint) may link devices and revoke the
  others; `secondary` syncs but cannot. Roles are minted, never escalated.
- **Token lifecycle** — `reissue` rotates the calling device's token (old one
  revoked, role preserved); `revoke-others` (owner only) signs out every
  device but the caller; `revoke-self` signs out this device. Signing out
  never touches the journal — ops belong to the account, not the token.
- Auth is `Authorization: Bearer <token>` (RFC 6750) on every endpoint except
  `health`, `bootstrap`, and `pair/redeem`.

## Endpoints

| endpoint | auth | what it does |
| -------- | ---- | ------------ |
| `GET /api/health` | — | liveness |
| `POST /api/sync/push` | token | validate + store a batch of ops (idempotent); 400 + `invalid[]` when any op is implausible |
| `POST /api/sync/pull` | token | the account's full journal (or a `since` tail), ordered by hlc |
| `POST /api/sync/pair` | owner | mint a one-time pairing code |
| `POST /api/sync/pair/redeem` | — (rate-limited) | exchange a code for a token + account id |
| `POST /api/sync/bootstrap` | — (rate-limited) | first/recovery token from the account id |
| `POST /api/sync/token/reissue` | token | rotate this device's token |
| `POST /api/sync/token/revoke-others` | owner | sign out all other devices |
| `POST /api/sync/token/revoke-self` | token | sign out this device |
| `GET /api/social/squads` | token | the caller's squads (`{ squads: [{ id, name }] }`) — what gates the Squad/Chamber nav tabs |
| `GET /api/social/standings?challenge=<syncId>&squad=<squadId>` | token (squad member) | one squad's raw feed for one challenge: per member, the LWW profile, the LWW challenge start, and the best hold per day — **never including today or future dates** (the quiet-day rule, see below). 400 without a squad, 403 for non-members |

## Convergence, in one paragraph

Ops are immutable and idempotent (deduped by `id`), sync is just exchanging
unseen ops, and every merge rule is a commutative fold — max per day,
last-write-wins per hlc (per field for `settings`/`profile`/`trophyCase`),
set-union of sessions — so any two devices that have both seen the same op
set project byte-identical state, no matter in what order the ops arrived or
which clocks were skewed.

## Versioning caveats

- An **old app build** has no `challengeId` concept: its replay funnels every
  `plankDay` op into the single legacy challenge (max per day — so days
  copied between challenges are not double-counted), and every `challenge`
  op into one last-write-wins `startedAt` slot, **ignoring the entity id**.
  Consequences for the 2026-10 hand-over:
  - the start ops are pushed **incoming first, outgoing last**, so the old
    device's effective start is the outgoing cohort's in-progress date and
    its running user sees their current challenge;
  - `plank-max`-only days (e.g. a short test hold) surface on the old
    device as extra legacy days — a short hold below the base just reads as
    a missed day, cosmetic;
  - once the outgoing window closes, the old device shows the finished
    challenge until it updates; the new build must be deployed before the
    incoming cohort opens or the device never sees it (the old config has no
    `plank-max`).
  All devices on an account should run the new build as soon as possible
  regardless — stale devices self-heal on update (the journal is the source
  of truth, and stale devices never write bad ops back).
- An **old server build** accepts new `plankDay` ops (extra `data` fields are
  ignored) but rejects `challenge` ops for any id but `"plank"`. Deploy the
  server before using the admin CLI's `--challenge` against it.
- The social entities (`profile`, `trophyCase`) are the newest ops. An
  **old app build** ignores them on replay (unknown entity → skipped, not
  fatal), so a stale device simply shows no squad identity or chamber until it
  updates. An **old server build** rejects them as unknown entities, so a new
  device cannot push its profile/case to it — deploy the server before the
  first `profile`/`trophyCase` op. Neither breaks progress: the core
  `plankDay`/`challenge`/`session` ops are unchanged.
