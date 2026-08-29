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
