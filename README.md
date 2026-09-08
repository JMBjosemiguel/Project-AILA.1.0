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

See `DEPLOYMENT.md` for the Cloudflare Pages, Render, Aiven MySQL, and Cloudflare R2 deployment flow.

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

## Admin Package Integration

The generated admin package was used as a structural reference only. Its raw files were removed because they contained mock users, fake statistics, question banks, chat sessions, feedback, notifications, and demo profile data.

The active Admin Portal is database-ready and only references tables from the finalized database architecture.

## Backend Integration Notes

All network code lives in `src/services/api` (one `<feature>Service.js` per domain,
`endpoints.js` for URLs); pages consume `use<Feature>Data` hooks, never axios directly.
Session state lives in `src/contexts/AuthContext.jsx`.

As of v1.1 every student page is wired to a real backend endpoint (personalized
course/lesson/quiz generation, resumable assessments, course checkpoints + final,
material sharing, gamification, chatbot "Save as Quiz"). A page shows a proper empty
state when the API succeeds with no data, and a retry-able error (`components/common/LoadError`)
when the request fails.

## Database

Local dev uses `aila_db` on XAMPP MySQL/MariaDB. For a **fresh install** import
`database/schema.sql` + `seed.sql` (see `database/migration_notes.md`). For an
**existing database on v1.0.0**, apply the ordered migrations in
`database/migrations/` (`001`–`007`) — see `database/migrations/README.md`.

## Run

```bash
npm install
npm run dev
npm run build
```
