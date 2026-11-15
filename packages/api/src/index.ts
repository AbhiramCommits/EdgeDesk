import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./env";
import { AgentRunDO } from "./do/AgentRunDO";

export { AgentRunDO };

const app = new Hono<AppEnv>();

app.use(
  "/api/*",
  cors({
    origin: (origin) =>
      origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ? origin
        : "http://localhost:5173",
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Cookie"],
    credentials: true,
    maxAge: 600,
  }),
);

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    version: c.env.APP_VERSION ?? "0.1.0",
    ...(c.env.GIT_COMMIT ? { commit: c.env.GIT_COMMIT } : {}),
    bindings: ["DB", "SESSIONS", "AGENT_RUNS"],
  });
});

app.notFound((c) =>
  c.json({ error: { code: "not_found", message: "Route not found" } }, 404),
);

app.onError((err, c) => {
  console.error("unhandled error", err);
  return c.json(
    { error: { code: "internal_error", message: "An unexpected error occurred" } },
    500,
  );
});

export default app;
