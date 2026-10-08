# Aiven MySQL Production Database Runbook

This runbook prepares a clean production database for AILA on Aiven MySQL.
It imports the finalized schema, production-safe reference data, and one
deliberate administrator account. It does not copy local development data.

```text
production_schema.sql + production_baseline.sql -> Aiven MySQL -> ready for backend deployment
```

Do not dump and restore the local `aila_db` database into production. The local
database is for development and may contain test accounts, generated courses,
sample resources, chats, quizzes, and other non-production records.

## 1. Required Aiven Values

Collect these values from the Aiven service overview or connection information.
Keep them out of commits, screenshots, and shared chat messages.

| Aiven value | Backend environment variable |
| --- | --- |
| Host | `DB_HOST` |
| Port | `DB_PORT` |
| User, usually `avnadmin` | `DB_USER` |
| Password | `DB_PASSWORD` |
| Database name, for example `project-aila` | `DB_NAME` |
| CA certificate contents | `DB_SSL_CA` |

The database name `project-aila` is valid for MySQL connections. If raw SQL
references the database name directly, wrap it in backticks as
`` `project-aila` ``.

## 2. Confirm the Target Database

In the Aiven console, open the service's Databases tab and confirm the target
database exists. If it does not exist, create it before importing any SQL.

## 3. Import the Production Schema

From the repository's `database/` directory, run:

```bash
mysql --host=<HOST> --port=<PORT> --user=avnadmin --password \
      --ssl-mode=REQUIRED --ssl-ca=/path/to/ca.pem \
      project-aila < production_schema.sql
```

`--password` without a value prompts for the password and avoids placing the
secret in shell history.

Alternatively, open the Aiven Query editor, select the target database, and run
the contents of `production_schema.sql`.

## 4. Import Production Reference Data

```bash
mysql --host=<HOST> --port=<PORT> --user=avnadmin --password \
      --ssl-mode=REQUIRED --ssl-ca=/path/to/ca.pem \
      project-aila < production_baseline.sql
```

`production_baseline.sql` inserts only lookup/reference rows required by the
application. It does not create users, passwords, sample courses, or QA data.

## 5. Verify the Database

Run these checks against the target database:

```sql
-- Expected: 48
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'project-aila';

-- Expected: 65
SELECT COUNT(*) FROM information_schema.table_constraints
WHERE table_schema = 'project-aila'
  AND constraint_type = 'FOREIGN KEY';

-- Expected:
-- roles=3, task_priorities=3, resource_categories=3,
-- conversation_categories=3, suggested_questions=3
SELECT 'roles' AS table_name, COUNT(*) AS row_count FROM roles
UNION ALL SELECT 'task_priorities', COUNT(*) FROM task_priorities
UNION ALL SELECT 'resource_categories', COUNT(*) FROM resource_categories
UNION ALL SELECT 'conversation_categories', COUNT(*) FROM conversation_categories
UNION ALL SELECT 'suggested_questions', COUNT(*) FROM suggested_questions;

-- Expected: 0
SELECT COUNT(*) FROM users;
```

If any count differs from the expected value, stop and review the import before
continuing.

## 6. Create the Initial Administrator Account

Generate a bcrypt password hash locally from the `backend/` directory:

```bash
cd backend
node -e "require('bcrypt').hash(process.argv[1], 10).then(h => console.log(h))" "<STRONG_ADMIN_PASSWORD>"
```

Copy only the printed hash into the SQL below. Do not commit or share the
plaintext password or hash.

```sql
INSERT INTO users (role_id, email, password_hash, first_name, last_name, is_active)
VALUES (
  (SELECT id FROM roles WHERE name = 'admin'),
  'admin@yourdomain.example',
  '$2b$...PASTE_HASH_HERE...',
  'AILA',
  'Administrator',
  1
);

INSERT INTO user_profiles (user_id, program, xp_points, level)
VALUES (
  (SELECT id FROM users WHERE email = 'admin@yourdomain.example'),
  'System Administration',
  0,
  1
);
```

Create QA/student accounts later through the application or through a separate
controlled setup process.

## 7. Deployment Handoff

The database is ready for backend deployment after:

1. `production_schema.sql` imports successfully.
2. `production_baseline.sql` imports successfully.
3. All verification queries pass.
4. The initial administrator account is created.

Render will also require the backend environment variables listed in the
deployment guide, including `JWT_SECRET`, `GEMINI_API_KEY`, `APP_URL`,
`CORS_ORIGINS`, storage settings, and the Aiven database values above.
