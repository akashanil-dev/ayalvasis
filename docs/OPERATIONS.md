# Operations and recovery

All examples run from the repository root. Production commands use `--mode prod`;
omit that option for development. Use the CLI for mutating operations so its
per-project file lock prevents an overlapping backup/deploy on the same host.
Direct Docker/SQL operations and operators on other hosts bypass this lock.

## Routine checks

```sh
python3 scripts/stack.py --mode prod status
python3 scripts/stack.py --mode prod check
python3 scripts/stack.py --mode prod logs
```

`check` verifies a database-backed login page and the application role's privileges.
It does not exercise business billing rules or detect every background-job failure.
Docker restart policies restart exited processes; an unhealthy status alone does
not restart a container. Alert on health failures, investigate logs and restart only
after understanding the cause.

Monitor host disk usage, volume growth, memory/OOM events, PostgreSQL connection
usage, HTTPS expiry, HTTP availability, backup freshness and restore results. When
billing is implemented, add metrics for oldest due period, failed runs, duplicate
prevention, invoice counts and email delivery failures. Alert destinations are not
configured because no hosting account or notification channel has been chosen.

## Consistent backup

```sh
python3 scripts/stack.py --mode prod backup
```

The command starts/checks PostgreSQL, records running application/proxy services,
stops them gracefully (including Odoo cron), dumps PostgreSQL, streams the filestore,
writes SHA-256 checksums and a manifest, then restarts the services that were running.
It also attempts restart if the dump/archive fails. Other database writers must be
quiesced; this is designed for one Odoo instance and its database, not independent
external writers. The maintenance window lasts for the dump and archive duration.

Artifacts are under `backups/PROJECT/UTC_TIMESTAMP/`:

- `database.dump`: custom-format PostgreSQL dump, including invoice/attachment metadata.
- `filestore.tar.gz`: file-backed attachments. Session files are intentionally excluded.
- `manifest.json`: source runtime references, database name and SHA-256 checksums.
- `COMPLETE`: written only after both artifacts succeed. Never restore incomplete sets.

Backups do not contain `.secrets`, Caddy's certificate volume, or the source checkout.
Preserve release images/source and credentials separately. Restoring keeps the source
Odoo login-password hashes but uses the destination's PostgreSQL credentials.

Local archives are not encrypted by these scripts. Keep the host disk protected,
copy complete sets to encrypted off-host storage and test that copy. Choose retention
after estimating database size and growth (a possible starting policy is 7 daily,
4 weekly and 3 monthly backups). No automatic deletion is enabled before the backup
destination and retention policy are selected. Watch disk space.

The provided systemd timer runs at 02:00 UTC (07:30 Asia/Kolkata) with up to five
minutes jitter. It is a template, not an installed job. After choosing the host,
review its user, checkout path, Docker access, maintenance window and failure alerts;
then install the two unit files and enable the timer. Scheduling without monitoring
or off-host copies is not a completed backup service.

## Restore to a fresh environment

1. Use the same Odoo/PostgreSQL references and application release listed in the
   backup manifest. Build or obtain that application image before restore.
2. Prepare a separate environment file with a unique `COMPOSE_PROJECT_NAME`, separate
   secrets, and the same `DB_NAME`. Use a different loopback port for development.
3. Do not run `init` on the destination; it must have an empty database/filestore.
4. Run:

```sh
python3 scripts/stack.py --env-file /absolute/path/to/recovery.env restore /absolute/path/to/backup
```

Use `--mode prod` as well if the recovery environment uses the production overlay.
The restore refuses a running target application, a nonempty database/filestore,
runtime mismatch or checksum failure. It does not overwrite an existing deployment.
On failure, leave the original service untouched and provision another fresh recovery
project after diagnosing the error; never blindly delete production volumes.

5. Before starting a recovered copy of production, neutralize outgoing email, payment
   integrations and automated jobs so the recovery drill cannot contact real customers.
   Keep it isolated from public traffic. The included smoke drill uses only fresh,
   synthetic records and no configured outgoing providers.
6. Start/check the recovery environment, inspect invoices, balances and attachment
   downloads, then switch traffic only after verification. Record recovery duration.

`python3 scripts/smoke.py` automates this process with isolated synthetic projects and
proves database and filestore bytes survive the round trip. A production restore
drill should additionally verify business data and the actual off-host storage path.

## Failure triage

| Symptom | First checks |
| --- | --- |
| Unhealthy Odoo | Database availability, bootstrap marker, migrations, memory and logs |
| Cannot initialize | Existing Odoo tables: initialization is deliberately one-time |
| Login fails | Correct environment, generated login/password, source login after restore |
| Certificate fails | DNS, TCP 80/443, IPv6 correctness, certificate rate limits |
| WebSocket disconnects | Worker count > 0, proxy route to 8072, upstream availability |
| Backup fails | Disk space, Docker access, lock conflicts, DB role and filestore permissions |
| Restore rejected | Matching images/DB name, complete/checksummed backup, empty target |
| Secrets changed but DB rejects login | Existing database password was not rotated with the file |
