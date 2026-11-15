import { createExecutionContext, env } from "cloudflare:test";
import app from "../src/index";
import { createUser } from "../src/db/repo";

export const TEST_USERS = {
  employee: {
    id: "test_user_employee",
    email: "employee@edgedesk.test",
    name: "Eve Employee",
    role: "employee" as const,
  },
  ops: {
    id: "test_user_ops",
    email: "ops@edgedesk.test",
    name: "Olive Ops",
    role: "people_ops" as const,
  },
  admin: {
    id: "test_user_admin",
    email: "admin@edgedesk.test",
    name: "Avery Admin",
    role: "admin" as const,
  },
};

export async function resetDatabase(): Promise<void> {
  await env.DB.exec(
    "DELETE FROM audit_events; DELETE FROM agent_steps; DELETE FROM agent_runs; DELETE FROM requests; DELETE FROM users;",
  );
  const sessions = await env.SESSIONS.list({ prefix: "session:" });
  await Promise.all(sessions.keys.map((key) => env.SESSIONS.delete(key.name)));
  await createUser(env.DB, TEST_USERS.employee);
  await createUser(env.DB, TEST_USERS.ops);
  await createUser(env.DB, TEST_USERS.admin);
}

export async function request(
  path: string,
  init: RequestInit = {},
  cookie?: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (cookie) headers.set("cookie", cookie);
  return app.request(path, { ...init, headers }, env, createExecutionContext());
}

export function cookieFrom(response: Response): string {
  const raw = response.headers.get("set-cookie");
  if (!raw) throw new Error("expected a Set-Cookie header");
  return raw.split(";")[0] ?? raw;
}

export async function loginAs(email: string): Promise<string> {
  const res = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  }
  return cookieFrom(res);
}

export async function countAuditEvents(entityId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM audit_events WHERE entity_id = ?",
  )
    .bind(entityId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function countRequests(): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM requests").first<{ n: number }>();
  return row?.n ?? 0;
}

export async function createRequestAsEmployee(
  cookie: string,
  title = "Need a monitor",
  body = "Please send a 27 inch monitor for my desk.",
): Promise<{ request: { id: string; status: string; requesterId: string }; runId: string }> {
  const res = await request(
    "/api/requests",
    { method: "POST", body: JSON.stringify({ title, body }) },
    cookie,
  );
  if (res.status !== 201) {
    throw new Error(`create request failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as {
    request: { id: string; status: string; requesterId: string };
    runId: string;
  };
}
