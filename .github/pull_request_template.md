# Pull request

## Summary

<!-- What changed and why? Link the sprint ticket. -->

- Ticket: EDG-
- Area: api / web / agent / infra / docs

## Changes

<!-- Bullet the user-visible and internal changes. -->

-

## Verification

<!-- Every command must have actually been run for this PR. -->

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test` — tests: ___ , runtime: ___
- [ ] `pnpm test:e2e` — specs: ___ , runtime: ___
- [ ] `pnpm eval` — accuracy: ___ , macro-F1: ___
- [ ] `pnpm bench` (required if Worker/endpoint/agent changed)
- [ ] `pnpm build`
- [ ] README/report numbers reconciled with fresh output

## Screenshots or traces

<!-- For UI changes, attach a screenshot or the Playwright trace/report. -->

## Risk and rollback

<!-- Data migrations, breaking API changes, deploy concerns. How do we roll back? -->

## Checklist

- [ ] No secrets, account ids, or remote resource ids committed
- [ ] New behaviour has tests
- [ ] Audit events added for every mutation
- [ ] Shared zod schemas used instead of duplicated types
- [ ] Generated reports committed if numbers changed
- [ ] Docs updated
