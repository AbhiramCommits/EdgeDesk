import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_dev } from "wrangler";
import { buildSeedSql } from "../scripts/seed-sql";

const N = 500;
const CONCURRENCY = 10;
const PORT = 8790;
const EMPLOYEE_EMAIL = "ada.lovelace@edgedesk.test";

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(here, "..");
const repoRoot = resolve(packageDir, "../..");
const reportsDir = resolve(repoRoot, "reports");
const stateDir = resolve(packageDir, ".wrangler/bench-state");
const seedSqlPath = resolve(packageDir, ".wrangler/bench-seed.sql");

const isWindows = process.platform === "win32";
const wranglerBin = resolve(
  packageDir,
  isWindows ? "node_modules/.bin/wrangler.cmd" : "node_modules/.bin/wrangler",
);

function stripAnsi(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\u001b\[[0-9;]*m/g, "");
}

function runWrangler(args: string[], capture = true): string {
  return execFileSync(wranglerBin, args, {
    cwd: packageDir,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

/* ------------------------------------------------------------------ */
/* Fresh local D1 + seed                                               */
/* ------------------------------------------------------------------ */

console.log("Benchmark: preparing isolated local D1 state...");
rmSync(stateDir, { recursive: true, force: true });
rmSync(resolve(packageDir, "dist-worker"), { recursive: true, force: true });
mkdirSync(dirname(seedSqlPath), { recursive: true });
writeFileSync(seedSqlPath, buildSeedSql(), "utf8");

runWrangler(
  ["d1", "migrations", "apply", "edgedesk", "--local", "--persist-to", stateDir],
  false,
);
runWrangler(
  ["d1", "execute", "edgedesk", "--local", "--persist-to", stateDir, "--file", seedSqlPath, "--yes"],
  false,
);

interface ParsedD1Row {
  [key: string]: string | number | null;
}

function d1Query(sql: string): ParsedD1Row[] {
  const raw = stripAnsi(
    runWrangler([
      "d1",
      "execute",
      "edgedesk",
      "--local",
      "--persist-to",
      stateDir,
      "--json",
      "--command",
      sql,
    ]),
  );
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error(`Could not parse D1 JSON output:\n${raw.slice(0, 1000)}`);
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Array<{
    results?: ParsedD1Row[];
  }>;
  return parsed[0]?.results ?? [];
}

/* ------------------------------------------------------------------ */
/* Worker bundle size                                                  */
/* ------------------------------------------------------------------ */

console.log("Benchmark: measuring Worker bundle with wrangler deploy --dry-run...");
const dryRun = spawnSync(wranglerBin, ["deploy", "--dry-run", "--outdir", "dist-worker"], {
  cwd: packageDir,
  encoding: "utf8",
});
const dryOutput = `${dryRun.stdout ?? ""}\n${dryRun.stderr ?? ""}`;
const bundleMatch = dryOutput.match(
  /Total Upload:\s*([\d.]+)\s*KiB\s*\/\s*gzip:\s*([\d.]+)\s*KiB/i,
);
if (dryRun.status !== 0 || !bundleMatch) {
  throw new Error(
    `Could not read Worker bundle size from wrangler dry-run (exit ${dryRun.status}):\n${dryOutput.slice(-4000)}`,
  );
}
const workerBundle = {
  rawKiB: Number.parseFloat(bundleMatch[1] ?? "0"),
  gzipKiB: Number.parseFloat(bundleMatch[2] ?? "0"),
};

/* ------------------------------------------------------------------ */
/* Boot Worker via unstable_dev                                        */
/* ------------------------------------------------------------------ */

console.log(`Benchmark: booting Worker via unstable_dev on 127.0.0.1:${PORT}...`);
const worker = await unstable_dev("src/index.ts", {
  config: "wrangler.toml",
  local: true,
  ip: "127.0.0.1",
  port: PORT,
  persistTo: stateDir,
  logLevel: "none",
  experimental: {
    disableExperimentalWarning: true,
    forceLocal: true,
  },
});

interface FetchResult {
  ms: number;
  status: number;
  text: string;
}

interface BenchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

async function timedFetch(path: string, init?: BenchInit): Promise<FetchResult> {
  const started = performance.now();
  const response = await worker.fetch(
    path,
    init as unknown as Parameters<typeof worker.fetch>[1],
  );
  const text = await response.text();
  const ms = performance.now() - started;
  if (!response.ok) {
    throw new Error(`${path} -> ${response.status}: ${text.slice(0, 300)}`);
  }
  return { ms, status: response.status, text };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

interface LoadResult {
  name: string;
  method: string;
  path: string;
  n: number;
  concurrency: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  min: number;
  mean: number;
  throughputReqPerSec: number;
  totalMs: number;
}

async function runLoad(
  name: string,
  method: string,
  path: string,
  makeRequest: (index: number) => Promise<number>,
): Promise<LoadResult> {
  const latencies: number[] = [];
  let nextIndex = 0;
  const started = performance.now();

  const loop = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= N) return;
      latencies.push(await makeRequest(index));
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, N) }, () => loop()),
  );

  const totalMs = performance.now() - started;
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const round = (value: number): number => Math.round(value * 100) / 100;
  return {
    name,
    method,
    path,
    n: sorted.length,
    concurrency: CONCURRENCY,
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted[sorted.length - 1] ?? 0),
    min: round(sorted[0] ?? 0),
    mean: round(sum / Math.max(1, sorted.length)),
    throughputReqPerSec: round(N / (totalMs / 1000)),
    totalMs: round(totalMs),
  };
}

let cookie = "";
let firstRequestId: string | null = null;
let lastRequestId: string | null = null;
let createdRuns = 0;

try {
  const login = await worker.fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMPLOYEE_EMAIL }),
  });
  if (!login.ok) {
    throw new Error(`Benchmark login failed with ${login.status}: ${await login.text()}`);
  }
  await login.text();
  cookie = login.headers.get("set-cookie") ?? "";
  if (!cookie) throw new Error("Benchmark login did not return a session cookie");
  const cookieHeader = cookie.split(";")[0] ?? cookie;
  const authHeaders = { cookie: cookieHeader };

  console.log("Benchmark: warming health/list/detail routes...");
  for (let i = 0; i < 5; i += 1) {
    await timedFetch("/api/health");
    await timedFetch("/api/requests?limit=50", { headers: authHeaders });
  }

  console.log(`Benchmark: GET /api/health x${N}...`);
  const health = await runLoad("health", "GET", "/api/health", async () => {
    const result = await timedFetch("/api/health");
    return result.ms;
  });

  console.log(`Benchmark: POST /api/requests x${N} (agent kickoff)...`);
  const create = await runLoad("create_request", "POST", "/api/requests", async (index) => {
    const result = await timedFetch("/api/requests", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        title: `Benchmark request ${index}`,
        body: "Synthetic benchmark request: my laptop monitor is broken and I need a replacement this week.",
      }),
    });
    const parsed = JSON.parse(result.text) as {
      request?: { id?: string };
      runId?: string;
    };
    if (!firstRequestId && parsed.request?.id) firstRequestId = parsed.request.id;
    if (parsed.request?.id) lastRequestId = parsed.request.id;
    if (parsed.runId) createdRuns += 1;
    return result.ms;
  });

  if (!firstRequestId || !lastRequestId) {
    throw new Error("Benchmark did not create any requests");
  }

  console.log(`Benchmark: GET /api/requests?limit=50 x${N}...`);
  const list = await runLoad("list_requests", "GET", "/api/requests", async () => {
    const result = await timedFetch("/api/requests?limit=50", { headers: authHeaders });
    return result.ms;
  });

  console.log(`Benchmark: GET /api/requests/:id x${N}...`);
  const detail = await runLoad("get_request", "GET", "/api/requests/:id", async () => {
    const result = await timedFetch(`/api/requests/${firstRequestId}`, {
      headers: authHeaders,
    });
    return result.ms;
  });

  console.log("Benchmark: waiting for background agent runs to finish...");
  const waitDeadline = Date.now() + 180_000;
  let pending = Number.POSITIVE_INFINITY;
  while (Date.now() < waitDeadline) {
    try {
      const rows = d1Query(
        "SELECT COUNT(*) AS n FROM agent_runs WHERE status IN ('queued', 'running')",
      );
      pending = Number(rows[0]?.["n"] ?? 0);
      if (pending === 0) break;
    } catch {
      const detailRes = await worker.fetch(`/api/requests/${lastRequestId}`, {
        headers: authHeaders,
      });
      const body = (await detailRes.json()) as {
        latestRun?: { status?: string } | null;
      };
      if (body.latestRun?.status === "finished" || body.latestRun?.status === "failed") {
        pending = 0;
        break;
      }
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
  }
  console.log(`Benchmark: pending agent runs after wait: ${pending}`);

  const statusRows = d1Query(
    "SELECT status, COUNT(*) AS n FROM agent_runs GROUP BY status ORDER BY status",
  );
  const durationRows = d1Query(
    "SELECT duration_ms FROM agent_runs WHERE status = 'finished' AND duration_ms IS NOT NULL ORDER BY duration_ms ASC",
  );
  const durations = durationRows
    .map((row) => Number(row["duration_ms"] ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  const round = (value: number): number => Math.round(value * 100) / 100;
  const durationSum = durations.reduce((total, value) => total + value, 0);
  const agentRuns = {
    totalRows: statusRows.reduce((total, row) => total + Number(row["n"] ?? 0), 0),
    statusCounts: Object.fromEntries(
      statusRows.map((row) => [String(row["status"]), Number(row["n"] ?? 0)]),
    ) as Record<string, number>,
    finishedWithDuration: durations.length,
    p50: round(percentile(durations, 50)),
    p95: round(percentile(durations, 95)),
    p99: round(percentile(durations, 99)),
    max: round(durations[durations.length - 1] ?? 0),
    min: round(durations[0] ?? 0),
    mean: round(durationSum / Math.max(1, durations.length)),
  };

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      node: process.version,
      runtime: "wrangler unstable_dev / Miniflare (local, no Cloudflare account)",
      n: N,
      concurrency: CONCURRENCY,
      seededRequests: 60,
      requestsCreated: create.n,
      createdRuns,
      pendingRunsAfterWait: Number.isFinite(pending) ? pending : null,
      workerBundle,
    },
    endpoints: [health, create, list, detail],
    agentRuns,
  };

  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(resolve(reportsDir, "bench.json"), `${JSON.stringify(report, null, 2)}\n`);

  const lines: string[] = [];
  lines.push("# Edge latency benchmark");
  lines.push("");
  lines.push(
    `Local Wrangler \`unstable_dev\` (Miniflare) on Node ${process.version}. ` +
      `N=${N} requests per endpoint, concurrency ${CONCURRENCY}, isolated local D1/KV/DO state. ` +
      `No Cloudflare account or network calls.`,
  );
  lines.push("");
  lines.push("## Endpoint latency");
  lines.push("");
  lines.push("| Endpoint | Method | N | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | req/s |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const item of report.endpoints) {
    lines.push(
      `| ${item.path} | ${item.method} | ${item.n} | ${item.p50} | ${item.p95} | ${item.p99} | ${item.max} | ${item.throughputReqPerSec} |`,
    );
  }
  lines.push("");
  lines.push("## Agent runs (from `agent_runs`)");
  lines.push("");
  lines.push("| Runs | Finished with duration | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | mean (ms) |");
  lines.push("| ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  lines.push(
    `| ${agentRuns.totalRows} | ${agentRuns.finishedWithDuration} | ${agentRuns.p50} | ${agentRuns.p95} | ${agentRuns.p99} | ${agentRuns.max} | ${agentRuns.mean} |`,
  );
  lines.push("");
  lines.push(
    `Run status counts: ${Object.entries(agentRuns.statusCounts)
      .map(([status, count]) => `${status}=${count}`)
      .join(", ")}. Pending after wait: ${String(report.meta.pendingRunsAfterWait)}.`,
  );
  lines.push("");
  lines.push("## Worker bundle (`wrangler deploy --dry-run`)");
  lines.push("");
  lines.push("| Raw | Gzipped |");
  lines.push("| ---: | ---: |");
  lines.push(`| ${workerBundle.rawKiB} KiB | ${workerBundle.gzipKiB} KiB |`);
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push(
    "- `POST /api/requests` returns after the D1 insert and queues the agent run with `waitUntil`, so its latency is the kickoff latency, not the agent run duration.",
  );
  lines.push(
    "- Agent run durations are read back from the `agent_runs` table after all background runs finish.",
  );
  lines.push(
    "- This is a single-machine local benchmark; absolute numbers will differ on Cloudflare's edge and other hardware.",
  );
  lines.push("");

  writeFileSync(resolve(reportsDir, "bench.md"), `${lines.join("\n")}\n`);

  console.log("Benchmark complete");
  for (const item of report.endpoints) {
    console.log(
      `  ${item.method} ${item.path}: p50=${item.p50}ms p95=${item.p95}ms p99=${item.p99}ms max=${item.max}ms ${item.throughputReqPerSec} req/s`,
    );
  }
  console.log(
    `  agent runs: ${agentRuns.finishedWithDuration} finished, p50=${agentRuns.p50}ms p95=${agentRuns.p95}ms p99=${agentRuns.p99}ms max=${agentRuns.max}ms`,
  );
  console.log(`  worker bundle: ${workerBundle.rawKiB} KiB raw / ${workerBundle.gzipKiB} KiB gzip`);
  console.log("  reports/bench.json and reports/bench.md written");
} finally {
  await worker.stop();
}
