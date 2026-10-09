import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApiApp } from './api.js';

// Anchor the default static dir to the repo layout, NOT to process.cwd():
// pm2 keeps the cwd of whenever the process was first started, so a
// cwd-relative path would silently serve a stale dist/ from elsewhere.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Build the production HTTP app: the static dist/ build plus the sync
 * API. `db` (via createApiApp options) is injectable for tests;
 * `staticDir` defaults to <repo>/dist next to server/.
 */
export function createApp(options = {}) {
  const app = express();
  const { api, db } = createApiApp(options);
  const staticDir = options.staticDir ?? path.join(__dirname, '..', 'dist');

  app.use((_, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    // HSTS only takes effect behind the TLS front; browsers ignore it on
    // plain HTTP, so it is harmless in dev.
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // One line per request for abuse forensics. No client IP on purpose:
  // the auth layer already logs IPs for the security-relevant events
  // (401/429), and an always-on IP log is personal-data overhead.
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      console.log(`[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
    next();
  });

  app.use(express.static(staticDir));
  app.use('/api', api);

  app.use((_, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });

  return { app, db };
}
