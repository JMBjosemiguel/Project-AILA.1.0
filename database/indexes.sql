USE aila_db;

DELIMITER $$

DROP PROCEDURE IF EXISTS add_index_if_missing $$
CREATE PROCEDURE add_index_if_missing(
  IN p_table_name VARCHAR(64),
  IN p_index_name VARCHAR(64),
  IN p_create_sql TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND INDEX_NAME = p_index_name
  ) THEN
    SET @sql_text = p_create_sql;
    PREPARE stmt FROM @sql_text;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DELIMITER ;

CALL add_index_if_missing('users', 'idx_users_role_id', 'CREATE INDEX idx_users_role_id ON users (role_id)');
CALL add_index_if_missing('users', 'idx_users_deleted_at', 'CREATE INDEX idx_users_deleted_at ON users (deleted_at)');
CALL add_index_if_missing('password_resets', 'idx_password_resets_user_id', 'CREATE INDEX idx_password_resets_user_id ON password_resets (user_id)');
CALL add_index_if_missing('password_resets', 'idx_password_resets_token_hash', 'CREATE INDEX idx_password_resets_token_hash ON password_resets (token_hash)');
CALL add_index_if_missing('password_resets', 'idx_password_resets_expires_at', 'CREATE INDEX idx_password_resets_expires_at ON password_resets (expires_at)');
CALL add_index_if_missing('user_sessions', 'idx_user_sessions_user_id', 'CREATE INDEX idx_user_sessions_user_id ON user_sessions (user_id)');
CALL add_index_if_missing('user_sessions', 'idx_user_sessions_last_active_at', 'CREATE INDEX idx_user_sessions_last_active_at ON user_sessions (last_active_at)');
CALL add_index_if_missing('dashboard_activity_log', 'idx_dashboard_activity_log_user_created', 'CREATE INDEX idx_dashboard_activity_log_user_created ON dashboard_activity_log (user_id, created_at)');
CALL add_index_if_missing('chatbot_intents', 'idx_chatbot_intents_category_id', 'CREATE INDEX idx_chatbot_intents_category_id ON chatbot_intents (category_id)');
CALL add_index_if_missing('chatbot_keywords', 'idx_chatbot_keywords_keyword', 'CREATE INDEX idx_chatbot_keywords_keyword ON chatbot_keywords (keyword)');
CALL add_index_if_missing('chatbot_responses', 'idx_chatbot_responses_intent_id', 'CREATE INDEX idx_chatbot_responses_intent_id ON chatbot_responses (intent_id)');
CALL add_index_if_missing('chat_conversations', 'idx_chat_conversations_user_started', 'CREATE INDEX idx_chat_conversations_user_started ON chat_conversations (user_id, started_at)');
CALL add_index_if_missing('chat_messages', 'idx_chat_messages_conversation_created', 'CREATE INDEX idx_chat_messages_conversation_created ON chat_messages (conversation_id, created_at)');
CALL add_index_if_missing('unknown_questions_log', 'idx_unknown_questions_log_reviewed', 'CREATE INDEX idx_unknown_questions_log_reviewed ON unknown_questions_log (reviewed)');
CALL add_index_if_missing('suggested_questions', 'idx_suggested_questions_active_order', 'CREATE INDEX idx_suggested_questions_active_order ON suggested_questions (is_active, display_order)');
CALL add_index_if_missing('modules', 'idx_modules_subject_order', 'CREATE INDEX idx_modules_subject_order ON modules (subject_id, order_index)');
CALL add_index_if_missing('topics', 'idx_topics_module_order', 'CREATE INDEX idx_topics_module_order ON topics (module_id, order_index)');
CALL add_index_if_missing('definitions', 'idx_definitions_term', 'CREATE INDEX idx_definitions_term ON definitions (term)');
CALL add_index_if_missing('resources', 'idx_resources_type', 'CREATE INDEX idx_resources_type ON resources (type)');
CALL add_index_if_missing('resource_views_log', 'idx_resource_views_log_user_viewed', 'CREATE INDEX idx_resource_views_log_user_viewed ON resource_views_log (user_id, viewed_at)');
CALL add_index_if_missing('study_tasks', 'idx_study_tasks_user_status', 'CREATE INDEX idx_study_tasks_user_status ON study_tasks (user_id, status)');
CALL add_index_if_missing('study_tasks', 'idx_study_tasks_deadline', 'CREATE INDEX idx_study_tasks_deadline ON study_tasks (deadline)');
CALL add_index_if_missing('study_sessions', 'idx_study_sessions_user_started', 'CREATE INDEX idx_study_sessions_user_started ON study_sessions (user_id, started_at)');
CALL add_index_if_missing('learning_progress', 'idx_learning_progress_user_status', 'CREATE INDEX idx_learning_progress_user_status ON learning_progress (user_id, status)');
CALL add_index_if_missing('notifications', 'idx_notifications_type', 'CREATE INDEX idx_notifications_type ON notifications (type)');
CALL add_index_if_missing('notification_recipients', 'idx_notification_recipients_user_read', 'CREATE INDEX idx_notification_recipients_user_read ON notification_recipients (user_id, is_read)');
CALL add_index_if_missing('feedback', 'idx_feedback_context', 'CREATE INDEX idx_feedback_context ON feedback (context_type, context_id)');
CALL add_index_if_missing('admin_audit_log', 'idx_admin_audit_log_target', 'CREATE INDEX idx_admin_audit_log_target ON admin_audit_log (target_table, target_id)');

DROP PROCEDURE IF EXISTS add_index_if_missing;
