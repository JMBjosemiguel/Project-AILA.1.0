# AILA Database Package

This folder contains the production-ready MySQL/MariaDB database package for AILA, generated from the finalized database architecture document.

## Files

- `schema.sql` creates the local `aila_db` database and all tables. Contains `CREATE DATABASE` + `USE aila_db` + a `DROP TABLE` reset block — for **local XAMPP/phpMyAdmin only**.
- `production_schema.sql` same table definitions as `schema.sql`, but with **no** `CREATE DATABASE`, **no** `USE`, and **no** `DROP TABLE`. Use this for a managed host (Aiven, RDS, ...) where the database already exists and its name is fixed. Select the database on the connection instead.
- `seed.sql` inserts development data for admin/student login testing and related sample records. **Local only** — never in production.
- `production_baseline.sql` inserts production-safe reference/lookup rows only (roles, task priorities, resource categories, conversation categories, curated suggested questions). No users, no passwords, no sample content. Portable (no `USE`).
- `indexes.sql` / `constraints.sql` idempotent helper scripts that add recommended indexes / foreign keys **if missing**. `schema.sql` and `production_schema.sql` already create every one of them inline, so these are a no-op after a full import. They use `USE aila_db`, `DELIMITER`, and `CREATE PROCEDURE`, so they are for the local `mysql` CLI only — skip them on Aiven.
- `database_documentation.md` documents every table, column, key, and relationship.
- `migration_notes.md` explains validation, import order, phpMyAdmin steps, assumptions, and compatibility notes.
- `AIVEN_MIGRATION.md` step-by-step runbook for creating the Aiven production database.

## Development Import

In phpMyAdmin, run:

1. `schema.sql`
2. `seed.sql`
3. `indexes.sql`
4. `constraints.sql`

The database name is `aila_db`.

## Production / Aiven Import

On a managed host the database is pre-created and its name is fixed (for AILA's Aiven
service the name is `project-aila`). Do not use `schema.sql` there — it hardcodes
`aila_db`. Instead, connect with the target database selected and run:

1. `production_schema.sql`
2. `production_baseline.sql`

Then create one admin account deliberately (see `AIVEN_MIGRATION.md`). Never run
`seed.sql` in production. `indexes.sql` / `constraints.sql` are not needed (and not
recommended) on Aiven.

## Development-Only Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@aila.local` | `admin123` |
| Student | `student@aila.local` | `student123` |

The passwords are stored as Node bcrypt-compatible hashes in `seed.sql`. These are local development credentials only and must not be used for production, QA, adviser access, or cloud deployment.

## Scope

This package only creates the database layer. It does not add Express.js, APIs, React code, or frontend changes.

## Validation Note

The architecture document says "Total tables: 34," but its table inventory and definitions enumerate 38 tables. This package includes all 38 listed tables so that no documented table is skipped.
