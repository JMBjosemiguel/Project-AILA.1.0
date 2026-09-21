# AILA — Admin Stabilization & Production-Readiness QA

_Date: 2026-08-30 · Branch: `qa/admin-stabilization` (not pushed) · Prepared for the maintainer_

This pass verified the production Admin → Users hotfix, audited the whole admin
panel plus the student core flows, ran a security / data-isolation regression,
added automated tests, and applied a small set of safe stabilization fixes.
**Nothing was pushed or deployed. No production data was touched.**

Local stack used for testing: backend on `http://localhost:5000`, MariaDB 10.4
(`aila_db`). Production is MySQL 8.4.8 (Aiven) + Render + Cloudflare Pages + R2.
Where a check could only be done locally it is labelled **(local only)**.

---

## 1. Admin Users hotfix — verified

**Root cause.** `config/database.js` `query()` ran every statement through
`pool.execute()` (server-side prepared statements). mysql2 3.22.6 encodes every
JS number as `DOUBLE`, and MySQL 8 rejects a `DOUBLE` in `LIMIT` / `OFFSET`
with `ER_WRONG_ARGUMENTS` ("Incorrect arguments to mysqld_stmt_execute").
MariaDB (local dev) silently coerces it, so it only failed in production. The
bug was systemic — ~25 `LIMIT ?` / `LIMIT ? OFFSET ?` query sites across the
admin and student portals.

**Fix (commit `91efb8e`, already on `main` / deployed).** `query()` and the
`execute()` transaction helper now use `pool.query()` / `connection.query()`
(text protocol). Parameters are still bound with `?` and escaped by mysql2, so
it stays injection-safe; `LIMIT`/`OFFSET` render as bare integers that MySQL 8
accepts. Pagination inputs were already validated (`paginationQueryValidator`
→ 422) and coerced to bounded integers (`parsePagination`).

**Tests (local, all green).** `backend/test/integration/adminUsers.test.js`:

| Case | Result |
| --- | --- |
| `role=all&status=all&sort=newest&page=1&pageSize=10` (the failing request) | 200 + pagination metadata |
| `role=student` / `role=admin` | 200 |
| `status=active` / `status=inactive` | 200 |
| `sort=newest` / `oldest` / `name` / `last_login` | 200 |
| search by email / first name / last name / empty | 200 |
| `page=1&pageSize=1`, `page=2&pageSize=2`, `page=99999` | 200, correct metadata |
| `page=-5&pageSize=-1`, `page=abc`, `pageSize=99999`, `page=1.5`, `page=0` | 422 (never 500) |
| `search=' OR '1'='1` | 200, treated as literal text |
| response contains `password_hash` / secrets | never |
| user with **no `user_profiles` row** in list + detail | 200, null profile fields, no crash |
| `GET/DELETE /admin/*` without token / as student | 401 / 403 |

Also confirmed still-green: `/admin/dashboard`, `/admin/resources`,
`/admin/learning`, `/admin/announcements/list`, `/admin/audit-log`,
`/admin/analytics`, `/admin/chat-sessions/users`.

**Production verification still required** (needs the deployed frontend + a real
admin login — see §9).

---

## 2. Admin panel audit

Pages: Dashboard, Users, Learning Management, Resources, Analytics, Chat
Sessions, Feedback, Audit Log, Announcements. Every page calls a real backend
route; every `/api/admin/*` router mounts `authenticate` + `authorize('admin')`;
response shapes match the frontend.

### Bugs found

| # | Sev | Area | Finding | Status |
| --- | --- | --- | --- | --- |
| A1 | P1 | Analytics page | On any analytics API failure the component rendered with `data === null` and threw (`Cannot read properties of null`) → blank screen. | **Fixed** (commit `8e4cb7c`) |
| A2 | P2 | All admin list pages | `listX().then(setState).finally()` with **no `.catch`** — an API error (500 / offline / Render cold start / 403) showed the "nothing here" empty state, no error, plus an unhandled promise rejection. This is exactly why the Users 500 looked like a blank page. | **Fixed** (`8e4cb7c`) — `DataTable` gains `error` + `onRetry`; Dashboard gets an error banner; Chat Sessions surfaces a toast |
| A3 | P2 | `UserDetailDialog` | Load error left the dialog showing skeletons forever + "undefined undefined" in the title. | **Fixed** (`8e4cb7c`) |
| A4 | P3 | `Pagination` | Hidden entirely when `totalPages <= 1`, so the "Showing X–Y of Z" count disappears for single-page results. | Open (cosmetic) |
| A5 | P3 | `UserDetailDialog` | Labelled "student profile" even when viewing an admin row. | Open (cosmetic) |
| A6 | P3 | Users page | `pageSize` hardcoded to 10 in the loader but initial state says 20 (self-corrects after first load). | Open (cosmetic) |
| A7 | P3 | Admin filters | Role and status pill groups sit in one undifferentiated `flex-wrap` row; on narrow widths they wrap into an ambiguous block. | Owner review (§7) |

No mock/demo data, no mass-assignment (services use hardcoded field
whitelists), destructive actions have confirm dialogs, IDs are validated
(`isInt({min:1})`).

---

## 3. Admin Users deep QA

- Roles resolved by name via join (`r.name AS role`); student/admin/inactive
  filters and all four sorts work.
- `deleted_at IS NULL` correctly excludes soft-deleted users (local DB: 18 rows,
  4 active — listing shows 4).
- `student_number` nullable, `last_login_at` nullable, `created_at` present —
  all render.
- Profile join is `LEFT JOIN`; a user with **no profile** does not crash the
  list or the detail view (verified with a forced fixture).
- Registration (`authService.register`) creates the `users` row **and** the
  `user_profiles` row **in one transaction** — a partial user is not possible.
  A production admin created directly by SQL may still lack a profile; the UI
  now tolerates that.

---

## 4. Security audit

**Backend posture is strong.** Verified by `backend/test/integration/*` + code
review:

- All `/api/admin/*` routers: `authenticate` then `authorize('admin')`. No
  token → 401, student token → 403. UI hiding is **not** the only protection.
- `authenticate` verifies the JWT signature + expiry **and** checks the
  `user_sessions` row is still present.
- Every user-owned entity is scoped by `user_id` / `uploaded_by` /
  `created_by` at the model layer; services check ownership before acting and
  throw 404 (not 403) on a miss, so IDs aren't enumerable.
- No `password_hash`, JWT secret, DB / R2 / Gemini credentials appear in any
  response. `mapUser()` selects explicit columns; `findUserByEmailWithPassword`
  (the only `SELECT users.*`) is used only inside `login()`.
- No mass assignment — `profileService`, `plannerService`, `notificationModel`
  build `SET` clauses from hardcoded key lists, not the raw body.
- Production errors return a generic `500 "Internal server error."`; full
  errors are `console.error`'d server-side only. `morgan('combined')` does not
  log the `Authorization` header or bodies.
- CORS is a strict allowlist (no `*`); helmet is on; `/api` rate-limited
  300/15 min, AI routes 20/5 min.

### Security bug fixed

| # | Sev | Finding | Status |
| --- | --- | --- | --- |
| S1 | P2 | **SSRF** — `resourceService.addLinkResource` fetches a student-supplied URL server-side for AI analysis. The URL was only shape-checked, so `http://localhost:…`, `http://169.254.169.254/…` (cloud metadata), or private-range IPs would be fetched and their text returned to the user. | **Fixed** (`90d1237`) — new `utils/safeUrl.assertFetchableExternalUrl`: rejects non-`http(s)`, credentialed URLs, and hosts that are or DNS-resolve to loopback / link-local / private / reserved addresses; `fetchLinkText` no longer follows redirects. Current Render deployment has no internal services, so real-world impact was low, but the class of bug is closed. |

### Security notes (no change made)

- **S2 (P3)** `user_sessions` rows are only deleted on explicit logout — never
  expired/pruned. Stale rows are harmless (the JWT expiry still gates access)
  but the table grows unbounded. Consider a periodic cleanup / `expires_at`.
- **S3 (P3)** DNS-rebinding between the `safeUrl` lookup and the actual
  `fetch()` is still theoretically possible. A pinned-IP fetch or network
  egress controls would fully close it.
- **S4 (P3)** `changePassword` has no max length; bcrypt silently truncates at
  72 bytes (register already caps at 72).
- **S5 (P3)** Quiz fetch returns `correctAnswer`/`explanation` to the client
  before submission — fine for self-assessment, not a cross-user leak.

---

## 5. Student core-flow audit (static + local)

Ownership enforced and verified for every user-owned entity:

| Flow | Ownership check | Isolation test |
| --- | --- | --- |
| Planner tasks | `getTaskForUser(id, userId)` / model scoped | B PATCH/duplicate/DELETE A's task → 404, A's task unchanged |
| Quizzes / attempts | `getQuizWithQuestions(id, userId)`, `getAttemptDetail(id, userId)` | B GET/DELETE/submit on A's quiz + attempt → 404 |
| AI chat | `getConversationForUser(id, userId)` before every read/write | B GET/rename/DELETE A's conversation → 404; not in B's history |
| Resources | `(uploaded_by = ? OR admin)` everywhere | B view/download/update/delete A's resource → 404; not in B's list |
| Lessons / courses | `s.created_by = ?` joined through subject | (static review — same pattern) |
| Notifications | `notification_recipients.user_id = ?` | B mark-read / delete A's notification → 404; stays unread |
| Profile | route is `/users/me`, always `req.auth.user.id` | `GET /users/me/profile` returns caller only |

Auth: register → login → `/auth/me` → logout all work; expired/garbage token →
401; expired token on app load → clean logout (`authService.refreshSession`
removes it).

AI chat is 100% Gemini via the backend (`geminiClient`, raw `fetch`, key in
query string, never returned). Errors map to friendly 429/503/504. R2 upload /
download / delete / ownership isolation were already live-verified in an
earlier phase.

---

## 6. API error handling

Consistent: `ApiError(status, message, details)` → `{ success, message,
details }`; validation → 422 with field details; ownership miss → 404; auth →
401 / 403; unexpected → generic 500. No stack traces / SQL / secrets / paths in
responses. Left as-is (no new framework needed).

---

## 7. Admin UI tweaks

### Applied now (safe — missing state only, no redesign)

- Error + Retry state on all admin list tables (`DataTable`).
- Dashboard load-error banner with Retry.
- Analytics page no longer crashes on a failed load.
- Chat Sessions load failures raise a toast.
- `UserDetailDialog` shows an error state instead of an infinite skeleton.

### Needs owner review (subjective — not applied)

- **Filter bar** (Users, Resources, Learning): role/status/type pills + the
  sort `<select>` share one `flex-wrap` row. On tablet widths they wrap
  awkwardly. Suggest grouping (labelled segments or a filter popover) — a
  layout decision, not a defect.
- **Long emails / names** in tables push columns wide and force horizontal
  scroll on the card. Suggest `max-w` + `truncate` with a title tooltip on the
  email cell.
- **Single-page lists** hide the row-count entirely (`Pagination` returns
  `null` when `totalPages <= 1`). Suggest always showing "N results".
- **`UserDetailDialog`** copy says "student" for admin rows.
- **Date formatting** is `toLocaleDateString()` / `toLocaleString()`
  per-component — consider one shared `formatDate` helper for consistency.
- **Mobile**: the admin shell is usable but wide tables always scroll; a
  card/stacked layout under `sm` would be a bigger design task.

---

## 8. Automated tests added

`node:test` (built in — **no new dependencies**).

| Suite | File | What it covers |
| --- | --- | --- |
| unit | `backend/test/unit/safeUrl.test.js` | SSRF guard — blocks loopback / private / link-local / metadata / non-http / bare host / credentialed; allows normal public URLs |
| unit | `backend/test/unit/pagination.test.js` | `parsePagination` always yields bounded non-negative integers for junk / negative / oversized input |
| integration | `backend/test/integration/adminUsers.test.js` | the whole `/admin/users` matrix from §1 + response sanitization + orphan-profile + server-side authz |
| integration | `backend/test/integration/ownership.test.js` | cross-student isolation for planner / quiz / chat / resource / notification |

Scripts: `npm test` (unit), `npm run test:integration` (needs `npm run dev`
+ local DB; self-skips if the backend is down and purges its own fixtures),
`npm run test:smoke` (the previous `node --check`).

**Results (local):** unit 9/9 pass · integration 15/15 pass.

---

## 9. Still to verify in production (owner, after returning)

1. Open <https://aila-chat.pages.dev>, log in as the production admin.
2. **Admin → Users**: list loads; exercise search, Role filter, Status filter,
   the Sort dropdown, and pagination next/prev.
3. Open Dashboard, Resources, Learning Management, Analytics, Chat Sessions,
   Feedback, Audit Log, Announcements — each loads (all shared the bug).
4. As the production student: Dashboard, Analytics, Resources, Quiz history,
   Notifications, Planner all load.
5. Render logs: no new `Incorrect arguments to mysqld_stmt_execute`.
6. (If the `qa/admin-stabilization` branch is merged) re-run the Analytics page
   with the network throttled/offline to confirm the error card, not a blank
   screen.

---

## 10. Release recommendation

**READY WITH ISSUES.** The production-breaking bug is fixed and deployed; the
security and isolation posture is solid and now test-covered. Remaining items
are P3 polish and owner-review UI decisions — none block use.

Target stable tag: **v1.0.0** — **do not tag yet.** Tag after: (a) the
production verification in §9 passes, and (b) a decision on merging
`qa/admin-stabilization`.
