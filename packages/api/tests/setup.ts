import { beforeAll } from "vitest";
import { env } from "cloudflare:test";
import initSql from "../src/db/migrations/0001_init.sql?raw";
import slaSql from "../src/db/migrations/0002_sla.sql?raw";

/**
 * The test D1 API executes one prepared statement per call, so split the
 * migration files into statements (comments stripped) and apply them in order.
 */
function statements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function apply(sql: string): Promise<void> {
  for (const statement of statements(sql)) {
    await env.DB.prepare(statement).run();
  }
}

beforeAll(async () => {
  await apply(initSql);
  await apply(slaSql);
});
