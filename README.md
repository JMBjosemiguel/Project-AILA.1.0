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

Future feature endpoint integration should stay mostly inside:

- `src/services/api`
- `src/contexts/AuthContext.jsx`

Authentication is already backend-connected. Current non-auth feature pages intentionally show empty states until real feature endpoints are connected.

## Run

```bash
npm install
npm run dev
npm run build
```
