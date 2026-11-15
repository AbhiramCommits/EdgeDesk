import { Hono } from "hono";
import { agentSnapshotSchema, type AgentSnapshot } from "shared";
import { requireAuth } from "../auth";
import { getLatestAgentRun, getRequest, listAgentSteps } from "../db/repo";
import type { AppEnv, Env } from "../env";
import { ApiError } from "../lib/errors";

export const agentRoutes = new Hono<AppEnv>();

agentRoutes.use("*", requireAuth);

function isTerminal(snapshot: AgentSnapshot): boolean {
  return snapshot.status === "finished" || snapshot.status === "failed";
}

async function dbSnapshot(env: Env, requestId: string): Promise<AgentSnapshot | null> {
  const run = await getLatestAgentRun(env.DB, requestId);
  if (!run) return null;
  const steps = await listAgentSteps(env.DB, run.id);
  return {
    requestId,
    runId: run.id,
    status: run.status,
    done: run.status === "finished" || run.status === "failed",
    steps,
    durationMs: run.durationMs,
  };
}

async function liveSnapshot(env: Env, requestId: string): Promise<AgentSnapshot | null> {
  const id = env.AGENT_RUNS.idFromName(requestId);
  const stub = env.AGENT_RUNS.get(id);
  const res = await stub.fetch("https://agent-run/state");
  if (res.ok) {
    const parsed = agentSnapshotSchema.safeParse(await res.json());
    if (parsed.success && parsed.data.runId !== null) {
      return parsed.data;
    }
  }
  return dbSnapshot(env, requestId);
}

agentRoutes.get("/:id/run", async (c) => {
  const id = c.req.param("id");
  const request = await getRequest(c.env.DB, id);
  if (!request) throw ApiError.notFound("Request not found");
  const snapshot = await liveSnapshot(c.env, id);
  if (!snapshot) throw ApiError.notFound("No agent run exists for this request");
  return c.json(snapshot);
});

/**
 * SSE fallback for runs whose Durable Object state is unavailable (for
 * example, a local state reset). It polls D1 and replays steps as events.
 */
function dbSse(env: Env, requestId: string): Response {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      let lastSeq = -1;
      let sentSnapshot = false;
      const deadline = Date.now() + 30_000;
      const send = (event: string, data: unknown): void => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const tick = async (): Promise<void> => {
        if (cancelled) return;
        try {
          const snapshot = await dbSnapshot(env, requestId);
          if (!snapshot) {
            send("error", { message: "No agent run exists for this request" });
            controller.close();
            return;
          }
          if (!sentSnapshot) {
            send("snapshot", snapshot);
            sentSnapshot = true;
          }
          for (const step of snapshot.steps) {
            if (step.seq > lastSeq) {
              send("step", step);
              lastSeq = step.seq;
            }
          }
          if (isTerminal(snapshot)) {
            send("done", {
              runId: snapshot.runId ?? "",
              status: snapshot.status,
              durationMs: snapshot.durationMs,
            });
            controller.close();
            return;
          }
          if (Date.now() > deadline) {
            send("error", { message: "Timed out waiting for the agent run" });
            controller.close();
            return;
          }
          timer = setTimeout(() => {
            void tick();
          }, 150);
        } catch (error) {
          send("error", {
            message: error instanceof Error ? error.message : String(error),
          });
          controller.close();
        }
      };

      void tick();
    },
    cancel: () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

agentRoutes.get("/:id/run/stream", async (c) => {
  const id = c.req.param("id");
  const request = await getRequest(c.env.DB, id);
  if (!request) throw ApiError.notFound("Request not found");

  const run = await getLatestAgentRun(c.env.DB, id);
  if (!run) throw ApiError.notFound("No agent run exists for this request");

  const doId = c.env.AGENT_RUNS.idFromName(id);
  const stub = c.env.AGENT_RUNS.get(doId);
  const stateRes = await stub.fetch("https://agent-run/state");
  if (stateRes.ok) {
    const parsed = agentSnapshotSchema.safeParse(await stateRes.json());
    if (parsed.success && parsed.data.runId !== null) {
      const sse = await stub.fetch("https://agent-run/stream");
      return new Response(sse.body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          "x-accel-buffering": "no",
        },
      });
    }
  }

  return dbSse(c.env, id);
});

