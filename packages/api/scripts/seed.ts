import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_REQUESTS, SEED_USERS } from "./fixtures";
import { buildSeedSql } from "./seed-sql";

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(here, "..");
const sqlPath = resolve(packageDir, ".wrangler/seed.sql");
const persistTo = process.env["D1_PERSIST_TO"];

function persistArgs(): string[] {
  return persistTo ? ["--persist-to", persistTo] : [];
}

mkdirSync(dirname(sqlPath), { recursive: true });
writeFileSync(sqlPath, buildSeedSql(), "utf8");

function stripAnsi(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\u001b\[[0-9;]*m/g, "");
}

console.log(`Applying ${SEED_REQUESTS.length} requests for ${SEED_USERS.length} users...`);
execFileSync(
  "wrangler",
  ["d1", "execute", "edgedesk", "--local", ...persistArgs(), "--file", sqlPath, "--yes"],
  { cwd: packageDir, stdio: "inherit" },
);

const raw = execFileSync(
  "wrangler",
  [
    "d1",
    "execute",
    "edgedesk",
    "--local",
    ...persistArgs(),
    "--json",
    "--command",
    "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM requests) AS requests",
  ],
  { cwd: packageDir, encoding: "utf8" },
);

const clean = stripAnsi(raw);
const start = clean.indexOf("[");
const end = clean.lastIndexOf("]");
if (start === -1 || end === -1) {
  throw new Error(`Could not parse wrangler --json output:\n${clean}`);
}

interface D1JsonResult {
  results?: Array<{ users?: number; requests?: number }>;
}
const parsed = JSON.parse(clean.slice(start, end + 1)) as D1JsonResult[];
const row = parsed[0]?.results?.[0];

console.log(
  `Seeded local D1: users=${row?.users ?? "?"} requests=${row?.requests ?? "?"}`,
);
