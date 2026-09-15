-- Migration 008 — email verification for registration
--
-- Purpose:  new accounts start unverified and cannot log in until they click a
--           one-time link emailed to them. Prevents typo'd / fake / someone-
--           else's email addresses from being usable AILA accounts.
--
-- Changes (all additive — nothing renamed, nothing dropped):
--
--   users
--     + email_verified_at TIMESTAMP NULL DEFAULT NULL
--         NULL = unverified (blocks login). Set once, when the student clicks
--         a valid verification link.
--
--   email_verification_tokens  (NEW)
--     One row per issued token. Shaped like the existing (unused)
--     password_resets table. The raw token is NEVER stored — only its SHA-256
--     hash, so a database leak does not hand out live verification links.
--       id          BIGINT UNSIGNED PK
--       user_id     BIGINT UNSIGNED, FK -> users(id) ON DELETE CASCADE
--       token_hash  CHAR(64) NOT NULL    -- sha256 hex digest, UNIQUE
--       expires_at  DATETIME NOT NULL    -- ~30 minutes after issue; app-supplied
--                                        -- only, never touched again by MySQL
--       used_at     DATETIME NULL        -- set once consumed; NULL = still usable
--       created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP  -- insert-time only
--     Issuing a new token for a user marks that user's other still-active
--     tokens as used (application-layer, in emailVerificationModel) so only the
--     newest link ever works — this is a supersede, not a second valid link.
--
--     expires_at / used_at are DATETIME, not TIMESTAMP: a bare
--     `TIMESTAMP NOT NULL` column with no explicit DEFAULT/ON UPDATE is, on
--     this server, silently upgraded by legacy MySQL/MariaDB timestamp
--     auto-initialization to `DEFAULT CURRENT_TIMESTAMP ON UPDATE
--     CURRENT_TIMESTAMP` — so any later UPDATE to the row (e.g. marking
--     used_at) would have silently overwritten expires_at with "now". DATETIME
--     has no such auto-init/auto-update behavior at the MySQL level, so these
--     columns only ever change when application code sets them explicitly.
--     created_at keeps TIMESTAMP + an *explicit* DEFAULT CURRENT_TIMESTAMP
--     (no ON UPDATE clause given) — explicit defaults are exempted from the
--     auto-init quirk, and this matches every other created_at column in the
--     schema.
--
-- Existing-user policy (do not break current accounts):
--   Every row that already exists at migration time is backfilled as already
--   verified, using its own created_at as the verified-at timestamp (a
--   plausible historical value, not a fabricated "verified today"). Every
--   account created AFTER this migration starts out unverified (NULL) and must
--   go through the new flow. This is purely additive and reversible.
--
-- Preserves: every user, every session, every existing login. No account is
--   locked out by this migration.
--
-- Compatibility: MariaDB 10.4+ and MySQL 8.4. Apply ONCE (no ADD COLUMN IF NOT
--   EXISTS). Preflight: `users.email_verified_at` must NOT already exist.
--
-- Preflight (record; must match afterwards):
--   SELECT COUNT(*) FROM information_schema.columns
--     WHERE table_schema = DATABASE() AND table_name = 'users'
--       AND column_name = 'email_verified_at';   -- expect 0 before, 1 after
--   SELECT COUNT(*) FROM users WHERE deleted_at IS NULL;  -- unchanged by this migration
--
-- Apply (local dev only — never against Aiven in this batch):
--   "C:/xampp/mysql/bin/mysql.exe" -h 127.0.0.1 -u root aila_db < database/migrations/008_email_verification.sql
--
-- Verify:
--   SHOW COLUMNS FROM users LIKE 'email_verified_at';                 -- 1 row, NULL default
--   SHOW CREATE TABLE email_verification_tokens;                     -- table exists;
--                                                                     -- expires_at / used_at show as
--                                                                     -- `datetime`, NEITHER has an
--                                                                     -- "ON UPDATE CURRENT_TIMESTAMP" clause
--   SELECT COUNT(*) FROM users WHERE email_verified_at IS NULL;      -- expect 0 right after migration
--                                                                     -- (every pre-existing row was backfilled)
--
-- Rollback:
--   DROP TABLE IF EXISTS email_verification_tokens;
--   ALTER TABLE users DROP COLUMN email_verified_at;

ALTER TABLE users
  ADD COLUMN email_verified_at TIMESTAMP NULL DEFAULT NULL AFTER is_active;

-- Existing-user policy: every account that exists right now is treated as
-- already verified (see header). Anything inserted after this line starts
-- NULL (unverified) because the column default is NULL.
UPDATE users
   SET email_verified_at = created_at
 WHERE email_verified_at IS NULL;

CREATE TABLE email_verification_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_verification_tokens_token_hash (token_hash),
  KEY idx_email_verification_tokens_user (user_id, used_at),
  KEY idx_email_verification_tokens_expires_at (expires_at),
  CONSTRAINT fk_email_verification_tokens_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
