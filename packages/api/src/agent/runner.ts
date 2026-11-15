import {
  type AgentRun,
  type AgentStep,
  type Request,
  type RequestCategory,
  type RequestPriority,
} from "shared";
import { z } from "zod";
import {
  applyTriageOutcome,
  finishAgentRun,
  getAgentRun,
  getLatestAgentRun,
  getRequest,
  insertAgentRun,
  insertAgentStep,
  insertAuditEvent,
  listAgentSteps,
  markAgentRunRunning,
} from "../db/repo";
import type { Env } from "../env";
import { nowIso } from "../lib/time";
import { callTool, type ToolContext, type ToolResult } from "./tools";
import { triage } from "./triage";

/* ------------------------------------------------------------------ */
/* Output shapes (defensive validation of tool output in the runner)   */
/* ------------------------------------------------------------------ */

const classifyOutSchema = z.object({
  category: z.enum(["equipment", "onboarding", "policy", "access", "payroll", "other"]),
  priority: z.enum(["p0", "p1", "p2", "p3"]),
  confidence: z.number().min(0).max(1),
  signals: z.object({
    fallback: z.boolean(),
    margin: z.number(),
    topTerms: z.array(z.string()),
  }),
});

const priorityOutSchema = z.object({
  priority: z.enum(["p0", "p1", "p2", "p3"]),
  dueAt: z.string(),
  slaHours: z.number().positive(),
  rationale: z.array(z.string()),
});

const assignOutSchema = z.object({
  assigneeId: z.string(),
  assigneeName: z.string(),
  strategy: z.literal("round-robin"),
  slot: z.number().int().nonnegative(),
});

const draftOutSchema = z.object({
  draft: z.string().min(20),
  citations: z.array(z.object({ id: z.string(), title: z.string() })),
});

interface ToolRun {
  result: ToolResult;
  output: unknown;
}

async function getRunStub(env: Env, requestId: string) {
  const id = env.AGENT_RUNS.idFromName(requestId);
  return env.AGENT_RUNS.get(id);
}

async function doPost(
  stub: DurableObjectStub,
  path: string,
  body: unknown,
): Promise<void> {
  const res = await stub.fetch(`https://agent-run${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`AgentRunDO ${path} failed with ${res.status}`);
  }
}

export interface AgentRunResult {
  run: AgentRun;
  steps: AgentStep[];
  request: Request;
  reused: boolean;
}

/**
 * Creates the queued run row synchronously so the HTTP response can hand back a
 * run id. The caller then schedules runAgent() with waitUntil().
 */
export async function kickoffAgentRun(requestId: string, env: Env): Promise<string> {
  const run = await insertAgentRun(env.DB, { requestId, status: "queued" });
  return run.id;
}

/**
 * Executes the deterministic triage agent. Idempotent per request: if a
 * finished run already exists it is returned untouched.
 */
export async function runAgent(
  requestId: string,
  env: Env,
  runId?: string,
): Promise<AgentRunResult> {
  const request = await getRequest(env.DB, requestId);
  if (!request) throw new Error(`Request ${requestId} not found`);

  const latest = await getLatestAgentRun(env.DB, requestId);
  if (latest && latest.status === "finished") {
    return {
      run: latest,
      steps: await listAgentSteps(env.DB, latest.id),
      request,
      reused: true,
    };
  }

  let run: AgentRun | null = null;
  if (runId) run = await getAgentRun(env.DB, runId);
  if (!run && latest && latest.status !== "finished") run = latest;
  if (!run) run = await insertAgentRun(env.DB, { requestId, status: "running" });

  if (run.status === "finished") {
    return {
      run,
      steps: await listAgentSteps(env.DB, run.id),
      request,
      reused: true,
    };
  }

  const activeRun: AgentRun = run;
  const startedAt = activeRun.startedAt ?? nowIso();
  await markAgentRunRunning(env.DB, activeRun.id, startedAt);

  const stub = await getRunStub(env, requestId);
  await doPost(stub, "/start", { requestId, runId: activeRun.id });

  const text = `${request.title}\n${request.body}`;
  const ctx: ToolContext = { env, request, nowIso: startedAt };
  const steps: AgentStep[] = [];
  let seq = 0;

  const recordStep = async (
    kind: AgentStep["kind"],
    toolName: string | null,
    input: unknown,
    output: unknown,
    ms: number,
  ): Promise<AgentStep> => {
    seq += 1;
    const step = await insertAgentStep(env.DB, {
      runId: activeRun.id,
      seq,
      kind,
      toolName,
      input,
      output,
      ms,
    });
    steps.push(step);
    await doPost(stub, "/step", { step });
    return step;
  };

  const execTool = async (name: string, input: unknown): Promise<ToolRun> => {
    const result = await callTool(name, input, ctx);
    await recordStep(
      result.ok ? "tool" : "error",
      name,
      input,
      result.ok ? result.output : result.error,
      result.ms,
    );
    return { result, output: result.output };
  };

  try {
    // 1. Classify first, then plan the rest of the tool sequence from it.
    const classifyRun = await execTool("classify_request", { text });
    if (!classifyRun.result.ok) {
      throw new Error(
        `classify_request failed: ${classifyRun.result.error?.message ?? "unknown error"}`,
      );
    }
    const classified = classifyOutSchema.parse(classifyRun.output);

    const plannedTools = [
      "classify_request",
      "estimate_priority",
      "search_policy_kb",
      ...(classified.category === "equipment" ? ["check_equipment_stock"] : []),
      "assign_owner",
      "post_resolution_draft",
    ];
    await recordStep(
      "plan",
      null,
      { requestId, category: classified.category },
      { tools: plannedTools, rationale: "category-driven deterministic plan" },
      0,
    );

    // 2. Priority + SLA.
    const priorityRun = await execTool("estimate_priority", {
      text,
      category: classified.category,
    });
    const priorityOutput = priorityRun.result.ok
      ? priorityOutSchema.safeParse(priorityRun.output)
      : null;
    const priority: RequestPriority =
      priorityOutput?.success ? priorityOutput.data.priority : triage(text).priority;
    const dueAt = priorityOutput?.success
      ? priorityOutput.data.dueAt
      : new Date(Date.parse(startedAt) + 72 * 3_600_000).toISOString();

    // 3. Policy knowledge base retrieval.
    await execTool("search_policy_kb", {
      query: text,
      category: classified.category,
      limit: 3,
    });

    // 4. Inventory check only for equipment requests.
    if (classified.category === "equipment") {
      await execTool("check_equipment_stock", {
        item: request.title.slice(0, 160),
        quantity: 1,
      });
    }

    // 5. Owner assignment (writes D1 inside the tool).
    const assignRun = await execTool("assign_owner", { category: classified.category });
    const assignParsed = assignRun.result.ok
      ? assignOutSchema.safeParse(assignRun.output)
      : null;
    const assignee = assignParsed?.success ? assignParsed.data : null;

    // 6. Draft reply from KB snippets + request context.
    const draftRun = await execTool("post_resolution_draft", {
      category: classified.category,
      title: request.title.slice(0, 300),
      body: request.body.slice(0, 8000),
    });
    const draftParsed = draftRun.result.ok
      ? draftOutSchema.safeParse(draftRun.output)
      : null;

    // 7. Write the structured outcome back to the request row.
    const nextStatus =
      request.status === "new" || request.status === "triaging"
        ? "in_progress"
        : request.status;
    const updatedRequest = await applyTriageOutcome(env.DB, requestId, {
      category: classified.category,
      priority,
      assigneeId: assignee?.assigneeId ?? request.assigneeId,
      dueAt,
      draftResolution: draftParsed?.success ? draftParsed.data.draft : request.draftResolution,
      status: nextStatus,
    });

    await insertAuditEvent(env.DB, {
      actor: "agent:triage",
      entityType: "request",
      entityId: requestId,
      action: "request.triaged",
      detail: {
        agentRunId: activeRun.id,
        category: classified.category,
        priority,
        confidence: classified.confidence,
        fallback: classified.signals.fallback,
        dueAt,
        topTerms: classified.signals.topTerms,
      },
    });

    if (assignee) {
      await insertAuditEvent(env.DB, {
        actor: "agent:triage",
        entityType: "request",
        entityId: requestId,
        action: "request.assigned",
        detail: {
          agentRunId: activeRun.id,
          assigneeId: assignee.assigneeId,
          assigneeName: assignee.assigneeName,
        },
      });
    }

    await recordStep(
      "outcome",
      null,
      { requestId },
      {
        category: classified.category,
        priority,
        dueAt,
        assigneeId: assignee?.assigneeId ?? null,
        draftChars: draftParsed?.success ? draftParsed.data.draft.length : 0,
      },
      0,
    );

    const durationMs = Math.max(1, Date.now() - Date.parse(startedAt));
    const finished = await finishAgentRun(env.DB, activeRun.id, {
      status: "finished",
      triageCategory: classified.category,
      triagePriority: priority,
      confidence: classified.confidence,
      durationMs,
    });
    await doPost(stub, "/finish", { status: "finished", durationMs });

    return {
      run: finished ?? activeRun,
      steps,
      request: updatedRequest ?? request,
      reused: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const durationMs = Math.max(1, Date.now() - Date.parse(startedAt));
    await recordStep("error", null, { requestId }, { message }, durationMs);
    await finishAgentRun(env.DB, activeRun.id, { status: "failed", durationMs });
    await doPost(stub, "/finish", { status: "failed", durationMs, error: message });
    await insertAuditEvent(env.DB, {
      actor: "agent:triage",
      entityType: "request",
      entityId: requestId,
      action: "agent.failed",
      detail: { agentRunId: activeRun.id, message },
    });
    throw error;
  }
}

/** Exposed for tests and the SSE fallback: the category set the agent can emit. */
export const AGENT_CATEGORIES: RequestCategory[] = [
  "equipment",
  "onboarding",
  "policy",
  "access",
  "payroll",
  "other",
];
