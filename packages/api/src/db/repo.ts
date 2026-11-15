import type {
  AgentRun,
  AgentRunStatus,
  AgentStep,
  AuditEvent,
  Request,
  RequestCategory,
  RequestPriority,
  RequestStatus,
  User,
  UserRole,
} from "shared";
import { newId } from "../lib/ids";
import { isPast, nowIso } from "../lib/time";

/* ------------------------------------------------------------------ */
/* Row shapes (snake_case, exactly as D1 returns them)                 */
/* ------------------------------------------------------------------ */

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

interface RequestRow {
  id: string;
  requester_id: string;
  requester_name: string | null;
  title: string;
  body: string;
  category: string | null;
  priority: string | null;
  status: string;
  assignee_id: string | null;
  assignee_name: string | null;
  resolution: string | null;
  draft_resolution: string | null;
  due_at: string | null;
  sla_breached: number;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AgentRunRow {
  id: string;
  request_id: string;
  status: string;
  triage_category: string | null;
  triage_priority: string | null;
  confidence: number | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

interface AgentStepRow {
  id: string;
  run_id: string;
  seq: number;
  kind: string;
  tool_name: string | null;
  input_json: string;
  output_json: string;
  ms: number;
  created_at: string;
}

interface AuditEventRow {
  id: string;
  actor: string;
  entity_type: string;
  entity_id: string;
  action: string;
  detail_json: string;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* Mappers                                                             */
/* ------------------------------------------------------------------ */

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function mapRequest(row: RequestRow): Request {
  const open = row.status !== "resolved" && row.status !== "rejected";
  const overdueNow = open && isPast(row.due_at);
  return {
    id: row.id,
    requesterId: row.requester_id,
    requesterName: row.requester_name,
    title: row.title,
    body: row.body,
    category: row.category as RequestCategory | null,
    priority: row.priority as RequestPriority | null,
    status: row.status as RequestStatus,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    resolution: row.resolution,
    draftResolution: row.draft_resolution,
    dueAt: row.due_at,
    slaBreached: row.sla_breached === 1 || overdueNow,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAgentRun(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    requestId: row.request_id,
    status: row.status as AgentRunStatus,
    triageCategory: row.triage_category as RequestCategory | null,
    triagePriority: row.triage_priority as RequestPriority | null,
    confidence: row.confidence,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
  };
}

function mapAgentStep(row: AgentStepRow): AgentStep {
  return {
    id: row.id,
    runId: row.run_id,
    seq: row.seq,
    kind: row.kind as AgentStep["kind"],
    toolName: row.tool_name,
    input: parseJson(row.input_json),
    output: parseJson(row.output_json),
    ms: row.ms,
    createdAt: row.created_at,
  };
}

function mapAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    actor: row.actor,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    detail: parseJson(row.detail_json),
    createdAt: row.created_at,
  };
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export interface CreateUserInput {
  id?: string;
  email: string;
  name: string;
  role: UserRole;
}

export async function createUser(db: D1Database, input: CreateUserInput): Promise<User> {
  const id = input.id ?? newId();
  await db
    .prepare(
      "INSERT INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id, input.email.trim().toLowerCase(), input.name, input.role, nowIso())
    .run();
  return { id, email: input.email.trim().toLowerCase(), name: input.name, role: input.role };
}

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await db
    .prepare("SELECT id, email, name, role, created_at FROM users WHERE email = ?")
    .bind(email.trim().toLowerCase())
    .first<UserRow>();
  return row ? mapUser(row) : null;
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db
    .prepare("SELECT id, email, name, role, created_at FROM users WHERE id = ?")
    .bind(id)
    .first<UserRow>();
  return row ? mapUser(row) : null;
}

export async function listUsersByRole(db: D1Database, role: UserRole): Promise<User[]> {
  const result = await db
    .prepare("SELECT id, email, name, role, created_at FROM users WHERE role = ? ORDER BY name ASC")
    .bind(role)
    .all<UserRow>();
  return result.results.map(mapUser);
}

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

export interface CreateRequestRowInput {
  id?: string;
  requesterId: string;
  title: string;
  body: string;
  category?: RequestCategory | null;
  priority?: RequestPriority | null;
  status?: RequestStatus;
  assigneeId?: string | null;
  dueAt?: string | null;
  createdAt?: string;
}

export async function createRequest(
  db: D1Database,
  input: CreateRequestRowInput,
): Promise<Request> {
  const id = input.id ?? newId();
  const now = input.createdAt ?? nowIso();
  await db
    .prepare(
      `INSERT INTO requests
        (id, requester_id, title, body, category, priority, status, assignee_id, due_at,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.requesterId,
      input.title,
      input.body,
      input.category ?? null,
      input.priority ?? null,
      input.status ?? "new",
      input.assigneeId ?? null,
      input.dueAt ?? null,
      now,
      now,
    )
    .run();
  const request = await getRequest(db, id);
  if (!request) throw new Error(`request ${id} disappeared after insert`);
  return request;
}

export async function getRequest(db: D1Database, id: string): Promise<Request | null> {
  const row = await db
    .prepare(
      `SELECT r.*, ru.name AS requester_name, au.name AS assignee_name
       FROM requests r
       JOIN users ru ON ru.id = r.requester_id
       LEFT JOIN users au ON au.id = r.assignee_id
       WHERE r.id = ?`,
    )
    .bind(id)
    .first<RequestRow>();
  return row ? mapRequest(row) : null;
}

export type RequestSort = "created_at" | "updated_at" | "priority" | "due_at";

export interface ListRequestsFilters {
  status?: RequestStatus;
  category?: RequestCategory;
  priority?: RequestPriority;
  assigneeId?: string;
  q?: string;
  sort?: RequestSort;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

const SORT_COLUMNS: Record<RequestSort, string> = {
  created_at: "r.created_at",
  updated_at: "r.updated_at",
  priority: "r.priority",
  due_at: "r.due_at",
};

export interface ListRequestsResult {
  items: Request[];
  total: number;
  limit: number;
  offset: number;
}

export async function listRequests(
  db: D1Database,
  filters: ListRequestsFilters = {},
): Promise<ListRequestsResult> {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (filters.status) {
    clauses.push("r.status = ?");
    values.push(filters.status);
  }
  if (filters.category) {
    clauses.push("r.category = ?");
    values.push(filters.category);
  }
  if (filters.priority) {
    clauses.push("r.priority = ?");
    values.push(filters.priority);
  }
  if (filters.assigneeId) {
    clauses.push("r.assignee_id = ?");
    values.push(filters.assigneeId);
  }
  if (filters.q) {
    clauses.push("(LOWER(r.title) LIKE ? OR LOWER(r.body) LIKE ?)");
    const needle = `%${filters.q.toLowerCase()}%`;
    values.push(needle, needle);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const sort = filters.sort ?? "created_at";
  const direction = filters.order === "asc" ? "ASC" : "DESC";
  const limit = filters.limit ?? 25;
  const offset = filters.offset ?? 0;

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS total FROM requests r ${where}`)
    .bind(...values)
    .first<{ total: number }>();

  const rows = await db
    .prepare(
      `SELECT r.*, ru.name AS requester_name, au.name AS assignee_name
       FROM requests r
       JOIN users ru ON ru.id = r.requester_id
       LEFT JOIN users au ON au.id = r.assignee_id
       ${where}
       ORDER BY ${SORT_COLUMNS[sort]} ${direction}, r.id ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(...values, limit, offset)
    .all<RequestRow>();

  return {
    items: rows.results.map(mapRequest),
    total: countRow?.total ?? 0,
    limit,
    offset,
  };
}

export async function updateRequestStatus(
  db: D1Database,
  id: string,
  status: RequestStatus,
): Promise<Request | null> {
  const now = nowIso();
  await db
    .prepare(
      `UPDATE requests
       SET status = ?,
           resolved_at = CASE
             WHEN ? IN ('resolved', 'rejected') THEN COALESCE(resolved_at, ?)
             ELSE resolved_at
           END,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(status, status, now, now, id)
    .run();
  return getRequest(db, id);
}

export async function updateRequestPriority(
  db: D1Database,
  id: string,
  priority: RequestPriority,
): Promise<Request | null> {
  await db
    .prepare("UPDATE requests SET priority = ?, updated_at = ? WHERE id = ?")
    .bind(priority, nowIso(), id)
    .run();
  return getRequest(db, id);
}

export async function assignRequest(
  db: D1Database,
  id: string,
  assigneeId: string | null,
): Promise<Request | null> {
  await db
    .prepare("UPDATE requests SET assignee_id = ?, updated_at = ? WHERE id = ?")
    .bind(assigneeId, nowIso(), id)
    .run();
  return getRequest(db, id);
}

export async function resolveRequest(
  db: D1Database,
  id: string,
  resolution: string,
): Promise<Request | null> {
  const now = nowIso();
  await db
    .prepare(
      `UPDATE requests
       SET status = 'resolved', resolution = ?, resolved_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(resolution, now, now, id)
    .run();
  return getRequest(db, id);
}

/** Persists the structured triage outcome written back by the agent. */
export async function applyTriageOutcome(
  db: D1Database,
  id: string,
  outcome: {
    category: RequestCategory;
    priority: RequestPriority;
    assigneeId: string | null;
    dueAt: string | null;
    draftResolution?: string | null;
    status?: RequestStatus;
  },
): Promise<Request | null> {
  await db
    .prepare(
      `UPDATE requests
       SET category = ?, priority = ?, assignee_id = ?, due_at = ?, draft_resolution = ?,
           status = COALESCE(?, status), updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      outcome.category,
      outcome.priority,
      outcome.assigneeId,
      outcome.dueAt,
      outcome.draftResolution ?? null,
      outcome.status ?? null,
      nowIso(),
      id,
    )
    .run();
  return getRequest(db, id);
}

/* ------------------------------------------------------------------ */
/* Agent runs and steps                                                */
/* ------------------------------------------------------------------ */

export interface InsertAgentRunInput {
  id?: string;
  requestId: string;
  status: AgentRunStatus;
  startedAt?: string;
  triageCategory?: RequestCategory | null;
  triagePriority?: RequestPriority | null;
  confidence?: number | null;
}

export async function insertAgentRun(
  db: D1Database,
  input: InsertAgentRunInput,
): Promise<AgentRun> {
  const id = input.id ?? newId();
  const startedAt = input.startedAt ?? nowIso();
  await db
    .prepare(
      `INSERT INTO agent_runs
        (id, request_id, status, triage_category, triage_priority, confidence, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.requestId,
      input.status,
      input.triageCategory ?? null,
      input.triagePriority ?? null,
      input.confidence ?? null,
      startedAt,
    )
    .run();
  return {
    id,
    requestId: input.requestId,
    status: input.status,
    triageCategory: input.triageCategory ?? null,
    triagePriority: input.triagePriority ?? null,
    confidence: input.confidence ?? null,
    startedAt,
    finishedAt: null,
    durationMs: null,
  };
}

export async function getAgentRun(db: D1Database, id: string): Promise<AgentRun | null> {
  const row = await db
    .prepare("SELECT * FROM agent_runs WHERE id = ?")
    .bind(id)
    .first<AgentRunRow>();
  return row ? mapAgentRun(row) : null;
}

export async function markAgentRunRunning(
  db: D1Database,
  id: string,
  startedAt: string,
): Promise<void> {
  await db
    .prepare("UPDATE agent_runs SET status = 'running', started_at = ? WHERE id = ?")
    .bind(startedAt, id)
    .run();
}

export async function getLatestAgentRun(
  db: D1Database,
  requestId: string,
): Promise<AgentRun | null> {
  const row = await db
    .prepare(
      "SELECT * FROM agent_runs WHERE request_id = ? ORDER BY started_at DESC, id DESC LIMIT 1",
    )
    .bind(requestId)
    .first<AgentRunRow>();
  return row ? mapAgentRun(row) : null;
}

export async function finishAgentRun(
  db: D1Database,
  id: string,
  outcome: {
    status: AgentRunStatus;
    triageCategory?: RequestCategory | null;
    triagePriority?: RequestPriority | null;
    confidence?: number | null;
    durationMs: number;
    finishedAt?: string;
  },
): Promise<AgentRun | null> {
  const finishedAt = outcome.finishedAt ?? nowIso();
  await db
    .prepare(
      `UPDATE agent_runs
       SET status = ?, triage_category = ?, triage_priority = ?, confidence = ?,
           finished_at = ?, duration_ms = ?
       WHERE id = ?`,
    )
    .bind(
      outcome.status,
      outcome.triageCategory ?? null,
      outcome.triagePriority ?? null,
      outcome.confidence ?? null,
      finishedAt,
      outcome.durationMs,
      id,
    )
    .run();
  return getAgentRun(db, id);
}

export interface InsertAgentStepInput {
  id?: string;
  runId: string;
  seq: number;
  kind: AgentStep["kind"];
  toolName?: string | null;
  input?: unknown;
  output?: unknown;
  ms: number;
  createdAt?: string;
}

export async function insertAgentStep(
  db: D1Database,
  input: InsertAgentStepInput,
): Promise<AgentStep> {
  const id = input.id ?? newId();
  const createdAt = input.createdAt ?? nowIso();
  const inputJson = JSON.stringify(input.input ?? {});
  const outputJson = JSON.stringify(input.output ?? {});
  await db
    .prepare(
      `INSERT INTO agent_steps
        (id, run_id, seq, kind, tool_name, input_json, output_json, ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.runId,
      input.seq,
      input.kind,
      input.toolName ?? null,
      inputJson,
      outputJson,
      input.ms,
      createdAt,
    )
    .run();
  return {
    id,
    runId: input.runId,
    seq: input.seq,
    kind: input.kind,
    toolName: input.toolName ?? null,
    input: input.input ?? {},
    output: input.output ?? {},
    ms: input.ms,
    createdAt,
  };
}

export async function listAgentSteps(db: D1Database, runId: string): Promise<AgentStep[]> {
  const rows = await db
    .prepare("SELECT * FROM agent_steps WHERE run_id = ? ORDER BY seq ASC, id ASC")
    .bind(runId)
    .all<AgentStepRow>();
  return rows.results.map(mapAgentStep);
}

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

export interface InsertAuditEventInput {
  id?: string;
  actor: string;
  entityType: string;
  entityId: string;
  action: string;
  detail?: unknown;
  createdAt?: string;
}

export async function insertAuditEvent(
  db: D1Database,
  input: InsertAuditEventInput,
): Promise<AuditEvent> {
  const id = input.id ?? newId();
  const createdAt = input.createdAt ?? nowIso();
  const detail = input.detail ?? {};
  await db
    .prepare(
      `INSERT INTO audit_events
        (id, actor, entity_type, entity_id, action, detail_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.actor,
      input.entityType,
      input.entityId,
      input.action,
      JSON.stringify(detail),
      createdAt,
    )
    .run();
  return {
    id,
    actor: input.actor,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    detail,
    createdAt,
  };
}

export async function listAuditEvents(
  db: D1Database,
  entityId: string,
  limit = 200,
): Promise<AuditEvent[]> {
  const rows = await db
    .prepare(
      "SELECT * FROM audit_events WHERE entity_id = ? ORDER BY created_at ASC, rowid ASC LIMIT ?",
    )
    .bind(entityId, limit)
    .all<AuditEventRow>();
  return rows.results.map(mapAuditEvent);
}
