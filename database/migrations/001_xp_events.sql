-- Migration 001 — idempotent XP ledger
--
-- Purpose:  give every XP award a durable, de-duplicated record so a student
--           cannot farm points by retaking/regenerating the same activity.
--           `user_profiles.xp_points` / `level` become a cached projection of
--           SUM(xp_events.points) per user.
--
-- Properties: additive only. No column renamed or dropped. Safe on existing
--             rows. Idempotent (CREATE TABLE IF NOT EXISTS + INSERT IGNORE).
--             Compatible with MariaDB 10.4+ and MySQL 8.4.
--
-- Apply (local dev only — never against Aiven in this batch):
--   "C:/xampp/mysql/bin/mysql.exe" -h 127.0.0.1 -u root aila_db < database/migrations/001_xp_events.sql
--
-- Rollback:
--   DROP TABLE IF EXISTS xp_events;
--   (and revert the application commit — xp_points/level rows are left intact by
--    the DROP, so no balance is lost, only post-migration awards.)

CREATE TABLE IF NOT EXISTS xp_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  event_key VARCHAR(120) NOT NULL,
  points INT NOT NULL,
  reason VARCHAR(200) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_xp_events_user_event (user_id, event_key),
  KEY idx_xp_events_user_created (user_id, created_at),
  CONSTRAINT fk_xp_events_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preserve every existing user's current XP as a single ledger entry so the
-- cached xp_points remains correct once the app switches to SUM(xp_events).
INSERT IGNORE INTO xp_events (user_id, event_key, points, reason)
SELECT up.user_id, 'legacy_balance', up.xp_points, 'Imported pre-ledger XP balance'
FROM user_profiles up
WHERE up.xp_points > 0;
