# AILA

Adaptive Intelligent Learning Assistant, organized as two independent portals that share only authentication and reusable UI primitives.

## Architecture

- Shared: login, register, authentication context, route guards, reusable common components
- Student Portal: independent layout, sidebar, topbar, routes, pages, and student components
- Admin Portal: independent layout, sidebar, topbar, routes, pages, and admin components

Administrators are not rendered inside the Student Portal. Students are not rendered inside the Admin Portal.

## Backend Auth

The app authenticates against the Express, JWT, and MySQL backend.

Flow:

- Register calls `POST /api/auth/register`.
- Login calls `POST /api/auth/login`.
- Session restoration calls `GET /api/auth/me`.
- Logout calls `POST /api/auth/logout`.
- The frontend stores only the JWT at `aila.jwt` and sends it as a Bearer token.

Register creates student accounts only.

Configure the frontend API base URL with:

```env
VITE_API_URL=http://localhost:5000/api
```

For production, set `VITE_API_URL` to the deployed Render backend URL with `/api`, for example:

```env
VITE_API_URL=https://your-render-service.onrender.com/api
```

See `docs/DEPLOYMENT.md` for the Cloudflare Pages, Render, Aiven MySQL, and Cloudflare R2 deployment flow.

## Routes

Shared:
- `/login`
- `/register`

Student:
- `/student/dashboard`
- `/student/ai-assistant`
- `/student/learning-hub`
- `/student/resources`
- `/student/planner`
- `/student/analytics`
- `/student/achievements`
- `/student/notifications`
- `/student/profile`
- `/student/feedback`

Admin:
- `/admin`
- `/admin/users`
- `/admin/knowledge-base`
- `/admin/resources`
- `/admin/chatbot-rules`
- `/admin/chat-sessions`
- `/admin/feedback`
- `/admin/audit-log`
- `/admin/settings`

## Folder Structure

```text
src/
  app/
    App.jsx
    main.jsx
    router.jsx
    providers/
    routes/
      adminRoutes.jsx
      authPaths.js
      ProtectedRoute.jsx
      studentRoutes.jsx
  components/
    admin/
    analytics/
    auth/
    chatbot/
    common/
    student/
      dashboard/
      feedback/
      learningHub/
      planner/
      resources/
  constants/
  contexts/
  hooks/
  layouts/
    AdminLayout/
    AuthLayout/
    StudentLayout/
  pages/
    admin/*/
    auth/Login/
    auth/Register/
    student/*/
  services/
    api/
  styles/
  types/
```

## Backend Integration Notes

All network code lives in `src/services/api` (one `<feature>Service.js` per domain,
`endpoints.js` for URLs); pages consume `use<Feature>Data` hooks, never axios directly.
Session state lives in `src/contexts/AuthContext.jsx`.

As of v1.1 every student page is wired to a real backend endpoint (personalized
course/lesson/quiz generation, resumable assessments, course checkpoints + final,
material sharing, gamification, chatbot "Save as Quiz"). A page shows a proper empty
state when the API succeeds with no data, and a retry-able error (`components/common/LoadError`)
when the request fails. A quiz requested through chat is capped at 20 items; the Learning
Hub and Resource Library's own "Generate Quiz" can go up to 150 (see below).

The admin Audit Log also records student activity (login, registration, email
verification, resource uploads, quiz submissions), not just admin actions. Admins can
promote a verified, active student with no personal uploads to admin from the Users page.

From the Learning Hub or Resource Library, practice quizzes can go up to 150 items.
Anything over 15 items generates in batches (the UI shows live progress); batches append
to the same quiz under a row lock, so concurrent batch requests can never push a quiz
past its requested item count. Lessons open in a full-screen reader (not an inline
panel), with Previous/Next across the whole course and the reading progress bar synced
to scroll position.

Creating a course accepts optional choices beyond name/difficulty/goal — why the course
is for (from scratch, exam review, board exam review, catching up, clinical skills,
mastery), its length (short/standard/in-depth), and what to focus on (worked examples,
case scenarios, key terms, in-lesson practice questions, summaries, real-world
application). These are validated against a fixed list server-side and folded into the
roadmap/lesson prompts as rules, not inserted as free text; they're stored on the
course's existing JSON snapshot column, so no schema change was needed. Courses created
before this feature keep generating exactly as before.

The chat composer can attach a file (upload or pick from the Resource Library) so
replies are grounded in that document; the attachment persists on the conversation,
shows as a chip when the conversation is reopened, and can be explicitly detached.

Announcements can target Everyone, a specific student, or a role — "specific course" and
"year level" targeting were removed for new announcements (existing announcements sent
that way still display correctly).

The admin dashboard surfaces counts that need attention (feedback awaiting a reply,
accounts unverified 24h+, students who may need a nudge), a short list of students with
no recent activity or a weak recent quiz average, and a 7-day active-students chart.
Admin Analytics can also group near-duplicate topics across different students' AI-
generated courses (e.g. "Infant Growth" and "Infant Measurements" into one group) so an
instructor sees one entry instead of many worded-differently near-duplicates.

Both portals support light/dark mode (a manual toggle, remembered per browser).

## Database

Local dev uses `aila_db` on XAMPP MySQL/MariaDB. For a **fresh install** import
`database/schema.sql` + `seed.sql` (see `database/migration_notes.md`). For an
**existing database on v1.0.0**, apply the ordered migrations in
`database/migrations/` (`001`–`009`) — see `database/migrations/README.md`.

## Mock data

For demos, `backend/scripts/mockData.js` seeds ~150 synthetic BS Nursing students
(`mock.001@mock.aila.local` … `mock.150@mock.aila.local`) with courses, lesson/quiz
progress, XP, streaks, achievements, feedback and a few chat conversations, so the
leaderboard, admin dashboard, analytics and AI topic groups look like a real class
instead of an empty database. Data is deterministic (fixed random seed) and tagged for
exact removal — every mock course additionally carries a `code` starting with `MOCK-`.

```bash
npm run mock:seed    # removes any earlier mock data, then re-seeds
npm run mock:remove  # deletes mock data only — real/seeded accounts are untouched
```

The script refuses to run unless `NODE_ENV` isn't `production`, `DB_HOST` is
`localhost`/`127.0.0.1`, and `DB_SSL` is off — **never run it against production.**
There is no override flag.

## Run

```bash
npm install
npm run dev
npm run build
```
