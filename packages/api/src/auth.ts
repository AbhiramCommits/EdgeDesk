import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { loginRequestSchema, userRoleSchema, type UserRole } from "shared";
import { z } from "zod";
import { getUserByEmail, getUserById } from "./db/repo";
import type { AppEnv, AuthUser } from "./env";
import { ApiError } from "./lib/errors";
import { readJson } from "./lib/http";
import { newId } from "./lib/ids";

export const SESSION_COOKIE = "edgedesk_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

const sessionSchema = z.object({
  userId: z.string().min(1),
  role: userRoleSchema,
  email: z.string().email(),
});

export function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", async (c) => {
  const parsed = loginRequestSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw ApiError.badRequest("Enter a valid work email", parsed.error.flatten());
  }

  const user = await getUserByEmail(c.env.DB, parsed.data.email);
  if (!user) {
    throw new ApiError(401, "invalid_credentials", "No account exists for that email");
  }

  const sessionId = newId();
  const session: AuthUser = { userId: user.id, role: user.role, email: user.email };
  await c.env.SESSIONS.put(sessionKey(sessionId), JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  const secure = new URL(c.req.url).protocol === "https:";
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure,
    maxAge: SESSION_TTL_SECONDS,
  });

  return c.json({ user });
});

authRoutes.post("/logout", async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (sessionId) {
    await c.env.SESSIONS.delete(sessionKey(sessionId));
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId) {
    throw ApiError.unauthorized();
  }

  const raw = await c.env.SESSIONS.get(sessionKey(sessionId));
  if (!raw) {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    throw ApiError.unauthorized("Session expired, please sign in again");
  }

  let parsed: z.infer<typeof sessionSchema>;
  try {
    parsed = sessionSchema.parse(JSON.parse(raw) as unknown);
  } catch {
    await c.env.SESSIONS.delete(sessionKey(sessionId));
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    throw ApiError.unauthorized("Session is invalid, please sign in again");
  }

  c.set("user", parsed);
  await next();
});

/**
 * Role gate for mutating endpoints. Admins are a superset of people_ops, so an
 * admin passes every people_ops check.
 */
export function requireRole(...roles: UserRole[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) throw ApiError.unauthorized();
    const allowed = roles.includes(user.role) || user.role === "admin";
    if (!allowed) throw ApiError.forbidden();
    await next();
  });
}

authRoutes.get("/me", requireAuth, async (c) => {
  const session = c.get("user");
  const user = await getUserById(c.env.DB, session.userId);
  if (!user) throw ApiError.unauthorized("Session user no longer exists");
  return c.json({ user });
});
