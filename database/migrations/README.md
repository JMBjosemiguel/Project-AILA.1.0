# AILA Schema Migrations

This folder contains ordered, apply-once migrations for upgrading an existing
AILA database in place. A fresh installation does not need these files because
`schema.sql` and `production_schema.sql` already include the latest structure.

## Migration Order

| # | File | Main change |
| --- | --- | --- |
| 001 | `001_xp_events.sql` | Adds XP ledger support. |
| 002 | `002_resumable_quiz_attempts.sql` | Adds resumable formal quiz attempts. |
| 003 | `003_personalization_context.sql` | Adds personalization context fields. |
| 004 | `004_course_assessments.sql` | Adds course assessment metadata. |
| 005 | `005_material_sharing.sql` | Adds material sharing support. |
| 006 | `006_gamification.sql` | Adds achievements and profile gamification fields. |
| 007 | `007_chat_quiz_provenance.sql` | Adds quiz provenance for chatbot-generated quizzes. |
| 008 | `008_email_verification.sql` | Adds email verification support. |
| 009 | `009_chat_pending_intent.sql` | Adds pending chatbot intent state. |

Run migrations in this order only.

## When to Use These Migrations

Use these files only for an existing database that must preserve data while
moving to the current schema.

Do not run them on a fresh database that was created from `schema.sql` or
`production_schema.sql`.

## Deployment Checklist

For each migration:

1. Back up the target database.
2. Run the migration file's preflight query.
3. Apply the migration if the preflight confirms it has not been applied.
4. Run the migration file's verification query.
5. Complete any migration-specific post-step.
6. Stop immediately if an error occurs.

## Apply-Once Behavior

These migrations are intentionally not fully idempotent. MySQL 8.4 does not
support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, and a repeated migration
should fail rather than silently hide an inconsistent deployment state.

If a preflight query shows that a migration is already applied, skip that file
and verify the rest of the migration history before continuing.

## Post-Steps

- `001_xp_events.sql`: Seeds each user's existing XP balance into the ledger.
- `006_gamification.sql`: Run achievement reconciliation once after applying.
- `008_email_verification.sql`: Backfills existing users as verified during the
  migration.

## Stop Conditions

Stop and review before proceeding if:

- A preflight query reports unexpected existing objects.
- A migration fails partway through.
- Verification queries do not match expected results.
- Data reconciliation checks report mismatches.
