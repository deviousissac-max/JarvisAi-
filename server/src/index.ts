import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { config } from "./config.js";
import { errorHandler, auth as authMiddleware, rateLimit } from "./middleware.js";
import router from "./routes/index.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((_req, res, next) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Permissions-Policy", "microphone=(self)");
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit(120, 60_000), authMiddleware, router);

const dist = path.resolve("../app/dist");
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: "1h", index: false }));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use(errorHandler);

const missing = [
  !config.groqKey && "GROQ_API_KEY",
  (!config.fishKey || !config.fishModelId) && "FISH_AUDIO_API_KEY / FISH_AUDIO_MODEL_ID",
].filter(Boolean);

app.listen(config.port, () => console.log(
  `[JARVIS] server on :${config.port} (${missing.length ? "MISSING CONFIG: " + missing.join(", ") : "all configured"})`
));
