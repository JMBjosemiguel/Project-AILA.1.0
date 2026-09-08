-- Migration 005 — generated-material sharing (private / unlisted + copy)
--
-- Purpose:  let a student share a generated COURSE or generated QUIZ read-only
--           via an unlisted, revocable link, and let a recipient COPY it into
--           their own materials. Private by default. No public library, no
--           resource-file or chat sharing (later batches).
--
-- Changes (all additive — nothing renamed, nothing dropped):
--
--   subjects
--     + visibility ENUM('private','unlisted') NOT NULL DEFAULT 'private'
--         Every existing course stays 'private' — nothing is auto-exposed.
--     + copied_from_subject_id INT UNSIGNED NULL  (provenance; metadata only)
--       FK -> subjects(id) ON DELETE SET NULL  (a copy survives the original's deletion)
--
--   quizzes
--     + visibility ENUM('private','unlisted') NOT NULL DEFAULT 'private'
--     + copied_from_quiz_id BIGINT UNSIGNED NULL
--       FK -> quizzes(id) ON DELETE SET NULL
--
--   material_shares  (NEW)
--     One row per share link. The raw token is NEVER stored — only its SHA-256
--     hash, so a DB leak does not hand an attacker every live share URL. The
--     raw token is returned exactly once, at creation. Lookup hashes the
--     incoming token and matches token_hash.
--     At most one *active* (revoked_at IS NULL) share per (material, owner):
--     re-sharing revokes the previous link and mints a fresh one.
--
--       id             BIGINT UNSIGNED PK
--       material_type  ENUM('subject','quiz')    -- controlled allowlist, never dynamic SQL
--       material_id    BIGINT UNSIGNED           -- holds subject.id (INT) or quiz.id (BIGINT)
--       created_by     BIGINT UNSIGNED  FK users(id) ON DELETE CASCADE
--       token_hash     CHAR(64)  UNIQUE          -- sha256 hex of the raw token
--       token_hint     VARCHAR(16) NULL          -- first chars of the raw token, for the owner's list
--       created_at     TIMESTAMP
--       revoked_at     TIMESTAMP NULL
--
-- Preserves: every existing subject / quiz (-> visibility 'private'), all FKs,
--   the xp_events ledger. Nothing is exposed by the migration itself.
--
-- Study guides: `study_guides` is still not wired into any generation flow, so
--   study-guide sharing is deliberately out of scope here (see the report).
--
-- Compatibility: MariaDB 10.4+ and MySQL 8.4. Applied ONCE (no
--   ADD COLUMN IF NOT EXISTS — MySQL 8.4 lacks it). Self-referencing FKs with
--   ON DELETE SET NULL are supported on both.
--
-- Preflight (record; must match afterwards):
--   SELECT (SELECT COUNT(*) FROM subjects) subjects, (SELECT COUNT(*) FROM quizzes) quizzes;
--
-- Apply (local dev only — never against Aiven in this batch):
--   "C:/xampp/mysql/bin/mysql.exe" -h 127.0.0.1 -u root aila_db < database/migrations/005_material_sharing.sql
--
-- Verify:
--   SELECT visibility, COUNT(*) FROM subjects GROUP BY visibility;   -- all 'private'
--   SELECT visibility, COUNT(*) FROM quizzes  GROUP BY visibility;   -- all 'private'
--   SELECT COUNT(*) FROM material_shares;                            -- 0
--   SHOW CREATE TABLE material_shares;
--   -- same subjects / quizzes counts as preflight
--
-- Rollback:
--   DROP TABLE IF EXISTS material_shares;
--   ALTER TABLE quizzes  DROP FOREIGN KEY fk_quizzes_copied_from,
--                        DROP COLUMN copied_from_quiz_id, DROP COLUMN visibility;
--   ALTER TABLE subjects DROP FOREIGN KEY fk_subjects_copied_from,
--                        DROP COLUMN copied_from_subject_id, DROP COLUMN visibility;

ALTER TABLE subjects
  ADD COLUMN visibility ENUM('private','unlisted') NOT NULL DEFAULT 'private',
  ADD COLUMN copied_from_subject_id INT UNSIGNED NULL,
  ADD KEY idx_subjects_copied_from (copied_from_subject_id),
  ADD CONSTRAINT fk_subjects_copied_from FOREIGN KEY (copied_from_subject_id) REFERENCES subjects(id)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE quizzes
  ADD COLUMN visibility ENUM('private','unlisted') NOT NULL DEFAULT 'private',
  ADD COLUMN copied_from_quiz_id BIGINT UNSIGNED NULL,
  ADD KEY idx_quizzes_copied_from (copied_from_quiz_id),
  ADD CONSTRAINT fk_quizzes_copied_from FOREIGN KEY (copied_from_quiz_id) REFERENCES quizzes(id)
    ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE material_shares (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  material_type ENUM('subject','quiz') NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  token_hint VARCHAR(16) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_material_shares_token_hash (token_hash),
  KEY idx_material_shares_material (material_type, material_id, revoked_at),
  KEY idx_material_shares_creator (created_by),
  CONSTRAINT fk_material_shares_creator FOREIGN KEY (created_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
