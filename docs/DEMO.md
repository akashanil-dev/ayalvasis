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
