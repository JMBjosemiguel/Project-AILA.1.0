-- Migration 004 — course assessments (module checkpoints + course final / long test)
--
-- Purpose:  give generated courses a formal assessment structure —
--             MODULE 1 … lessons … MODULE CHECKPOINT
--             MODULE 2 … lessons … MODULE CHECKPOINT
--             …
--             COURSE FINAL / LONG TEST
--           without a separate test engine: a checkpoint / final IS a `quizzes`
--           row, so it reuses Batch 1 answer-key protection + XP ledger, Batch 2
--           resumable attempts / autosave / server-side grading / immutable
--           submissions, and Batch 3 personalized generation + snapshots.
--
-- Changes (all additive — nothing renamed, nothing dropped):
--
--   quizzes
--     + subject_id      INT UNSIGNED NULL   -> the course (formal assessments only)
--     + module_id       INT UNSIGNED NULL   -> the module (module_checkpoint only)
--     + assessment_kind ENUM('practice','module_checkpoint','course_final') NOT NULL DEFAULT 'practice'
--         Every existing quiz becomes 'practice' automatically.
--     + passing_score   TINYINT UNSIGNED NULL   -> 0-100, set when a formal assessment is created (default 70)
--     + assessment_slot INT UNSIGNED NULL
--         Uniqueness discriminator, same idea as Batch 2's quiz_attempts.active_slot:
--           practice           -> NULL
--           module_checkpoint  -> module_id
--           course_final       -> 0
--     + UNIQUE (user_id, subject_id, assessment_slot)
--         -> at most ONE checkpoint per (student, module) and ONE final per
--            (student, course). Practice quizzes carry NULLs, and MySQL/MariaDB
--            allow many NULLs in a UNIQUE index, so unlimited practice quizzes
--            are unaffected. This is the concurrency guard for on-demand
--            generation — two simultaneous "open checkpoint" requests cannot
--            both create the quiz.
--     + KEY (subject_id, assessment_kind), KEY (module_id)
--     + FK subject_id -> subjects(id)  ON DELETE CASCADE   (consistent with fk_quizzes_user)
--     + FK module_id  -> modules(id)   ON DELETE CASCADE
--       (Normal course *soft*-delete leaves the assessment row — harmless, hidden
--        by the deleted_at filter — exactly like existing quiz history.)
--
--   quiz_attempts
--     + passed TINYINT(1) NULL
--         Recorded at submission for module_checkpoint / course_final attempts
--         (NULL for practice). Stored, not derived, so a later passing_score
--         change never retroactively alters a historical pass/fail.
--
-- Preserves: every existing quiz (-> 'practice'), every attempt, all scores,
--   all FKs, the xp_events ledger.
--
-- Compatibility: MariaDB 10.4+ and MySQL 8.4. Applied ONCE (no
--   `ADD COLUMN IF NOT EXISTS` — MySQL 8.4 lacks it).
--
-- Preflight (record; must be identical afterwards):
--   SELECT (SELECT COUNT(*) FROM subjects) subjects, (SELECT COUNT(*) FROM modules) modules,
--          (SELECT COUNT(*) FROM quizzes) quizzes, (SELECT COUNT(*) FROM quiz_attempts) quiz_attempts;
--   SELECT source_type, COUNT(*) FROM quizzes GROUP BY source_type;   -- context only
--
-- Apply (local dev only — never against Aiven in this batch):
--   "C:/xampp/mysql/bin/mysql.exe" -h 127.0.0.1 -u root aila_db < database/migrations/004_course_assessments.sql
--
-- Verify after apply:
--   SELECT assessment_kind, COUNT(*) FROM quizzes GROUP BY assessment_kind;   -- all existing -> practice
--   SELECT COUNT(*) FROM quizzes WHERE assessment_kind <> 'practice';         -- expect 0
--   SHOW INDEX FROM quizzes;         -- uq_quizzes_assessment present
--   SHOW COLUMNS FROM quiz_attempts LIKE 'passed';
--   -- same subjects / modules / quizzes / quiz_attempts counts as preflight
--
-- Rollback:
--   ALTER TABLE quiz_attempts DROP COLUMN passed;
--   ALTER TABLE quizzes
--     DROP FOREIGN KEY fk_quizzes_subject, DROP FOREIGN KEY fk_quizzes_module,
--     DROP INDEX uq_quizzes_assessment, DROP INDEX idx_quizzes_subject_kind, DROP INDEX idx_quizzes_module,
--     DROP COLUMN assessment_slot, DROP COLUMN passing_score, DROP COLUMN assessment_kind,
--     DROP COLUMN module_id, DROP COLUMN subject_id;
--   (Delete any generated assessment quizzes first if you want a pure practice-only history.)

ALTER TABLE quizzes
  ADD COLUMN subject_id INT UNSIGNED NULL,
  ADD COLUMN module_id INT UNSIGNED NULL,
  ADD COLUMN assessment_kind ENUM('practice','module_checkpoint','course_final') NOT NULL DEFAULT 'practice',
  ADD COLUMN passing_score TINYINT UNSIGNED NULL,
  ADD COLUMN assessment_slot INT UNSIGNED NULL,
  ADD CONSTRAINT chk_quizzes_passing_score CHECK (passing_score IS NULL OR passing_score <= 100),
  ADD UNIQUE KEY uq_quizzes_assessment (user_id, subject_id, assessment_slot),
  ADD KEY idx_quizzes_subject_kind (subject_id, assessment_kind),
  ADD KEY idx_quizzes_module (module_id),
  ADD CONSTRAINT fk_quizzes_subject FOREIGN KEY (subject_id) REFERENCES subjects(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  ADD CONSTRAINT fk_quizzes_module FOREIGN KEY (module_id) REFERENCES modules(id)
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE quiz_attempts
  ADD COLUMN passed TINYINT(1) NULL;
