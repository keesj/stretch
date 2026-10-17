# Stretch

A calm, mobile-first PWA for guided stretching routines and the 30-day plank
challenge. React 19 + TypeScript + Vite, Tailwind CSS, zustand. Progress
syncs across devices through a small op-journal protocol with a dumb
SQLite-backed sync server (Express).

## Documentation

- [docs/sync-protocol.md](docs/sync-protocol.md) — how multi-device sync
  works: ops, the hybrid logical clock, replay semantics, identity and
  tokens, server validation, legacy migration, and versioning caveats.
- [docs/cli.md](docs/cli.md) — the admin CLI (`node server/cli.ts`):
  inspecting accounts and recording plank days or challenge start dates.
- [docs/pose-tool.md](docs/pose-tool.md) — how the exercise figures in
  `StretchAnimation.tsx` are generated from video with MediaPipe.

## Development

```
npm install
npm run dev        # app + sync API in one process (localhost, no second server)
npm run test:run   # vitest: client + server + e2e
npm run lint       # oxlint
npm run build      # tsc -b && vite build
```

The Vite dev server mounts the sync API in-process, so a fresh `npm run dev`
needs no second node process. Production runs `npm start` (`node server.ts`,
pm2), which serves the built app from `dist/` plus the API on `PORT`
(default 3021) behind a TLS front; data lives in `DATA_DIR`
(default `~/.stretch/data`).

The server is plain TypeScript run natively by Node's type stripping
(≥ 22.18; use `npm start`, not a bundler): imports carry explicit `.ts`
extensions and the code sticks to erasable syntax only (no enums, no
parameter properties). `tsconfig.server.json` typechecks it; the tests
under `server/*.test.ts` cover it the same way as the client.

## Adding content

Content lives in three hand-edited JSON files under `src/data/`, each
validated at import time by `src/data/validate.ts` (strict: unknown fields
are rejected as typo-catching, and cross-references must resolve). A bad
file fails the app and the test suite immediately, with a message naming
the offending entry.

Checklist:

- **A stretch** — add an entry to `stretches.json` (`id`, `title`,
  `duration`, `instructions`, `bodyParts`, `difficulty`, `illustration`;
  optional `animation` and `side`). Animation figures are generated with
  the pose tool (docs/pose-tool.md).
- **A routine** — add an entry to `routines.json` referencing existing
  stretch ids (validated against `stretches.json`).
- **A challenge** — add an entry to `challenges.json`: the shared base
  fields plus the fields of its scoring variant (`threshold`: bonus and
  milestone fields; `duration`: `basePoints`, `incrementSeconds`,
  `incrementPoints`, `maxSeconds`). A `startDate` makes it a cohort
  challenge (everyone opens on the shared date; the admin CLI may record
  that start date in advance, up to 60 days ahead). The sync server
  derives its challenge allowlists from the same file, so no server change
  is needed — the new `syncId` is accepted the moment the app ships with it.
- **A trophy / shelf item** — these are code, not JSON: the `TROPHIES` and
  `FREE_ITEMS` constants in `src/utils/trophies.ts`.

Then run `npm run test:run` — the import-time validation and the existing
tests are the safety net.

## Layout

```
src/            React app
  sync/         client side of the protocol (journal, replay, sync store)
  data/         routines, stretches, challenges (challenge config is here)
server/         Express sync API, SQLite store, admin CLI (TypeScript)
docs/           protocol, CLI, and tooling documentation
```
