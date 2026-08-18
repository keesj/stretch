import express from "express";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3021;
const HOST = process.env.HOST || "127.0.0.1";

app.use(express.json());
app.use(express.static("dist"));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use((_, res) => {
  res.sendFile(path.join(process.cwd(), "dist/index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
