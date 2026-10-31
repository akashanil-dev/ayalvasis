# Demo readiness — business flow and customer portal

Verified on **31 October 2026** in a disposable local environment by Edson.
The core demonstration works locally, including an isolated-network rehearsal.
This is evidence for the checks below, not a claim of complete production readiness.

## Scope, source and ownership

The review started from `27c5a6ddf48fc7bb4ccdd76af8c0cdf9aae99726` on `main` of
`akashanil-dev/ayalvasis`. The checkout was initially clean and pulled with
`--ff-only`. Akash's staff changes at `9221750` were subsequently fast-forwarded
with Edson's work preserved. Before publishing, Edson's unpublished commits were
rebased onto Akash's `fcfffe0` smoke-test assertion update. GitHub authentication
and Git identity were verified as Edson's. Existing history and reconstruction disclosures were preserved; all
new commits use actual timestamps. The private handoff repository is not involved.

The selected official source was the local
`Subscription_Management_System-1.pdf`. Its scope includes products/plans,
quotations, subscription lifecycle, recurring invoices, discounts, payments,
customer ownership, reporting, authentication and a two-second page target.
Coverage below distinguishes real browser checks from model tests and unverified
requirements. Full requirement coverage has not been established.

Changes are limited to Edson's controller, portal, backend-test and readiness
files. Akash owns the staff workspace and `docs/DEMO.md`. No shared manifest,
views, styles, infrastructure, dependencies or `scripts/browser_smoke.cjs` were
edited. The existing frontend glob `ayal_subscription/static/src/portal/*`
includes the new `portal.scss`; its compiled styles were verified in the browser.

## Environment and local access

| Item | Verified value |
| --- | --- |
| Snapshot directory | `.state/demo-edson-20261031/` (ignored) |
| Compose project | `ayalvasis-demo-edson-20261031` |
| Database | `ayalvasis_demo_edson_20261031` |
| Normal demo address | `http://127.0.0.1:8206` |
| Odoo / frontend | Community `19.0-20261015` / bundled Owl |
| Docker Engine / Compose | `29.8.2` / `5.3.1` |
| Application image | Cached `ayalvasis-odoo:dev`, with isolated source bind mount |
| Base/database images | Repository-pinned Odoo 19 and PostgreSQL 17 Alpine; present locally |
| Accounting fixture | Generic chart, USD, untaxed monthly service |

Port 8206 was checked unused before creation. New secrets and volumes were used.
The existing `ayalvasis-dev` service on port 8069 and its data were not tested or
reset. The disposable stack is left running with normal localhost access.

From this checkout, inspect/start the retained demo using:

```sh
python3 .state/demo-edson-20261031/scripts/stack.py status
python3 .state/demo-edson-20261031/scripts/stack.py up
python3 .state/demo-edson-20261031/scripts/stack.py check
```

Do **not** run `init` against this existing database. Credentials are only in the
snapshot's protected `.secrets/dev/` directory. The generated customer secret is
used for synthetic portal accounts. Find their login details through the local
administrator; do not include credentials in recordings, Git or chat. Database
contents, screenshots, session data and runtime logs remain outside Git.

The snapshot is intentionally isolated: future source changes in the main
checkout do not automatically update it. Copy only reviewed changes into it and
use its upgrade/restart commands as appropriate. These local runtime artifacts
are not delivered by cloning the repository on another machine.

## Ready records for Akash's demo

All names and records here are synthetic; IDs apply only to this database.

| Purpose | Record | State |
| --- | --- | --- |
| Product / plan | `Demo recurring support` (product 1); `Demo Monthly Support`, code `DEMO-MONTHLY` (plan 1) | USD 100/month, no tax |
| **Start a fresh demo here** | **Demo Presenter — `SUB/2026/00024`, ID 93** | **Quotation; not yet accepted or billed** |
| Completed offline rehearsal | Demo Presenter — `SUB/2026/00023`, ID 92 | Active; invoice 88 (`INV/2026/00003`) paid |
| Original payment rehearsal | Demo Customer — `SUB/2026/00001`, ID 1 | Active; invoice 1 (`INV/2026/00001`) paid |
| Expired quotation error | Demo Customer — `SUB/2026/00004`, ID 74 | Expired quotation; acceptance denied |
| Resume/date validation | Demo Customer — `SUB/2026/00005`, ID 75 | Paused; no next billing scheduled until resume |
| Ownership boundary | Demo Other — subscription 2, invoice 2 | Posted invoice inaccessible to Demo Customer |
| Empty and pagination states | Demo Empty; Demo Pagination | Zero records; 13 separate quotations respectively |

The ready quotation starts **2026-10-31**, expires **2027-01-29**, and totals
**USD 100** per period. If recording on another date, create a new quotation with
appropriate dates; a past start requires an explicit administrator backdate
reason. Do not silently change accepted terms or reuse already-paid invoices.

Keep administrator and customer browser sessions separate. Use the Demo Presenter
portal for the clean recording, and Demo Customer for validation examples. The
expired quotation is deliberately invalid and is not the opening demo record.

### Five-to-six-minute business sequence

1. As administrator, show the product and monthly plan, then open ready
   subscription 93 under **Subscriptions**. Explain product, price, dates and terms.
2. In the Demo Presenter session, open `/my/subscriptions`, locate
   `SUB/2026/00024`, click **Accept quotation**, then **Confirm request**.
   Expect a saved notice and **Confirmed** state.
3. Back in the administrator session, open
   `/odoo/action-ayal_subscription.subscriptions_action/93`. Click **Activate**,
   then **Generate due invoices**. The start date must have arrived.
4. Open the generated invoice from **Billing history**. It starts as a draft.
   Click **Confirm** to post it. Expect USD 100 due. Generating due invoices
   again must not create another period for the same date.
5. Click **Pay**. Choose **Bank / Manual Payment**, enter amount **40**, today's
   payment date, and a new unique receipt reference. Click **Create Payment**.
   Refresh the customer portal: USD 60 due, **Partially paid**.
6. Record the remaining **60** with another unique reference. Refresh the portal:
   USD 0 due, **Paid**. Open the invoice PDF and download the agreement.
7. Optionally show the deliberate expired quotation error or mobile portal;
   follow Akash's recording outline in `docs/DEMO.md`.

The generic chart's Bank journal (ID 6) has its inbound Manual Payment account
set to bank liquidity for this demonstration. This permits immediate **Paid**
status without a bank feed. An outstanding-receipts configuration can legitimately
show **Payment processing** until reconciliation. This fixture is not a production
accounting configuration. The scheduler is disabled in this demo database to keep
rehearsals deterministic; use the explicit billing button. Cron behavior was
checked separately by automated tests.

## Executed checks and results

### Business flow and invalid input

- Created plans/products and quotations through the real ORM in the disposable
  database. The offline rehearsal then used the real browser for customer
  acceptance, native staff activation, invoice generation/posting and both payments.
  Product/plan setup was not a native-form browser test.
- Observed quotation → confirmed → active, one draft invoice, posted USD 100 due,
  partial USD 40 receipt leaving USD 60, and final USD 60 receipt leaving USD 0.
- Repeated the billing action: exactly one period. Replayed the identical payment
  HTTP request after **each** partial/full receipt: no additional payment and no
  balance change. Customer invoice PDFs remained accessible after each payment.
- Rollback-only setup probes rejected reversed plan availability dates, negative
  plan price, zero minimum quantity, expiry before start, impossible start date,
  zero line quantity and negative line price. Invalid records were not committed.
- **38 backend tests passed: 0 failed, 0 errors.** Added coverage includes normalized
  receipt references with a fresh wizard, conflicting retry payloads, full-payment
  replay, zero/negative/excess/blank-reference payments and invalid resume dates.
  Extended billing-failure coverage verifies recovery clears the error/retry state
  and a second retry does not duplicate a period.
- The first suite attempt stopped on four errors in the new date-test harness:
  Odoo's `assertRaises` wrapper does not accept a tuple of exception classes.
  After permission to continue, each input was paired with its single expected
  exception class. The complete suite was rerun successfully, including after
  the final controller change. The earlier unsuccessful run is retained as evidence.

### Portal states, security and layout

- Initial slow request: loading text renders before data arrives. An injected
  HTTP 503 shows a service error, no false empty message and no stale cards;
  **Retry** restores real data. Connection failures and HTML login responses
  produce distinct connection/session guidance. Cancelling an expired-session
  confirmation retains its sign-in link; a successful reload restores actions.
- The actual empty account shows only its empty-state guidance. A real 13-record
  account supports first/last-page controls and 12/1 row counts. Negative,
  malformed and excessive page parameters are normalized; an excessive page
  selects the last existing page instead of hiding records.
- A real expired-quotation denial retains confirmation and displays the reason.
  Confirmation receives keyboard focus. While a delayed mutation is pending,
  conflicting actions, cancellation and pagination are guarded. Resume inputs
  reject missing/past/after-expiry dates before submitting.
- Direct HTTP resume requests with impossible, malformed, past and after-expiry
  dates return **400** and leave the subscription paused.
- Customer data excludes the other customer's subscription. Forged lifecycle
  requests, foreign agreement/invoice requests, and own-subscription plus foreign
  invoice requests return **404**. Missing CSRF returns **400**; an action outside
  the whitelist returns **404**. Owned agreements/invoices return valid PDFs.
- Checked actual desktop **1440px**, mobile **390px** and narrow **320px** layouts,
  including long unbroken plan/terms text. No horizontal document overflow, style
  error or portal runtime exception was observed. Inspected desktop/mobile images.
  Verified currency decimals, readable invoice payment states and compiled scoped
  portal styling. Paused subscriptions now show **Not scheduled** instead of an
  old billing cursor as an upcoming charge.
- Local portal method checks passed for stale-response protection of rows/CSRF,
  pending-action guards and invalid resume inputs.
- **All eight HOOT tests passed** at
  `/web/tests?filter=Ayal%20subscriptions&headless=true`, including Akash's four
  staff navigation tests. `scripts/browser_smoke.cjs` was left untouched as
  requested; Akash updated its assertion to eight tests in `fcfffe0`. Hosted CI
  verification remains Akash's responsibility. Do not equate the isolated HOOT
  result with a full smoke-script or CI pass.

### Offline startup and external services

1. Confirmed the app image and both pinned base/database images exist locally.
2. Restarted only this disposable project with both Docker networks marked
   internal through an ignored runtime override. Kept the database and filestore
   volumes. Used `up --pull never --no-build --wait`.
3. Both services became healthy. Docker network inspection showed `Internal=true`;
   an external application TCP connection failed as expected.
4. Internal-only networking suppressed Docker's normal published port. The initial
   localhost probe therefore could not connect. The app's own HTTP listener was
   healthy, and the browser reached it over its private Docker bridge address.
   This was a routing limitation of the isolation setup, not an application test
   failure. The temporary address was discovered with `docker inspect`.
5. Started fresh browser sessions, blocked any HTTP(S) request to other hosts,
   and repeated acceptance → native activation/billing/posting → 40/60 payments
   and request replays → customer invoice/agreement PDFs. All passed. No external
   browser hosts were requested. Mobile portal rendering also passed.
6. Restored the normal network and localhost:8206 publishing, retaining records;
   verified the final app is healthy and the fresh quotation is available.

This proves the rehearsed local workflow works with cached dependencies and
blocked application/browser internet access. It does not prove cold setup on a
machine without images or an air-gapped host installation. First image acquisition
requires internet. SMTP, delivered password-reset/quotation email, external payment
providers, public DNS/TLS and hosted deployment remain unverified. No email was
sent during the rehearsal; manual portal acceptance does not require SMTP.

## Evidence and limits

All runtime artifacts below are ignored under `.state/`, not committed:

| Evidence | Files |
| --- | --- |
| Startup | `demo-edson-init.log`, `demo-edson-install.log`, `demo-up-final.log` |
| Initial flow | `demo-baseline.log`, `demo-activate.log`, `demo-payment-result.log` |
| Backend runs | `demo-tests.log` (initial error), `demo-tests-resumed.log`, `demo-tests-final.log` |
| Portal | `demo-portal-browser.cjs`, `demo-portal-browser.log`, `demo-portal-unit.cjs`, `demo-session-recovery.log` |
| Invalid setup values | `demo-invalid-inputs.py`, `demo-invalid-inputs.log` |
| Offline | `demo-offline-start.py`, `demo-offline-start.log`, `demo-offline-browser.cjs`, `demo-offline-browser.log` |
| Restoration/ready fixture | `demo-restore-network.log`, `demo-ready-quote.log`, `demo-final-check.log` |
| Visual checks | `demo-portal-desktop-after.png`, `demo-portal-320-after.png`, `demo-portal-long-content.png`, `demo-offline-paid-mobile.png` |

The backend command was
`python3 .state/demo-edson-20261031/scripts/stack.py test`; follow it with `up`
because that command stops the disposable app. Local browser probes use installed
Playwright/Chromium, generated local secrets, and synthetic fixture IDs. They
perform mutations: **do not rerun acceptance/payment scripts against their already
accepted/paid records**. Create fresh fixtures for a repeat rehearsal.

Remaining boundaries: hosted CI is Akash's verification; a clean machine/release
image deployment is not covered by this source-mounted demo; real SMTP and payment
integrations are not covered; full end-to-end two-second page performance at scale
has not been measured here. Existing backend tests cover additional lifecycle,
proration, tax, discount, authentication and permission behavior, but this review
is not a complete manual acceptance of every PDF requirement. No production
system or existing user database was tested or overwritten.
