# Ayalvasis infrastructure

Odoo Community 19 and PostgreSQL deployment foundation.

## Local startup

Run `python3 scripts/stack.py setup`, `validate`, `build`, `init`, and `up`
in that order. Use `python3 scripts/stack.py check` to verify readiness.
Requirements: Python 3.12+, Docker Engine and Docker Compose.

Setup generates private local credentials. Never commit `.env`, `.secrets`,
database backups or generated runtime files. Do not repeat setup or initialization
for an existing environment. Development HTTP binds to localhost:8069.

See [deployment](docs/DEPLOYMENT.md) and [operations](docs/OPERATIONS.md)
for production configuration, backup and restore procedures.
