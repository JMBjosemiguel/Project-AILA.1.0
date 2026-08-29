# AILA Database Documentation

The schema contains all 38 tables enumerated in the finalized AILA architecture document. The document's summary says "Total tables: 34," but the actual inventory, ERD, and table definitions list 38 tables; no listed table was skipped. All tables use InnoDB, `utf8mb4`, and `utf8mb4_unicode_ci`.

## roles

Purpose: Defines system roles such as student, admin, and future instructor.

| Column | Type | Description |
| --- | --- | --- |
| id | INT UNSIGNED | Primary key. |
| name | VARCHAR(50) | Unique role name. |
| description | VARCHAR(255) | Optional role description. |
| created_at | TIMESTAMP | Creation timestamp. |
| updated_at | TIMESTAMP | Update timestamp. |

Relationships: `roles.id` is referenced by `users.role_id`.

## users

Purpose: Core identity and authentication table.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| role_id | INT UNSIGNED | Foreign key to `roles.id`. |
| student_number | VARCHAR(30) | Optional unique student identifier. |
| email | VARCHAR(150) | Unique login email. |
| password_hash | VARCHAR(255) | Bcrypt/argon2 password hash. |
| first_name | VARCHAR(100) | User first name. |
| last_name | VARCHAR(100) | User last name. |
| is_active | TINYINT(1) | Active/inactive account flag. |
| last_login_at | TIMESTAMP | Last successful login timestamp. |
| created_at | TIMESTAMP | Creation timestamp. |
| updated_at | TIMESTAMP | Update timestamp. |
| deleted_at | TIMESTAMP | Soft-delete timestamp. |

Relationships: belongs to `roles`; owns profiles, sessions, planner items, chats, analytics records, notifications, feedback, and audit entries.

## user_profiles

Purpose: Stores role-agnostic profile and gamification fields.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| user_id | BIGINT UNSIGNED | Unique foreign key to `users.id`. |
| program | VARCHAR(150) | Academic program. |
| year_level | TINYINT | Year level, when applicable. |
| avatar_url | VARCHAR(255) | Optional profile avatar URL. |
| bio | TEXT | Optional profile bio. |
| xp_points | INT UNSIGNED | Gamification XP. |
| level | INT UNSIGNED | Gamification level. |
| created_at | TIMESTAMP | Creation timestamp. |
| updated_at | TIMESTAMP | Update timestamp. |

Relationships: one-to-one with `users`.

## password_resets

Purpose: Tracks password reset tokens, expiry, and usage.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| user_id | BIGINT UNSIGNED | Foreign key to `users.id`. |
| token_hash | VARCHAR(255) | Hashed reset token. |
| expires_at | TIMESTAMP | Token expiry time. |
| used_at | TIMESTAMP | Time token was used. |
| created_at | TIMESTAMP | Creation timestamp. |

Relationships: many password-reset rows belong to one user.

## user_sessions

Purpose: Tracks active sessions/devices for security and logout-all support.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| user_id | BIGINT UNSIGNED | Foreign key to `users.id`. |
| device_info | VARCHAR(255) | Browser/device description. |
| ip_address | VARCHAR(45) | IPv4 or IPv6 address. |
| last_active_at | TIMESTAMP | Last session activity. |
| created_at | TIMESTAMP | Creation timestamp. |

Relationships: many sessions belong to one user.

## learning_streaks

Purpose: Stores each user's current and longest study streak.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| user_id | BIGINT UNSIGNED | Unique foreign key to `users.id`. |
| current_streak | INT UNSIGNED | Current consecutive active days. |
| longest_streak | INT UNSIGNED | Longest recorded streak. |
| last_active_date | DATE | Most recent activity date. |
| updated_at | TIMESTAMP | Update timestamp. |

Relationships: one-to-one with `users`.

## dashboard_activity_log

Purpose: Append-only feed for recent dashboard activity.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| user_id | BIGINT UNSIGNED | Foreign key to `users.id`. |
| activity_type | VARCHAR(50) | Activity category, such as `task_completed`. |
| reference_id | BIGINT UNSIGNED | Optional related row id. |
| description | VARCHAR(255) | Human-readable activity text. |
| created_at | TIMESTAMP | Activity timestamp. |

Relationships: many activity entries belong to one user.

## conversation_categories

Purpose: Groups chatbot intents and suggested questions.

| Column | Type | Description |
| --- | --- | --- |
| id | INT UNSIGNED | Primary key. |
| name | VARCHAR(100) | Unique category name. |
| created_at | TIMESTAMP | Creation timestamp. |

Relationships: referenced by `chatbot_intents` and `suggested_questions`.

## chatbot_intents

Purpose: Defines recognizable chatbot intents.

| Column | Type | Description |
| --- | --- | --- |
| id | INT UNSIGNED | Primary key. |
| category_id | INT UNSIGNED | Optional foreign key to `conversation_categories.id`. |
| intent_name | VARCHAR(100) | Unique intent key. |
| description | VARCHAR(255) | Intent description. |
| is_active | TINYINT(1) | Whether matching is enabled. |
| created_at | TIMESTAMP | Creation timestamp. |
| updated_at | TIMESTAMP | Update timestamp. |

Relationships: has many keywords, responses, and matched messages.

## chatbot_keywords

Purpose: Maps keywords/phrases to intents.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| intent_id | INT UNSIGNED | Foreign key to `chatbot_intents.id`. |
| keyword | VARCHAR(150) | Trigger keyword or phrase. |
| weight | DECIMAL(3,2) | Matching confidence weight. |
| created_at | TIMESTAMP | Creation timestamp. |

Relationships: many keywords belong to one intent.

## chatbot_responses

Purpose: Stores response templates for each intent.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| intent_id | INT UNSIGNED | Foreign key to `chatbot_intents.id`. |
| response_text | TEXT | Bot response template. |
| is_active | TINYINT(1) | Whether the response may be used. |
| created_at | TIMESTAMP | Creation timestamp. |
| updated_at | TIMESTAMP | Update timestamp. |

Relationships: many responses belong to one intent.

## chat_conversations

Purpose: Represents one chat session/thread for a user.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| user_id | BIGINT UNSIGNED | Foreign key to `users.id`. |
| started_at | TIMESTAMP | Conversation start time. |
| ended_at | TIMESTAMP | Optional end time. |

Relationships: belongs to a user and contains many chat messages.

## chat_messages

Purpose: Stores individual user/bot messages in a conversation.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| conversation_id | BIGINT UNSIGNED | Foreign key to `chat_conversations.id`. |
| sender | ENUM | Either `user` or `bot`. |
| message_text | TEXT | Message body. |
| matched_intent_id | INT UNSIGNED | Optional foreign key to `chatbot_intents.id`. |
| confidence_score | DECIMAL(4,3) | Optional matching confidence. |
| created_at | TIMESTAMP | Message timestamp. |

Relationships: belongs to a conversation; optionally references an intent; can be referenced by `unknown_questions_log`.

## unknown_questions_log

Purpose: Captures unmatched user questions for admin review.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| message_id | BIGINT UNSIGNED | Foreign key to `chat_messages.id`. |
| raw_input | TEXT | Original unmatched user input. |
| reviewed | TINYINT(1) | Admin review flag. |
| created_at | TIMESTAMP | Creation timestamp. |

Relationships: each row references one chat message.

## suggested_questions

Purpose: Curated prompt chips shown to students.

| Column | Type | Description |
| --- | --- | --- |
| id | INT UNSIGNED | Primary key. |
| category_id | INT UNSIGNED | Optional foreign key to `conversation_categories.id`. |
| question_text | VARCHAR(255) | Suggested question text. |
| is_active | TINYINT(1) | Display flag. |
| display_order | INT | Sort order. |

Relationships: optionally belongs to a conversation category.

## subjects

Purpose: Top-level academic subjects.

| Column | Type | Description |
| --- | --- | --- |
| id | INT UNSIGNED | Primary key. |
| name | VARCHAR(150) | Subject name. |
| code | VARCHAR(20) | Optional unique subject code. |
| description | TEXT | Subject description. |
| created_at | TIMESTAMP | Creation timestamp. |
| updated_at | TIMESTAMP | Update timestamp. |
| deleted_at | TIMESTAMP | Soft-delete timestamp. |

Relationships: has many modules, resources, FAQs, and study sessions.

## modules

Purpose: Course units/chapters under a subject.

| Column | Type | Description |
| --- | --- | --- |
| id | INT UNSIGNED | Primary key. |
| subject_id | INT UNSIGNED | Foreign key to `subjects.id`. |
| title | VARCHAR(200) | Module title. |
| order_index | INT | Sort order within subject. |
| created_at | TIMESTAMP | Creation timestamp. |
| updated_at | TIMESTAMP | Update timestamp. |
| deleted_at | TIMESTAMP | Soft-delete timestamp. |

Relationships: belongs to a subject and has many topics.

## topics

Purpose: Granular teachable units within modules.

| Column | Type | Description |
| --- | --- | --- |
| id | INT UNSIGNED | Primary key. |
| module_id | INT UNSIGNED | Foreign key to `modules.id`. |
| title | VARCHAR(200) | Topic title. |
| order_index | INT | Sort order within module. |
| created_at | TIMESTAMP | Creation timestamp. |
| updated_at | TIMESTAMP | Update timestamp. |
| deleted_at | TIMESTAMP | Soft-delete timestamp. |

Relationships: belongs to a module and has lessons, definitions, examples, FAQs, resources, study guides, and learning progress rows.

## lessons

Purpose: Instructional lesson content for topics.

| Column | Type | Description |
| --- | --- | --- |
| id | INT UNSIGNED | Primary key. |
| topic_id | INT UNSIGNED | Foreign key to `topics.id`. |
| title | VARCHAR(200) | Lesson title. |
| content | LONGTEXT | Lesson body. |
| created_at | TIMESTAMP | Creation timestamp. |
| updated_at | TIMESTAMP | Update timestamp. |
| deleted_at | TIMESTAMP | Soft-delete timestamp. |

Relationships: many lessons belong to one topic.

## definitions

Purpose: Term/definition pairs tied to topics.

| Column | Type | Description |
| --- | --- | --- |
| id | INT UNSIGNED | Primary key. |
| topic_id | INT UNSIGNED | Foreign key to `topics.id`. |
| term | VARCHAR(150) | Defined term. |
| definition_text | TEXT | Definition content. |
| created_at | TIMESTAMP | Creation timestamp. |
| updated_at | TIMESTAMP | Update timestamp. |

Relationships: many definitions belong to one topic.

## examples

Purpose: Worked examples tied to topics.

| Column | Type | Description |
| --- | --- | --- |
| id | INT UNSIGNED | Primary key. |
| topic_id | INT UNSIGNED | Foreign key to `topics.id`. |
| title | VARCHAR(200) | Optional example title. |
| content | TEXT | Example content. |
| created_at | TIMESTAMP | Creation timestamp. |
| updated_at | TIMESTAMP | Update timestamp. |

Relationships: many examples belong to one topic.

## study_guides

Purpose: Curated guides that can aggregate multiple topics.

| Column | Type | Description |
| --- | --- | --- |
| id | INT UNSIGNED | Primary key. |
| title | VARCHAR(200) | Guide title. |
| description | TEXT | Guide summary. |
| created_by | BIGINT UNSIGNED | Optional admin user who created it. |
| created_at | TIMESTAMP | Creation timestamp. |
| updated_at | TIMESTAMP | Update timestamp. |
| deleted_at | TIMESTAMP | Soft-delete timestamp. |

Relationships: optionally created by a user; linked to topics through `study_guide_topics`.

## study_guide_topics

Purpose: Junction table between study guides and topics.

| Column | Type | Description |
| --- | --- | --- |
| study_guide_id | INT UNSIGNED | Composite primary key and FK to `study_guides.id`. |
| topic_id | INT UNSIGNED | Composite primary key and FK to `topics.id`. |

Relationships: resolves the many-to-many relationship between study guides and topics.

## faqs

Purpose: Subject/topic question and answer records.

| Column | Type | Description |
| --- | --- | --- |
| id | INT UNSIGNED | Primary key. |
| subject_id | INT UNSIGNED | Optional foreign key to `subjects.id`. |
| topic_id | INT UNSIGNED | Optional foreign key to `topics.id`. |
| question | VARCHAR(255) | FAQ question. |
| answer | TEXT | FAQ answer. |
| created_at | TIMESTAMP | Creation timestamp. |
| updated_at | TIMESTAMP | Update timestamp. |

Relationships: optionally belongs to a subject and/or topic.

## resource_categories

Purpose: Lookup table for resource categories.

| Column | Type | Description |
| --- | --- | --- |
| id | INT UNSIGNED | Primary key. |
| name | VARCHAR(100) | Unique category name. |

Relationships: referenced by `resources.category_id`.

## resources

Purpose: Stores metadata for uploaded or linked learning resources.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| category_id | INT UNSIGNED | Optional FK to `resource_categories.id`. |
| uploaded_by | BIGINT UNSIGNED | Optional FK to `users.id`. |
| title | VARCHAR(200) | Resource title. |
| type | ENUM | `pdf`, `pptx`, `doc`, `video`, `link`, or `image`. |
| file_path | VARCHAR(500) | Uploaded file path. |
| external_url | VARCHAR(500) | External URL for links/videos. |
| description | TEXT | Resource description. |
| created_at | TIMESTAMP | Creation timestamp. |
| updated_at | TIMESTAMP | Update timestamp. |
| deleted_at | TIMESTAMP | Soft-delete timestamp. |

Relationships: belongs to a category and uploader; links to subjects/topics through junction tables; has many view-log rows.

## resource_subjects

Purpose: Junction table between resources and subjects.

| Column | Type | Description |
| --- | --- | --- |
| resource_id | BIGINT UNSIGNED | Composite primary key and FK to `resources.id`. |
| subject_id | INT UNSIGNED | Composite primary key and FK to `subjects.id`. |

Relationships: resolves many-to-many resource tagging by subject.

## resource_topics

Purpose: Junction table between resources and topics.

| Column | Type | Description |
| --- | --- | --- |
| resource_id | BIGINT UNSIGNED | Composite primary key and FK to `resources.id`. |
| topic_id | INT UNSIGNED | Composite primary key and FK to `topics.id`. |

Relationships: resolves many-to-many resource tagging by topic.

## resource_views_log

Purpose: Append-only record of resource views/downloads.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| user_id | BIGINT UNSIGNED | Foreign key to `users.id`. |
| resource_id | BIGINT UNSIGNED | Foreign key to `resources.id`. |
| viewed_at | TIMESTAMP | View timestamp. |

Relationships: belongs to a user and a resource.

## task_priorities

Purpose: Lookup table for study task priority levels.

| Column | Type | Description |
| --- | --- | --- |
| id | TINYINT UNSIGNED | Primary key. |
| label | VARCHAR(20) | Unique label such as Low, Medium, or High. |

Relationships: referenced by `study_tasks.priority_id`.

## study_tasks

Purpose: Student-created planner tasks.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| user_id | BIGINT UNSIGNED | Foreign key to `users.id`. |
| priority_id | TINYINT UNSIGNED | Foreign key to `task_priorities.id`. |
| title | VARCHAR(200) | Task title. |
| description | TEXT | Task notes. |
| deadline | DATETIME | Optional deadline. |
| status | ENUM | `pending`, `in_progress`, or `completed`. |
| completed_at | TIMESTAMP | Completion timestamp. |
| created_at | TIMESTAMP | Creation timestamp. |
| updated_at | TIMESTAMP | Update timestamp. |
| deleted_at | TIMESTAMP | Soft-delete timestamp. |

Relationships: belongs to a user and priority; has status history rows.

## task_status_log

Purpose: Tracks planner task status changes.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| task_id | BIGINT UNSIGNED | Foreign key to `study_tasks.id`. |
| old_status | VARCHAR(20) | Previous status. |
| new_status | VARCHAR(20) | New status. |
| changed_at | TIMESTAMP | Status change timestamp. |

Relationships: many status-log rows belong to one study task.

## study_sessions

Purpose: Tracks focused study sessions for analytics.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| user_id | BIGINT UNSIGNED | Foreign key to `users.id`. |
| subject_id | INT UNSIGNED | Optional foreign key to `subjects.id`. |
| started_at | TIMESTAMP | Session start time. |
| ended_at | TIMESTAMP | Session end time. |
| duration_minutes | INT UNSIGNED | Session duration. |
| session_type | ENUM | `pomodoro` or `free_study`. |
| created_at | TIMESTAMP | Creation timestamp. |

Relationships: belongs to a user and optionally a subject.

## learning_progress

Purpose: Stores per-user, per-topic progress.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| user_id | BIGINT UNSIGNED | Foreign key to `users.id`. |
| topic_id | INT UNSIGNED | Foreign key to `topics.id`. |
| progress_percent | TINYINT UNSIGNED | Completion percentage from 0 to 100. |
| status | ENUM | `not_started`, `in_progress`, or `completed`. |
| updated_at | TIMESTAMP | Update timestamp. |

Relationships: belongs to a user and topic; unique on `(user_id, topic_id)`.

## notifications

Purpose: Stores shared notification content.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| created_by | BIGINT UNSIGNED | Optional admin creator. |
| type | ENUM | `announcement`, `reminder`, `assignment_alert`, or `system`. |
| title | VARCHAR(200) | Notification title. |
| body | TEXT | Notification body. |
| created_at | TIMESTAMP | Creation timestamp. |
| updated_at | TIMESTAMP | Update timestamp. |

Relationships: created by a user; delivered through `notification_recipients`.

## notification_recipients

Purpose: Tracks which users received and read each notification.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| notification_id | BIGINT UNSIGNED | Foreign key to `notifications.id`. |
| user_id | BIGINT UNSIGNED | Foreign key to `users.id`. |
| is_read | TINYINT(1) | Read/unread flag. |
| read_at | TIMESTAMP | Read timestamp. |

Relationships: resolves many-to-many notifications-to-users and enforces uniqueness on `(notification_id, user_id)`.

## feedback

Purpose: Stores user ratings, comments, and suggestions.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| user_id | BIGINT UNSIGNED | Foreign key to `users.id`. |
| context_type | VARCHAR(50) | Optional context such as resource, chatbot, or general. |
| context_id | BIGINT UNSIGNED | Optional related row id interpreted by context type. |
| rating | TINYINT UNSIGNED | Optional 1-5 rating. |
| comment | TEXT | Optional written feedback. |
| created_at | TIMESTAMP | Creation timestamp. |

Relationships: belongs to a user. The context fields are intentionally polymorphic and are not foreign-key constrained.

## admin_audit_log

Purpose: Append-only audit trail for admin actions.

| Column | Type | Description |
| --- | --- | --- |
| id | BIGINT UNSIGNED | Primary key. |
| admin_id | BIGINT UNSIGNED | Foreign key to `users.id`. |
| action | VARCHAR(100) | Action name. |
| target_table | VARCHAR(100) | Table affected by the action. |
| target_id | BIGINT UNSIGNED | Optional affected row id. |
| details | JSON | Optional structured audit details. |
| created_at | TIMESTAMP | Audit timestamp. |

Relationships: many audit rows belong to one admin user.
