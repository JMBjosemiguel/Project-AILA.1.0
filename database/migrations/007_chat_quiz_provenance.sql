-- Migration 007 — "Save as Quiz" provenance for chatbot mini-quizzes
--
-- Purpose:  let a student turn an informal chatbot mini-quiz (stored inside a
--           chat message, message_type='quiz') into their OWN persisted practice
--           quiz that then uses the formal TAKE serializer / server grading /
--           resumable attempt lifecycle / history. This adds only a provenance
--           link + a dedup guard so a double-click / retry can't create two
--           saved copies of the same chat quiz.
--
-- Changes (all additive — nothing renamed, nothing dropped):
--
--   quizzes
--     + source_chat_message_id BIGINT UNSIGNED NULL
--         Set only for quizzes saved from a chat message. NULL for every
--         existing quiz and every AI-generated / assessment quiz.
--       FK -> chat_messages(id) ON DELETE SET NULL
--         Deleting the source conversation/message keeps the saved quiz; it
--         just loses the provenance pointer.
--     + UNIQUE KEY uq_quizzes_source_chat_message (user_id, source_chat_message_id)
--         MySQL/MariaDB allow many NULLs in a UNIQUE key, so normal quizzes are
--         unaffected; a given (user, chat message) can be saved at most once.
--
-- Preserves: every quiz, question, attempt, score. No data backfilled.
--
-- Compatibility: MariaDB 10.4+ and MySQL 8.4. Apply ONCE (no ADD COLUMN IF NOT
--   EXISTS). Preflight: `quizzes.source_chat_message_id` must NOT already exist.
--
-- Preflight (record; must match afterwards):
--   SELECT COUNT(*) FROM information_schema.columns
--     WHERE table_schema = DATABASE() AND table_name = 'quizzes'
--       AND column_name = 'source_chat_message_id';   -- expect 0 before, 1 after
--   SELECT COUNT(*) FROM quizzes;                     -- unchanged by this migration
--
-- Apply (local dev only — never against Aiven in this batch):
--   "C:/xampp/mysql/bin/mysql.exe" -h 127.0.0.1 -u root aila_db < database/migrations/007_chat_quiz_provenance.sql
--
-- Verify:
--   SHOW COLUMNS FROM quizzes LIKE 'source_chat_message_id';        -- 1 row, NULL default
--   SHOW INDEX FROM quizzes WHERE Key_name = 'uq_quizzes_source_chat_message';  -- 2 rows
--
-- Rollback:
--   ALTER TABLE quizzes DROP FOREIGN KEY fk_quizzes_source_chat_message;
--   ALTER TABLE quizzes DROP INDEX uq_quizzes_source_chat_message;
--   ALTER TABLE quizzes DROP COLUMN source_chat_message_id;

ALTER TABLE quizzes
  ADD COLUMN source_chat_message_id BIGINT UNSIGNED NULL AFTER source_id,
  ADD UNIQUE KEY uq_quizzes_source_chat_message (user_id, source_chat_message_id),
  ADD CONSTRAINT fk_quizzes_source_chat_message
    FOREIGN KEY (source_chat_message_id) REFERENCES chat_messages(id)
    ON DELETE SET NULL ON UPDATE CASCADE;
