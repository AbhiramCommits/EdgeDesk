# Triage dataset construction

`dataset.json` contains **160** hand-authored, synthetic People-Ops requests. Each row is:

```json
{
  "id": "ev_001",
  "title": "Laptop stolen from hotel",
  "body": "My work laptop was stolen while I was travelling...",
  "label_category": "equipment",
  "label_priority": "p0"
}
```

## Composition

| Category | Rows |
| --- | ---: |
| equipment | 32 |
| onboarding | 23 |
| policy | 30 |
| access | 31 |
| payroll | 24 |
| other | 20 |
| **Total** | **160** |

| Priority | Rows |
| --- | ---: |
| p0 | 16 |
| p1 | 38 |
| p2 | 74 |
| p3 | 32 |

The distribution is deliberately non-uniform. P2 — the normal queue — is the largest class, P0 is
rare, and `other` is large enough (20 rows, above the 15-row minimum) to measure the ambiguous
fallback rather than hiding it.

## How the rows were written

1. **Six category briefs.** For each category I wrote realistic intake text covering the common
   sub-types: hardware and peripherals for equipment; pre-start, day-one, buddy, and paperwork for
   onboarding; leave, travel, remote work, conduct, and accommodation for policy; SSO, VPN, repo,
   deploy, mailbox, and admin rights for access; salary, payslips, tax, benefits, expenses, and
   bonuses for payroll.
2. **Priority cues were varied, not formulaic.** P0 rows describe stolen devices, locked-out users
   with a demo in an hour, blocked releases, and missed payroll. P1 rows use customer impact,
   this-week deadlines, and inability to work. P2 rows are ordinary requests. P3 rows explicitly say
   "no urgency", "whenever", "no rush", or ask a planning question.
3. **Adversarial and ambiguous rows.** `other` intentionally includes requests that mention
   equipment or access vocabulary but do not belong to those queues: desk moves, guest visits,
   lost badges, swag exchanges, plant watering, parking, and "not sure who owns this". Examples also
   include cross-category phrasing such as "travel reimbursement" (payroll processing) versus
   "expense policy" (policy question), and "new hire needs laptop and accounts" (onboarding, not
   equipment/access).
4. **Label rules.** Category labels follow the owning queue, not the noun in the request:
   reimbursement *processing* is payroll, reimbursement *policy* is policy; a new hire's equipment
   provisioning is onboarding; a login or permission failure is access; anything with no clear
   owner or a facilities/office request is `other`. Priority labels follow urgency and business
   impact, not sentiment.

## Honest limitations

- The rows are **self-authored** and were written after the rule table existed. Vocabulary overlaps
  with the deterministic rules by construction, so this is a regression and reproducibility suite,
  not an unbiased estimate of triage quality on unseen employee language. A production evaluation
  would need independently labeled real tickets and an inter-annotator agreement check.
- There is no LLM baseline in this dataset. The `TRIAGE_MODE=llm` path is optional and is not
  measured here.
- Two rows (`ev_157` guest visit, `ev_142` desk move) are genuinely ambiguous and remain
  misclassified. They are reported rather than removed.
- Class balance is controlled for measurement. Real intake volume will be more skewed.

The current measured results live in `reports/eval.md` and `reports/eval.json`, regenerated with
`pnpm eval`.
