-- AILA production baseline data (portable / managed-host safe).
-- Reference/lookup rows the application requires, plus curated public prompt chips.
-- Contains NO user accounts and NO passwords.
--
-- No USE statement: select the target database on the connection before running
-- this file (mysql -D <DB_NAME> ...  or pick the database in the Aiven console).
-- Run this AFTER production_schema.sql, on the same database.

SET NAMES utf8mb4;

INSERT INTO roles (id, name, description) VALUES
  (1, 'student', 'Learner account with access to study tools and resources.'),
  (2, 'admin', 'Administrator account for managing content, chatbot data, and system records.'),
  (3, 'instructor', 'Future instructor role reserved by the architecture.')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description);

INSERT INTO task_priorities (id, label) VALUES
  (1, 'Low'),
  (2, 'Medium'),
  (3, 'High')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- migration 006: gamification achievement catalog (reference data).
INSERT INTO achievements (slug, name, description, category, icon_key, xp_reward, criteria_type, criteria_value, sort_order) VALUES
  ('first_lesson',     'First Steps',        'Complete your first lesson',              'learning', 'book_open',      5,  'lessons_completed', 1,  10),
  ('lessons_10',       'Dedicated Learner',  'Complete 10 lessons',                     'learning', 'book_open',      20, 'lessons_completed', 10, 20),
  ('first_quiz',       'Quiz Starter',       'Submit your first quiz',                  'learning', 'target',         5,  'first_quiz',        1,  30),
  ('perfect_quiz',     'Perfect Score',      'Score 100% on a quiz',                    'learning', 'star',           15, 'perfect_quiz',      1,  40),
  ('first_checkpoint', 'Checkpoint Cleared', 'Pass your first module checkpoint',       'course',   'medal',          15, 'checkpoint_passed', 1,  50),
  ('first_course',     'Course Completer',   'Pass your first course final assessment', 'course',   'trophy',         50, 'course_completed',  1,  60),
  ('streak_3',         'Getting Consistent', 'Reach a 3-day study streak',              'streak',   'flame',          10, 'streak_days',       3,  70),
  ('streak_7',         'One Week Strong',    'Reach a 7-day study streak',              'streak',   'flame',          15, 'streak_days',       7,  80),
  ('streak_14',        'Study Habit',        'Reach a 14-day study streak',             'streak',   'flame',          25, 'streak_days',       14, 90),
  ('streak_30',        'Consistency Master', 'Reach a 30-day study streak',             'streak',   'flame',          50, 'streak_days',       30, 100),
  ('level_5',          'Rising Scholar',     'Reach Level 5',                           'level',    'graduation_cap', 0,  'level_reached',     5,  110),
  ('level_10',         'AILA Achiever',      'Reach Level 10',                          'level',    'graduation_cap', 0,  'level_reached',     10, 120)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), description = VALUES(description), category = VALUES(category),
  icon_key = VALUES(icon_key), xp_reward = VALUES(xp_reward),
  criteria_type = VALUES(criteria_type), criteria_value = VALUES(criteria_value),
  sort_order = VALUES(sort_order), is_active = 1;

INSERT INTO resource_categories (id, name) VALUES
  (1, 'Lecture Slides'),
  (2, 'Reference'),
  (3, 'Image')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO conversation_categories (id, name) VALUES
  (1, 'Academic'),
  (2, 'Study Tips'),
  (3, 'Technical Support')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO suggested_questions (id, category_id, question_text, is_active, display_order) VALUES
  (1, 1, 'What should I study today?', 1, 1),
  (2, 2, 'Help me create a study plan.', 1, 2),
  (3, 1, 'Show me resources for database normalization.', 1, 3)
ON DUPLICATE KEY UPDATE
  category_id = VALUES(category_id),
  question_text = VALUES(question_text),
  is_active = VALUES(is_active),
  display_order = VALUES(display_order);
