import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import type { AuditEvent, Request } from "shared";
import { createRequest } from "../src/db/repo";
import {
  countAuditEvents,
  countRequests,
  createRequestAsEmployee,
  loginAs,
  request,
  resetDatabase,
  TEST_USERS,
} from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

interface DetailBody {
  request: Request;
  latestRun: { id: string; status: string } | null;
  steps: unknown[];
  audit: AuditEvent[];
}

interface ListBody {
  items: Request[];
  total: number;
  limit: number;
  offset: number;
}

async function rawRequest(overrides: {
  title?: string;
  status?: Request["status"];
  category?: Request["category"];
  priority?: Request["priority"];
  assigneeId?: string | null;
  createdAt?: string;
}): Promise<Request> {
  return createRequest(env.DB, {
    requesterId: TEST_USERS.employee.id,
    title: overrides.title ?? "Raw test request",
    body: "Raw test body long enough for validation.",
    status: overrides.status ?? "new",
    category: overrides.category ?? null,
    priority: overrides.priority ?? null,
    assigneeId: overrides.assigneeId ?? null,
    createdAt: overrides.createdAt,
  });
}

describe("request creation", () => {
  it("creates a request, writes exactly one audit row, and queues an agent run", async () => {
    const cookie = await loginAs(TEST_USERS.employee.email);
    const res = await request(
      "/api/requests",
      {
        method: "POST",
        body: JSON.stringify({
          title: "Need a replacement laptop",
          body: "My laptop will not boot after the firmware update.",
          categoryHint: "equipment",
        }),
      },
      cookie,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { request: Request; runId: string };
    expect(body.request.status).toBe("new");
    expect(body.request.requesterId).toBe(TEST_USERS.employee.id);
    expect(body.request.requesterName).toBe(TEST_USERS.employee.name);
    expect(body.request.category).toBeNull();
    expect(body.request.priority).toBeNull();

    expect(await countAuditEvents(body.request.id)).toBe(1);
    const audit = await env.DB.prepare(
      "SELECT action FROM audit_events WHERE entity_id = ?",
    )
      .bind(body.request.id)
      .first<{ action: string }>();
    expect(audit?.action).toBe("request.created");

    const run = await env.DB.prepare("SELECT status FROM agent_runs WHERE id = ?")
      .bind(body.runId)
      .first<{ status: string }>();
    expect(run?.status).toBe("queued");
  });

  it("rejects a too-short title with 400 and inserts nothing", async () => {
    const cookie = await loginAs(TEST_USERS.employee.email);
    const res = await request(
      "/api/requests",
      {
        method: "POST",
        body: JSON.stringify({ title: "x", body: "This body is long enough." }),
      },
      cookie,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
    expect(await countRequests()).toBe(0);
  });

  it("rejects a too-short body with 400", async () => {
    const cookie = await loginAs(TEST_USERS.employee.email);
    const res = await request(
      "/api/requests",
      { method: "POST", body: JSON.stringify({ title: "Valid title", body: "short" }) },
      cookie,
    );
    expect(res.status).toBe(400);
  });
});

describe("request listing", () => {
  it("paginates with total, limit, and offset", async () => {
    const base = Date.parse("2026-01-01T00:00:00.000Z");
    for (let i = 0; i < 7; i += 1) {
      await rawRequest({
        title: `Paginated request ${i}`,
        createdAt: new Date(base + i * 1000).toISOString(),
      });
    }
    const cookie = await loginAs(TEST_USERS.employee.email);
    const res = await request("/api/requests?limit=3&offset=3", {}, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListBody;
    expect(body.total).toBe(7);
    expect(body.limit).toBe(3);
    expect(body.offset).toBe(3);
    expect(body.items).toHaveLength(3);
    expect(body.items[0]?.title).toBe("Paginated request 3");
  });

  it("filters by status and category", async () => {
    await rawRequest({ category: "equipment", status: "new", title: "e1" });
    await rawRequest({ category: "equipment", status: "in_progress", title: "e2" });
    await rawRequest({ category: "payroll", status: "new", title: "p1" });
    await rawRequest({ category: "policy", status: "resolved", title: "o1" });

    const cookie = await loginAs(TEST_USERS.employee.email);

    const equipment = (await (
      await request("/api/requests?category=equipment&limit=100", {}, cookie)
    ).json()) as ListBody;
    expect(equipment.total).toBe(2);

    const newOnly = (await (
      await request("/api/requests?status=new&limit=100", {}, cookie)
    ).json()) as ListBody;
    expect(newOnly.total).toBe(2);

    const both = (await (
      await request("/api/requests?status=new&category=equipment&limit=100", {}, cookie)
    ).json()) as ListBody;
    expect(both.total).toBe(1);
    expect(both.items[0]?.title).toBe("e1");
  });

  it("filters by assignee", async () => {
    await rawRequest({ assigneeId: TEST_USERS.ops.id, title: "assigned one" });
    await rawRequest({ title: "unassigned one" });
    const cookie = await loginAs(TEST_USERS.employee.email);
    const body = (await (
      await request(`/api/requests?assignee=${TEST_USERS.ops.id}`, {}, cookie)
    ).json()) as ListBody;
    expect(body.total).toBe(1);
    expect(body.items[0]?.assigneeName).toBe(TEST_USERS.ops.name);
  });

  it("sorts by priority ascending", async () => {
    await rawRequest({ priority: "p3", title: "low" });
    await rawRequest({ priority: "p0", title: "critical" });
    await rawRequest({ priority: "p2", title: "normal" });
    const cookie = await loginAs(TEST_USERS.employee.email);
    const body = (await (
      await request("/api/requests?sort=priority&order=asc", {}, cookie)
    ).json()) as ListBody;
    expect(body.items.map((item) => item.priority)).toEqual(["p0", "p2", "p3"]);
  });

  it("rejects an invalid status filter with 400", async () => {
    const cookie = await loginAs(TEST_USERS.employee.email);
    const res = await request("/api/requests?status=exploded", {}, cookie);
    expect(res.status).toBe(400);
  });
});

describe("request detail", () => {
  it("returns the request, its latest run, and the audit timeline", async () => {
    const cookie = await loginAs(TEST_USERS.employee.email);
    const created = await createRequestAsEmployee(cookie);
    const res = await request(`/api/requests/${created.request.id}`, {}, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DetailBody;
    expect(body.request.id).toBe(created.request.id);
    expect(body.latestRun?.id).toBe(created.runId);
    expect(body.steps).toHaveLength(0);
    expect(body.audit).toHaveLength(1);
    expect(body.audit[0]?.action).toBe("request.created");
  });

  it("returns 404 for an unknown request", async () => {
    const cookie = await loginAs(TEST_USERS.employee.email);
    const res = await request("/api/requests/does-not-exist", {}, cookie);
    expect(res.status).toBe(404);
  });
});

describe("request mutations", () => {
  it("lets people_ops change status and writes exactly one audit row", async () => {
    const employeeCookie = await loginAs(TEST_USERS.employee.email);
    const created = await createRequestAsEmployee(employeeCookie);
    const opsCookie = await loginAs(TEST_USERS.ops.email);

    const res = await request(
      `/api/requests/${created.request.id}`,
      { method: "PATCH", body: JSON.stringify({ status: "in_progress" }) },
      opsCookie,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { request: Request };
    expect(body.request.status).toBe("in_progress");
    expect(await countAuditEvents(created.request.id)).toBe(2);
    const latest = await env.DB.prepare(
      "SELECT action FROM audit_events WHERE entity_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
    )
      .bind(created.request.id)
      .first<{ action: string }>();
    expect(latest?.action).toBe("request.updated");
  });

  it("rejects an illegal status transition with 409", async () => {
    const resolved = await rawRequest({ status: "resolved", title: "already done" });
    const opsCookie = await loginAs(TEST_USERS.ops.email);
    const res = await request(
      `/api/requests/${resolved.id}`,
      { method: "PATCH", body: JSON.stringify({ status: "triaging" }) },
      opsCookie,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_transition");
  });

  it("changes priority and assignee in one mutation with one audit row", async () => {
    const employeeCookie = await loginAs(TEST_USERS.employee.email);
    const created = await createRequestAsEmployee(employeeCookie);
    const opsCookie = await loginAs(TEST_USERS.ops.email);
    const before = await countAuditEvents(created.request.id);

    const res = await request(
      `/api/requests/${created.request.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ priority: "p1", assigneeId: TEST_USERS.ops.id }),
      },
      opsCookie,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { request: Request };
    expect(body.request.priority).toBe("p1");
    expect(body.request.assigneeId).toBe(TEST_USERS.ops.id);
    expect(body.request.assigneeName).toBe(TEST_USERS.ops.name);
    expect(await countAuditEvents(created.request.id)).toBe(before + 1);
  });

  it("rejects assigning to an employee with 400", async () => {
    const created = await rawRequest({});
    const opsCookie = await loginAs(TEST_USERS.ops.email);
    const res = await request(
      `/api/requests/${created.id}`,
      { method: "PATCH", body: JSON.stringify({ assigneeId: TEST_USERS.employee.id }) },
      opsCookie,
    );
    expect(res.status).toBe(400);
  });

  it("rejects assigning to a nonexistent user with 400", async () => {
    const created = await rawRequest({});
    const opsCookie = await loginAs(TEST_USERS.ops.email);
    const res = await request(
      `/api/requests/${created.id}`,
      { method: "PATCH", body: JSON.stringify({ assigneeId: "no-such-user" }) },
      opsCookie,
    );
    expect(res.status).toBe(400);
  });

  it("rejects an empty or no-op PATCH with 400", async () => {
    const created = await rawRequest({ priority: "p2" });
    const opsCookie = await loginAs(TEST_USERS.ops.email);
    const empty = await request(
      `/api/requests/${created.id}`,
      { method: "PATCH", body: JSON.stringify({}) },
      opsCookie,
    );
    expect(empty.status).toBe(400);
    const noop = await request(
      `/api/requests/${created.id}`,
      { method: "PATCH", body: JSON.stringify({ priority: "p2" }) },
      opsCookie,
    );
    expect(noop.status).toBe(400);
  });

  it("rejects unknown keys in PATCH thanks to a strict schema", async () => {
    const created = await rawRequest({});
    const opsCookie = await loginAs(TEST_USERS.ops.email);
    const res = await request(
      `/api/requests/${created.id}`,
      { method: "PATCH", body: JSON.stringify({ sneaky: true }) },
      opsCookie,
    );
    expect(res.status).toBe(400);
  });
});

describe("resolution flow", () => {
  it("resolves a request with text, a resolved_at timestamp, and one audit row", async () => {
    const employeeCookie = await loginAs(TEST_USERS.employee.email);
    const created = await createRequestAsEmployee(employeeCookie);
    const opsCookie = await loginAs(TEST_USERS.ops.email);
    const before = await countAuditEvents(created.request.id);

    const res = await request(
      `/api/requests/${created.request.id}/resolve`,
      {
        method: "POST",
        body: JSON.stringify({ resolution: "Monitor shipped and confirmed delivered." }),
      },
      opsCookie,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { request: Request };
    expect(body.request.status).toBe("resolved");
    expect(body.request.resolution).toBe("Monitor shipped and confirmed delivered.");
    expect(body.request.resolvedAt).not.toBeNull();
    expect(await countAuditEvents(created.request.id)).toBe(before + 1);
  });

  it("returns 409 when resolving an already-resolved request", async () => {
    const employeeCookie = await loginAs(TEST_USERS.employee.email);
    const created = await createRequestAsEmployee(employeeCookie);
    const opsCookie = await loginAs(TEST_USERS.ops.email);
    await request(
      `/api/requests/${created.request.id}/resolve`,
      { method: "POST", body: JSON.stringify({ resolution: "Done the first time." }) },
      opsCookie,
    );
    const res = await request(
      `/api/requests/${created.request.id}/resolve`,
      { method: "POST", body: JSON.stringify({ resolution: "Done the second time." }) },
      opsCookie,
    );
    expect(res.status).toBe(409);
  });

  it("rejects a too-short resolution with 400 and writes no audit row", async () => {
    const employeeCookie = await loginAs(TEST_USERS.employee.email);
    const created = await createRequestAsEmployee(employeeCookie);
    const opsCookie = await loginAs(TEST_USERS.ops.email);
    const before = await countAuditEvents(created.request.id);
    const res = await request(
      `/api/requests/${created.request.id}/resolve`,
      { method: "POST", body: JSON.stringify({ resolution: "no" }) },
      opsCookie,
    );
    expect(res.status).toBe(400);
    expect(await countAuditEvents(created.request.id)).toBe(before);
  });

  it("records created -> updated -> resolved audit events in order", async () => {
    const employeeCookie = await loginAs(TEST_USERS.employee.email);
    const created = await createRequestAsEmployee(employeeCookie);
    const opsCookie = await loginAs(TEST_USERS.ops.email);
    await request(
      `/api/requests/${created.request.id}`,
      { method: "PATCH", body: JSON.stringify({ assigneeId: TEST_USERS.ops.id }) },
      opsCookie,
    );
    await request(
      `/api/requests/${created.request.id}/resolve`,
      { method: "POST", body: JSON.stringify({ resolution: "Assigned and completed." }) },
      opsCookie,
    );
    const detail = (await (
      await request(`/api/requests/${created.request.id}`, {}, employeeCookie)
    ).json()) as DetailBody;
    expect(detail.audit.map((event) => event.action)).toEqual([
      "request.created",
      "request.updated",
      "request.resolved",
    ]);
  });
});
