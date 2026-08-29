# AILA Database Package

This folder contains the production-ready MySQL/MariaDB database package for AILA, generated from the finalized database architecture document.

## Files

- `schema.sql` creates the `aila_db` database and all 38 enumerated tables.
- `seed.sql` inserts development data for admin/student login testing and related sample records.
- `production_baseline.sql` inserts production-safe reference rows only. It does not create users or passwords.
- `indexes.sql` safely adds recommended indexes if they are missing.
- `constraints.sql` safely adds foreign-key constraints if they are missing.
- `database_documentation.md` documents every table, column, key, and relationship.
- `migration_notes.md` explains validation, import order, phpMyAdmin steps, assumptions, and compatibility notes.

## Development Import

In phpMyAdmin, run:

1. `schema.sql`
2. `seed.sql`
3. `indexes.sql`
4. `constraints.sql`

The database name is `aila_db`.

For production, use `schema.sql` only on a fresh database, then run `production_baseline.sql`. Do not run `seed.sql` in production unless the demo users and sample data have been removed.

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
