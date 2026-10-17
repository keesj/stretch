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
needs no second node process. Production runs `server.ts` (pm2, Node ≥ 22.18 runs the TypeScript directly), which serves
the built app from `dist/` plus the API on `PORT` (default 3021) behind a TLS
front; data lives in `DATA_DIR` (default `~/.stretch/data`).

## Layout

```
src/            React app
  sync/         client side of the protocol (journal, replay, sync store)
  data/         routines, stretches, challenges (challenge config is here)
server/         Express sync API, SQLite store, admin CLI
docs/           protocol, CLI, and tooling documentation
```
