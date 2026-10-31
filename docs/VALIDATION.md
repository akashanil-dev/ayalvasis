# Infrastructure validation — 31 October 2026

Deployment-file preparation is complete. Validation ran locally against Docker
Engine 29.8.2, Compose 5.3.1 and the pinned Odoo 19 image. No cloud host was provisioned.

| Check | Result |
| --- | --- |
| Python infrastructure tests | 6 passed |
| Development and production Compose configuration | Passed |
| Python compilation and PostgreSQL initialization shell syntax | Passed |
| GitHub Actions workflow (actionlint) | Passed; checkout action pinned to verified v6 commit |
| Caddy configuration validation | Passed; no public certificate requested |
| systemd service/timer syntax | Passed; units are not installed/enabled |
| Production preflight | Accepts complete fixture; rejects missing domain, zero workers, disabled proxy mode and mutable image settings |
| Application image build | Passed with immutable base-image digests |
| Fresh Odoo initialization without demo records | Passed |
| Generated administrator authentication | Passed |
| Database-backed HTTP readiness | Passed |
| Application role lacks superuser/createdb/createrole | Passed |
| Consistent database + filestore backup | Passed |
| Restore into a separate empty environment | Passed; database record and binary filestore contents verified |
| Restored multi-worker startup and port 8072 listener | Passed |
| Reinitialization of existing data | Correctly rejected |
| Unsafe/corrupt archive handling | Correctly rejected by tests |
| Backup failure restart behavior | Passed |
| Generated secrets in deliverable files | None found |

The final rebuilt image completed the end-to-end recovery drill. Disposable test
containers, volumes and backups were removed. The image and local environment files
remain available; generated credentials stay outside Git. The final local log is
`.state/release-validation.log` and is intentionally ignored by Git.

## Remaining production work

- Choose host, domain and deployment account; provision the host and network controls.
- Configure real DNS, HTTPS issuance, SMTP and external monitoring/alert destinations.
- Choose encrypted off-host backup storage, retention and restore objectives; install
  the backup timer only after confirming its maintenance window and failure alerts.
- Scan the final release image for vulnerabilities and complete any required remediation.
- Push the repository to execute hosted GitHub CI; local workflow validation is not
  evidence of a GitHub-hosted run.
- Implement the subscription business addon, then test its permissions, billing
  correctness and performance. These are not supplied by the infrastructure scaffold.

The current setup is a tested single-host foundation. Public TLS, gateway/SMTP
delivery, workload capacity, high availability and full WebSocket application traffic
have not been validated by this local infrastructure drill.
