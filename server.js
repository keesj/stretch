import { createApp } from "./server/app.js";

const { app, db } = createApp();
const PORT = process.env.PORT || 3021;
// Loopback by default: a TLS front (haproxy/nginx/caddy) on the same host
// is the only thing that should reach the API. A public bind would expose
// it over plaintext HTTP. Set HOST=0.0.0.0 only if the proxy runs
// elsewhere.
const HOST = process.env.HOST || "127.0.0.1";

const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});

// pm2 sends SIGINT on stop/restart; close the database before exiting.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
