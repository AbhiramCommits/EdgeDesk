import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { authRoutes } from "./auth";
import { AgentRunDO } from "./do/AgentRunDO";
import type { AppEnv } from "./env";
import { ApiError } from "./lib/errors";
import { agentRoutes } from "./routes/agent";
import { requestRoutes } from "./routes/requests";

export { AgentRunDO };

const app = new Hono<AppEnv>();

app.use(
  "/api/*",
  cors({
    origin: (origin) =>
      origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ? origin
        : "http://localhost:5173",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
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

app.route("/api/auth", authRoutes);
app.route("/api/requests", requestRoutes);
app.route("/api/requests", agentRoutes);

app.notFound((c) =>
  c.json({ error: { code: "not_found", message: "Route not found" } }, 404),
);

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details === undefined ? {} : { details: err.details }),
        },
      },
      err.status as ContentfulStatusCode,
    );
  }

  if (err instanceof HTTPException) {
    return c.json(
      { error: { code: "http_error", message: err.message } },
      err.status as ContentfulStatusCode,
    );
  }

  console.error("unhandled error", err);
  return c.json(
    { error: { code: "internal_error", message: "An unexpected error occurred" } },
    500,
  );
});

export default app;
