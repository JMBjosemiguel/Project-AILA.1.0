# AILA Database Import Notes

This document summarizes the local database package, import order,
compatibility assumptions, and validation checks for the AILA MySQL/MariaDB
schema.

## Validation Summary

- The schema is normalized around users, learning content, resources, planner
  tasks, quizzes, chat, notifications, feedback, analytics, and administration.
- Tables use InnoDB, `utf8mb4`, and `utf8mb4_unicode_ci`.
- Primary keys, foreign keys, indexes, and junction-table composite keys are
  defined in the main schema files.
- `feedback.context_type` and `feedback.context_id` are intentionally not
  foreign-key constrained because feedback can refer to different application
  areas.
- `production_baseline.sql` contains only production-safe reference rows.

## Local Development Import

Use these files for a fresh local XAMPP/phpMyAdmin database:

1. `schema.sql`
2. `seed.sql`
3. `indexes.sql`
4. `constraints.sql`

`schema.sql` creates and resets the local `aila_db` database. It is destructive
and must not be used against production.

`seed.sql` inserts development-only accounts and sample data. It must not be
used for production or adviser-facing deployments.

## Production Import

For a managed database such as Aiven, use:

1. `production_schema.sql`
2. `production_baseline.sql`

Do not run `schema.sql`, `seed.sql`, `indexes.sql`, or `constraints.sql` against
Aiven. The production schema already includes the required indexes and
constraints.

See `AIVEN_MIGRATION.md` for the complete Aiven runbook.

## Local phpMyAdmin Steps

1. Start Apache and MySQL from XAMPP.
2. Open `http://localhost/phpmyadmin`.
3. Open the SQL tab.
4. Run `database/schema.sql`.
5. Run `database/seed.sql`.
6. Run `database/indexes.sql` if needed.
7. Run `database/constraints.sql` if needed.

## Compatibility Notes

- Local database name: `aila_db`.
- Production database name is selected by the connection and may differ.
- Compatible with modern MySQL and MariaDB versions used by the project.
- Password hashes in `seed.sql` are for local development only.

## Development-Only Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@aila.local` | `admin123` |
| Student | `student@aila.local` | `student123` |

These accounts are not production accounts and must not be used for public QA,
adviser review, or deployment.
