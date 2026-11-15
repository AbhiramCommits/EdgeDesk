import {
  SLA_HOURS,
  requestCategorySchema,
  requestPrioritySchema,
  type Request,
  type RequestCategory,
  type ToolCall,
} from "shared";
import { z } from "zod";
import { assignRequest, listUsersByRole } from "../db/repo";
import type { Env } from "../env";
import { addHoursIso } from "../lib/time";
import { triage } from "./triage";

/* ------------------------------------------------------------------ */
/* Context and tool definition shape                                   */
/* ------------------------------------------------------------------ */

export interface ToolContext {
  env: Env;
  request: Request;
  /** Frozen at run start so a whole run shares one deterministic clock. */
  nowIso: string;
}

export interface ToolDefinition<I extends z.ZodTypeAny, O extends z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
  handler: (input: z.infer<I>, ctx: ToolContext) => Promise<z.infer<O>>;
}

export interface AnyTool {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown>;
}

function defineTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  definition: ToolDefinition<I, O>,
): AnyTool {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    handler: (input, ctx) =>
      definition.handler(input as z.infer<I>, ctx) as Promise<unknown>,
  };
}

/* ------------------------------------------------------------------ */
/* Policy KB lexical search (shared by two tools)                      */
/* ------------------------------------------------------------------ */

interface PolicyRow {
  id: string;
  title: string;
  body: string;
  category: string;
  tags: string;
}

export interface PolicySnippet {
  id: string;
  title: string;
  body: string;
  category: RequestCategory;
  score: number;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "need", "please", "my", "i", "a", "an", "to", "is",
  "of", "on", "in", "how", "do", "does", "can", "you", "me", "we", "our", "what",
  "when", "where", "who", "why", "this", "that", "it", "be", "have", "has", "are",
  "was", "were", "will", "would", "should", "could", "about", "from", "at", "as",
  "by", "or", "not", "am", "get", "got", "any", "there", "their",
]);

function tokensOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function countToken(tokens: string[], token: string): number {
  let count = 0;
  for (const candidate of tokens) {
    if (candidate === token || (token.length >= 4 && candidate.startsWith(token))) {
      count += 1;
    }
  }
  return count;
}

export async function searchPolicyKb(
  db: D1Database,
  query: string,
  category?: RequestCategory,
  limit = 3,
): Promise<{ snippets: PolicySnippet[]; totalIndexed: number }> {
  const rows = await db
    .prepare("SELECT id, title, body, category, tags FROM policy_kb ORDER BY id ASC")
    .all<PolicyRow>();

  const queryTokens = [...new Set(tokensOf(query).filter((t) => !STOP_WORDS.has(t)))];

  const scored = rows.results.map((row) => {
    const titleTokens = tokensOf(row.title);
    const tagTokens = tokensOf(row.tags);
    const bodyTokens = tokensOf(row.body);
    let score = category && row.category === category ? 5 : 0;
    for (const token of queryTokens) {
      score += countToken(titleTokens, token) * 4;
      score += countToken(tagTokens, token) * 3;
      score += countToken(bodyTokens, token);
    }
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      category: row.category as RequestCategory,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const matched = scored.filter((item) => item.score > 0);
  const chosen = (matched.length > 0 ? matched : scored).slice(0, limit);
  return { snippets: chosen, totalIndexed: rows.results.length };
}

/* ------------------------------------------------------------------ */
/* Tool 1: classify_request                                            */
/* ------------------------------------------------------------------ */

const classifyRequest = defineTool({
  name: "classify_request",
  description:
    "Classify a People-Ops request into a category with a confidence score using the deterministic triage rules.",
  inputSchema: z.object({ text: z.string().min(3).max(8000) }),
  outputSchema: z.object({
    category: requestCategorySchema,
    priority: requestPrioritySchema,
    confidence: z.number().min(0).max(1),
    signals: z.object({
      categoryScores: z.record(requestCategorySchema, z.number()),
      priorityScores: z.record(requestPrioritySchema, z.number()),
      fallback: z.boolean(),
      margin: z.number(),
      topTerms: z.array(z.string()),
    }),
  }),
  handler: async (input) => {
    const result = triage(input.text);
    return {
      category: result.category,
      priority: result.priority,
      confidence: result.confidence,
      signals: {
        categoryScores: result.signals.categoryScores,
        priorityScores: result.signals.priorityScores,
        fallback: result.signals.fallback,
        margin: result.signals.margin,
        topTerms: result.signals.categoryMatches.slice(0, 5).map((match) => match.term),
      },
    };
  },
});

/* ------------------------------------------------------------------ */
/* Tool 2: estimate_priority                                           */
/* ------------------------------------------------------------------ */

const estimatePriority = defineTool({
  name: "estimate_priority",
  description:
    "Estimate a priority (p0-p3) from urgency cues and compute the SLA due date.",
  inputSchema: z.object({
    text: z.string().min(3).max(8000),
    category: requestCategorySchema.optional(),
  }),
  outputSchema: z.object({
    priority: requestPrioritySchema,
    dueAt: z.string(),
    slaHours: z.number().positive(),
    rationale: z.array(z.string()),
  }),
  handler: async (input, ctx) => {
    const result = triage(input.text);
    const slaHours = SLA_HOURS[result.priority];
    return {
      priority: result.priority,
      dueAt: addHoursIso(ctx.nowIso, slaHours),
      slaHours,
      rationale: result.signals.priorityMatches.slice(0, 5).map((m) => m.term),
    };
  },
});

/* ------------------------------------------------------------------ */
/* Tool 3: search_policy_kb                                            */
/* ------------------------------------------------------------------ */

const searchPolicyKbTool = defineTool({
  name: "search_policy_kb",
  description:
    "Lexically search the seeded People-Ops policy knowledge base and return the top matching snippets.",
  inputSchema: z.object({
    query: z.string().min(2).max(4000),
    category: requestCategorySchema.optional(),
    limit: z.number().int().min(1).max(5).default(3),
  }),
  outputSchema: z.object({
    snippets: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        body: z.string(),
        category: requestCategorySchema,
        score: z.number(),
      }),
    ),
    totalIndexed: z.number().int().nonnegative(),
  }),
  handler: async (input, ctx) => {
    const result = await searchPolicyKb(
      ctx.env.DB,
      input.query,
      input.category,
      input.limit,
    );
    return { snippets: result.snippets, totalIndexed: result.totalIndexed };
  },
});

/* ------------------------------------------------------------------ */
/* Tool 4: check_equipment_stock                                       */
/* ------------------------------------------------------------------ */

interface InventoryRow {
  sku: string;
  name: string;
  category: string;
  quantity: number;
  location: string;
}

const checkEquipmentStock = defineTool({
  name: "check_equipment_stock",
  description:
    "Read the equipment inventory table and report availability for a requested item.",
  inputSchema: z.object({
    item: z.string().min(2).max(160),
    quantity: z.number().int().min(1).max(20).default(1),
  }),
  outputSchema: z.object({
    available: z.boolean(),
    sku: z.string().nullable(),
    name: z.string().nullable(),
    quantity: z.number().int().nonnegative(),
    location: z.string().nullable(),
    alternatives: z.array(
      z.object({
        sku: z.string(),
        name: z.string(),
        quantity: z.number().int().nonnegative(),
      }),
    ),
  }),
  handler: async (input, ctx) => {
    const rows = await ctx.env.DB.prepare(
      "SELECT sku, name, category, quantity, location FROM equipment_inventory ORDER BY sku ASC",
    ).all<InventoryRow>();

    const requested = tokensOf(input.item).filter((t) => !STOP_WORDS.has(t));
    const scored = rows.results.map((row) => {
      const haystack = tokensOf(`${row.name} ${row.category}`);
      let score = 0;
      for (const token of requested) {
        score += countToken(haystack, token);
      }
      return { row, score };
    });
    scored.sort(
      (a, b) => b.score - a.score || b.row.quantity - a.row.quantity || a.row.sku.localeCompare(b.row.sku),
    );

    const best = scored.find((entry) => entry.score > 0);
    if (!best) {
      return {
        available: false,
        sku: null,
        name: null,
        quantity: 0,
        location: null,
        alternatives: scored
          .filter((entry) => entry.row.quantity > 0)
          .slice(0, 3)
          .map((entry) => ({
            sku: entry.row.sku,
            name: entry.row.name,
            quantity: entry.row.quantity,
          })),
      };
    }

    return {
      available: best.row.quantity >= input.quantity,
      sku: best.row.sku,
      name: best.row.name,
      quantity: best.row.quantity,
      location: best.row.location,
      alternatives: scored
        .filter((entry) => entry.row.sku !== best.row.sku && entry.score > 0)
        .slice(0, 3)
        .map((entry) => ({
          sku: entry.row.sku,
          name: entry.row.name,
          quantity: entry.row.quantity,
        })),
    };
  },
});

/* ------------------------------------------------------------------ */
/* Tool 5: assign_owner                                                */
/* ------------------------------------------------------------------ */

const assignOwner = defineTool({
  name: "assign_owner",
  description:
    "Pick a people_ops owner by category round-robin (KV counter) and write the assignment to D1.",
  inputSchema: z.object({ category: requestCategorySchema }),
  outputSchema: z.object({
    assigneeId: z.string(),
    assigneeName: z.string(),
    strategy: z.literal("round-robin"),
    slot: z.number().int().nonnegative(),
  }),
  handler: async (input, ctx) => {
    const owners = await listUsersByRole(ctx.env.DB, "people_ops");
    if (owners.length === 0) {
      throw new Error("No people_ops users are available to assign");
    }
    const key = `assign_rr:${input.category}`;
    const raw = await ctx.env.SESSIONS.get(key);
    const slot = raw ? Number.parseInt(raw, 10) || 0 : 0;
    const owner = owners[slot % owners.length];
    if (!owner) throw new Error("Round-robin owner lookup failed");
    await ctx.env.SESSIONS.put(key, String(slot + 1));
    await assignRequest(ctx.env.DB, ctx.request.id, owner.id);
    return {
      assigneeId: owner.id,
      assigneeName: owner.name,
      strategy: "round-robin" as const,
      slot,
    };
  },
});

/* ------------------------------------------------------------------ */
/* Tool 6: post_resolution_draft                                       */
/* ------------------------------------------------------------------ */

const postResolutionDraft = defineTool({
  name: "post_resolution_draft",
  description:
    "Compose a draft reply from the top policy KB snippets plus the request's own context.",
  inputSchema: z.object({
    category: requestCategorySchema,
    title: z.string().min(1).max(300),
    body: z.string().min(1).max(8000),
  }),
  outputSchema: z.object({
    draft: z.string().min(20),
    citations: z.array(z.object({ id: z.string(), title: z.string() })),
  }),
  handler: async (input, ctx) => {
    const kb = await searchPolicyKb(
      ctx.env.DB,
      `${input.title} ${input.body}`,
      input.category,
      3,
    );
    const bullets =
      kb.snippets.length > 0
        ? kb.snippets
            .map((snippet) => `- ${snippet.title}: ${snippet.body.slice(0, 180)}`)
            .join("\n")
        : "- A People-Ops teammate will review the details and follow up.";
    const draft = [
      `Hi ${ctx.request.requesterName ?? "there"},`,
      "",
      `Thanks for flagging "${input.title}". I triaged this as ${input.category}.`,
      "",
      "Relevant guidance:",
      bullets,
      "",
      "Next steps:",
      "1. A People-Ops owner will confirm the details in this thread.",
      "2. If equipment is involved, stock and shipping are checked before dispatch.",
      "",
      "— EdgeDesk triage agent",
    ].join("\n");
    return {
      draft,
      citations: kb.snippets.map((snippet) => ({ id: snippet.id, title: snippet.title })),
    };
  },
});

/* ------------------------------------------------------------------ */
/* Registry and safe caller                                            */
/* ------------------------------------------------------------------ */

export const TOOLS: Record<string, AnyTool> = {
  [classifyRequest.name]: classifyRequest,
  [estimatePriority.name]: estimatePriority,
  [searchPolicyKbTool.name]: searchPolicyKbTool,
  [checkEquipmentStock.name]: checkEquipmentStock,
  [assignOwner.name]: assignOwner,
  [postResolutionDraft.name]: postResolutionDraft,
};

export const TOOL_NAMES = Object.keys(TOOLS);

export interface ToolError {
  code: "unknown_tool" | "invalid_input" | "invalid_output" | "tool_error";
  message: string;
  details?: unknown;
}

export interface ToolResult {
  ok: boolean;
  name: string;
  output: unknown;
  error: ToolError | null;
  ms: number;
}

function elapsedMs(started: number): number {
  return Math.max(1, Math.round(performance.now() - started));
}

/**
 * Validates input, times the handler, validates output, and returns a typed
 * result. Unknown tools, schema failures, and handler throws never escape.
 */
export async function callTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) {
    return {
      ok: false,
      name,
      output: null,
      error: { code: "unknown_tool", message: `Unknown tool: ${name}` },
      ms: 0,
    };
  }

  const started = performance.now();
  const parsedInput = tool.inputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      name,
      output: null,
      error: {
        code: "invalid_input",
        message: `Invalid input for ${name}`,
        details: parsedInput.error.flatten(),
      },
      ms: elapsedMs(started),
    };
  }

  try {
    const output = await tool.handler(parsedInput.data, ctx);
    const parsedOutput = tool.outputSchema.safeParse(output);
    if (!parsedOutput.success) {
      return {
        ok: false,
        name,
        output,
        error: {
          code: "invalid_output",
          message: `Tool ${name} produced invalid output`,
          details: parsedOutput.error.flatten(),
        },
        ms: elapsedMs(started),
      };
    }
    return {
      ok: true,
      name,
      output: parsedOutput.data,
      error: null,
      ms: elapsedMs(started),
    };
  } catch (error) {
    return {
      ok: false,
      name,
      output: null,
      error: {
        code: "tool_error",
        message: error instanceof Error ? error.message : String(error),
      },
      ms: elapsedMs(started),
    };
  }
}

/** Converts a ToolResult into the shared ToolCall DTO persisted in agent_steps. */
export function toToolCall(result: ToolResult, input: unknown): ToolCall {
  return {
    name: result.name,
    input,
    output: result.output,
    ok: result.ok,
    error: result.error ? { code: result.error.code, message: result.error.message } : null,
    ms: result.ms,
  };
}

