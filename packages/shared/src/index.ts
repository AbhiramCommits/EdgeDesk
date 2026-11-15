import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Enumerations                                                        */
/* ------------------------------------------------------------------ */

export const REQUEST_CATEGORIES = [
  "equipment",
  "onboarding",
  "policy",
  "access",
  "payroll",
  "other",
] as const;
export const requestCategorySchema = z.enum(REQUEST_CATEGORIES);
export type RequestCategory = z.infer<typeof requestCategorySchema>;

export const REQUEST_PRIORITIES = ["p0", "p1", "p2", "p3"] as const;
export const requestPrioritySchema = z.enum(REQUEST_PRIORITIES);
export type RequestPriority = z.infer<typeof requestPrioritySchema>;

export const REQUEST_STATUSES = [
  "new",
  "triaging",
  "awaiting_info",
  "in_progress",
  "resolved",
  "rejected",
] as const;
export const requestStatusSchema = z.enum(REQUEST_STATUSES);
export type RequestStatus = z.infer<typeof requestStatusSchema>;

export const USER_ROLES = ["employee", "people_ops", "admin"] as const;
export const userRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof userRoleSchema>;

export const AGENT_RUN_STATUSES = ["queued", "running", "finished", "failed"] as const;
export const agentRunStatusSchema = z.enum(AGENT_RUN_STATUSES);
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const AGENT_STEP_KINDS = ["plan", "tool", "outcome", "error"] as const;
export const agentStepKindSchema = z.enum(AGENT_STEP_KINDS);
export type AgentStepKind = z.infer<typeof agentStepKindSchema>;

/** SLA windows, in hours, keyed by priority. Used by the triage agent. */
export const SLA_HOURS: Record<RequestPriority, number> = {
  p0: 4,
  p1: 24,
  p2: 72,
  p3: 168,
};

/** Display ordering for priorities (p0 is the most urgent). */
export const PRIORITY_RANK: Record<RequestPriority, number> = {
  p0: 0,
  p1: 1,
  p2: 2,
  p3: 3,
};

/** Allowed status transitions for the lifecycle API. */
export const ALLOWED_STATUS_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  new: ["triaging", "awaiting_info", "in_progress", "rejected"],
  triaging: ["awaiting_info", "in_progress", "resolved", "rejected"],
  awaiting_info: ["triaging", "in_progress", "resolved", "rejected"],
  in_progress: ["awaiting_info", "resolved", "rejected"],
  resolved: ["in_progress"],
  rejected: ["new"],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return from === to || ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

/* ------------------------------------------------------------------ */
/* Core entities                                                       */
/* ------------------------------------------------------------------ */

export const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  role: userRoleSchema,
});
export type User = z.infer<typeof userSchema>;

export const requestSchema = z.object({
  id: z.string().min(1),
  requesterId: z.string().min(1),
  requesterName: z.string().nullable(),
  title: z.string().min(1),
  body: z.string().min(1),
  category: requestCategorySchema.nullable(),
  priority: requestPrioritySchema.nullable(),
  status: requestStatusSchema,
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  resolution: z.string().nullable(),
  draftResolution: z.string().nullable(),
  dueAt: z.string().nullable(),
  slaBreached: z.boolean(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Request = z.infer<typeof requestSchema>;

export const agentRunSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  status: agentRunStatusSchema,
  triageCategory: requestCategorySchema.nullable(),
  triagePriority: requestPrioritySchema.nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
});
export type AgentRun = z.infer<typeof agentRunSchema>;

export const agentStepSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  kind: agentStepKindSchema,
  toolName: z.string().nullable(),
  input: z.unknown(),
  output: z.unknown(),
  ms: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type AgentStep = z.infer<typeof agentStepSchema>;

export const toolCallSchema = z.object({
  name: z.string().min(1),
  input: z.unknown(),
  output: z.unknown(),
  ok: z.boolean(),
  error: z
    .object({ code: z.string(), message: z.string() })
    .nullable(),
  ms: z.number().int().nonnegative(),
});
export type ToolCall = z.infer<typeof toolCallSchema>;

export const auditEventSchema = z.object({
  id: z.string().min(1),
  actor: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  action: z.string().min(1),
  detail: z.unknown(),
  createdAt: z.string(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

/* ------------------------------------------------------------------ */
/* API request DTOs                                                    */
/* ------------------------------------------------------------------ */

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid work email"),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginResponseSchema = z.object({
  user: userSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const createRequestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(160, "Title must be 160 characters or fewer"),
  body: z
    .string()
    .trim()
    .min(10, "Describe the request in at least 10 characters")
    .max(8000, "Body must be 8000 characters or fewer"),
  categoryHint: requestCategorySchema.optional(),
});
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const updateRequestSchema = z
  .object({
    status: requestStatusSchema.optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    priority: requestPrioritySchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one of status, assigneeId, or priority",
  });
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;

export const resolveRequestSchema = z.object({
  resolution: z
    .string()
    .trim()
    .min(5, "Resolution must be at least 5 characters")
    .max(5000, "Resolution must be 5000 characters or fewer"),
});
export type ResolveRequestInput = z.infer<typeof resolveRequestSchema>;

export const listRequestsQuerySchema = z.object({
  status: requestStatusSchema.optional(),
  category: requestCategorySchema.optional(),
  priority: requestPrioritySchema.optional(),
  assignee: z.string().min(1).optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(["created_at", "updated_at", "priority", "due_at"]).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListRequestsQuery = z.infer<typeof listRequestsQuerySchema>;

export const listRequestsResponseSchema = z.object({
  items: z.array(requestSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type ListRequestsResponse = z.infer<typeof listRequestsResponseSchema>;

export const requestDetailResponseSchema = z.object({
  request: requestSchema,
  latestRun: agentRunSchema.nullable(),
  steps: z.array(agentStepSchema),
  audit: z.array(auditEventSchema),
});
export type RequestDetailResponse = z.infer<typeof requestDetailResponseSchema>;

export const createRequestResponseSchema = z.object({
  request: requestSchema,
  runId: z.string().min(1),
});
export type CreateRequestResponse = z.infer<typeof createRequestResponseSchema>;

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  commit: z.string().optional(),
  bindings: z.array(z.string()),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

/* ------------------------------------------------------------------ */
/* Agent streaming DTOs                                                */
/* ------------------------------------------------------------------ */

export const agentSnapshotSchema = z.object({
  requestId: z.string(),
  runId: z.string().nullable(),
  status: agentRunStatusSchema,
  done: z.boolean(),
  steps: z.array(agentStepSchema),
  durationMs: z.number().int().nonnegative().nullable(),
});
export type AgentSnapshot = z.infer<typeof agentSnapshotSchema>;

export const agentStreamEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("snapshot"), snapshot: agentSnapshotSchema }),
  z.object({ kind: z.literal("step"), step: agentStepSchema }),
  z.object({
    kind: z.literal("done"),
    runId: z.string(),
    status: agentRunStatusSchema,
    durationMs: z.number().int().nonnegative().nullable(),
  }),
  z.object({ kind: z.literal("error"), message: z.string() }),
]);
export type AgentStreamEvent = z.infer<typeof agentStreamEventSchema>;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function isTerminalStatus(status: RequestStatus): boolean {
  return status === "resolved" || status === "rejected";
}

export function priorityLabel(priority: RequestPriority): string {
  switch (priority) {
    case "p0":
      return "P0 · Critical";
    case "p1":
      return "P1 · High";
    case "p2":
      return "P2 · Normal";
    case "p3":
      return "P3 · Low";
  }
}
