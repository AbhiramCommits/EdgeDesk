# EdgeDesk demo — 90 seconds

This script uses the seeded local environment. All state changes described below are real; the
numbers on the queue come from the 60 seeded requests.

## Before recording

```bash
pnpm install
rm -rf packages/api/.wrangler
pnpm migrate
pnpm seed

# terminal 1
pnpm dev:api

# terminal 2
pnpm dev:web
```

Open `http://localhost:5173/login` in a 1440×900 browser window.

## Script

| Time | Do this | Expected on screen |
| --- | --- | --- |
| 0:00 | Open `/login` | EdgeDesk split login screen. Email is pre-filled with `ada.lovelace@edgedesk.test`; role buttons for employee, people_ops, admin are visible. |
| 0:05 | Click **Continue** | Queue page: **60 requests**. Status cards: New 11, Triaging 0, Awaiting info 6, In progress 15, Resolved 24, Rejected 4. A few rows are highlighted red with "SLA breached". |
| 0:12 | Click **New request** | Intake form with title, description, optional category hint, and the "What happens next" panel. |
| 0:16 | Title: `Laptop died before a customer demo` | — |
| 0:20 | Body: `My laptop will not boot and I have a customer demo in one hour. I need a replacement laptop.` | — |
| 0:26 | Click **File request** | Detail page opens immediately with the request in **New**, then updates live. Category hint is intentionally left as "Let the agent decide". |
| 0:32 | Watch the **Agent run** panel | "live" badge, then steps appear: `classify_request`, plan, `estimate_priority`, `search_policy_kb`, `check_equipment_stock`, `assign_owner`, `post_resolution_draft`, outcome. Each tool step shows input/output summaries and non-zero milliseconds. |
| 0:42 | Point at the header | **In progress**, **P0 · Critical**, **Equipment**, an owner (Marcus or Priya), and a due date four hours out. Below, the **Agent draft reply** uses policy KB citations. The panel ends "Agent run finished in … ms." |
| 0:50 | Click **Sign out**, then sign in as `priya.raman@edgedesk.test` | Queue as People-Ops. Open the request from the queue (or use the same URL). |
| 1:00 | In **People-Ops actions**, choose a different assignee and click **Save assignee** | Success toast "Assignee updated"; owner changes; audit timeline gains "Updated by People-Ops". |
| 1:07 | Type `Replacement laptop dispatched by courier.` in **Resolution**, click **Resolve request** | Green success toast; **Resolution** box appears with the text; status becomes **Resolved**; audit timeline gains "Resolved by People-Ops". |
| 1:15 | Scroll the **Audit timeline** | In order: Request created → Triaged by agent → Assigned by agent → Updated by People-Ops → Resolved by People-Ops. |
| 1:20 | Sign out, sign back in as `ada.lovelace@edgedesk.test`, open the same request | As an employee, the action panel is still visible but an amber notice states that People-Ops mutations are server-enforced. |
| 1:24 | Choose a different assignee and click **Save assignee** | Error toast: `403 forbidden: You do not have permission to perform this action`. This is the API's role gate, not a client-side check. |
| 1:29 | Click **Queue**, choose Status **Resolved**, Category **Payroll** | The table filters to 5 seeded rows and the footer reads `5 requests`. |
| 1:30 | Stop recording | — |

## Recording commands

Screen recording is external to the repo. On macOS, either use QuickTime Player → File → New Screen
Recording, or:

```bash
mkdir -p docs/demo
# The avfoundation input index depends on the machine; grant screen-recording permission first.
ffmpeg -f avfoundation -framerate 30 -i "1:0" -pix_fmt yuv420p docs/demo/edgedesk-demo.mp4
```

The recording would live at `docs/demo/edgedesk-demo.mp4`. It is intentionally **not** committed and
no recording link is claimed here.

For a deterministic headless walkthrough instead of a narrated recording, run:

```bash
pnpm test:e2e --headed
```

The Playwright project keeps failure videos under `test-results/`; set `video: "on"` in
`playwright.config.ts` temporarily if you want a video for every spec. Do not commit those artifacts
(the directory is gitignored).

## Reset after the demo

The demo adds and resolves requests in local D1. Reset with:

```bash
rm -rf packages/api/.wrangler
pnpm migrate
pnpm seed
```
