import type { Env } from "../env";
import { insertAgentRun } from "../db/repo";

/**
 * Step 2 stub: persist a queued run so the API contract is stable. Step 3
 * replaces this module with the real deterministic agent runner.
 */
export async function kickoffAgentRun(requestId: string, env: Env): Promise<string> {
  const run = await insertAgentRun(env.DB, { requestId, status: "queued" });
  return run.id;
}
