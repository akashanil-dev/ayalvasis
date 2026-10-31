# Production deployment

## Architecture

```text
Internet -> Caddy :443 -> Odoo :8069 (HTTP) / :8072 (WebSockets)
                           |
                           +-> PostgreSQL :5432 on an internal Docker network
                           +-> persistent filestore volume

Host backup job -> consistent database dump + filestore archive -> off-host storage
```

Caddy alone publishes production ports. The database is not exposed to the host.
The Odoo process runs as the image's non-root user with a read-only root filesystem,
dropped capabilities, and an ephemeral private configuration in `/tmp`. The
application database role is not a superuser and cannot create databases or roles.
The database-manager route is disabled in Odoo and blocked at the proxy.

## Hosting decision

Choose a Linux host with Docker/Compose support, persistent SSD storage and a public
DNS name. A starting planning estimate is 4 vCPU / 8 GiB RAM / 40+ GiB disk; validate
with the actual workload before purchasing or promising capacity. Current limits
are 3 GiB / 2 CPUs for Odoo and 1 GiB / 1 CPU for PostgreSQL, leaving headroom for
the OS, proxy, builds and backups. Two HTTP workers plus a cron worker are configured.
This is a single point of failure; no availability SLA is implied.

Keep development and production on separate hosts. Use a dedicated `ayalvasis`
deployment account and a checkout at `/opt/ayalvasis`. Docker access is privileged;
limit it to trusted operators. Host provisioning, SSH keys, firewall rules and
package installation await the hosting choice and are not automated here.

## Prepare a release

1. Run `python3 scripts/stack.py --mode prod setup` once. It generates independent
   production credentials and `.env.production`. Do not copy development secrets.
2. Edit `.env.production`: set a real `DOMAIN`, `ACME_EMAIL`, `ADMIN_LOGIN`, and an
   immutable application release tag such as `APP_IMAGE=ayalvasis-odoo:release-001`.
3. Keep `ODOO_PROXY_MODE=True` and at least one worker. Review resource limits against
   host RAM and PostgreSQL connection capacity.
4. Base image references should contain `@sha256:...`. The committed example is
   pinned after validation. To adopt an update, pull the selected upstream version,
   inspect `docker image inspect IMAGE --format '{{index .RepoDigests 0}}'`, update
   the reference, rebuild and rerun CI/restore tests. Never guess a digest.
5. Run:

```sh
python3 scripts/stack.py --mode prod preflight
python3 scripts/stack.py --mode prod build
python3 scripts/stack.py --mode prod init
python3 scripts/stack.py --mode prod up
python3 scripts/stack.py --mode prod check
```

Preflight checks configuration, not DNS reachability, certificate issuance, host
capacity, vulnerability status, SMTP delivery or application correctness. Initialization
sets a generated administrator password before HTTP is permitted. Open signup is
disabled until the project's registration rules have been implemented and tested.

## Networking and TLS

- Point DNS A/AAAA records at the host. Publish AAAA only if IPv6 actually works.
- Permit inbound TCP 80 and 443; UDP 443 is optional for HTTP/3. Restrict SSH to
  operator addresses. Docker-published ports require attention to Docker's firewall
  behavior; this configuration publishes no database or Odoo port in production.
- Caddy obtains and renews HTTPS certificates once the DNS and inbound paths work.
  Certificate data persists in `caddy_data`. Certificate issuance has not been
  tested until a real domain is deployed.
- Keep Odoo reachable only through this trusted proxy when proxy mode is enabled.
- Caddy routes WebSockets to port 8072 and normal requests to 8069.
- Access logs omit URI values because reset and portal links can include tokens.
- Review third-party module logging before allowing sensitive customer data.

## Storage and secrets

Persistent volumes: PostgreSQL data, Odoo filestore/sessions, Caddy certificate data.
Neither container recreation nor `stack.py down` removes these volumes.

Compose file secrets are host bind mounts, not an encrypted secret manager. `.secrets`
and each environment directory are mode 0700; files are readable by the container
user when mounted. Protect the host disk and backup destination with encryption and
appropriate operator access. For cloud deployment, integrate its secret manager
after the provider is selected. Do not run `cat .secrets/*/*` in shared logs.

Changing a secret file does not rotate an initialized PostgreSQL role password or an
existing Odoo login password. Coordinate role/password changes during a maintenance
window, update the matching secret, restart, and verify. Bootstrap never silently
resets existing credentials. The master password is different from the login password.

## Release gates

- Infrastructure CI and restore drill pass for the exact release.
- Run a vulnerability scan of the final image and review actionable findings; no
  clean vulnerability result is asserted by this repository's current tests.
- Configure authenticated SMTP, delivery testing and sender-domain DNS records.
- Set and freeze Odoo's public base URL; verify password-reset and invoice links.
- Configure the correct company, currency, chart of accounts and journals.
- Implement and test the custom subscription module, portal record rules and password
  requirements from the problem statement; base Odoo installation is not that application.
- Confirm backup retention, encrypted off-host copies, alerts and a restore drill.
- Set up external uptime/TLS monitoring and host disk, memory and backup-age alerts.
- Load-test page response time and concurrent billing on the actual host. No
  two-second performance claim has been validated by this infrastructure setup.

## Deployment and rollback policy

Deploy a unique image per release; retain the prior image plus a complete backup.
Before an update, take a backup, stop traffic/background processing and run explicit
reviewed module migrations. Do not auto-update modules every time the container starts.
The initial build intentionally installs only standard foundations. Add module
installation/migration commands when the business addon exists.

An image rollback alone cannot undo a database migration. Restore the matching
database and filestore into an isolated environment, verify the prior release, then
switch traffic. Major Odoo upgrades and PostgreSQL major upgrades need separate
migration plans; changing an image tag against an old volume is not an upgrade plan.
