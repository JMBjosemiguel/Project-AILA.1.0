USE aila_db;

SET NAMES utf8mb4;

INSERT INTO roles (id, name, description) VALUES
  (1, 'student', 'Learner account with access to study tools and resources.'),
  (2, 'admin', 'Administrator account for managing content, chatbot data, and system records.'),
  (3, 'instructor', 'Future instructor role reserved by the architecture.')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description);

INSERT INTO users (
  id, role_id, student_number, email, password_hash, first_name, last_name, is_active
) VALUES
  (1, 2, NULL, 'admin@aila.local', '$2b$10$Y9leQVKNrQFeWEO74xLqvuNP3UZV1Vl0qOvVCYmc17dRvsR2b2Ony', 'AILA', 'Administrator', 1),
  (2, 1, '2026-0001', 'student@aila.local', '$2b$10$EtNQ6N/u8g0sEeh7lg0vuezqmd.8TCI.edhAsTbTfxFjtieHJH1rW', 'Sample', 'Student', 1)
ON DUPLICATE KEY UPDATE
  role_id = VALUES(role_id),
  student_number = VALUES(student_number),
  password_hash = VALUES(password_hash),
  first_name = VALUES(first_name),
  last_name = VALUES(last_name),
  is_active = VALUES(is_active);

INSERT INTO user_profiles (user_id, program, year_level, avatar_url, bio, xp_points, level) VALUES
  (1, 'System Administration', NULL, NULL, 'Manages AILA content and learning records.', 0, 1),
  (2, 'BS Information Technology', 2, NULL, 'Development seed learner for AILA testing.', 320, 3)
ON DUPLICATE KEY UPDATE
  program = VALUES(program),
  year_level = VALUES(year_level),
  avatar_url = VALUES(avatar_url),
  bio = VALUES(bio),
  xp_points = VALUES(xp_points),
  level = VALUES(level);

INSERT INTO learning_streaks (user_id, current_streak, longest_streak, last_active_date) VALUES
  (2, 5, 12, CURDATE())
ON DUPLICATE KEY UPDATE
  current_streak = VALUES(current_streak),
  longest_streak = VALUES(longest_streak),
  last_active_date = VALUES(last_active_date);

INSERT INTO conversation_categories (id, name) VALUES
  (1, 'Academic'),
  (2, 'Study Tips'),
  (3, 'Technical Support')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO chatbot_intents (id, category_id, intent_name, description, is_active) VALUES
  (1, 1, 'greeting', 'Responds to basic greetings.', 1),
  (2, 2, 'study_schedule_help', 'Helps students plan study sessions.', 1),
  (3, 1, 'resource_recommendation', 'Suggests relevant learning resources.', 1)
ON DUPLICATE KEY UPDATE
  category_id = VALUES(category_id),
  description = VALUES(description),
  is_active = VALUES(is_active);

INSERT INTO chatbot_keywords (intent_id, keyword, weight) VALUES
  (1, 'hello', 1.00),
  (1, 'hi', 1.00),
  (2, 'study schedule', 0.95),
  (2, 'planner', 0.85),
  (3, 'resources', 0.90),
  (3, 'lesson materials', 0.85);

INSERT INTO chatbot_responses (intent_id, response_text, is_active) VALUES
  (1, 'Hello! I can help you review lessons, find resources, or organize your study tasks.', 1),
  (2, 'Start with the nearest deadline, then block a focused study session for one topic at a time.', 1),
  (3, 'Open the resource library and filter by subject or topic to find the most relevant materials.', 1);

INSERT INTO suggested_questions (id, category_id, question_text, is_active, display_order) VALUES
  (1, 1, 'What should I study today?', 1, 1),
  (2, 2, 'Help me create a study plan.', 1, 2),
  (3, 1, 'Show me resources for database normalization.', 1, 3)
ON DUPLICATE KEY UPDATE
  category_id = VALUES(category_id),
  question_text = VALUES(question_text),
  is_active = VALUES(is_active),
  display_order = VALUES(display_order);

INSERT INTO subjects (id, name, code, description) VALUES
  (1, 'Database Systems', 'IT112', 'Relational database design, SQL, normalization, and transaction concepts.'),
  (2, 'Web Application Development', 'IT121', 'Client-server application design and implementation.')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description);

INSERT INTO modules (id, subject_id, title, order_index) VALUES
  (1, 1, 'Relational Database Design', 1),
  (2, 1, 'SQL Fundamentals', 2),
  (3, 2, 'Frontend and API Integration', 1)
ON DUPLICATE KEY UPDATE
  subject_id = VALUES(subject_id),
  title = VALUES(title),
  order_index = VALUES(order_index);

INSERT INTO topics (id, module_id, title, order_index) VALUES
  (1, 1, 'Normalization and 3NF', 1),
  (2, 1, 'Entity Relationships', 2),
  (3, 2, 'SELECT Queries', 1),
  (4, 3, 'React Data Loading', 1)
ON DUPLICATE KEY UPDATE
  module_id = VALUES(module_id),
  title = VALUES(title),
  order_index = VALUES(order_index);

INSERT INTO lessons (topic_id, title, content) VALUES
  (1, 'Understanding 3NF', 'Third normal form reduces redundancy by ensuring non-key fields depend only on the key.'),
  (2, 'Reading ERD Cardinality', 'One-to-many and many-to-many relationships define how records connect across tables.'),
  (3, 'Filtering Rows with WHERE', 'The WHERE clause narrows query results based on conditions.'),
  (4, 'Async Data Hooks', 'React hooks can centralize loading, error, and data state for API-backed screens.');

INSERT INTO definitions (topic_id, term, definition_text) VALUES
  (1, 'Third Normal Form', 'A table design where every non-key attribute depends on the key, the whole key, and nothing but the key.'),
  (2, 'Foreign Key', 'A column that references the primary key of another table to enforce relationship integrity.'),
  (3, 'Projection', 'The operation of choosing which columns appear in a query result.');

INSERT INTO examples (topic_id, title, content) VALUES
  (1, 'Separating Roles from Users', 'Store role names once in roles, then reference them through users.role_id.'),
  (2, 'Resource Tagging', 'A resource can connect to many subjects through resource_subjects.'),
  (3, 'Basic Query', 'SELECT title, status FROM study_tasks WHERE user_id = 2;');

INSERT INTO study_guides (id, title, description, created_by) VALUES
  (1, 'Database Design Review Guide', 'Quick review guide for normalization, relationships, and SQL basics.', 1)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  description = VALUES(description),
  created_by = VALUES(created_by);

INSERT IGNORE INTO study_guide_topics (study_guide_id, topic_id) VALUES
  (1, 1),
  (1, 2),
  (1, 3);

INSERT INTO faqs (subject_id, topic_id, question, answer) VALUES
  (1, 1, 'Why is normalization important?', 'Normalization keeps related data organized and reduces update anomalies.'),
  (1, 2, 'What does a junction table do?', 'A junction table resolves many-to-many relationships using two foreign keys.');

INSERT INTO resource_categories (id, name) VALUES
  (1, 'Lecture Slides'),
  (2, 'Reference'),
  (3, 'Video')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO resources (id, category_id, uploaded_by, title, type, file_path, external_url, description) VALUES
  (1, 1, 1, 'Normalization Slides', 'pdf', '/resources/normalization-slides.pdf', NULL, 'Introductory slides for 1NF, 2NF, and 3NF.'),
  (2, 2, 1, 'SQL Practice Reference', 'link', NULL, 'https://example.com/sql-practice', 'External SQL practice exercises for development testing.')
ON DUPLICATE KEY UPDATE
  category_id = VALUES(category_id),
  uploaded_by = VALUES(uploaded_by),
  title = VALUES(title),
  type = VALUES(type),
  file_path = VALUES(file_path),
  external_url = VALUES(external_url),
  description = VALUES(description);

INSERT IGNORE INTO resource_subjects (resource_id, subject_id) VALUES
  (1, 1),
  (2, 1);

INSERT IGNORE INTO resource_topics (resource_id, topic_id) VALUES
  (1, 1),
  (2, 3);

INSERT INTO task_priorities (id, label) VALUES
  (1, 'Low'),
  (2, 'Medium'),
  (3, 'High')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO study_tasks (id, user_id, priority_id, title, description, deadline, status, completed_at) VALUES
  (1, 2, 3, 'Review 3NF notes', 'Prepare examples for the database normalization discussion.', DATE_ADD(NOW(), INTERVAL 2 DAY), 'in_progress', NULL),
  (2, 2, 2, 'Read SQL reference', 'Practice filtering and sorting queries.', DATE_ADD(NOW(), INTERVAL 5 DAY), 'pending', NULL),
  (3, 2, 1, 'Open resource library', 'Review the uploaded normalization slides.', DATE_SUB(NOW(), INTERVAL 1 DAY), 'completed', NOW())
ON DUPLICATE KEY UPDATE
  user_id = VALUES(user_id),
  priority_id = VALUES(priority_id),
  title = VALUES(title),
  description = VALUES(description),
  deadline = VALUES(deadline),
  status = VALUES(status),
  completed_at = VALUES(completed_at);

INSERT INTO task_status_log (task_id, old_status, new_status) VALUES
  (1, NULL, 'pending'),
  (1, 'pending', 'in_progress'),
  (3, 'pending', 'completed');

INSERT INTO study_sessions (user_id, subject_id, started_at, ended_at, duration_minutes, session_type) VALUES
  (2, 1, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_ADD(DATE_SUB(NOW(), INTERVAL 2 DAY), INTERVAL 45 MINUTE), 45, 'free_study'),
  (2, 1, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(DATE_SUB(NOW(), INTERVAL 1 DAY), INTERVAL 25 MINUTE), 25, 'pomodoro');

INSERT INTO learning_progress (user_id, topic_id, progress_percent, status) VALUES
  (2, 1, 65, 'in_progress'),
  (2, 2, 40, 'in_progress'),
  (2, 3, 100, 'completed')
ON DUPLICATE KEY UPDATE
  progress_percent = VALUES(progress_percent),
  status = VALUES(status);

INSERT INTO chat_conversations (id, user_id, started_at) VALUES
  (1, 2, DATE_SUB(NOW(), INTERVAL 3 HOUR))
ON DUPLICATE KEY UPDATE user_id = VALUES(user_id);

INSERT INTO chat_messages (conversation_id, sender, message_text, matched_intent_id, confidence_score) VALUES
  (1, 'user', 'Hello AILA', 1, 0.980),
  (1, 'bot', 'Hello! I can help you review lessons, find resources, or organize your study tasks.', 1, 0.980),
  (1, 'user', 'Help me create a study schedule', 2, 0.940),
  (1, 'bot', 'Start with the nearest deadline, then block a focused study session for one topic at a time.', 2, 0.940);

INSERT INTO resource_views_log (user_id, resource_id) VALUES
  (2, 1),
  (2, 2);

INSERT INTO dashboard_activity_log (user_id, activity_type, reference_id, description) VALUES
  (2, 'task_completed', 3, 'Completed task: Open resource library'),
  (2, 'resource_viewed', 1, 'Viewed Normalization Slides'),
  (2, 'chat_used', 1, 'Asked AILA for study planning help');

INSERT INTO notifications (id, created_by, type, title, body) VALUES
  (1, 1, 'announcement', 'Welcome to AILA', 'Your learning assistant workspace is ready.'),
  (2, 1, 'reminder', 'Study task due soon', 'Review your Database Systems planner for upcoming work.')
ON DUPLICATE KEY UPDATE
  created_by = VALUES(created_by),
  type = VALUES(type),
  title = VALUES(title),
  body = VALUES(body);

INSERT INTO notification_recipients (notification_id, user_id, is_read, read_at) VALUES
  (1, 2, 1, NOW()),
  (2, 2, 0, NULL)
ON DUPLICATE KEY UPDATE
  is_read = VALUES(is_read),
  read_at = VALUES(read_at);

INSERT INTO feedback (user_id, context_type, context_id, rating, comment) VALUES
  (2, 'resource', 1, 5, 'The normalization slides were clear and useful.'),
  (2, 'chatbot', 1, 4, 'The study schedule suggestion helped me prioritize tasks.');

INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, details) VALUES
  (1, 'seeded_database', 'database', NULL, JSON_OBJECT('source', 'database/seed.sql', 'purpose', 'development testing'));
