# Functional demo rehearsal

Target: 5–6 minutes. This is a proposed recording sequence, not a record of
completed manual acceptance. Match the selected official problem statement before
recording. Use fictional customer data and keep passwords out of the recording.

| Time | Flow | What to show |
| --- | --- | --- |
| 0:00–0:30 | Staff workspace | Explain the customer problem and show database-backed records. |
| 0:30–1:30 | Contract and quotation | Use a prepared plan, create a contract, explain price and dates. |
| 1:30–2:20 | Customer acceptance | Switch to the customer's session and accept the quotation. |
| 2:20–3:30 | Billing | Show activation, generate a due invoice and post it with billing permissions. |
| 3:30–4:20 | Payment | Register a valid payment and show the remaining balance. |
| 4:20–5:10 | Customer documents | Show the agreement and invoice available to their owner. |
| 5:10–5:40 | Usability and validation | Demonstrate a clear validation error and mobile portal. |

## Before recording

- Coordinate the exact records and business flow with Edson's DEMO_READINESS.md.
- Choose dates that legitimately make a billing period due; do not assume every
  newly accepted future contract will immediately activate or invoice.
- Confirm accounting configuration, staff/customer accounts and local startup.
- Preload required Docker images/dependencies. SMTP is an external dependency;
  distinguish an enqueued email from a delivered email.
- Rehearse without showing credentials, shell secrets or private customer data.
- Check workspace search, status filtering, clear filters, first/last pagination,
  loading, failed request/retry, empty data and an empty filtered result.
- At desktop and 390px widths, verify the controls remain usable and any horizontal
  table scroll stays inside its region. Keyboard-check the table and buttons.
- Run `/web/tests?filter=Ayal%20subscriptions&headless=true` and confirm both the
  existing four tests and four staff navigation tests pass.
- Record functional flow only. Verify the exported video is at most six minutes,
  opens without authentication, and is submitted within the portal's video window.

## Evidence boundaries

Local Docker daemon access was denied during Akash's staff-workspace changes.
Actual Odoo rendering and HOOT/browser acceptance require CI or an accessible
isolated Odoo environment. Syntax checks alone do not validate UI appearance.

## Current handoff and automated evidence

Coordinate final readiness and shared-file ownership in
[GitHub issue #1](https://github.com/akashanil-dev/ayalvasis/issues/1).
Edson's session should post its next SHA, business/portal findings and demo-machine
rehearsal results there; neither session needs to wait for a new commit before
reporting a blocker or completing independent checks.

The staff fixes at `9221750` and test-runner correction at `fcfffe0` passed the
[hosted acceptance run](https://github.com/akashanil-dev/ayalvasis/actions/runs/41187213613).
This verifies the eight application HOOT tests and the existing browser,
concurrency and recovery flow on that revision. It does not establish visual
quality at all viewport sizes or completion of the official problem statement.

Remaining release checks:

- Business/portal readiness and the final demo sequence are recorded in DEMO_READINESS.md.
- Edson reports staff desktop/390px, keyboard, failure/retry and initial loading
  verified on 2799e41; real multi-page navigation subsequently passed in the separate scale fixture.
- Both sessions: compare against the selected official problem statement once
  available and confirm final integrated CI after code changes.
- Team leader: verify portal milestones, evaluator access and repository/video
  submission confirmations. Code readiness does not confirm these submissions.

## Rehearsal against the selected problem statement

Edson supplied the extracted `Subscription_Management_System-1.pdf` in
[the coordination thread](https://github.com/akashanil-dev/ayalvasis/issues/1).
Use the following checkpoints to show the Brightloop business scenario.

| Requirement | Demonstration or evidence | Remaining boundary |
| --- | --- | --- |
| Customer signup and reset | Unique email/password rules; customer role and own records | Demo-only signup/reset and local SMTP capture passed per Edson. Defaults remain invitation-only; external mailbox delivery is unverified. |
| Product, variants and plans | Show product price/cost access, variant surcharge, billing interval and lifecycle permissions | Native product/plan/template and variant surcharge setup passed; tax and attribute names used prepared fixtures. |
| Quotation and lifecycle | Use a template; show terms, dates and quotation → confirmed → active | Preserve accepted terms; use fresh records for repeat recordings. |
| Billing, tax and discounts | Generate invoice, inspect lines/tax/discount and repeat billing without duplication | One simple untaxed demo does not demonstrate every tax/discount policy. |
| Payments | Record 40 then 60 against a USD 100 invoice with distinct references | Demo accounting configuration is described in DEMO_READINESS.md. |
| Reporting | Show active count, posted invoices, outstanding/overdue and reconciled receipts; apply financial dates | Describe the actual accounting measures, not recognized revenue or MRR. |
| Scale and responsiveness | Existing synthetic probe targets 10,000 contracts and 100,000 invoices | Representative warm browser journeys passed below two seconds; measured first-use loads exceeded the target. See DEMO_READINESS.md. |

For Edson's retained demo only, start with **Demo Presenter / SUB/2026/00024**
(subscription ID 93), provided it is still an unaccepted quotation. See
[DEMO_READINESS.md](DEMO_READINESS.md) for the exact environment, explicit activation,
posting and payment instructions. Those IDs and runtime files do not exist in a
fresh clone. Do not use the already-paid rehearsal records to simulate a new flow.

The integrated revision `2799e41` passed
[hosted CI](https://github.com/akashanil-dev/ayalvasis/actions/runs/41188611670),
including Edson's portal changes and the staff initial-loading fix. Edson also
reported desktop/mobile staff search, filters, clear filters, error/retry and
keyboard table navigation working in his isolated demo; initial loading and signup/reset with local SMTP capture subsequently passed,
as recorded in DEMO_READINESS.md at e38033e. These are Edson-reported local
observations, not a second independent rehearsal by Akash.

## Final integration handoff

The native draft-creation fix (`0074643`) and administrator variant-controls fix
(`8cc41a5`) are integrated. The [code acceptance run](https://github.com/akashanil-dev/ayalvasis/actions/runs/41191812575)
passed. Edson's follow-up report at `a1142f9` records 39 backend tests, native
variant/quotation/discount/invoice rehearsal and representative browser timings
at 10,000 subscriptions / 100,000 synthetic invoices.

The measured native variant example is two seats at (100 + 560), less 10 percent,
plus 15 percent tax: total **1366.20**. It exists in the separate regression
instance, not the presentation database. Native draft creation is now covered
by an Odoo Form regression with direct workflow-state injection still rejected.

**Check presentation record state immediately before recording.** The user is
manually testing the retained port-8206 environment; quotation 93 may have been
accepted or billed. Do not reset it or interrupt that environment. Create a fresh
quotation through the verified normal flow if needed.

Known remaining limits: measured cold-start pages miss the two-second target;
external mailbox delivery, clean-machine setup and actual evaluator/video/portal
submissions are not verified. Warm-server rehearsal is useful preparation, not
proof of a universal performance guarantee. Final manual recording and submission
remain the team's next steps.
