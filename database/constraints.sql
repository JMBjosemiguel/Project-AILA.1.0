USE aila_db;

DELIMITER $$

DROP PROCEDURE IF EXISTS add_fk_if_missing $$
CREATE PROCEDURE add_fk_if_missing(
  IN p_table_name VARCHAR(64),
  IN p_constraint_name VARCHAR(64),
  IN p_alter_sql TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND CONSTRAINT_NAME = p_constraint_name
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    SET @sql_text = p_alter_sql;
    PREPARE stmt FROM @sql_text;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DELIMITER ;

CALL add_fk_if_missing('users', 'fk_users_role', 'ALTER TABLE users ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON UPDATE CASCADE ON DELETE RESTRICT');
CALL add_fk_if_missing('user_profiles', 'fk_user_profiles_user', 'ALTER TABLE user_profiles ADD CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('password_resets', 'fk_password_resets_user', 'ALTER TABLE password_resets ADD CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('user_sessions', 'fk_user_sessions_user', 'ALTER TABLE user_sessions ADD CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('learning_streaks', 'fk_learning_streaks_user', 'ALTER TABLE learning_streaks ADD CONSTRAINT fk_learning_streaks_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('dashboard_activity_log', 'fk_dashboard_activity_log_user', 'ALTER TABLE dashboard_activity_log ADD CONSTRAINT fk_dashboard_activity_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('chatbot_intents', 'fk_chatbot_intents_category', 'ALTER TABLE chatbot_intents ADD CONSTRAINT fk_chatbot_intents_category FOREIGN KEY (category_id) REFERENCES conversation_categories(id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL add_fk_if_missing('chatbot_keywords', 'fk_chatbot_keywords_intent', 'ALTER TABLE chatbot_keywords ADD CONSTRAINT fk_chatbot_keywords_intent FOREIGN KEY (intent_id) REFERENCES chatbot_intents(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('chatbot_responses', 'fk_chatbot_responses_intent', 'ALTER TABLE chatbot_responses ADD CONSTRAINT fk_chatbot_responses_intent FOREIGN KEY (intent_id) REFERENCES chatbot_intents(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('chat_conversations', 'fk_chat_conversations_user', 'ALTER TABLE chat_conversations ADD CONSTRAINT fk_chat_conversations_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('chat_messages', 'fk_chat_messages_conversation', 'ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_messages_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('chat_messages', 'fk_chat_messages_matched_intent', 'ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_messages_matched_intent FOREIGN KEY (matched_intent_id) REFERENCES chatbot_intents(id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL add_fk_if_missing('unknown_questions_log', 'fk_unknown_questions_log_message', 'ALTER TABLE unknown_questions_log ADD CONSTRAINT fk_unknown_questions_log_message FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('suggested_questions', 'fk_suggested_questions_category', 'ALTER TABLE suggested_questions ADD CONSTRAINT fk_suggested_questions_category FOREIGN KEY (category_id) REFERENCES conversation_categories(id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL add_fk_if_missing('modules', 'fk_modules_subject', 'ALTER TABLE modules ADD CONSTRAINT fk_modules_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON UPDATE CASCADE ON DELETE RESTRICT');
CALL add_fk_if_missing('topics', 'fk_topics_module', 'ALTER TABLE topics ADD CONSTRAINT fk_topics_module FOREIGN KEY (module_id) REFERENCES modules(id) ON UPDATE CASCADE ON DELETE RESTRICT');
CALL add_fk_if_missing('lessons', 'fk_lessons_topic', 'ALTER TABLE lessons ADD CONSTRAINT fk_lessons_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON UPDATE CASCADE ON DELETE RESTRICT');
CALL add_fk_if_missing('definitions', 'fk_definitions_topic', 'ALTER TABLE definitions ADD CONSTRAINT fk_definitions_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('examples', 'fk_examples_topic', 'ALTER TABLE examples ADD CONSTRAINT fk_examples_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('study_guides', 'fk_study_guides_created_by', 'ALTER TABLE study_guides ADD CONSTRAINT fk_study_guides_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL add_fk_if_missing('study_guide_topics', 'fk_study_guide_topics_study_guide', 'ALTER TABLE study_guide_topics ADD CONSTRAINT fk_study_guide_topics_study_guide FOREIGN KEY (study_guide_id) REFERENCES study_guides(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('study_guide_topics', 'fk_study_guide_topics_topic', 'ALTER TABLE study_guide_topics ADD CONSTRAINT fk_study_guide_topics_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('faqs', 'fk_faqs_subject', 'ALTER TABLE faqs ADD CONSTRAINT fk_faqs_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL add_fk_if_missing('faqs', 'fk_faqs_topic', 'ALTER TABLE faqs ADD CONSTRAINT fk_faqs_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL add_fk_if_missing('resources', 'fk_resources_category', 'ALTER TABLE resources ADD CONSTRAINT fk_resources_category FOREIGN KEY (category_id) REFERENCES resource_categories(id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL add_fk_if_missing('resources', 'fk_resources_uploaded_by', 'ALTER TABLE resources ADD CONSTRAINT fk_resources_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL add_fk_if_missing('resource_subjects', 'fk_resource_subjects_resource', 'ALTER TABLE resource_subjects ADD CONSTRAINT fk_resource_subjects_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('resource_subjects', 'fk_resource_subjects_subject', 'ALTER TABLE resource_subjects ADD CONSTRAINT fk_resource_subjects_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('resource_topics', 'fk_resource_topics_resource', 'ALTER TABLE resource_topics ADD CONSTRAINT fk_resource_topics_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('resource_topics', 'fk_resource_topics_topic', 'ALTER TABLE resource_topics ADD CONSTRAINT fk_resource_topics_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('resource_views_log', 'fk_resource_views_log_user', 'ALTER TABLE resource_views_log ADD CONSTRAINT fk_resource_views_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('resource_views_log', 'fk_resource_views_log_resource', 'ALTER TABLE resource_views_log ADD CONSTRAINT fk_resource_views_log_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('study_tasks', 'fk_study_tasks_user', 'ALTER TABLE study_tasks ADD CONSTRAINT fk_study_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('study_tasks', 'fk_study_tasks_priority', 'ALTER TABLE study_tasks ADD CONSTRAINT fk_study_tasks_priority FOREIGN KEY (priority_id) REFERENCES task_priorities(id) ON UPDATE CASCADE ON DELETE RESTRICT');
CALL add_fk_if_missing('task_status_log', 'fk_task_status_log_task', 'ALTER TABLE task_status_log ADD CONSTRAINT fk_task_status_log_task FOREIGN KEY (task_id) REFERENCES study_tasks(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('study_sessions', 'fk_study_sessions_user', 'ALTER TABLE study_sessions ADD CONSTRAINT fk_study_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('study_sessions', 'fk_study_sessions_subject', 'ALTER TABLE study_sessions ADD CONSTRAINT fk_study_sessions_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL add_fk_if_missing('learning_progress', 'fk_learning_progress_user', 'ALTER TABLE learning_progress ADD CONSTRAINT fk_learning_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('learning_progress', 'fk_learning_progress_topic', 'ALTER TABLE learning_progress ADD CONSTRAINT fk_learning_progress_topic FOREIGN KEY (topic_id) REFERENCES topics(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('notifications', 'fk_notifications_created_by', 'ALTER TABLE notifications ADD CONSTRAINT fk_notifications_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL');
CALL add_fk_if_missing('notification_recipients', 'fk_notification_recipients_notification', 'ALTER TABLE notification_recipients ADD CONSTRAINT fk_notification_recipients_notification FOREIGN KEY (notification_id) REFERENCES notifications(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('notification_recipients', 'fk_notification_recipients_user', 'ALTER TABLE notification_recipients ADD CONSTRAINT fk_notification_recipients_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('feedback', 'fk_feedback_user', 'ALTER TABLE feedback ADD CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE');
CALL add_fk_if_missing('admin_audit_log', 'fk_admin_audit_log_admin', 'ALTER TABLE admin_audit_log ADD CONSTRAINT fk_admin_audit_log_admin FOREIGN KEY (admin_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT');

DROP PROCEDURE IF EXISTS add_fk_if_missing;
