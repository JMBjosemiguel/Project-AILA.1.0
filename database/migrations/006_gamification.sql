-- Migration 006 — gamification (achievements + leaderboard privacy)
--
-- Purpose:  turn the existing XP ledger (`xp_events`, migration 001), cached
--           `user_profiles.xp_points`/`level`, and `learning_streaks` into a
--           visible system: a small achievement catalog + per-user unlocks, and
--           an opt-in leaderboard. All deterministic — no AI, no client-supplied
--           points/levels/ranks. XP and level formulas are UNCHANGED
--           (`level = floor(xp / 100) + 1`).
--
-- Changes (all additive — nothing renamed, nothing dropped):
--
--   achievements  (NEW) — the catalog. One row = a condition + its reward + the
--   badge icon it renders as. "Badge" is just the visual for an achievement, so
--   there is one table, not two.
--     slug (UNIQUE, stable), name, description, category, icon_key,
--     xp_reward (one-time bonus, 0 for level achievements to avoid any cascade),
--     criteria_type + criteria_value (evaluated server-side), sort_order, is_active
--
--   user_achievements  (NEW) — one row per (user, achievement) unlock.
--     UNIQUE(user_id, achievement_id) is the final concurrency guard — two
--     concurrent qualifying requests grant exactly one row.
--     source = 'earned' (normal) | 'backfill' (historical reconciliation —
--     granted with NO bonus XP and NO notification).
--
--   user_profiles + leaderboard_opt_in TINYINT(1) NOT NULL DEFAULT 0
--     OPT-IN by default (privacy-friendly for a school setting). A student is
--     not on the leaderboard until they turn it on in their profile.
--
--   The 12-achievement catalog is seeded idempotently (INSERT ... ON DUPLICATE
--   KEY UPDATE) so re-running the migration only refreshes definitions.
--
-- Preserves: every user, all XP totals, all levels, all streaks, the ledger.
--   user_achievements starts EMPTY — run the reconciliation utility afterwards
--   to grant already-earned historical achievements (no bonus XP, no notifications).
--
-- Compatibility: MariaDB 10.4+ and MySQL 8.4. Applied ONCE (no
--   ADD COLUMN IF NOT EXISTS). Preflight: if `achievements` / `user_achievements`
--   / `badges` / `leaderboard` already exist, STOP and inspect.
--
-- Preflight (record; must match afterwards):
--   SELECT (SELECT COUNT(*) FROM users) users, (SELECT COUNT(*) FROM user_profiles) profiles,
--          (SELECT COUNT(*) FROM xp_events) xp_events, (SELECT COUNT(*) FROM learning_streaks) streaks;
--   SELECT COUNT(*) FROM user_profiles up
--     WHERE up.xp_points <> COALESCE((SELECT SUM(points) FROM xp_events e WHERE e.user_id=up.user_id),0);  -- expect 0
--
-- Apply (local dev only — never against Aiven in this batch):
--   "C:/xampp/mysql/bin/mysql.exe" -h 127.0.0.1 -u root aila_db < database/migrations/006_gamification.sql
--
-- Verify:
--   SELECT COUNT(*) FROM achievements;            -- 12
--   SELECT COUNT(*) FROM user_achievements;       -- 0 (until reconciliation)
--   SELECT leaderboard_opt_in, COUNT(*) FROM user_profiles GROUP BY leaderboard_opt_in;  -- all 0
--   -- same users / profiles / xp_events / streaks counts as preflight; XP mismatch still 0
--
-- Then reconcile historical unlocks (local, one-time, no notifications, no bonus XP):
--   node -e "require('./backend/src/services/achievementService').reconcileAllUsers().then(r=>console.log(r)).finally(()=>process.exit())"
--
-- Rollback:
--   ALTER TABLE user_profiles DROP COLUMN leaderboard_opt_in;
--   DROP TABLE IF EXISTS user_achievements;
--   DROP TABLE IF EXISTS achievements;
--   DELETE FROM xp_events WHERE event_key LIKE 'achievement:%';
--   -- then recompute the affected user_profiles.xp_points from SUM(xp_events).

CREATE TABLE achievements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(60) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  category ENUM('learning','course','streak','level') NOT NULL,
  icon_key VARCHAR(30) NOT NULL,
  xp_reward SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  criteria_type ENUM('lessons_completed','first_quiz','perfect_quiz','checkpoint_passed','course_completed','streak_days','level_reached') NOT NULL,
  criteria_value INT UNSIGNED NOT NULL DEFAULT 1,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_achievements_slug (slug),
  KEY idx_achievements_criteria (criteria_type, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_achievements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  achievement_id INT UNSIGNED NOT NULL,
  earned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source ENUM('earned','backfill') NOT NULL DEFAULT 'earned',
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_achievements (user_id, achievement_id),
  KEY idx_user_achievements_user_earned (user_id, earned_at),
  CONSTRAINT fk_user_achievements_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_user_achievements_achievement FOREIGN KEY (achievement_id) REFERENCES achievements(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE user_profiles
  ADD COLUMN leaderboard_opt_in TINYINT(1) NOT NULL DEFAULT 0;

INSERT INTO achievements (slug, name, description, category, icon_key, xp_reward, criteria_type, criteria_value, sort_order) VALUES
  ('first_lesson',     'First Steps',          'Complete your first lesson',                       'learning', 'book_open',      5,  'lessons_completed', 1,  10),
  ('lessons_10',       'Dedicated Learner',    'Complete 10 lessons',                              'learning', 'book_open',      20, 'lessons_completed', 10, 20),
  ('first_quiz',       'Quiz Starter',         'Submit your first quiz',                           'learning', 'target',         5,  'first_quiz',        1,  30),
  ('perfect_quiz',     'Perfect Score',        'Score 100% on a quiz',                             'learning', 'star',           15, 'perfect_quiz',      1,  40),
  ('first_checkpoint', 'Checkpoint Cleared',   'Pass your first module checkpoint',                'course',   'medal',          15, 'checkpoint_passed', 1,  50),
  ('first_course',     'Course Completer',     'Pass your first course final assessment',          'course',   'trophy',         50, 'course_completed',  1,  60),
  ('streak_3',         'Getting Consistent',   'Reach a 3-day study streak',                       'streak',   'flame',          10, 'streak_days',       3,  70),
  ('streak_7',         'One Week Strong',      'Reach a 7-day study streak',                       'streak',   'flame',          15, 'streak_days',       7,  80),
  ('streak_14',        'Study Habit',          'Reach a 14-day study streak',                      'streak',   'flame',          25, 'streak_days',       14, 90),
  ('streak_30',        'Consistency Master',   'Reach a 30-day study streak',                      'streak',   'flame',          50, 'streak_days',       30, 100),
  ('level_5',          'Rising Scholar',       'Reach Level 5',                                    'level',    'graduation_cap', 0,  'level_reached',     5,  110),
  ('level_10',         'AILA Achiever',        'Reach Level 10',                                   'level',    'graduation_cap', 0,  'level_reached',     10, 120)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), description = VALUES(description), category = VALUES(category),
  icon_key = VALUES(icon_key), xp_reward = VALUES(xp_reward),
  criteria_type = VALUES(criteria_type), criteria_value = VALUES(criteria_value),
  sort_order = VALUES(sort_order), is_active = 1;
