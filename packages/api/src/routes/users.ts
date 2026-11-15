import { Hono } from "hono";
import { requireAuth } from "../auth";
import { listAssignableUsers } from "../db/repo";
import type { AppEnv } from "../env";

export const userRoutes = new Hono<AppEnv>();

userRoutes.use("*", requireAuth);

userRoutes.get("/assignable", async (c) => {
  const users = await listAssignableUsers(c.env.DB);
  return c.json({ users });
});
