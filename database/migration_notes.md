# AILA Database Migration Notes

## Validation Summary

Schema validation found one document inconsistency and otherwise passed.

- The document states "Total tables: 34," but the module breakdown, ERD, table definitions, and current frontend `DATABASE_TABLES` constant enumerate 38 tables. Because the instruction also says not to skip any tables, all 38 enumerated tables are included.
- No duplicate table names were found.
- No duplicate columns were introduced inside a table.
- All explicit relationships from the ERD and table definitions are represented as foreign keys, except `feedback.context_type/context_id`, which the document intentionally defines as a lightweight polymorphic reference rather than a strict FK.
- No circular foreign-key dependencies were found.
- Junction tables use composite primary keys where specified.
- Recommended indexes are included for login lookups, chatbot keyword matching, ordered chat history, task dashboards, unread notification counts, learning progress uniqueness, and foreign-key lookup columns.
- Normalization is consistent with the document's 3NF target. The only intentional denormalization/flexibility point is the feedback polymorphic reference described above.

## Import Order

Run the files in this order:

1. `schema.sql`
2. `seed.sql` for local development, or `production_baseline.sql` for production
3. `indexes.sql`
4. `constraints.sql`

`schema.sql` is self-contained and already creates tables, keys, indexes, and foreign keys. The separate `indexes.sql` and `constraints.sql` files are idempotent helper scripts that check `information_schema` before adding an index or foreign key, so they are safe to run after `schema.sql`.

For production, do not import `seed.sql` as-is. Use `production_baseline.sql`, then create admin and QA accounts with private passwords.

## phpMyAdmin Import Steps

1. Open XAMPP and start Apache and MySQL.
2. Go to `http://localhost/phpmyadmin`.
3. Open the SQL tab.
4. Paste and run `database/schema.sql`.
5. Paste and run `database/seed.sql`.
6. Optionally paste and run `database/indexes.sql`.
7. Optionally paste and run `database/constraints.sql`.

## Compatibility Notes

- Target database name: `aila_db`.
- Engine: InnoDB.
- Charset: `utf8mb4`.
- Collation: `utf8mb4_unicode_ci`.
- Compatible with MySQL 8+ and MariaDB as bundled with XAMPP/phpMyAdmin.
- `CHECK` constraints are included where useful. Older MariaDB/MySQL versions may parse or enforce them differently, but current MySQL 8+ and modern MariaDB support them.
- Passwords in `seed.sql` are Node bcrypt-compatible hashes for local development only:
  - `admin@aila.local` / `admin123`
  - `student@aila.local` / `student123`

## Assumptions

- The architecture document intentionally treats `user_sessions`, `task_status_log`, `resource_views_log`, `admin_audit_log`, and `dashboard_activity_log` as optional/recommended tables. They are still included because they appear in the table inventory and definitions.
- `feedback.context_type/context_id` is not constrained by a foreign key because the document explicitly defines it as a polymorphic-style reference.
- `schema.sql` uses a fresh-build approach and drops existing AILA tables before recreating them. Back up existing data before running it on a non-development database.
- `production_baseline.sql` intentionally avoids demo users, QA users, admin passwords, and uploaded-resource sample data.
