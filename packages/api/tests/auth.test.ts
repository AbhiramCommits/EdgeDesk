import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import {
  cookieFrom,
  createRequestAsEmployee,
  loginAs,
  request,
  resetDatabase,
  TEST_USERS,
} from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("health", () => {
  it("reports ok with all three bindings", async () => {
    const res = await request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      version: string;
      bindings: string[];
    };
    expect(body.ok).toBe(true);
    expect(body.version).toBe("0.1.0");
    expect(body.bindings).toEqual(["DB", "SESSIONS", "AGENT_RUNS"]);
  });
});

describe("auth", () => {
  it("logs in a known user, returns the user, and stores a 12h KV session", async () => {
    const res = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: TEST_USERS.employee.email }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { email: string; role: string } };
    expect(body.user.email).toBe(TEST_USERS.employee.email);
    expect(body.user.role).toBe("employee");

    const cookie = cookieFrom(res);
    expect(cookie.startsWith("edgedesk_session=")).toBe(true);
    const sessionId = cookie.split("=")[1] ?? "";
    const stored = await env.SESSIONS.get(`session:${sessionId}`);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? "{}")).toMatchObject({
      userId: TEST_USERS.employee.id,
      role: "employee",
    });
  });

  it("rejects an unknown email with 401", async () => {
    const res = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "nobody@edgedesk.test" }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_credentials");
  });

  it("rejects a malformed email with 400", async () => {
    const res = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  it("rejects malformed JSON with 400 instead of crashing", async () => {
    const res = await request("/api/auth/login", {
      method: "POST",
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 when no session cookie is present", async () => {
    const res = await request("/api/requests");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("returns 401 for an unknown session id", async () => {
    const res = await request("/api/requests", {}, "edgedesk_session=missing-session");
    expect(res.status).toBe(401);
  });

  it("returns 403 when an employee attempts a people_ops mutation", async () => {
    const cookie = await loginAs(TEST_USERS.employee.email);
    const created = await createRequestAsEmployee(cookie);
    const res = await request(
      `/api/requests/${created.request.id}`,
      { method: "PATCH", body: JSON.stringify({ status: "in_progress" }) },
      cookie,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });

  it("lets an admin through the people_ops role gate", async () => {
    const employeeCookie = await loginAs(TEST_USERS.employee.email);
    const created = await createRequestAsEmployee(employeeCookie);
    const adminCookie = await loginAs(TEST_USERS.admin.email);
    const res = await request(
      `/api/requests/${created.request.id}`,
      { method: "PATCH", body: JSON.stringify({ priority: "p1" }) },
      adminCookie,
    );
    expect(res.status).toBe(200);
  });

  it("logout invalidates the KV session", async () => {
    const cookie = await loginAs(TEST_USERS.employee.email);
    const out = await request("/api/auth/logout", { method: "POST" }, cookie);
    expect(out.status).toBe(200);
    const after = await request("/api/requests", {}, cookie);
    expect(after.status).toBe(401);
  });
});
