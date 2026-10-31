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
  requested; Akash updated its assertion to eight tests in `fcfffe0`. The later
  integrated CI run on `2799e41` was independently verified as completed/success
  through GitHub, including its `validate-and-restore` job:
  [run 41188611670](https://github.com/akashanil-dev/ayalvasis/actions/runs/41188611670).
  This CI result is separate from the isolated local HOOT evidence.

### Staff review after Akash's loading fix

Fast-forwarded the clean checkout to `2799e41` and copied the reviewed staff asset
into the disposable snapshot. No staff source files were edited by Edson.

- Initial loading is visible before the first RPC response. Search for Demo
  Presenter and the quotation filter reduce two matching records to the ready
  quotation; no-match guidance and Clear filters work.
- Injected RPC failure hides results; Retry restores them. Reload loading and
  pagination guards work. First/last controls are disabled on the current
  single-page, 20-record dataset. Real multi-page staff navigation was not
  exercised here; HOOT covers navigation behavior.
- Inspected desktop 1440px and mobile 390px images. Horizontal overflow stays
  within the results table, including the deliberately unbroken long plan name;
  the table also requires horizontal scrolling on desktop for that fixture.
  Keyboard table scrolling and search → status → Search tab order work.
- No browser runtime errors were observed. Ready quotation 93 remains untouched.
  Staff financial cards represent posted invoices, balances and reconciled
  receipts; they are not a formal revenue-recognition report.

### Public signup and local password-reset delivery

Public signup is disabled by the bootstrap's default invitation policy. For this
**disposable database only**, enabled `auth_signup.invitation_scope=b2c` and
`auth_signup.reset_password=True`, with `web.base.url=http://127.0.0.1:8206` and
`web.base.url.freeze=True`. Restarted the isolated Odoo worker after changing
parameters through the shell, since its cached policy initially still returned
404 for signup. Shared bootstrap defaults and the existing port-8069 database
were not changed. Enable these demo settings deliberately if signup is shown on
another demo installation.

Configured one local mail server at `demo-smtp:1025`, without encryption, on the
internal Docker backend network. The isolated helper container
`ayalvasis-demo-edson-smtp` uses cached `python:3.11-alpine`, exposes no host port,
and writes protected capture files only under ignored `.state/`. This proves
local email generation and reset-link behavior, **not external mailbox delivery**.
No real external email was sent. The helper and its files are local artifacts,
not provisioned by cloning this repository. When no longer needed, remove only
this helper with `docker rm -f ayalvasis-demo-edson-smtp`.

The fresh synthetic-account browser rehearsal passed:

- Short and insufficient-complexity passwords rejected; valid public signup
  opens the customer portal; case-normalized duplicate signup rejected.
- Exactly one normalized user exists, with portal access and no internal,
  staff or administrator role. The new account has the expected empty portal.
- Reset email captured locally, with a link to the local demo. Unknown email
  receives the same generic acknowledgement.
- Reset link changes the password; the new password works and the old one fails.
  A consumed reset token cannot be replayed.

One probe incorrectly expected a redirect after resetting the password. Odoo 19
instead renders a success message on the same URL. After correcting that harness
expectation, the complete flow passed with a fresh synthetic account. Passwords,
email captures and token URLs remain protected local artifacts, never Git content.

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
requires internet. External SMTP delivery, delivered quotation email, external
payment providers, public DNS/TLS and hosted deployment remain unverified. No
email was sent during the offline business rehearsal; the subsequent local
signup/reset capture is documented separately above. Manual portal acceptance
does not require SMTP.

## Follow-up: built image and representative browser scale checks

On revision `21051fd`, created a separate ignored snapshot
`.state/scale-edson-20261031/`, project `ayalvasis-scale-edson-20261031`, database
`ayalvasis_scale_edson_20261031`, and unused loopback port **57327**. Built
`ayalvasis-odoo:review-21051fd` with cached dependencies, `--pull=false` and
`--network=none`. Initialized fresh volumes and installed the addon using
`IMAGE_ONLY=true`; the application runs code baked into the image, without the
addon development bind mount. Startup and health checks passed. This verifies
fresh-volume image startup on this machine, not initial image acquisition or a
new host's operating-system setup. The presentation database was not used for
load generation.

Ran the existing `business_probe.py` to create real balanced seed invoices and
verify signup/billing/discount contention. Disabled this fixture's scheduler,
then ran the existing `performance_probe.py`. It added **10,000 subscriptions and
100,000 posted invoices** by cloning balanced accounting rows. This is a read
load fixture, not evidence of billing 100,000 real invoices. Twenty concurrent
ORM dashboard callers with twelve database slots measured **p50 0.627s,
p95 0.788s, maximum 0.813s**; its p95 acceptance check passed.

Browser timing measured authenticated navigation or button action through real
rendered records and two animation frames, over loopback with no CPU/network
throttling. Login is excluded. Browser interactions were sequential, separate
from the concurrent ORM probe. Results are small samples, not a percentile SLA:

| Journey | Samples | Observed seconds |
| --- | ---: | ---: |
| Staff workspace, warm reload | 5 | 0.483–0.614 |
| Staff next / previous page | 1 each | 0.309 / 0.289 |
| Staff search | 5 | 0.265–0.300 |
| Staff active-status filter | 1 | 0.200 |
| Native contracts list, warm | 2 | 0.480–0.503 |
| Native invoices list, warm | 2 | 1.183–1.384 |
| Native billing periods list, warm | 2 | 1.149–1.233 |
| Native plans list, warm | 2 | 1.032–1.150 |
| Customer portal, warm reload | 5 | 1.416–1.466 |
| Customer next / previous page | 1 each | 1.029 / 1.027 |
| Workspace, fresh browser / warm server | 3 | 0.885–0.950 |
| Portal, fresh browser / warm server | 3 | 1.485–1.518 |

Actual first and second staff pages contained 25 distinct records each; returning
restored the first page and disabled Previous. Customer pages contained 12
distinct subscriptions each and returned correctly. Search/status filters,
mobile portal document width and absence of browser runtime errors passed.

**The strict cold-start two-second target is not met.** First-use observations
were workspace **5.234s**, invoice list **12.782s**, billing periods **2.867s**,
plans **2.200s**, and portal **23.623s**. These include first-use asset/view/cache
preparation, which was not individually profiled. A fresh browser against the
already warmed server was faster, as shown above. Preloading the demo pages is
useful rehearsal preparation; it does not turn these results into proof that
every page always responds within two seconds.

### Native setup defect fixed and regression verified

Native forms successfully saved new synthetic product `Native Demo Software`
(service, sales price 100, cost 40), plan `Native Demo Monthly` (100/month,
minimum quantity two), and seven-day quotation template `Native Demo Offer`.
The first subscription save failed with
`Contract workflow fields cannot be supplied directly.` The state field was
editable in model metadata, so the native form included its default draft value,
which the protected-field guard correctly rejected. The failed rehearsal stopped,
and the user explicitly authorized fixing and continuing.

Commit `0074643` makes state read-only in model metadata while retaining the
server-side create/write guards. The actual browser retry now saves numbered
**SUB/2026/00025**, ID **165**, as a draft: two seats at 100, tax 30, total 230.
It is an additional synthetic record; ready quotation 93 was not modified.

A new Odoo `Form` regression exercises staff template-based creation, numbering,
terms, minimum quantity/template lines and rejection of direct state injection.
Its first run failed a numbering assertion because the upstream accounting test
fixture uses another company without the installed company's sequence. The test
now provisions its own company-specific sequence. The full rerun passed:
**39 backend tests, zero failures and zero errors**, in the separate project
`ayalvasis-regression-edson-20261031`, database
`ayalvasis_regression_edson_20261031`, port **34273**. Its source includes Akash's
`8cc41a5` variant-role fix and Edson's `0074643` form fix.

The fresh regression environment confirms the administrator has
`product.group_product_variant`; ordinary staff and customers do not, and attempts
by either to create product attributes are denied. The native Attributes & Variants
tab now appears, and configuring a brand with two values creates two variants.
The native surcharge editor saved **560** for the Odoo brand. Native forms then
created a monthly plan priced at 100 with two seats minimum, a seven-day template,
and a product-scoped ten-percent discount with a minimum purchase of 100,
minimum quantity two and one-use limit. The customer accepted the quotation in
the real portal; staff activated, generated and posted its invoice.

Verified amounts: **2 × (100 + 560) = 1320** before discount and tax;
**132 discount**, **1188 taxable base**, **178.20 tax (15%)**, **1366.20 total**.
Inspected the native invoice image and retrieved the owned invoice PDF. This
uses the existing generic-chart 15% sales tax; native creation of a new tax rule
was not exercised. The attribute and its two named values were prepared through
the ORM; product attribute assignment and surcharge configuration were native UI.
The resulting synthetic regression records are subscription **41**, invoice
**45**, variant **10**, exclusively in the port-34273 database. They are not
presentation fixtures on port 8206.

The browser probe was corrected to follow Odoo's surcharge form (rather than an
inline cell), search by product name before choosing its variant, and skip an
already-saved price rather than expecting a no-op save RPC. Those probe attempts
are retained in ignored logs; the final full flow passed.

The user began manual testing on **8206** and explicitly approved a brief
upgrade/restart. The integrated form and variant-role update completed successfully;
startup, health and least-privilege database checks passed, with records retained.
Refresh the browser to load the updated administrator controls. Manual testing
may consume the previously ready quotation: check its actual state and create a
fresh quotation for recording if necessary. Automated checks
now use the separate regression instance. Do not stop, upgrade or reseed 8206
again while the user is testing without coordinating that interruption.

Integrated CI for `0074643` is independently verified completed/success:
[run 41191812575](https://github.com/akashanil-dev/ayalvasis/actions/runs/41191812575).

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
| Scale/image follow-up | `scale-build.log`, `scale-init.log`, `scale-install.log`, `scale-seed.log`, `scale-browser.cjs`, `scale-browser.log`, `scale-browser-results.json` |
| Native setup | `demo-native-setup.cjs`, `demo-native-setup.log` (original failure), `demo-native-retry.log`, `demo-tests-native-form.log` (sequence fixture assertion), `regression-tests.log`, `regression-prepare.log`, `regression-native-variants.log`, `regression-native-variant-flow.log`, `regression-native-variant-invoice.png`, `demo-manual-upgrade.log` |
| Staff follow-up | `demo-staff-review.cjs`, `demo-staff-final.log`, `demo-staff-desktop.png`, `demo-staff-mobile.png`, `demo-staff-mobile-results.png` |
| Signup/reset | `demo-signup-reset.cjs`, `demo-signup-reset.log`, `demo-signup-roles.log`, `demo-check-signup-config.log`, `demo-signup-reset-navigation-probe.log` (initial harness expectation) |
| Visual checks | `demo-portal-desktop-after.png`, `demo-portal-320-after.png`, `demo-portal-long-content.png`, `demo-offline-paid-mobile.png` |

The backend command was
`python3 .state/demo-edson-20261031/scripts/stack.py test`; follow it with `up`
because that command stops the disposable app. Local browser probes use installed
Playwright/Chromium, generated local secrets, and synthetic fixture IDs. They
perform mutations: **do not rerun acceptance/payment scripts against their already
accepted/paid records**. Create fresh fixtures for a repeat rehearsal.

Remaining boundaries: CI is verified through `0074643`, not future revisions; a clean
machine setup is not covered; the separate built-image startup is documented above;
external SMTP delivery and payment integrations are not covered; the representative
warm browser measurements do not establish an every-page two-second guarantee,
and measured first-use loads exceed it. Existing backend tests cover additional lifecycle,
proration, tax, discount, authentication and permission behavior, but this review
is not a complete manual acceptance of every PDF requirement. No production
system or existing user database was tested or overwritten.

Coordination and the extracted problem statement are recorded in
[issue #1](https://github.com/akashanil-dev/ayalvasis/issues/1). The coding window
ends at **17:00 IST on 31 October 2026**. Preserve ready quotation 93 for the demo.

## Role-specific guided tours (31 October, before freeze)

The user requested onboarding for each account's capabilities and approved the
limited workspace/manifest integration after coordination in issue #1. The tour
starts from **Subscriptions → Workspace → Take a tour** for internal users, or
**My subscriptions → Take a tour** for customers. A first-visit invitation is
nonblocking: customers and operators can keep using the page without opening it.

| Capability | Guide |
| --- | --- |
| Customer | 8 steps: account/quotation request, agreement review, acceptance, service dates, invoices/manual-payment expectations, lifecycle requests, recovery and help |
| Staff | 8 steps: search, drafts, quotation delivery, activation, generating/monitoring periods, lifecycle and error recovery |
| Staff with billing permission | 11 steps: staff guide plus invoice posting, manual payments and financial totals |
| Subscription administrator | 17 steps: operational/financial guide plus products/variants, plans/templates, discounts/taxes, quantity amendments, staff provisioning and customer/email setup |

Role and finance capability come from the existing server-side groups. The tour
adds no permissions. Customer accounts still cannot call the staff workspace.
Admin mail guidance explicitly refers to the system administrator because the
subscription-administrator role alone does not grant technical Odoo settings.

Back, Next step, Finish tour, Skip tour and Escape are supported. The dialog traps
keyboard focus and returns focus to Take a tour when closed. Visible workspace
regions are highlighted; instructions name menu locations for other screens.
This is a read-only instructional tour, not an automated multi-page workflow:
it does not create, accept, bill or pay records. Missing cards/targets do not block
an empty account from completing the guide.

Skip/completion is stored locally by database/user ID, role and finance capability
(version v1), without names, email addresses, credentials or tokens. Other accounts
in the same browser receive their own invitation. Clearing browser data or using
a new browser displays the invitation again. When browser storage is disabled,
the guide still works but cannot remember dismissal. Replay is always available.

Validation used only the separate `ayalvasis-regression-edson-20261031` project
on port 34273:

- **40 backend tests passed**, zero failures/errors. New coverage checks ordinary
  staff, finance-enabled staff, subscription admin, account-specific persistence
  identities and customer denial of the workspace endpoint.
- **All 8 existing HOOT tests passed** with the new tour assets. Neither staff
  tests nor `scripts/browser_smoke.cjs` were edited.
- Real Chromium rehearsed every step for all four capability combinations at
  desktop 1440×1000 and mobile 320×640: first-visit invitation, Skip persistence,
  replay, Back/Next, completion persistence, Escape, focus trapping and returning
  focus. Accounts shared a browser context to verify dismissal isolation.
- Customer guide also passed a simulated empty data response and disabled browser
  storage. Desktop/mobile screenshots were visually inspected. No page errors
  occurred in the full role rehearsal.
- The first 320px assertion exposed a **pre-existing** account-menu overflow
  (323px page width), reproduced before/during/after the guide. Work paused and
  the user explicitly authorized fixing it. A narrow subscription-page-only CSS
  rule now truncates long account names while retaining the dropdown and My
  Account action. The complete 320px rehearsal and long-name menu check passed
  after the correction.
- Python compilation, OWL XML parsing and staged whitespace checks passed.

Reproduce manually using a fresh browser profile and an account with each role:
open the appropriate page, dismiss the invitation, reload, start Take a tour,
use Next/Back and Escape, replay and finish all steps, then reload again. Repeat
at 320px and switch to another account. Verify ordinary staff have no financial
or configuration steps, billing staff have financial but no configuration steps,
and customers have no internal operations steps. Use the existing disposable
fixtures or fresh synthetic ones; do not accept or pay the user's ready records.

Ignored evidence: `.state/tour-regression-tests.log`, `.state/tour-browser.cjs`,
`.state/tour-browser.log`, `.state/tour-hoot.log`, `.state/tour-overflow.png`, and
`.state/tour-*-desktop.png` / `.state/tour-*-mobile.png`. The first browser harness
also needed waits for asynchronous OWL step rendering; that harness correction
was separate from the reproduced navbar defect.

Published tour code: `e8fb3d493f923d0d2a0d2aac1e5741515ddc97bf`.
Its hosted validate-and-restore CI passed:
[run 41196187702](https://github.com/akashanil-dev/ayalvasis/actions/runs/41196187702).
The user then explicitly approved updating port 8206. The brief upgrade completed
at approximately 16:51 IST, with a protected local database backup. Business record
counts, account count, outgoing-mail settings, signup/reset/base-URL settings and
scheduler state matched before/after; app health and least-privilege checks passed.
Read-only browser checks verified admin and customer Take a tour / Skip entry
points on the updated app, without accepting, billing or paying any record.
Evidence: `.state/tour-demo-update.log` and `.state/tour-demo-readonly.log`.
Refresh the app after the upgrade. The updated instance is again reserved for the
user's manual testing; do not restart or run business-mutation probes against it.
