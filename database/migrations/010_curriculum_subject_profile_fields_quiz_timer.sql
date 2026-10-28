-- Migration 010 — course curriculum subject, extra profile fields, quiz timer fields
--
-- Purpose:  One additive migration for three planned features, so every new
--           column lands in a single, reviewable deploy step:
--             * Courses can be tagged with a 2nd-year nursing curriculum
--               subject (Learning Hub groups/filters by it; it is also given
--               to Gemini as context when generating the roadmap).
--             * Student profiles gain an optional middle name, Facebook
--               name/link and contact number (contact info is visible only to
--               the student themselves and to admins — never other students).
--             * Quiz attempts gain an optional time limit and a tab-switch
--               counter. The existing (until now unused) quiz_attempts.expires_at
--               is reused as the attempt's deadline — nothing new for that.
--
-- Changes (additive — nothing renamed, nothing dropped):
--
--   subjects
--     + curriculum_subject VARCHAR(50) NULL DEFAULT NULL
--         The curriculum subject code (e.g. 'NCM 106'), validated server-side
--         against backend/src/constants/curriculumSubjects.json. NULL means
--         "Others" — which is also what every existing course becomes.
--
--   user_profiles
--     + middle_name    VARCHAR(100) NULL DEFAULT NULL
--     + facebook       VARCHAR(255) NULL DEFAULT NULL   (a name or a facebook.com link)
--     + contact_number VARCHAR(30)  NULL DEFAULT NULL
--
--   quiz_attempts
--     + time_limit_seconds INT UNSIGNED NULL DEFAULT NULL
--         NULL = no time limit (every existing attempt, and the default).
--     + tab_switch_count SMALLINT UNSIGNED NOT NULL DEFAULT 0
--         Existing rows are backfilled with 0 by the DEFAULT.
--
-- Preserves: every course, profile and quiz attempt. Existing courses read as
--   "Others", existing profiles simply have no middle name/contact info, and
--   existing attempts are untimed with zero tab switches — all behave exactly
--   as before.
--
-- Compatibility: MariaDB 10.4+ and MySQL 8.4. Apply ONCE. Preflight: none of
--   the six columns below may already exist.
--
-- Preflight (record; must match afterwards):
--   SELECT table_name, column_name FROM information_schema.columns
--     WHERE table_schema = DATABASE()
--       AND ((table_name = 'subjects' AND column_name = 'curriculum_subject')
--         OR (table_name = 'user_profiles' AND column_name IN ('middle_name', 'facebook', 'contact_number'))
--         OR (table_name = 'quiz_attempts' AND column_name IN ('time_limit_seconds', 'tab_switch_count')));
--   -- expect 0 rows before, 6 rows after
--
-- Apply (local dev only — never against Aiven without a backup first):
--   "C:/xampp/mysql/bin/mysql.exe" -h 127.0.0.1 -u root aila_db < database/migrations/010_curriculum_subject_profile_fields_quiz_timer.sql
--
-- Verify:
--   SHOW COLUMNS FROM subjects LIKE 'curriculum_subject';                         -- 1 row, NULL default
--   SHOW COLUMNS FROM user_profiles WHERE Field IN ('middle_name', 'facebook', 'contact_number');  -- 3 rows
--   SHOW COLUMNS FROM quiz_attempts WHERE Field IN ('time_limit_seconds', 'tab_switch_count');     -- 2 rows
--   SELECT COUNT(*) FROM subjects WHERE curriculum_subject IS NOT NULL;           -- expect 0 right after migration
--   SELECT COUNT(*) FROM quiz_attempts WHERE tab_switch_count <> 0;               -- expect 0 right after migration
--
-- Rollback:
--   ALTER TABLE quiz_attempts DROP COLUMN tab_switch_count, DROP COLUMN time_limit_seconds;
--   ALTER TABLE user_profiles DROP COLUMN contact_number, DROP COLUMN facebook, DROP COLUMN middle_name;
--   ALTER TABLE subjects DROP COLUMN curriculum_subject;

ALTER TABLE subjects
  ADD COLUMN curriculum_subject VARCHAR(50) NULL DEFAULT NULL AFTER goal;

ALTER TABLE user_profiles
  ADD COLUMN middle_name VARCHAR(100) NULL DEFAULT NULL AFTER user_id,
  ADD COLUMN facebook VARCHAR(255) NULL DEFAULT NULL AFTER bio,
  ADD COLUMN contact_number VARCHAR(30) NULL DEFAULT NULL AFTER facebook;

ALTER TABLE quiz_attempts
  ADD COLUMN time_limit_seconds INT UNSIGNED NULL DEFAULT NULL AFTER expires_at,
  ADD COLUMN tab_switch_count SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER time_limit_seconds;
