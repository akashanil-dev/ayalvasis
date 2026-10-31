# Team Ayalvasis

Ayalvasis is our team and repository name for the Odoo × Make-A-Ton 9.0
hackathon at CUSAT, not the application name.

## Team members

- Akash A
- Edson

## Current implementation

Subscription management built on Odoo Community 19 and its bundled Owl framework.
The application includes a staff workspace, customer portal, products and variants,
plans, quotation templates, recurring billing, discounts, manual payments and reports.

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

Open [local Odoo](http://localhost:8069). The login is `ADMIN_LOGIN` in `.env`.
Read the generated password locally from `.secrets/dev/admin_password`; do not copy
it into Git, logs or chat. Development HTTP binds only to `127.0.0.1:8069` and the
database has no host port.

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
The isolated smoke drill installs the built image without source bind mounts,
runs Odoo tests, independent-transaction contention checks, HOOT and Chromium
journeys, then restores database and filestore into a separate multi-worker stack.
It removes only its own test projects, volumes and backups.

The performance fixture clones balanced posted accounting rows to measure dashboard
reads with 10,000 subscriptions and 100,000 invoices. It is not a billing-throughput
benchmark or a promise about an unchosen production host. See the
[validation record](docs/VALIDATION.md) for results and limits.

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

`python3 scripts/stack.py down` retains data. PostgreSQL and the filestore must be
backed up together. Backup briefly stops HTTP and cron for consistency.

## Production boundary

Deployment files are prepared; no hosting, DNS, public TLS or SMTP service has been
provisioned. Configure real accounting, email, external monitoring and encrypted
off-host backups, scan the final image, and repeat acceptance tests on the selected
host before launch. This is a single-host deployment, without a high-availability SLA.

See [deployment](docs/DEPLOYMENT.md), [operations](docs/OPERATIONS.md),
[implementation plan](docs/IMPLEMENTATION_PLAN.md) and [validation](docs/VALIDATION.md).
