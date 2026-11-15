# Contributing to EdgeDesk

EdgeDesk is a single-sprint-sized, serverless People-Ops desk. Contributions are welcome as long
as they keep the project runnable offline, deterministic where it matters, and measured where it
claims results.

## Sprint and ticket workflow

1. **Pick a ticket.** Work is tracked as GitHub issues, one vertical slice per ticket. Labels:
   `area:api`, `area:web`, `area:agent`, `area:infra`, `area:docs`, plus `type:bug`,
   `type:feature`, `type:test`, `type:docs`.
2. **Branch.** `feat/EDG-123-short-description`, `fix/EDG-123-short-description`, or
   `docs/EDG-123-short-description`. Branch from `main`.
3. **Sprint slice.** A ticket should be shippable on its own: implementation, tests, and docs in the
   same PR. Do not mix unrelated refactors.
4. **Definition of done.** The PR is done only when:
   - `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass locally.
   - New behaviour has unit/integration coverage; UI flows have a Playwright spec.
   - If triage rules or the dataset changed, `pnpm eval` has been rerun and `reports/eval.md`
     updated.
   - If the Worker or endpoints changed, `pnpm bench` has been rerun and `reports/bench.md`
     updated.
   - README numbers are reconciled with the fresh reports.
   - No secrets, account ids, or remote resource ids are committed.
5. **Review.** One approving review. Reviewers run the commands in the PR checklist, not just read
   the diff.

## Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/) with a package scope when useful:

```
feat(api): add request resolution endpoint
fix(web): keep assignee selection through agent refresh
test(e2e): cover the 403 path for employees
docs: reconcile benchmark numbers
chore: bump wrangler to 3.114.17
```

- One logical change per commit; do not combine independent tickets.
- Imperative subject, 72 characters or fewer. Put the *why* in the body.
- Never commit commented-out code, generated build output, `.wrangler/`, or local `.dev.vars`.
- Reports (`reports/eval.*`, `reports/bench.*`) are generated artefacts and are committed on
  purpose so results are traceable in review.

## Local development

```bash
pnpm install
pnpm migrate          # apply both D1 migrations locally
pnpm seed             # 6 users + 60 requests
pnpm dev:api          # wrangler dev on 8787
pnpm dev:web          # Vite on 5173, proxies /api to 8787
```

Run the whole gate before opening a PR:

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e
pnpm eval
pnpm bench
pnpm build
```

## Code standards

- TypeScript strict mode with `noUncheckedIndexedAccess`; no `any` (ESLint enforces it).
- Validate every external boundary with the zod schemas in `packages/shared`. DTO types come from
  there; do not duplicate them in the web app.
- D1 access goes through `packages/api/src/db/repo.ts`, using prepared statements and `.bind()`.
  Never interpolate user input into SQL.
- Every mutation writes one `audit_events` row. Agent-generated changes use the `agent:triage`
  actor; user changes use `user:<email>`.
- The default triage path must stay deterministic. Any new rule belongs in the exported
  `TRIAGE_RULES` table so the eval harness can reason about it.
- UI components use the tokens in `styles/tokens.css`. Status, priority, category, and role labels
  render through `BADGE_VARIANTS` and the shared `Badge` component.
- Background work uses `waitUntil`; tests set `AGENT_TRIGGER=manual` and call `runAgent()` directly
  to stay inside Vitest's isolated storage frame.

## Security and deployment

Local development and CI never contact Cloudflare. The deploy workflow requires repository secrets
and is skipped when `CLOUDFLARE_API_TOKEN` is absent. See `.github/workflows/deploy.yml` for the
secret list and the remote config generation step.

Report security issues privately to the maintainers instead of opening a public issue.
