# EdgeDesk

EdgeDesk is a serverless internal People-Ops request desk that runs entirely on Cloudflare's
developer platform. Employees file equipment, onboarding, policy, access, payroll, and general
requests from a React + TypeScript client; a single Hono Worker is the only backend, handling auth,
routing, the full request lifecycle, audit logging, and an agent that triages each request at the
edge with no origin server. Relational data lives in D1, sessions live in Workers KV, and in-flight
agent run state lives in a Durable Object so the UI can stream live progress. A deterministic
rule-and-lexical triage engine is the default and is what the evaluation measures; a reproducible
eval harness, an edge latency benchmark, a Playwright suite, and a gated GitHub Actions deploy
pipeline ship with the repo.

## Architecture

```text
                         ┌──────────────────────────────────────────────┐
                         │ Browser (React 18 + Vite, TypeScript strict) │
                         └──────────────────────┬───────────────────────┘
                                                │ HTTPS + HttpOnly session cookie
                                                ▼
                         ┌──────────────────────────────────────────────┐
                         │ Cloudflare Pages — static bundle + SPA      │
                         │ fallback; /api/* proxied to the Worker       │
                         └──────────────────────┬───────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Cloudflare Worker (Hono) — the only backend                                         │
│                                                                                     │
│  auth: KV session lookup, role gates        request lifecycle: create/list/detail/  │
│                                             patch/resolve + audit on every mutation │
│                                                                                     │
│  POST /api/requests ──► insert request ──► audit created ──► waitUntil(runAgent)    │
│                                                                                     │
│  agent runner ──► classify → plan → estimate → KB → stock? → assign → draft         │
│       │                 │                                                           │
│       │                 └── each tool call persisted as agent_steps(input, output, ms)│
│       ├── structured outcome written back to requests (category, priority, owner,   │
│       │   due_at, draft_resolution)                                                 │
│       └── Durable Object AgentRunDO: per-request live state + SSE                    │
└───────┬─────────────────────────────┬───────────────────────────────┬───────────────┘
        │                             │                               │
        ▼                             ▼                               ▼
┌───────────────┐             ┌───────────────┐               ┌──────────────────────┐
│ D1            │             │ Workers KV    │               │ Durable Object       │
│ users         │             │ session:<id>  │               │ AgentRunDO           │
│ requests      │             │ assign_rr:<c> │               │  state, steps, SSE   │
│ agent_runs    │             └───────────────┘               └──────────────────────┘
│ agent_steps   │
│ audit_events  │             ┌────────────────────────────────────────────────────────┐
│ policy_kb     │             │ Typed tool registry (zod input + output schemas)      │
│ equipment_     │             │ classify_request, estimate_priority, search_policy_kb,│
│ inventory     │             │ check_equipment_stock, assign_owner,                  │
└───────────────┘             │ post_resolution_draft                                 │
                              └────────────────────────────────────────────────────────┘
```

### Bindings

| Binding | Cloudflare primitive | What it stores | Notes |
| --- | --- | --- | --- |
| `DB` | D1 | users, requests, agent runs/steps, audit events, policy KB, equipment inventory | Real SQL migrations and foreign keys; prepared statements only. Committed config uses `database_id = "local"`. |
| `SESSIONS` | Workers KV | `session:<uuid>` → `{ userId, role, email }`; `assign_rr:<category>` round-robin counters | Sessions have a 12-hour TTL. KV is the right fit for per-session reads and expiry. |
| `AGENT_RUNS` | Durable Object | Per-request run status, ordered steps, duration, SSE subscribers | One instance per request id (`idFromName(requestId)`), so run progress is strongly ordered and streamable. |
| `TRIAGE_MODE` | Var | `"rules"` | Default deterministic path. The optional `llm` path is not implemented/measured. |
| `AGENT_TRIGGER` | Var | `"waitUntil"` | Production/e2e uses background `waitUntil`; unit tests set `manual` and await `runAgent()` inside the test. |

### Request lifecycle

1. `POST /api/requests` authenticates the KV session, validates the body with the shared zod schema,
   inserts a `requests` row with status `new`, and writes exactly one `request.created` audit event.
2. It creates a queued `agent_runs` row and returns `{ request, runId }` immediately. The run is
   kicked off with `c.executionCtx.waitUntil(runAgent(...))` so the HTTP response stays fast.
3. `runAgent` marks the run `running`, starts the Durable Object, then classifies the text and plans
   a category-dependent tool sequence: `classify_request → estimate_priority → search_policy_kb →
   check_equipment_stock (equipment only) → assign_owner → post_resolution_draft`.
4. Every tool call is validated on input and output, timed, persisted as an `agent_steps` row with
   input/output JSON and milliseconds, and appended to the Durable Object.
5. The structured outcome is written back to the request (`category`, `priority`, `assignee_id`,
   `due_at`, `draft_resolution`, status `in_progress`) and `request.triaged` / `request.assigned`
   audit events are written.
6. The run is marked `finished` with `duration_ms`. Clients poll `GET /api/requests/:id/run` or
   subscribe to `GET /api/requests/:id/run/stream`; the SSE stream replays steps from the Durable
   Object and ends with a terminal `done` event.
7. People-Ops mutations (`PATCH`, `POST /resolve`) are role-gated, update D1, and write one audit
   row per mutation. The detail page re-renders the audit timeline and the live agent timeline.

## Data model

```text
users(id PK, email UNIQUE, name, role CHECK employee|people_ops|admin, created_at)

requests(id PK, requester_id FK→users, title, body, category CHECK, priority CHECK,
         status CHECK, assignee_id FK→users, resolution, created_at, updated_at,
         due_at, sla_breached, resolved_at, draft_resolution)

agent_runs(id PK, request_id FK→requests, status CHECK, triage_category, triage_priority,
           confidence REAL, started_at, finished_at, duration_ms)

agent_steps(id PK, run_id FK→agent_runs, seq, kind CHECK plan|tool|outcome|error,
            tool_name, input_json, output_json, ms, created_at)

audit_events(id PK, actor, entity_type, entity_id, action, detail_json, created_at)

policy_kb(id PK, title, body, category, tags)
equipment_inventory(sku PK, name, category, quantity, location)
```

Indexes: `requests(status)`, `requests(category)`, `requests(created_at)`, `requests(due_at)`,
`agent_runs(request_id)`, `agent_steps(run_id)`, `audit_events(entity_id)`.

**Migrations**

- `packages/api/src/db/migrations/0001_init.sql` creates the five core tables, checks, foreign keys,
  and indexes.
- `packages/api/src/db/migrations/0002_sla.sql` adds `due_at`, `sla_breached`, `resolved_at`, and
  `draft_resolution`, creates the `v_open_requests` view, and creates/seeds the two reference tables
  the agent tools read (`policy_kb`, `equipment_inventory`).

Both are applied in order by `wrangler d1 migrations apply edgedesk --local`; the local D1 records
`0001_init.sql` then `0002_sla.sql`. The split also proves migration ordering works against real
local D1 rather than relying on a single schema dump.

**Why D1 + KV + Durable Objects**

- **D1** is the system of record: joins (requester/assignee names), foreign keys, filtered and
  paginated lists, audit queries, and run history all need relational guarantees.
- **KV** fits ephemeral session state: a small value keyed by a random session id, read on every
  authenticated request, with native TTL expiry. It also holds the low-stakes category round-robin
  counter. Session writes should not churn the relational store.
- **Durable Objects** fit a single request's in-flight run: one logical owner, ordered step appends,
  strongly consistent reads, and a long-lived SSE stream. Completed run history is persisted back to
  D1; the DO is the live coordination point, not the system of record.

## How to run

Prerequisites: Node.js 22 (`.nvmrc`), pnpm 12.8.1, and no Cloudflare account. Everything below runs
offline against local Miniflare/workerd; no API token or network call to Cloudflare is required.

```bash
corepack enable
pnpm install
pnpm migrate        # applies 0001_init.sql and 0002_sla.sql to local D1
pnpm seed           # 6 users + 60 deterministic requests

# terminal 1
pnpm dev:api        # wrangler dev --local, http://127.0.0.1:8787

# terminal 2
pnpm dev:web        # Vite, http://localhost:5173, proxies /api to 8787
```

Open `http://localhost:5173` and sign in with a seeded email (email-only demo auth):

| Email | Role |
| --- | --- |
| `ada.lovelace@edgedesk.test` | employee |
| `priya.raman@edgedesk.test` | people_ops |
| `sasha.ivanov@edgedesk.test` | admin |

Verification and measurement commands:

```bash
pnpm lint
pnpm typecheck
pnpm test           # Vitest inside workerd with real D1/KV/DO
pnpm test:e2e       # Playwright; recreates local D1, applies migrations, seeds, builds + previews
pnpm eval           # reports/eval.json + reports/eval.md
pnpm bench          # reports/bench.json + reports/bench.md
pnpm build          # packages/web/dist, Pages-ready
```

`pnpm test:e2e` starts both servers itself (fresh local state), so stop the dev servers first.

### Deploy path

The committed `wrangler.toml` is intentionally local-only (`database_id = "local"` and a placeholder
KV id). For a real deployment:

1. Create a remote D1 database and KV namespace, then put their ids in a remote config (the deploy
   workflow generates `wrangler.remote.toml` from repository secrets).
2. Run the migrations against the real D1:
   `wrangler d1 migrations apply edgedesk --remote --config wrangler.remote.toml`
3. Deploy the Worker: `wrangler deploy --config wrangler.remote.toml`
4. Build the Pages bundle: `pnpm --filter web build`, then deploy `packages/web/dist` with
   `wrangler pages deploy packages/web/dist --project-name edgedesk`.
   If using Pages Git integration: root `packages/web`, build `pnpm build`, output `dist`.
5. Pages serves static files and the `_redirects` rule proxies `/api/*` to the Worker, so the
   HttpOnly cookie stays same-site.

`.github/workflows/deploy.yml` documents the required secrets: `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_KV_NAMESPACE_ID`, and
`CLOUDFLARE_PAGES_PROJECT`. The deploy job is guarded by
`if: ${{ secrets.CLOUDFLARE_API_TOKEN != '' }}`, so it no-ops without credentials. The CI workflow
runs lint, typecheck, tests, eval, build, and Playwright on every push/PR.

## RESULTS

Measured on 2026-11-14 on this machine (macOS arm64, Node v26.13.0, pnpm 12.8.1). All numbers are
regenerable with the commands above. Traceability:

| Result | Source |
| --- | --- |
| Triage metrics, per-category table, confusion matrix | [`reports/eval.md`](./reports/eval.md), [`reports/eval.json`](./reports/eval.json) |
| Endpoint latency, agent run duration, Worker bundle, N/concurrency | [`reports/bench.md`](./reports/bench.md), [`reports/bench.json`](./reports/bench.json) |
| Unit/e2e runtime, build sizes, migration/seed counts | [`reports/verification.md`](./reports/verification.md) |

### Triage evaluation

Dataset: **160** hand-authored labeled requests (`packages/api/eval/dataset.json`), covering all six
categories and 20 `other` rows. Regenerate with `pnpm eval`. Construction and limitations are
documented in [`packages/api/eval/DATASET.md`](./packages/api/eval/DATASET.md).

| Metric | Value |
| --- | ---: |
| Category accuracy | **98.8%** (158/160) |
| Macro-F1 (6 categories) | **0.9860** |
| Priority exact-match accuracy | **95.0%** (152/160) |
| Mean confidence on correct predictions | 0.9253 |
| Mean confidence on incorrect predictions | 0.8150 |

| Category | Support | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| equipment | 32 | 0.970 | 1.000 | 0.985 |
| onboarding | 23 | 1.000 | 1.000 | 1.000 |
| policy | 30 | 1.000 | 1.000 | 1.000 |
| access | 31 | 0.969 | 1.000 | 0.984 |
| payroll | 24 | 1.000 | 1.000 | 1.000 |
| other | 20 | 1.000 | 0.900 | 0.947 |

Confusion matrix (rows = labeled, columns = predicted):

| actual \ predicted | equipment | onboarding | policy | access | payroll | other |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **equipment** | 32 | 0 | 0 | 0 | 0 | 0 |
| **onboarding** | 0 | 23 | 0 | 0 | 0 | 0 |
| **policy** | 0 | 0 | 30 | 0 | 0 | 0 |
| **access** | 0 | 0 | 0 | 31 | 0 | 0 |
| **payroll** | 0 | 0 | 0 | 0 | 24 | 0 |
| **other** | 1 | 0 | 0 | 1 | 0 | 18 |

The weakest class is `other` (recall 0.900): both misses are facilities-flavoured `other`
requests that mention equipment/access nouns — a desk move that mentions monitors/docks and a guest
visit that mentions a badge. The two highest-confidence misses are in [`reports/eval.md`](./reports/eval.md).

### Edge latency benchmark

N = **500** requests per endpoint, concurrency 10, against a Worker booted with
`wrangler unstable_dev` (local Miniflare, real local D1/KV/DO). `POST /api/requests` measures the
kickoff latency (the agent run continues via `waitUntil`), not the run duration.

| Endpoint | Method | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | req/s |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `/api/health` | GET | 12.45 | 32.44 | 114.81 | 124.96 | 611.31 |
| `/api/requests` | POST | 383.27 | 1169.40 | 4110.17 | 4116.42 | 17.21 |
| `/api/requests?limit=50` | GET | 52.24 | 101.75 | 197.17 | 198.43 | 168.63 |
| `/api/requests/:id` | GET | 57.54 | 113.13 | 182.51 | 263.71 | 153.16 |

Agent run end-to-end duration read back from `agent_runs` after all 500 background runs finished:

| Runs | Finished | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | mean (ms) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 500 | **206** | **459** | 507 | 519 | 223.16 |

The long POST tail (p99 ≈ 4.1 s) is the 500-run burst contending on local D1 and Durable Object
writes, not a normal interactive request path. The benchmark is a single-machine local run.

### Bundle sizes

| Artifact | Raw | Gzipped |
| --- | ---: | ---: |
| Worker (`wrangler deploy --dry-run`) | 291.06 KiB | 59.31 KiB |
| Web JS (`pnpm build`) | 259.26 kB | 77.22 kB |
| Web CSS | 18.19 kB | 4.24 kB |
| Web HTML | 0.55 kB | 0.34 kB |

### Test coverage

| Suite | Count | Runtime |
| --- | ---: | ---: |
| Vitest unit/integration (workerd, real D1/KV/DO bindings) | **58 tests** | **2.32 s** |
| Playwright end-to-end (Chromium, fresh D1/KV/DO per run) | **6 specs** | **28.3 s** |

The unit suite covers auth success/failure, role enforcement (403), zod rejection (400), pagination,
filters, status transitions, the resolve flow, exactly-one-audit-row assertions, all six tools'
happy and invalid-input paths, runner end-to-end and idempotency, DO state transitions, and SSE
`done` events. Playwright covers intake, live agent timeline, queue counts/filtering, people_ops
assign+resolve, the employee 403 UI error, inline validation, audit ordering, and the SSE tool-step
stream.

### Database

Fresh local D1: **6 users**, **60 requests**, both migrations applied
(`0001_init.sql` then `0002_sla.sql`), 16 seeded policy KB rows, and 11 seeded inventory rows. The
seed is idempotent and deterministic.

### AI-assist stats

From [`docs/AI_ASSIST_LOG.md`](./docs/AI_ASSIST_LOG.md): **97** hand-authored files reviewed across
six steps, **72 accepted as-is**, **25 corrected**. The three most significant corrections:

1. Background `waitUntil` agent runs wrote Durable Object storage outside Vitest's isolated storage
   frame. Added an explicit `AGENT_TRIGGER` execution mode so unit tests await the runner while
   production and Playwright keep the asynchronous path.
2. The triage term tokenizer stripped `*`, so stems such as `onboard*` never prefix-matched
   "onboarding"; the first correction then exposed `intern*` matching "internet". Both were fixed in
   the rule matcher, not papered over in the dataset.
3. The detail page's SSE completion callback reloaded the request and overwrote a pending assignee
   selection, causing a real 400 "No changes" in the browser. Added a dirty-state guard.

## Limitations and next steps

- **Rules-based ceiling.** Triage is deterministic keyword/phrase scoring. It handles this vocabulary
  well but will miss paraphrases, negation, sarcasm, and non-English text. There is no semantic
  retrieval.
- **Self-authored evaluation.** The 160-row dataset was written alongside the rule table, so 98.8% is
  an optimistic, in-distribution number. A production evaluation needs independently labeled real
  tickets and inter-annotator agreement. The two remaining misses are documented rather than
  removed.
- **No real LLM baseline.** `TRIAGE_MODE=llm` is reserved but no Workers AI binding or LLM triage
  path is implemented, so there are no LLM accuracy or latency numbers to compare.
- **Local benchmark only.** `unstable_dev` on one machine is not Cloudflare's edge. Concurrency is
  10, there is no multi-region measurement, and the POST p99 is a local burst artefact.
- **Demo auth.** Email-only login with seeded users is not production authentication. There is no
  password, SSO, MFA, rate limiting, or session revocation list.
- **Lexical policy search.** `search_policy_kb` scores tokens in D1; it is not embeddings/vector
  search. The equipment inventory is a small static table.
- **Offset pagination and simple sorting.** Fine for the demo volume; a production queue would want
  keyset pagination and stable SLA sweep jobs.
- **Durable Object test isolation.** The Vitest pool runs a single runtime with explicit D1/KV
  resets because DO isolated-storage teardown was unreliable with the storage writes. CI is
  deterministic, but tests cannot run in parallel files today.
- **No remote deployment was performed.** The deploy workflow is gated and unexercised without
  credentials; its remote config substitution and Pages project settings must be validated against
  a real account.
- **Next steps.** Add a Workers AI triage adapter behind `TRIAGE_MODE=llm` and a paired eval split,
  replace the lexical KB with Vectorize, add SLA sweep alarms, move sessions to signed cookies or
  Access, and run the benchmark against a deployed staging Worker.

## Demo

A 90-second click-by-click demo script, what should be on screen at each step, and recording
commands live in [`docs/DEMO.md`](./docs/DEMO.md). No recording file is committed; the document
states where it would go.

## License

MIT — see [`LICENSE`](./LICENSE).
