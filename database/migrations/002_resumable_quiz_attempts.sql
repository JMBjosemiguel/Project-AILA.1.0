-- Migration 002 — resumable formal quiz attempts
--
-- Purpose:  give persisted quizzes a real server-side lifecycle
--             NOT_STARTED -> in_progress -> submitted   (expired reserved)
--           so a student who is interrupted (navigate away, refresh, close the
--           tab, log out / log back in) can resume the SAME attempt with the
--           answers they had already saved. The database — not React state or
--           localStorage — becomes the source of truth for quiz progress.
--
-- Changes (all additive — nothing renamed, nothing dropped):
--
--   quiz_attempts
--     + status ENUM('in_progress','submitted','expired') NOT NULL DEFAULT 'submitted'
--         Every existing row becomes 'submitted' automatically (they are all
--         completed submissions). New in-progress attempts set it explicitly.
--     + current_index SMALLINT UNSIGNED NOT NULL DEFAULT 0    -- resume position
--     + active_slot   TINYINT  UNSIGNED NULL DEFAULT NULL     -- 1 while in progress, NULL otherwise
--     + expires_at    TIMESTAMP NULL DEFAULT NULL             -- reserved for future timed exams; unused this batch
--     + updated_at    TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
--     + UNIQUE KEY (user_id, quiz_id, active_slot)
--         At most ONE active attempt per (user, quiz). Because MariaDB/MySQL
--         allow multiple NULLs in a UNIQUE index, unlimited historical
--         'submitted' attempts (active_slot = NULL) are unaffected. This is the
--         concurrency guard: two simultaneous "Start" requests cannot both
--         create an active attempt.
--     + KEY (user_id, status)  -- dashboard "resume" lookup + history filter
--
--   quiz_attempt_answers
--     ~ is_correct  TINYINT(1) NOT NULL DEFAULT 0  ->  TINYINT(1) NULL DEFAULT NULL
--         An answer saved before submission is ungraded (is_correct = NULL);
--         the server fills 0/1 at submit time. Existing graded rows keep 0/1.
--     + answered_at TIMESTAMP NULL DEFAULT NULL
--     + UNIQUE KEY (attempt_id, question_id)
--         Makes answer autosave an idempotent UPSERT (INSERT ... ON DUPLICATE
--         KEY UPDATE). Changing an answer before submitting overwrites the row.
--
--   completed_at is already NULL-able — no change needed. An in-progress
--   attempt keeps completed_at = NULL until it is submitted.
--
-- Preserves: every historical attempt, its score / total, its answers, its
--   is_correct values, all foreign keys, and the xp_events ledger from 001.
--
-- Compatibility: MariaDB 10.4+ and MySQL 8.4.
--   Applied ONCE — deliberately NOT written with `ADD COLUMN IF NOT EXISTS`
--   because MySQL 8.4 does not support that clause. Run the preflight below
--   first; if it reports any duplicate (attempt_id, question_id) rows, STOP —
--   the new UNIQUE key would fail and data would need manual review.
--
-- Preflight (expect an empty result):
--   SELECT attempt_id, question_id, COUNT(*) c
--     FROM quiz_attempt_answers
--     GROUP BY attempt_id, question_id HAVING c > 1;
--
-- Apply (local dev only — never against Aiven in this batch):
--   "C:/xampp/mysql/bin/mysql.exe" -h 127.0.0.1 -u root aila_db < database/migrations/002_resumable_quiz_attempts.sql
--
-- Verify after apply:
--   SELECT status, COUNT(*) FROM quiz_attempts GROUP BY status;          -- all historical rows -> 'submitted'
--   SELECT COUNT(*) FROM quiz_attempts WHERE status='submitted' AND completed_at IS NULL;  -- expect 0
--   SHOW INDEX FROM quiz_attempts;         -- uq_quiz_attempts_active present
--   SHOW INDEX FROM quiz_attempt_answers;  -- uq_quiz_attempt_answers_slot present
--
-- Rollback (in this order — assumes only 'submitted' history remains, which
-- keeps every score intact; delete any in-progress attempts first):
--   DELETE FROM quiz_attempts WHERE status <> 'submitted';
--   ALTER TABLE quiz_attempt_answers
--     DROP INDEX uq_quiz_attempt_answers_slot,
--     DROP COLUMN answered_at,
--     MODIFY COLUMN is_correct TINYINT(1) NOT NULL DEFAULT 0;
--   ALTER TABLE quiz_attempts
--     DROP INDEX uq_quiz_attempts_active,
--     DROP INDEX idx_quiz_attempts_user_status,
--     DROP COLUMN status, DROP COLUMN current_index, DROP COLUMN active_slot,
--     DROP COLUMN expires_at, DROP COLUMN updated_at;

ALTER TABLE quiz_attempts
  ADD COLUMN status ENUM('in_progress','submitted','expired') NOT NULL DEFAULT 'submitted',
  ADD COLUMN current_index SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN active_slot TINYINT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN expires_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  ADD UNIQUE KEY uq_quiz_attempts_active (user_id, quiz_id, active_slot),
  ADD KEY idx_quiz_attempts_user_status (user_id, status);

ALTER TABLE quiz_attempt_answers
  MODIFY COLUMN is_correct TINYINT(1) NULL DEFAULT NULL,
  ADD COLUMN answered_at TIMESTAMP NULL DEFAULT NULL,
  ADD UNIQUE KEY uq_quiz_attempt_answers_slot (attempt_id, question_id);
