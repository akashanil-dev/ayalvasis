# Application and infrastructure validation — 31 October 2026

The subscription addon and both Owl interfaces are implemented and validated locally
on the pinned Odoo Community 19 image. The application is not publicly deployed.

Final local application image ID:
`sha256:b2741f1bb7476b3bebe09cebf0f1df1a7f3f6b3db07c72e5eb4f7ad98ffd2a56`.
This is the local image content ID, not a published registry digest.
Hosting and production integration settings remain intentionally unprovisioned.

## Application evidence

| Check | Result |
| --- | --- |
| Odoo business tests | 34 passed, 0 failures, 0 errors |
| Application HOOT tests | 4 passed; Odoo's runner also executes one framework control test |
| Infrastructure unit tests | 6 passed |
| Fresh addon installation and explicit upgrade | Passed on Odoo 19 |
| Backend Owl workspace and native contract form | Passed in Chromium; visual review completed |
| Customer Owl portal and 390px mobile viewport | Passed; no horizontal overflow or browser runtime errors |
| Calendar anchors and final-period proration | Passed, including Jan 31 and leap-day boundaries |
| Accepted prices, descriptions, nested taxes and payment terms | Frozen; mutation and snapshot tests passed |
| Quantity amendments and future resumption | Passed; prior invoices/revisions retained |
| Variant surcharge of 560 | Applied exactly once; tested independently of product list price |
| Permissions and company isolation | Staff escalation/configuration changes and foreign-company reads rejected |
| Concurrent signup | Two independent transactions produced one account for the normalized email |
| Concurrent recurring billing | Two workers produced one period/invoice; serialization retries exercised |
| Last-use discount contention | Two contracts could reserve only one remaining use |
| Failure rollback and cron isolation | Cursor retained, failed contract recorded, healthy contract billed, retry delayed |
| Discount allocation and reservations | Fixed-cent allocation, eligibility, reserve/release/reissue/consume passed |
| Payments and reports | Partial/full/excess/repeated-reference cases and native reconciliation passed |
| Refunds | Native credit note reflected in net posted-invoice totals |
| Portal ownership and CSRF | Another customer's subscription/PDF and missing-CSRF mutation rejected |
| Agreement and invoice PDFs | Valid PDFs; rendered to PNG and visually inspected after internal asset-URL fix |
| Reset tokens and throttling | Expired/replayed tokens rejected; request limit enforced |
| Database + filestore restore | Real business records and referenced attachment bytes preserved |
| Billing after restore | Rerunning the scheduler did not duplicate periods |
| Restored process model | Two HTTP workers and WebSocket listener verified |
| CI configuration | actionlint passed; dependency versions locked; hosted CI run not yet verified |
| Python compilation and whitespace checks | Passed |

The fixture uses reserved example addresses and synthetic customer records. It does
not validate real SMTP delivery, bank connectivity or a payment gateway.

## Dashboard read-load measurement

Measured against **10,000 additional subscriptions and 100,000 additional posted
invoices**, with 20 concurrent callers sharing 12 database slots:

| Measurement | Seconds |
| --- | ---: |
| Median | 0.443 |
| p95 | 0.549 |
| Maximum | 0.573 |

This fixture clones the stored shape of a real, balanced, posted tax-free invoice
into coherent synthetic ledger rows. Balance checks and PostgreSQL ANALYZE run
before measurement. The timed operation is the server dashboard method with its
queries, record rules, totals and pagination, including database-slot queueing.
It excludes browser rendering, external network latency and cold image startup.
It does **not** measure invoice-creation throughput or establish production capacity.
The two-second local dashboard-read target passed; repeat on the chosen host.

## Infrastructure baseline

Docker Engine 29.8.2 and Compose 5.3.1 were used locally. Base image digests remain
pinned. The following previously established checks remain covered:

- Non-root application container, read-only root filesystem and dropped capabilities.
- Private PostgreSQL network and application role without superuser/createdb/createrole.
- Generated administrator authentication before HTTP exposure; no secrets committed.
- Development/production Compose validation, Caddy configuration and systemd syntax.
- Production preflight rejects incomplete domain/worker/proxy/image settings.
- Consistent backup, archive validation, restore and restart after backup failure.
- Existing-database reinitialization and unsafe/corrupt archives are rejected.

Integration tests use the **built image without development source bind mounts**.
This caught a source/schema mismatch during an earlier recovery iteration and makes
future release tests reproducible. Test failures in Odoo's final summary fail the
runner, even when Odoo itself returns a successful process exit.

Local evidence is intentionally ignored by Git: `.state/app-tests.log`,
`.state/hoot.log`, `.state/release-acceptance.log`, `.state/final-release.log`,
`.state/local-ui-final.log`,
`.state/workspace.png`, `.state/portal-mobile.png`, and the rendered PDF previews.
Disposable stacks, volumes and backups are removed by the acceptance runner.

## Remaining launch gates

- Select hosting, domain and deployment account; provision DNS, firewall and public TLS.
- Supply the real legal company details/logo, currency, billing timezone, chart,
  taxes, sales journals and payment-method outstanding accounts.
- Configure SMTP and the public base URL; exercise actual invitation, reset and
  invoice delivery. Open signup is disabled until explicitly enabled by an operator.
- Choose encrypted off-host backups, retention, RPO/RTO and the maintenance window;
  enable the timer and verify failure alerts.
- Connect external uptime, disk/memory, backup-age and billing-backlog monitoring.
  Billing errors appear in the workspace; `ayal.billing.last_run` records cron completion.
- Scan the final application image and review/remediate findings before deployment.
- Verify GitHub-hosted CI for the application commit and rerun acceptance on staging.
- Obtain business acceptance of the default proration, pause, amendment and discount
  policies; load-test the actual host, including billing and PDF concurrency.

Provisioning was introduced in `1344468`; application changes and their validation
are recorded in the subsequent Git history. No claim of high availability, a
completed security audit or production readiness is made.
