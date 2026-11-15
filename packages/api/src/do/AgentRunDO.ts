import type { Env } from "../env";

/**
 * Placeholder exported so Wrangler can resolve the AGENT_RUNS binding during
 * the initial scaffold. Step 3 replaces this with the real run-state object.
 */
export class AgentRunDO implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    void this.state;
    void this.env;
  }

  async fetch(): Promise<Response> {
    return new Response("AgentRunDO not implemented yet", { status: 501 });
  }
}
