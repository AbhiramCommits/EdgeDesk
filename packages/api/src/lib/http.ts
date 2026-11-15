import type { Context } from "hono";
import { ApiError } from "./errors";

/** Reads a JSON body, turning malformed JSON into a typed 400 instead of a 500. */
export async function readJson(c: Context): Promise<unknown> {
  try {
    return (await c.req.json()) as unknown;
  } catch {
    throw ApiError.badRequest("Request body must be valid JSON");
  }
}
