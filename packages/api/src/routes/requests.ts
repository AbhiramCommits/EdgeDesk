import { Hono } from "hono";
import {
  canTransition,
  createRequestSchema,
  listRequestsQuerySchema,
  resolveRequestSchema,
  updateRequestSchema,
  type RequestPriority,
  type RequestStatus,
} from "shared";
import { kickoffAgentRun } from "../agent/runner";
import { requireAuth, requireRole } from "../auth";
import {
  assignRequest,
  createRequest,
  getLatestAgentRun,
  getRequest,
  getUserById,
  insertAuditEvent,
  listAgentSteps,
  listAuditEvents,
  listRequests,
  resolveRequest,
  updateRequestPriority,
  updateRequestStatus,
} from "../db/repo";
import type { AppEnv, AuthUser } from "../env";
import { ApiError } from "../lib/errors";
import { readJson } from "../lib/http";

export const requestRoutes = new Hono<AppEnv>();

function actorFor(user: AuthUser): string {
  return `user:${user.email}`;
}

requestRoutes.use("*", requireAuth);

requestRoutes.post("/", async (c) => {
  const user = c.get("user");
  const parsed = createRequestSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw ApiError.badRequest("Request validation failed", parsed.error.flatten());
  }

  const request = await createRequest(c.env.DB, {
    requesterId: user.userId,
    title: parsed.data.title,
    body: parsed.data.body,
    category: null,
    priority: null,
    status: "new",
  });

  await insertAuditEvent(c.env.DB, {
    actor: actorFor(user),
    entityType: "request",
    entityId: request.id,
    action: "request.created",
    detail: {
      title: request.title,
      categoryHint: parsed.data.categoryHint ?? null,
    },
  });

  const runId = await kickoffAgentRun(request.id, c.env);
  return c.json({ request, runId }, 201);
});

requestRoutes.get("/", async (c) => {
  const parsed = listRequestsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten());
  }
  const query = parsed.data;
  const result = await listRequests(c.env.DB, {
    status: query.status,
    category: query.category,
    priority: query.priority,
    assigneeId: query.assignee,
    q: query.q,
    sort: query.sort,
    order: query.order,
    limit: query.limit,
    offset: query.offset,
  });
  return c.json(result);
});

requestRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const request = await getRequest(c.env.DB, id);
  if (!request) throw ApiError.notFound("Request not found");

  const latestRun = await getLatestAgentRun(c.env.DB, id);
  const steps = latestRun ? await listAgentSteps(c.env.DB, latestRun.id) : [];
  const audit = await listAuditEvents(c.env.DB, id);

  return c.json({ request, latestRun, steps, audit });
});

requestRoutes.patch("/:id", requireRole("people_ops", "admin"), async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const parsed = updateRequestSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw ApiError.badRequest("Update validation failed", parsed.error.flatten());
  }

  const existing = await getRequest(c.env.DB, id);
  if (!existing) throw ApiError.notFound("Request not found");

  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (parsed.data.status !== undefined && parsed.data.status !== existing.status) {
    const nextStatus: RequestStatus = parsed.data.status;
    if (nextStatus === "resolved") {
      throw ApiError.badRequest(
        "Use POST /api/requests/:id/resolve so a resolution is recorded",
      );
    }
    if (!canTransition(existing.status, nextStatus)) {
      throw ApiError.conflict(
        "invalid_transition",
        `Cannot move a request from ${existing.status} to ${nextStatus}`,
        { from: existing.status, to: nextStatus },
      );
    }
    changes["status"] = { from: existing.status, to: nextStatus };
  }

  if (parsed.data.priority !== undefined && parsed.data.priority !== existing.priority) {
    const nextPriority: RequestPriority = parsed.data.priority;
    changes["priority"] = { from: existing.priority, to: nextPriority };
  }

  if (parsed.data.assigneeId !== undefined && parsed.data.assigneeId !== existing.assigneeId) {
    if (parsed.data.assigneeId !== null) {
      const assignee = await getUserById(c.env.DB, parsed.data.assigneeId);
      if (!assignee) throw ApiError.badRequest("Assignee does not exist");
      if (assignee.role !== "people_ops" && assignee.role !== "admin") {
        throw ApiError.badRequest("Requests can only be assigned to people_ops or admin users");
      }
    }
    changes["assigneeId"] = { from: existing.assigneeId, to: parsed.data.assigneeId };
  }

  if (Object.keys(changes).length === 0) {
    throw ApiError.badRequest("No changes supplied");
  }

  if (parsed.data.status !== undefined && parsed.data.status !== existing.status) {
    await updateRequestStatus(c.env.DB, id, parsed.data.status);
  }
  if (parsed.data.priority !== undefined && parsed.data.priority !== existing.priority) {
    await updateRequestPriority(c.env.DB, id, parsed.data.priority);
  }
  if (parsed.data.assigneeId !== undefined && parsed.data.assigneeId !== existing.assigneeId) {
    await assignRequest(c.env.DB, id, parsed.data.assigneeId);
  }

  const updated = await getRequest(c.env.DB, id);
  if (!updated) throw ApiError.notFound("Request not found");

  await insertAuditEvent(c.env.DB, {
    actor: actorFor(user),
    entityType: "request",
    entityId: id,
    action: "request.updated",
    detail: { changes },
  });

  return c.json({ request: updated });
});

requestRoutes.post("/:id/resolve", requireRole("people_ops", "admin"), async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const parsed = resolveRequestSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw ApiError.badRequest("Resolution validation failed", parsed.error.flatten());
  }

  const existing = await getRequest(c.env.DB, id);
  if (!existing) throw ApiError.notFound("Request not found");
  if (existing.status === "resolved") {
    throw ApiError.conflict("already_resolved", "Request is already resolved");
  }
  if (existing.status === "rejected") {
    throw ApiError.conflict("invalid_state", "A rejected request cannot be resolved");
  }

  const updated = await resolveRequest(c.env.DB, id, parsed.data.resolution);
  if (!updated) throw ApiError.notFound("Request not found");

  await insertAuditEvent(c.env.DB, {
    actor: actorFor(user),
    entityType: "request",
    entityId: id,
    action: "request.resolved",
    detail: {
      previousStatus: existing.status,
      resolution: parsed.data.resolution,
    },
  });

  return c.json({ request: updated });
});
