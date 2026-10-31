# Team Ayalvasis · Subscription Management

Manage the subscription lifecycle from a customer quotation to recurring invoices,
manual payments and customer self-service. Built for the Odoo × Make-A-Ton 9.0
hackathon at CUSAT. **Ayalvasis is our team and repository name.**

**Team:** [Akash A](https://github.com/akashanil-dev) ·
[Edson](https://github.com/Edson-Edwin)

[Demo walkthrough](docs/DEMO.md) · [Verified readiness](docs/DEMO_READINESS.md) ·
[Deployment](docs/DEPLOYMENT.md) · [Operations](docs/OPERATIONS.md)

## What the application does

- Maintains products and variants, recurring plans, quotation templates and
  conditional discounts.
- Turns reviewed quotations into accepted agreements and active subscriptions.
- Generates recurring invoices with taxes, calendar-aware periods and retry protection.
- Records partial/full manual payments and updates invoice balances.
- Gives customers access to their own agreements, invoices and permitted lifecycle actions.
- Gives staff a searchable workspace and billing users financial summaries.
- Provides role-specific guided tours with Skip, replay and keyboard/mobile support.

## Architecture

| Layer | Technology and responsibility |
| --- | --- |
| Application | Odoo Community 19; Python models/controllers enforce business rules and permissions |
| Interface | Odoo's bundled Owl framework, XML templates and SCSS; staff workspace and customer portal |
| Data and accounting | PostgreSQL 17; Odoo invoices, taxes, payments and reconciliation |
| Runtime | Docker Compose; pinned base images, local secrets, readiness checks and backup/restore tooling |
| Production entry point | Prepared Caddy reverse-proxy configuration; hosting is not provisioned |
| Verification | Odoo backend tests, HOOT frontend tests, Playwright journeys and GitHub Actions |

This is an Odoo addon, not a standalone Node application. The browser tooling is
used for acceptance tests; Node is not the application server.

Business rules run on the server. Accepted terms and payment schedules are frozen;
quantity amendments preserve prior revisions. A unique service-period ledger and
transaction locks protect recurring billing and limited-use discounts from retries
and concurrent workers. Invoices, taxes, payments and reconciliation use Odoo's
accounting models.

## Run locally

Requirements: Linux, Python 3.12+, Docker Engine and Docker Compose with `!override`
support. Validation used Engine 29.8.2 and Compose 5.3.1. Run from this repository.

```sh
python3 scripts/stack.py setup
python3 scripts/stack.py validate
python3 scripts/stack.py build
python3 scripts/stack.py init
python3 scripts/stack.py install
python3 scripts/stack.py up
python3 scripts/stack.py check
```

Skip `setup` and `init` if this environment already exists. Both refuse to overwrite
credentials or initialize an existing database. After addon changes, run `upgrade`
and then `up`; installation/upgrades stop the application while changing its schema.
Rebuild for infrastructure changes and every production release.

For a fresh environment, `setup` generates `.env` and local secrets. If port 8069
is already occupied, choose an unused `LOCAL_PORT` in `.env` before starting.
Do not reuse another project's database, project name or credentials.

Open [local Odoo](http://localhost:8069), or your configured `LOCAL_PORT`.
The login is `ADMIN_LOGIN` in `.env`.
Read the generated password locally from `.secrets/dev/admin_password`; do not copy
it into Git, logs or chat. Development HTTP binds only to `127.0.0.1:8069` and the
database has no host port.

The team's retained manual-testing instance uses port **8206**, not the default
8069. Its records and credentials are machine-local and are not shipped with a
fresh clone. See [demo readiness](docs/DEMO_READINESS.md) before using that instance;
do not reinitialize it or run mutation tests against its prepared records.

## Roles and guided tours

| Role | Capabilities | Tour entry point |
| --- | --- | --- |
| Customer | Own quotations, agreements, posted invoices and permitted pause/resume/close/renew requests | My subscriptions → Take a tour (8 steps) |
| Staff | Search, prepare quotations, activate subscriptions, generate/monitor billing periods and manage lifecycle | Subscriptions → Workspace → Take a tour (8 steps) |
| Billing staff | Staff tools plus invoice posting, manual payments and financial summaries | Workspace → Take a tour (11 steps) |
| Subscription administrator | Billing tools plus products, plans, templates, discounts, taxes, staff provisioning and quantity amendments | Workspace → Take a tour (17 steps) |

Tours follow server-side role capabilities. They explain workflows and highlight
relevant page regions; they never create, accept or pay records. First visits show
a nonblocking invitation. **Back, Next, Skip, Finish and replay** are available;
Escape closes the guide. Dismissal is remembered per account/role in that browser.
Clearing browser storage displays the invitation again.

## Customer signup and account recovery

1. If the administrator enables public signup, open `/web/signup` and create an
   account with a unique email and a password of at least nine characters,
   including uppercase, lowercase and a special character.
2. Sign in at `/web/login` and open `/my/subscriptions`.
3. Request a quotation from the team using the email on your account. Signup
   creates a **customer account**, not a purchase or a staff account.
4. Review the quotation's products, price, dates and terms, then accept it.
   Staff handle activation and billing; posted invoices appear in your portal.
5. Use `/web/reset_password` if needed. Delivery requires working outgoing SMTP;
   a production base URL must be reachable from the recipient's device.

There is no public checkout or online card-payment gateway. Payments are recorded
by authorized billing staff. Public signup is disabled by default; it was enabled
only in the documented local demo. Subscription administrators are distinct from
Odoo system administrators who configure technical settings.

## Set up the business

1. Configure the real company, billing timezone on its contact, currency, chart of
   accounts, sales journal and bank/cash payment methods. An outstanding receipts
   account is required for a manual payment to reconcile the invoice.
2. In **Subscriptions → Configuration**, create products/variants, taxes, plans,
   optional recurring add-ons, quotation templates and conditional discounts.
   The plan price replaces the primary product's base price; its variant surcharge
   is added once. Cost fields and catalog writes are restricted to administrators.
3. Use **Add staff** to create staff or billing accounts. Subscription administrators
   do not receive Odoo system-administration privileges. Invitation email is an
   explicit option and requires working SMTP.
4. Create a contract, review its products, dates, price and terms, then create a
   quotation. Send it through the mail queue or let the customer review it in
   [My subscriptions](http://localhost:8069/my/subscriptions).
5. Accept the quotation. Contracts activate when their start date arrives. The
   scheduler checks every five minutes; **Generate due invoices** runs a bounded
   catch-up batch. Invoices stay draft unless the accepted plan enables auto-post.
6. Billing staff post invoices, send/print them and register partial or full payments.
   Enter a unique bank/cash receipt reference. Repeating the same payment request
   returns its existing payment; excess payments are rejected.
7. Customers can accept quotations, schedule permitted pauses/closures, resume now
   or on a future date, request renewal quotations and download their agreements
   and invoices. Ownership and CSRF checks apply on the server.

Open signup remains disabled by default. A system administrator can enable free
signup and password reset after configuring SMTP and the public base URL. Passwords
require at least nine characters, uppercase, lowercase and a special character.
Email uniqueness is enforced case-insensitively by a database constraint.

## Billing policies

- Expiry is inclusive; internal service periods use an exclusive end date.
- Monthly/yearly billing retains the original calendar anchor, including month-end
  and leap-day behavior. The final shortened period is prorated by service days.
- Pause/close takes effect at the next billing boundary. Existing invoices remain
  payable. Resume creates a new anchor and does not extend expiry.
- Admin quantity changes apply at the next unbilled future boundary and retain both
  snapshots. Backdated starts require an administrator reason and show catch-up
  estimates before acceptance.
- Discounts do not stack. Priority and then record ID select the first eligible
  rule. Drafts reserve a use, posting consumes it, and cancelling an unposted invoice
  releases it. Refunds do not replenish usage.
- Cancelled, never-posted invoices can be reissued from Billing periods. Posted
  invoices require native credit notes. The native sale-order invoice shortcut is
  blocked for subscription orders.
- Failed scheduled billing retains its cursor, records the error and retries after
  15 minutes. The workspace flags contracts that need attention. Each cron run is
  bounded to 20 contracts and a 45-second scheduling budget; completion counts and
  timestamps are recorded in `ayal.billing.last_run` for operator monitoring.
- Financial cards use company currency: net posted invoices, residual debt,
  installment-level overdue debt and reconciled receipt allocations. These are not
  revenue-recognition reports. Financial date filters use invoice dates for invoice
  cards and payment dates for receipts.

## Verification

```sh
python3 -m unittest discover -s tests -v
python3 scripts/stack.py test
npm ci --prefix scripts/browser
scripts/browser/node_modules/.bin/playwright install --with-deps chromium
PLAYWRIGHT_MODULE="$PWD/scripts/browser/node_modules/playwright" python3 scripts/smoke.py --business
# Optional larger synthetic dashboard-read benchmark:
PLAYWRIGHT_MODULE="$PWD/scripts/browser/node_modules/playwright" python3 scripts/smoke.py --performance
```

Application tests belong in development/disposable databases, never production.
`stack.py test` stops the selected app; run `stack.py up` afterward. Do not run it
against an instance someone is actively using for manual testing.
The isolated smoke drill installs the built image without source bind mounts,
runs Odoo tests, independent-transaction contention checks, HOOT and Chromium
journeys, then restores database and filestore into a separate multi-worker stack.
It removes only its own test projects, volumes and backups.

The performance fixture clones balanced posted accounting rows to measure dashboard
reads with 10,000 subscriptions and 100,000 invoices. It is not a billing-throughput
benchmark or a promise about an unchosen production host. See the
[validation record](docs/VALIDATION.md) for results and limits.

### Latest verified evidence

The guided-tour implementation at
[`e8fb3d4`](https://github.com/akashanil-dev/ayalvasis/commit/e8fb3d493f923d0d2a0d2aac1e5741515ddc97bf)
passed **40 backend tests**, **8 HOOT tests**, role-specific desktop/320px browser
rehearsals and [hosted CI](https://github.com/akashanil-dev/ayalvasis/actions/runs/41196187702).
Checks included account isolation, Skip/replay, keyboard navigation, empty results,
blocked browser storage and a long customer name on mobile.

The business rehearsal covered quotation acceptance → activation → invoice
posting → partial/full manual payment → updated balance and customer PDF access.
See [DEMO_READINESS.md](docs/DEMO_READINESS.md) for exact evidence, environments,
reproduction steps and limitations. These results describe tested revisions,
not a blanket claim of complete production readiness.

## Repository map

| Path | Purpose |
| --- | --- |
| `addons/ayal_subscription/` | Domain models, access rules, Owl interfaces, reports and tests |
| `compose.yaml`, `compose.dev.yaml`, `compose.prod.yaml` | Shared, development and production deployment |
| `compose.test.yaml` | Image-only integration testing without live source mounts |
| `infra/` | Bootstrap, readiness, secrets, reverse proxy and backup tooling |
| `scripts/stack.py` | Validated install, upgrade, test and operational commands |
| `scripts/smoke.py` | Isolated application and recovery acceptance drill |
| `.github/workflows/infra.yml` | Infrastructure, business, HOOT and browser CI |
| `docs/IMPLEMENTATION_PLAN.md` | Architecture, detailed policies and acceptance mapping |
| `docs/DEMO.md` | Suggested functional-demo sequence |
| `docs/DEMO_READINESS.md` | Rehearsal results, tested records and remaining limitations |

`python3 scripts/stack.py down` retains data. PostgreSQL and the filestore must be
backed up together. Backup briefly stops HTTP and cron for consistency.

## Known limitations and production boundary

- Warm representative dashboard journeys passed, but measured cold/first-use
  loads exceeded the problem statement's two-second target.
- Real external mailbox delivery is unverified. Local SMTP capture is not proof
  of Gmail delivery; never commit SMTP passwords or reset tokens.
- The large synthetic dataset measures reads, not mass invoice-generation throughput.
- Clean-machine deployment, public evaluator access, recording and submission
  confirmations remain separate checks.

Deployment files are prepared; no hosting, DNS, public TLS or SMTP service has been
provisioned. Configure real accounting, email, external monitoring and encrypted
off-host backups, scan the final image, and repeat acceptance tests on the selected
host before launch. This is a single-host deployment, without a high-availability SLA.

See [deployment](docs/DEPLOYMENT.md), [operations](docs/OPERATIONS.md),
[implementation plan](docs/IMPLEMENTATION_PLAN.md) and [validation](docs/VALIDATION.md).
