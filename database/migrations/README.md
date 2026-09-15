# AILA schema migrations (v1.0.0 → develop)

Additive, ordered, **apply-once** migrations that take the frozen production
`v1.0.0` schema (`main` @ `0ea4423`) to the current `develop` schema.

`database/schema.sql` and `database/production_schema.sql` are the *destination*
state (a fresh install already includes every migration). These files are for an
**existing** database that must be upgraded in place without losing data.

## Order

| # | File | Batch | Touches | New tables |
|---|------|-------|---------|-----------|
| 001 | `001_xp_events.sql` | 1 | — | `xp_events` |
| 002 | `002_resumable_quiz_attempts.sql` | 2 | `quiz_attempts`, `quiz_attempt_answers` | — |
| 003 | `003_personalization_context.sql` | 3 | `subjects`, `lessons`, `quizzes` | — |
| 004 | `004_course_assessments.sql` | 4 | `quizzes`, `quiz_attempts` | — |
| 005 | `005_material_sharing.sql` | 5 | `subjects`, `quizzes` | `material_shares` |
| 006 | `006_gamification.sql` | 6 | `user_profiles` | `achievements`, `user_achievements` |
| 007 | `007_chat_quiz_provenance.sql` | 7 | `quizzes` | — |
| 008 | `008_email_verification.sql` | 8 | `users` | `email_verification_tokens` |
| 009 | `009_chat_pending_intent.sql` | 9 | `chat_conversations` | — |

Rehearsed end-to-end against a fresh copy of the `v1.0.0` production schema:
43 tables → 48 tables (009 adds a column, not a table), every migration applies
with no error, all expected columns / indexes / seeded rows present,
`indexes.sql` + `constraints.sql` re-run clean afterwards.

## Apply-once, not re-runnable — and that's intentional

MySQL 8.4 has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so re-running a
migration errors on the second `ADD COLUMN`/`CREATE TABLE`. This is deliberate:
each migration file's header carries a **preflight** query (assert the change is
absent) and a **verify** query (assert it landed). Do not rewrite them to be
idempotent — run each exactly once, gated by its preflight.

## Per-migration deployment checklist

For every migration, in order:

1. **Back up** the target database.
2. **Preflight** — run the `Preflight` query from the file header. It must show
   the new column/table is **absent** and (where noted) that cached balances
   already reconcile. If the change is already present, that migration was
   already applied — skip it.
3. **Apply** — pipe the file into the DB on the correct connection
   (`mysql <conn> <dbname> < database/migrations/NNN_*.sql`). Local dev only in
   this batch; never against Aiven here.
4. **Verify** — run the `Verify` query from the header.
5. **Post-steps** (001, 006, 008 have one; the rest don't):
   - **001** — none; `xp_events` seeds each user's existing balance as one
     `legacy_balance` row via `INSERT IGNORE ... SELECT`.
   - **006** — `user_achievements` starts empty. Run the reconciliation utility
     once to grant already-earned historical achievements
     (`node -e "require('./backend/src/services/achievementService').reconcileAllUsers()..."`).
     No bonus XP, no notifications; `source='backfill'`.
   - **008** — runs its own backfill inline (every existing user is marked
     verified as of their `created_at`); no separate script to run. Confirm
     `SELECT COUNT(*) FROM users WHERE email_verified_at IS NULL` is `0`
     immediately after applying it — any non-zero count is a brand-new
     registration that landed mid-migration, not a backfill failure.
6. If a step fails, **stop** and use the `Rollback` block in that file's header.

## STOP conditions

- Preflight shows the change already present but a *later* migration is missing —
  investigate which migrations ran before proceeding.
- `001` preflight shows `user_profiles.xp_points` not matching
  `SUM(xp_events.points)` — do not migrate; the cache is already drifted.
- Any migration errors mid-file — roll back that file, do not run the next.
