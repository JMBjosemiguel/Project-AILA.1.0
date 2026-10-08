# AILA Database Package

This folder contains the MySQL/MariaDB schema, reference data, and migration
utilities for AILA.

## Files

- `schema.sql` creates the local `aila_db` database and all tables. It includes
  `CREATE DATABASE`, `USE aila_db`, and a reset block. Use it only for local
  development.
- `production_schema.sql` contains the same table definitions without database
  creation, `USE`, or reset statements. Use it for managed databases such as
  Aiven.
- `seed.sql` inserts development data for local admin/student testing. Do not
  use it in production.
- `production_baseline.sql` inserts production-safe reference rows only. It
  creates no users, passwords, sample courses, or uploaded-resource data.
- `indexes.sql` and `constraints.sql` are local helper scripts for adding
  indexes and foreign keys if missing. A full `schema.sql` or
  `production_schema.sql` import already includes them.
- `database_documentation.md` documents the schema tables and relationships.
- `migration_notes.md` summarizes import order, compatibility notes, and local
  setup guidance.
- `AIVEN_MIGRATION.md` provides the Aiven production database runbook.

## Local Development Import

For a fresh local database, run:

1. `schema.sql`
2. `seed.sql`
3. `indexes.sql`
4. `constraints.sql`

The local database name is `aila_db`.

## Production Import

For a managed database, connect with the target database selected and run:

1. `production_schema.sql`
2. `production_baseline.sql`

Then create one administrator account deliberately. See `AIVEN_MIGRATION.md` for
the full production database runbook.

Never run `seed.sql` in production. `indexes.sql` and `constraints.sql` are not
needed after a production schema import.

## Development-Only Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@aila.local` | `admin123` |
| Student | `student@aila.local` | `student123` |

These accounts are local development credentials only. They must not be used
for production, public QA, adviser access, or cloud deployment.

## Scope

This package defines the database layer only. It does not include backend API or
frontend code. See `database_documentation.md` for the table inventory.
