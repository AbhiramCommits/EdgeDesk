import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import type { AgentSnapshot, AgentStep, Request } from "shared";
import { createRequest, getLatestAgentRun, getRequest, listAgentSteps } from "../src/db/repo";
import { callTool, TOOL_NAMES, type ToolContext } from "../src/agent/tools";
import { triage, TRIAGE_RULES } from "../src/agent/triage";
import { runAgent } from "../src/agent/runner";
import { nowIso } from "../src/lib/time";
import {
  createRequestAsEmployee,
  loginAs,
  request,
  resetDatabase,
  TEST_USERS,
} from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

async function rawRequest(title: string, body: string): Promise<Request> {
  return createRequest(env.DB, {
    requesterId: TEST_USERS.employee.id,
    title,
    body,
    status: "new",
  });
}

async function ctxFor(requestId: string): Promise<ToolContext> {
  const req = await getRequest(env.DB, requestId);
  if (!req) throw new Error("missing request");
  return { env, request: req, nowIso: nowIso() };
}

describe("deterministic triage engine", () => {
  it("classifies equipment text and is deterministic", () => {
    const text = "My laptop screen is cracked, I need a replacement laptop.";
    const first = triage(text);
    const second = triage(text);
    expect(first).toEqual(second);
    expect(first.category).toBe("equipment");
    expect(first.confidence).toBeGreaterThan(0.55);
    expect(first.confidence).toBeLessThanOrEqual(1);
  });

  it("classifies policy questions", () => {
    const result = triage("What is the parental leave policy?");
    expect(result.category).toBe("policy");
  });

  it("falls back to other for weak ambiguous text", () => {
    const result = triage("I have a question about something general.");
    expect(result.category).toBe("other");
    expect(result.signals.fallback).toBe(true);
  });

  it("assigns p0 to an urgent blocked request", () => {
    const result = triage("I am locked out of SSO and have a customer demo in one hour.");
    expect(result.priority).toBe("p0");
  });

  it("exports a rules table covering all six categories", () => {
    const categories = TRIAGE_RULES.categories.map((rule) => rule.category);
    expect(categories.sort()).toEqual(
      ["access", "equipment", "onboarding", "other", "payroll", "policy"],
    );
    expect(TRIAGE_RULES.priorities).toHaveLength(3);
  });
});

describe("typed tool registry", () => {
  it("classify_request returns a validated category", async () => {
    const req = await rawRequest("Broken laptop", "My laptop does not turn on.");
    const result = await callTool(
      "classify_request",
      { text: "My laptop does not turn on and I need a replacement." },
      await ctxFor(req.id),
    );
    expect(result.ok).toBe(true);
    expect((result.output as { category: string }).category).toBe("equipment");
    expect(result.ms).toBeGreaterThanOrEqual(1);
  });

  it("classify_request rejects invalid input without throwing", async () => {
    const req = await rawRequest("Broken laptop", "My laptop does not turn on.");
    const result = await callTool("classify_request", { text: "" }, await ctxFor(req.id));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });

  it("estimate_priority returns a due date and SLA hours", async () => {
    const req = await rawRequest("Urgent demo", "I need this before my demo in one hour.");
    const result = await callTool(
      "estimate_priority",
      { text: "I need this before my demo in one hour." },
      await ctxFor(req.id),
    );
    expect(result.ok).toBe(true);
    const output = result.output as { priority: string; dueAt: string; slaHours: number };
    expect(output.priority).toBe("p0");
    expect(output.slaHours).toBe(4);
    expect(Date.parse(output.dueAt)).toBeGreaterThan(Date.now());
  });

  it("estimate_priority rejects invalid input", async () => {
    const req = await rawRequest("X", "Some body long enough.");
    const result = await callTool("estimate_priority", {}, await ctxFor(req.id));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });

  it("search_policy_kb finds parental leave guidance", async () => {
    const req = await rawRequest("Leave question", "How long is parental leave?");
    const result = await callTool(
      "search_policy_kb",
      { query: "parental leave", category: "policy", limit: 3 },
      await ctxFor(req.id),
    );
    expect(result.ok).toBe(true);
    const output = result.output as { snippets: Array<{ id: string }>; totalIndexed: number };
    expect(output.snippets.map((s) => s.id)).toContain("kb_parental");
    expect(output.totalIndexed).toBeGreaterThanOrEqual(10);
  });

  it("search_policy_kb rejects an out-of-range limit", async () => {
    const req = await rawRequest("Leave question", "How long is parental leave?");
    const result = await callTool(
      "search_policy_kb",
      { query: "leave", limit: 99 },
      await ctxFor(req.id),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });

  it("check_equipment_stock reads the D1 inventory table", async () => {
    const req = await rawRequest("Monitor request", "I need a second monitor.");
    const result = await callTool(
      "check_equipment_stock",
      { item: "monitor", quantity: 1 },
      await ctxFor(req.id),
    );
    expect(result.ok).toBe(true);
    const output = result.output as { available: boolean; quantity: number; name: string };
    expect(output.available).toBe(true);
    expect(output.quantity).toBeGreaterThan(0);
    expect(output.name.toLowerCase()).toContain("monitor");
  });

  it("check_equipment_stock rejects an empty item", async () => {
    const req = await rawRequest("Monitor request", "I need a second monitor.");
    const result = await callTool(
      "check_equipment_stock",
      { item: "" },
      await ctxFor(req.id),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });

  it("assign_owner round-robins to a people_ops user and writes D1", async () => {
    const req = await rawRequest("Payroll question", "Where is my payslip?");
    const result = await callTool("assign_owner", { category: "payroll" }, await ctxFor(req.id));
    expect(result.ok).toBe(true);
    const output = result.output as { assigneeId: string; assigneeName: string };
    expect(output.assigneeId).toBe(TEST_USERS.ops.id);
    expect(output.assigneeName).toBe(TEST_USERS.ops.name);
    const updated = await getRequest(env.DB, req.id);
    expect(updated?.assigneeId).toBe(TEST_USERS.ops.id);
  });

  it("assign_owner rejects an unknown category", async () => {
    const req = await rawRequest("Payroll question", "Where is my payslip?");
    const result = await callTool(
      "assign_owner",
      { category: "spaceflight" },
      await ctxFor(req.id),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });

  it("post_resolution_draft composes a draft with citations", async () => {
    const req = await rawRequest("PTO question", "How much PTO do I get per year?");
    const result = await callTool(
      "post_resolution_draft",
      { category: "policy", title: "PTO question", body: "How much PTO do I get per year?" },
      await ctxFor(req.id),
    );
    expect(result.ok).toBe(true);
    const output = result.output as { draft: string; citations: unknown[] };
    expect(output.draft).toContain("PTO question");
    expect(output.citations.length).toBeGreaterThan(0);
  });

  it("post_resolution_draft rejects a missing category", async () => {
    const req = await rawRequest("PTO question", "How much PTO do I get per year?");
    const result = await callTool(
      "post_resolution_draft",
      { title: "PTO question", body: "How much PTO do I get per year?" },
      await ctxFor(req.id),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });

  it("returns a typed error for an unknown tool", async () => {
    const req = await rawRequest("Something", "Something long enough to be a body.");
    const result = await callTool("delete_everything", {}, await ctxFor(req.id));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("unknown_tool");
    expect(result.ms).toBe(0);
    expect(TOOL_NAMES).toHaveLength(6);
  });
});

describe("agent runner", () => {
  it("runs the full equipment flow and writes a structured outcome", async () => {
    const cookie = await loginAs(TEST_USERS.employee.email);
    const created = await createRequestAsEmployee(
      cookie,
      "Laptop will not boot",
      "My laptop will not boot and I have a customer demo in one hour. I need a replacement laptop.",
    );

    const result = await runAgent(created.request.id, env, created.runId);
    expect(result.reused).toBe(false);
    expect(result.run.status).toBe("finished");
    expect(result.run.triageCategory).toBe("equipment");
    expect(result.run.triagePriority).toBe("p0");
    expect(result.run.confidence).toBeGreaterThan(0.5);
    expect(result.run.durationMs).toBeGreaterThan(0);

    const toolSteps = result.steps.filter((step) => step.kind === "tool");
    expect(toolSteps.length).toBeGreaterThanOrEqual(4);
    expect(result.steps.some((step) => step.kind === "plan")).toBe(true);
    expect(result.steps.some((step) => step.toolName === "check_equipment_stock")).toBe(true);
    for (const step of toolSteps) {
      expect(step.ms).toBeGreaterThanOrEqual(1);
    }

    const req = await getRequest(env.DB, created.request.id);
    expect(req?.category).toBe("equipment");
    expect(req?.priority).toBe("p0");
    expect(req?.assigneeId).toBe(TEST_USERS.ops.id);
    expect(req?.dueAt).not.toBeNull();
    expect(req?.draftResolution).not.toBeNull();
    expect(req?.status).toBe("in_progress");

    const audit = await env.DB.prepare(
      "SELECT action FROM audit_events WHERE entity_id = ? ORDER BY created_at ASC, rowid ASC",
    )
      .bind(created.request.id)
      .all<{ action: string }>();
    const actions = audit.results.map((row) => row.action);
    expect(actions).toContain("request.created");
    expect(actions).toContain("request.triaged");
    expect(actions).toContain("request.assigned");
  });

  it("is idempotent per request and does not duplicate steps", async () => {
    const cookie = await loginAs(TEST_USERS.employee.email);
    const created = await createRequestAsEmployee(
      cookie,
      "Policy leave question",
      "What is the parental leave policy for new parents?",
    );
    const first = await runAgent(created.request.id, env, created.runId);
    const second = await runAgent(created.request.id, env);
    expect(second.reused).toBe(true);
    expect(second.run.id).toBe(first.run.id);
    expect(second.steps).toHaveLength(first.steps.length);
    const runs = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM agent_runs WHERE request_id = ?",
    )
      .bind(created.request.id)
      .first<{ n: number }>();
    expect(runs?.n).toBe(1);
  });

  it("skips the inventory tool for non-equipment requests", async () => {
    const cookie = await loginAs(TEST_USERS.employee.email);
    const created = await createRequestAsEmployee(
      cookie,
      "PTO balance",
      "How many PTO days do I have left this year?",
    );
    const result = await runAgent(created.request.id, env, created.runId);
    expect(result.run.triageCategory).toBe("policy");
    expect(result.steps.some((step) => step.toolName === "check_equipment_stock")).toBe(false);
    const toolSteps = result.steps.filter((step) => step.kind === "tool");
    expect(toolSteps.length).toBeGreaterThanOrEqual(4);
    const stored = await listAgentSteps(env.DB, result.run.id);
    expect(stored).toHaveLength(result.steps.length);
  });
});

describe("AgentRunDO", () => {
  it("transitions queued -> running -> finished and exposes state/steps", async () => {
    const name = `do-${crypto.randomUUID()}`;
    const stub = env.AGENT_RUNS.get(env.AGENT_RUNS.idFromName(name));

    const queued = (await (
      await stub.fetch("https://agent-run/state")
    ).json()) as AgentSnapshot;
    expect(queued.status).toBe("queued");
    expect(queued.done).toBe(false);

    const started = (await (
      await stub.fetch("https://agent-run/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: name, runId: "run-1" }),
      })
    ).json()) as AgentSnapshot;
    expect(started.status).toBe("running");
    expect(started.runId).toBe("run-1");

    const step: AgentStep = {
      id: crypto.randomUUID(),
      runId: "run-1",
      seq: 1,
      kind: "tool",
      toolName: "classify_request",
      input: { text: "hello" },
      output: { category: "other" },
      ms: 3,
      createdAt: nowIso(),
    };
    const withStep = (await (
      await stub.fetch("https://agent-run/step", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step }),
      })
    ).json()) as AgentSnapshot;
    expect(withStep.steps).toHaveLength(1);

    const finished = (await (
      await stub.fetch("https://agent-run/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "finished", durationMs: 42 }),
      })
    ).json()) as AgentSnapshot;
    expect(finished.status).toBe("finished");
    expect(finished.done).toBe(true);
    expect(finished.durationMs).toBe(42);
  });

  it("rejects an invalid step payload with 400", async () => {
    const name = `do-${crypto.randomUUID()}`;
    const stub = env.AGENT_RUNS.get(env.AGENT_RUNS.idFromName(name));
    const res = await stub.fetch("https://agent-run/step", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step: { bogus: true } }),
    });
    expect(res.status).toBe(400);
  });
});

interface ParsedSseEvent {
  event: string | undefined;
  data: unknown;
}

function parseSse(text: string): ParsedSseEvent[] {
  return text
    .split("\n\n")
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const lines = block.split("\n");
      const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
      const rawData = lines.find((line) => line.startsWith("data: "))?.slice(6);
      let data: unknown = null;
      if (rawData) {
        try {
          data = JSON.parse(rawData) as unknown;
        } catch {
          data = rawData;
        }
      }
      return { event, data };
    });
}

describe("agent progress endpoints", () => {
  it("returns a finished snapshot from GET /run", async () => {
    const cookie = await loginAs(TEST_USERS.employee.email);
    const created = await createRequestAsEmployee(
      cookie,
      "Docking station request",
      "I need a USB-C docking station for my new laptop.",
    );
    await runAgent(created.request.id, env, created.runId);
    const res = await request(`/api/requests/${created.request.id}/run`, {}, cookie);
    expect(res.status).toBe(200);
    const snapshot = (await res.json()) as AgentSnapshot;
    expect(snapshot.done).toBe(true);
    expect(snapshot.runId).toBe(created.runId);
    expect(snapshot.steps.length).toBeGreaterThanOrEqual(4);
    expect(snapshot.status).toBe("finished");
  });

  it("streams step events and a terminal done event over SSE", async () => {
    const cookie = await loginAs(TEST_USERS.employee.email);
    const created = await createRequestAsEmployee(
      cookie,
      "Monitor request",
      "Please send a 27 inch monitor so I can pair program.",
    );
    await runAgent(created.request.id, env, created.runId);

    const res = await request(
      `/api/requests/${created.request.id}/run/stream`,
      { headers: { accept: "text/event-stream" } },
      cookie,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    const events = parseSse(text);
    const steps = events.filter((event) => event.event === "step");
    expect(steps.length).toBeGreaterThanOrEqual(4);
    const toolSteps = steps
      .map((event) => event.data as AgentStep)
      .filter((step) => step.kind === "tool");
    expect(toolSteps.length).toBeGreaterThanOrEqual(4);
    expect(toolSteps.every((step) => step.ms >= 1)).toBe(true);
    expect(events.some((event) => event.event === "done")).toBe(true);
    const done = events.find((event) => event.event === "done");
    expect((done?.data as { status: string }).status).toBe("finished");
  });

  it("rejects unauthenticated progress requests", async () => {
    const res = await request("/api/requests/any/run");
    expect(res.status).toBe(401);
  });

  it("has a finished run persisted in D1 after the agent completes", async () => {
    const cookie = await loginAs(TEST_USERS.employee.email);
    const created = await createRequestAsEmployee(
      cookie,
      "Keyboard replacement",
      "Several keys on my keyboard do not work.",
    );
    await runAgent(created.request.id, env, created.runId);
    const latest = await getLatestAgentRun(env.DB, created.request.id);
    expect(latest?.status).toBe("finished");
    expect(latest?.durationMs).toBeGreaterThan(0);
  });
});
