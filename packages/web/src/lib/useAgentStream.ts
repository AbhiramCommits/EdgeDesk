import { useEffect, useRef, useState } from "react";
import {
  agentRunStatusSchema,
  agentSnapshotSchema,
  agentStepSchema,
  type AgentSnapshot,
  type AgentStep,
} from "shared";
import { z } from "zod";
import { api } from "./api";

const donePayloadSchema = z.object({
  runId: z.string(),
  status: agentRunStatusSchema,
  durationMs: z.number().int().nonnegative().nullable(),
});

export interface AgentStreamState {
  snapshot: AgentSnapshot | null;
  steps: AgentStep[];
  done: boolean;
  error: string | null;
}

/**
 * Subscribes to the Worker's SSE endpoint. The Durable Object replays existing
 * steps first, so a client that connects after the run completed still gets the
 * full timeline plus a terminal `done` event.
 */
export function useAgentStream(requestId: string | null, onDone?: () => void): AgentStreamState {
  const [snapshot, setSnapshot] = useState<AgentSnapshot | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!requestId) {
      setSnapshot(null);
      setSteps([]);
      setDone(false);
      setError(null);
      return;
    }

    let cancelled = false;
    let finished = false;
    setSnapshot(null);
    setSteps([]);
    setDone(false);
    setError(null);

    const source = new EventSource(api.streamUrl(requestId), { withCredentials: true });

    const mergeStep = (step: AgentStep) => {
      setSteps((current) => {
        if (current.some((existing) => existing.id === step.id)) return current;
        return [...current, step].sort((a, b) => a.seq - b.seq);
      });
    };

    source.addEventListener("snapshot", (event) => {
      if (cancelled) return;
      const parsed = agentSnapshotSchema.safeParse(JSON.parse((event as MessageEvent<string>).data));
      if (!parsed.success) return;
      setSnapshot(parsed.data);
      setSteps(parsed.data.steps);
      if (parsed.data.done) {
        finished = true;
        setDone(true);
        source.close();
        onDoneRef.current?.();
      }
    });

    source.addEventListener("step", (event) => {
      if (cancelled) return;
      const parsed = agentStepSchema.safeParse(JSON.parse((event as MessageEvent<string>).data));
      if (parsed.success) mergeStep(parsed.data);
    });

    source.addEventListener("done", (event) => {
      if (cancelled) return;
      const parsed = donePayloadSchema.safeParse(
        JSON.parse((event as MessageEvent<string>).data),
      );
      if (parsed.success) {
        setSnapshot((current) =>
          current
            ? {
                ...current,
                status: parsed.data.status,
                done: true,
                durationMs: parsed.data.durationMs,
              }
            : current,
        );
      }
      finished = true;
      setDone(true);
      source.close();
      onDoneRef.current?.();
    });

    source.addEventListener("error", (event) => {
      if (cancelled || finished) return;
      const message = (event as MessageEvent<string>).data;
      if (typeof message === "string" && message.length > 0) {
        setError(message);
      } else {
        setError("Live agent stream disconnected. Reload to retry.");
      }
      source.close();
      void api
        .getRun(requestId)
        .then((run) => {
          if (cancelled) return;
          setSnapshot(run);
          setSteps(run.steps);
          setDone(run.done);
        })
        .catch(() => {
          // Keep the error message; the page still shows the persisted steps.
        });
    });

    return () => {
      cancelled = true;
      source.close();
    };
  }, [requestId]);

  return { snapshot, steps, done, error };
}
