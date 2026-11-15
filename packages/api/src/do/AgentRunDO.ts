import {
  agentStepSchema,
  type AgentRunStatus,
  type AgentSnapshot,
  type AgentStep,
} from "shared";
import type { Env } from "../env";

interface StoredState {
  requestId: string | null;
  runId: string | null;
  status: AgentRunStatus;
  steps: AgentStep[];
  durationMs: number | null;
  done: boolean;
  error: string | null;
}

const STATE_KEY = "agent-run-state";

function emptyState(): StoredState {
  return {
    requestId: null,
    runId: null,
    status: "queued",
    steps: [],
    durationMs: null,
    done: false,
    error: null,
  };
}

function toSnapshot(state: StoredState): AgentSnapshot {
  return {
    requestId: state.requestId ?? "",
    runId: state.runId,
    status: state.status,
    done: state.done,
    steps: state.steps,
    durationMs: state.durationMs,
  };
}

interface StartBody {
  requestId: string;
  runId: string;
}

interface StepBody {
  step: AgentStep;
}

interface FinishBody {
  status: AgentRunStatus;
  durationMs: number;
  error?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * One Durable Object instance per request id. Holds the in-flight agent run
 * state so clients can poll (GET /state) or stream (GET /stream) live progress
 * while the Worker writes D1 in the background.
 */
export class AgentRunDO implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    void this.env;
  }

  private async read(): Promise<StoredState> {
    const stored = await this.state.storage.get<StoredState>(STATE_KEY);
    return stored ?? emptyState();
  }

  private async write(state: StoredState): Promise<StoredState> {
    await this.state.storage.put(STATE_KEY, state);
    return state;
  }

  async start(requestId: string, runId: string): Promise<AgentSnapshot> {
    const existing = await this.read();
    if (existing.runId === runId) return toSnapshot(existing);
    const next: StoredState = {
      requestId,
      runId,
      status: "running",
      steps: [],
      durationMs: null,
      done: false,
      error: null,
    };
    return toSnapshot(await this.write(next));
  }

  async appendStep(step: AgentStep): Promise<AgentSnapshot> {
    const current = await this.read();
    if (current.steps.some((candidate) => candidate.id === step.id)) {
      return toSnapshot(current);
    }
    const steps = [...current.steps, step].sort((a, b) => a.seq - b.seq);
    const next: StoredState = { ...current, steps };
    return toSnapshot(await this.write(next));
  }

  async finish(status: AgentRunStatus, durationMs: number, error?: string): Promise<AgentSnapshot> {
    const current = await this.read();
    const next: StoredState = {
      ...current,
      status,
      durationMs,
      done: true,
      error: error ?? null,
    };
    return toSnapshot(await this.write(next));
  }

  async snapshot(): Promise<AgentSnapshot> {
    return toSnapshot(await this.read());
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "GET" && path === "/state") {
      return json(await this.snapshot());
    }

    if (request.method === "POST" && path === "/start") {
      const body = (await request.json()) as StartBody;
      if (typeof body.requestId !== "string" || typeof body.runId !== "string") {
        return json({ error: "requestId and runId are required" }, 400);
      }
      return json(await this.start(body.requestId, body.runId));
    }

    if (request.method === "POST" && path === "/step") {
      const body = (await request.json()) as StepBody;
      const parsed = agentStepSchema.safeParse(body.step);
      if (!parsed.success) {
        return json({ error: "invalid step", details: parsed.error.flatten() }, 400);
      }
      return json(await this.appendStep(parsed.data));
    }

    if (request.method === "POST" && path === "/finish") {
      const body = (await request.json()) as FinishBody;
      return json(await this.finish(body.status, body.durationMs, body.error));
    }

    if (request.method === "GET" && path === "/stream") {
      return this.stream();
    }

    return json({ error: "not found" }, 404);
  }

  /**
   * Server-Sent Events sourced from the DO's own storage. Polls every 120ms so
   * the stream reflects steps appended by the concurrently running agent.
   */
  private stream(): Response {
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
            const snap = await this.snapshot();
            if (!sentSnapshot) {
              send("snapshot", snap);
              sentSnapshot = true;
            }
            for (const step of snap.steps) {
              if (step.seq > lastSeq) {
                send("step", step);
                lastSeq = step.seq;
              }
            }
            if (snap.done) {
              send("done", {
                runId: snap.runId ?? "",
                status: snap.status,
                durationMs: snap.durationMs,
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
            }, 120);
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
}
