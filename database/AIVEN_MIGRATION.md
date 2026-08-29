# AILA — Aiven MySQL Migration Runbook

Goal: stand up a **clean** production database on Aiven — finalized schema + the
reference rows the app needs + one deliberate admin account. No local test data.

```
LOCAL aila_db  ──(schema only, not data)──►  production_schema.sql + production_baseline.sql  ──►  Aiven  ──►  ready for Render
```

Do **not** dump-and-restore the local `aila_db`. It is full of throwaway QA accounts
(`probe.*`, `final.polish.*`, `final.walkthrough.*`, `qa.final.*`) and AI-generated test
content. Production starts empty except for lookup data and one admin.

---

## 0. Values to get from the Aiven console (Service → Overview / Connection information)

Keep these out of chat, commits, and screenshots. You will paste them into Render later.

| Value | Where it goes |
| --- | --- |
| Host (e.g. `project-aila-xxx.a.aivencloud.com`) | `DB_HOST` |
| Port (Aiven-assigned, **not 3306**) | `DB_PORT` |
| User (`avnadmin`) | `DB_USER` |
| Password | `DB_PASSWORD` |
| Database name (`project-aila`) | `DB_NAME` |
| CA certificate (`ca.pem`, download it) | `DB_SSL_CA` |

`project-aila` is a valid MySQL database name and works as-is. The hyphen only matters
in raw SQL (`` `project-aila` `` must be backtick-quoted); the app passes the name to
the driver as a connection parameter, so no code change is needed. If you would rather
avoid the hyphen, create a second database named `aila` in the Aiven console (Databases
tab) and use that for `DB_NAME` — either way is fine.

---

## 1. Confirm the target database exists

Aiven usually creates `defaultdb` plus whatever you named at service creation. In the
**Databases** tab, confirm `project-aila` is listed. If it is not, create it there.

## 2. Import the schema

From a machine with the `mysql` client and `ca.pem` saved locally, run from the repo's
`database/` folder:

```bash
mysql --host=<HOST> --port=<PORT> --user=avnadmin --password \
      --ssl-mode=REQUIRED --ssl-ca=/path/to/ca.pem \
      project-aila < production_schema.sql
```

(`--password` with no value prompts, so the secret never lands in shell history.)

Or paste `production_schema.sql` into the Aiven console **Query editor** with
`project-aila` selected.

## 3. Import the baseline reference data

```bash
mysql --host=<HOST> --port=<PORT> --user=avnadmin --password \
      --ssl-mode=REQUIRED --ssl-ca=/path/to/ca.pem \
      project-aila < production_baseline.sql
```

## 4. Verify

```sql
-- expect 43
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'project-aila';
-- expect 55
SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = 'project-aila' AND constraint_type = 'FOREIGN KEY';
-- expect roles=3, task_priorities=3, resource_categories=3,
--        conversation_categories=3, suggested_questions=3
SELECT 'roles' t, COUNT(*) n FROM roles
UNION ALL SELECT 'task_priorities', COUNT(*) FROM task_priorities
UNION ALL SELECT 'resource_categories', COUNT(*) FROM resource_categories
UNION ALL SELECT 'conversation_categories', COUNT(*) FROM conversation_categories
UNION ALL SELECT 'suggested_questions', COUNT(*) FROM suggested_questions;
-- expect 0
SELECT COUNT(*) FROM users;
```

## 5. Create ONE admin account (deliberate, private password)

Generate a bcrypt hash locally with the project's own bcrypt (from `backend/`):

```bash
cd backend
node -e "require('bcrypt').hash(process.argv[1], 10).then(h => console.log(h))" "<CHOOSE_A_STRONG_PASSWORD>"
```

Copy the printed `$2b$...` hash into this INSERT (run against `project-aila`). Do not
put the plaintext password or the hash into git or chat:

```sql
INSERT INTO users (role_id, email, password_hash, first_name, last_name, is_active)
VALUES (
  (SELECT id FROM roles WHERE name = 'admin'),
  'admin@yourdomain',        -- real admin address
  '$2b$...PASTE_HASH...',
  'AILA', 'Administrator', 1
);

INSERT INTO user_profiles (user_id, program, xp_points, level)
VALUES ((SELECT id FROM users WHERE email = 'admin@yourdomain'), 'System Administration', 0, 1);
```

A QA student account is **not** created now — add it later, the same way, only when QA
testing actually starts.

## 6. Leave the rest to the app

Newly registered students get empty personal data automatically (the app creates only
their `users` + `user_profiles` row on register). No courses, resources, planner tasks,
chat, quizzes, or XP until they generate them. Nothing to pre-seed.

## 7. Hand-off to Render (next step — not yet)

The database is "ready for Render" once step 4 checks pass and step 5 is done. The
backend env vars Render will need are listed in §0 above plus `JWT_SECRET`,
`GEMINI_API_KEY`, `APP_URL`, `CORS_ORIGINS`, and the `STORAGE_DRIVER` / `R2_*` set.
Do not deploy Render until this database is confirmed.
