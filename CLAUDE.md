# CLAUDE.md

Guidance for working in this repo. AILA (Adaptive Intelligent Learning Assistant) is a
two-portal learning app: a **React + Vite** frontend at the repo root and a
**Node/Express + MySQL** backend in `backend/`. The two halves are deployed independently
and talk only over HTTP (`VITE_API_URL` -> backend `/api`).

## Project structure

```
Project-AILA.1.0/
├── src/                      Frontend (React 18, Vite 6, Tailwind 3)
│   ├── app/                  Entry, providers, custom router
│   │   ├── main.jsx          ReactDOM root + global CSS (katex, highlight.js)
│   │   ├── providers/        AppProviders = Auth > Toast > Confirm
│   │   └── routes/           Route tables (studentRoutes, adminRoutes), ProtectedRoute, authPaths
│   ├── pages/                One folder per screen: student/*, admin/*, auth/Login, auth/Register
│   ├── layouts/              AdminLayout, StudentLayout, AuthLayout (each: layout + sidebar + topbar)
│   ├── components/           common/ (shared primitives) + admin/, student/, chatbot/, analytics/, auth/
│   ├── contexts/AuthContext.jsx   Session state, login/register/logout/refresh
│   ├── hooks/                use*Data hooks, useAsyncData (generic loader)
│   ├── services/api/         API layer — see conventions below
│   ├── constants/            roles.js (ROLES.STUDENT / ROLES.ADMIN), ui.js
│   └── styles/index.css      Tailwind entry
├── backend/
│   └── src/
│       ├── server.js         App wiring: helmet, cors, rate limit, /health, /api, error handlers
│       ├── config/database.js  mysql2 pool: query(), transaction(), testConnection(), execute()
│       ├── routes/            One router per feature + index.js mount table + scaffoldRoutes.js
│       ├── controllers/       Thin — parse req, call service, sendSuccess()
│       ├── services/          Business logic (incl. gemini/course/quiz/AI services, storageService)
│       ├── models/            SQL only, via query()/execute(); return plain objects
│       ├── middlewares/       authenticate, authorize, validateRequest, aiRateLimiter, uploadResourceFile, errorHandler, notFoundHandler
│       ├── validators/        express-validator chains per feature
│       ├── utils/             ApiError, asyncHandler, http (sendSuccess), jwt, pagination, gamification, notify, *Text parsers
│       └── scripts/validateDeploymentConfig.js   Pre-deploy env check (npm run validate:deployment)
├── database/                 SQL package (see import order) + docs
├── scripts/validateFrontendConfig.mjs   Frontend pre-deploy env check
├── render.yaml               Render blueprint for the backend
├── DEPLOYMENT.md             Cloudflare Pages + Render + Aiven + R2 production guide
└── .env / backend/.env       Local only, gitignored — create from the .env.example files
```

## Running locally

Prerequisites: Node `>=20 <25`, and XAMPP MySQL/MariaDB running on `localhost:3306`.

**Database (XAMPP):** start MySQL from the XAMPP Control Panel, or run
`C:\xampp\mysql\bin\mysqld.exe --defaults-file=C:\xampp\mysql\bin\my.ini --standalone`.
The `aila_db` database already exists on this machine with data — **do not re-import**
`schema.sql` (it drops every table). Only import on a machine where `aila_db` is missing.

**Backend** (`http://localhost:5000`, API under `/api`, health at `/health`):
```bash
cd backend
npm install
npm run dev        # nodemon; npm start = plain node
```
`node --check src/server.js` is the smoke test (`npm test`). The server exits on startup
if it cannot reach the DB.

**Frontend** (`http://localhost:5173`):
```bash
npm install
npm run dev
npm run build      # outputs dist/ ; preview with npm run preview
```

Note: `npm install` prints `npm warn allow-scripts` for `bcrypt`, `esbuild`, etc.
That is npm 11's blocked-install-scripts warning. Both work anyway because they ship
prebuilt binaries — no action needed for local dev.

## Environment variables

Root `.env` (frontend, Vite — only `VITE_*` is exposed to the browser):

| Var | Local value | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:5000/api` | Base URL for all API calls. **Must end in `/api`.** |

`backend/.env`:

| Var | Local value | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` tightens CORS and logging; dev auto-allows `localhost:5173`. |
| `PORT` | `5000` | Backend listen port. |
| `APP_URL` | `http://localhost:5173` | Primary allowed CORS origin. |
| `CORS_ORIGINS` | `http://localhost:5173` | Extra allowed origins, comma-separated. |
| `DB_HOST` / `DB_PORT` | `localhost` / `3306` | MySQL connection. |
| `DB_USER` / `DB_PASSWORD` | `root` / *(empty)* | XAMPP default credentials. |
| `DB_NAME` | `aila_db` | Database name. |
| `DB_CONNECTION_LIMIT` | `10` | mysql2 pool size. |
| `DB_SSL` | `false` | `true` + `DB_SSL_CA` for Aiven/production. |
| `JWT_SECRET` | *(48-char random)* | Signs auth JWTs. Deploy check wants >=32 chars. |
| `JWT_EXPIRES_IN` | `1d` | Token lifetime. |
| `BCRYPT_SALT_ROUNDS` | `10` | Password hashing cost. |
| `GEMINI_API_KEY` | **`REPLACE_ME`** | Google Gemini key — **required for all AI features** (chat, course/quiz/study-tool generation). AI endpoints return 503 until set; the rest of the app runs fine without it. |
| `GEMINI_MODEL` | `gemini-flash-latest` | Model id. |
| `GEMINI_TIMEOUT_MS` | `30000` | Per-request timeout. |
| `STORAGE_DRIVER` | `local` | `local` = files in `backend/uploads/`; `r2` = Cloudflare R2 (needs the `R2_*` vars). |
| `R2_*` | *(blank)* | Only read when `STORAGE_DRIVER=r2`. |

## Database

SQL package lives in `database/`. Import order (phpMyAdmin SQL tab or the `mysql` CLI):

1. `schema.sql`  — creates `aila_db` + all 43 tables. **Destructive: drops existing tables first.**
2. `seed.sql`    — dev data + the login accounts below. (Production uses `production_baseline.sql` instead.)
3. `indexes.sql` — idempotent; adds recommended indexes if missing.
4. `constraints.sql` — idempotent; adds foreign keys if missing.

CLI example:
```bash
for f in schema seed indexes constraints; do
  "C:/xampp/mysql/bin/mysql.exe" -h 127.0.0.1 -u root < "database/$f.sql"
done
```

`database/database_documentation.md` documents every table; `database/migration_notes.md`
covers validation and phpMyAdmin steps.

### Dev login accounts (from `seed.sql`, local only)

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@aila.local` | `admin123` |
| Student | `student@aila.local` | `student123` |

Registration (`POST /api/auth/register`) only ever creates **student** accounts.

## Conventions

**Auth flow.** Frontend stores only the JWT at `localStorage["aila.jwt"]` and sends it as
`Authorization: Bearer <token>`. Backend `authenticate` verifies the token, checks the
`user_sessions` row is still active, and loads the user onto `req.auth`. `authorize('admin')`
gates admin routes. Login/logout also create/delete a `user_sessions` row.

**Backend request pipeline.** `route -> validator chain -> validateRequest -> [authenticate] ->
[authorize] -> [aiRateLimiter] -> controller -> service -> model`.
- Controllers are thin: read `req`, call a service, respond with `sendSuccess(res, data, status, message)`.
- Services hold all business logic and throw `new ApiError(status, message, details)` for expected failures.
- Models contain SQL only, run through `query()` / `execute()` / `transaction()` from `config/database.js`.
- `asyncHandler` wraps every async handler so throws reach `errorHandler`.

**API response envelope.** Success: `{ success: true, message, data }`. Error:
`{ success: false, message, details }` (422 validation errors put field errors in `details`).
The frontend axios client (`src/services/api/client.js`) unwraps to `response.data.data`
and converts failures into `ApiClientError`.

**Frontend API layer.** All network code lives in `src/services/api/`. `endpoints.js` is the
single source of URL paths. One `<feature>Service.js` per domain exposes plain functions that
call `apiClient`. Pages consume a `use<Feature>Data` hook (built on `useAsyncData`), never
axios directly. Non-auth feature screens render empty states where a backend endpoint isn't wired yet.

**Routing is custom — there is no react-router.** `src/app/router.jsx` reads
`window.location.pathname`, maps it through `STUDENT_ROUTES` / `ADMIN_ROUTES` (keyed by route
id, e.g. `student.dashboard`), and navigates with `window.history.pushState`. Route objects
carry `path`, `label`, `icon`, and `allowedRoles`. Admins never render student pages and vice
versa (enforced in `router.jsx` + `ProtectedRoute`). Add a screen by: new `pages/` folder ->
entry in the route table -> entry in the `STUDENT_PAGES` / `ADMIN_PAGES` map in `router.jsx`.
`public/_redirects` makes deep links work after a hard refresh in production.

**Scaffolded endpoints.** Routers built via `createScaffoldRouter(...)` /
`createPlaceholderController(...)` return **501** until their CRUD phase is implemented.

**Storage driver.** `services/storageService.js` abstracts file storage. `local` writes to
`backend/uploads/` (gitignored except `.gitkeep`); `r2` signs S3-style requests to Cloudflare
R2. Stored paths look like `/resources/<file>` (local) or `r2://resources/...` (R2).

**AI.** `services/geminiClient.js` is the only thing that calls Gemini (REST, keyed by
`GEMINI_API_KEY`). Higher-level `aiService`, `courseGenerationService`, `quizService`,
`aiStudyToolsService` build prompts. All AI routes sit behind `aiRateLimiter` (20 req / 5 min).

**Pre-deploy checks.** `npm run validate:deployment` (both halves) enforces production env
rules — HTTPS `VITE_API_URL`, `NODE_ENV=production`, secret length, R2 vars when `STORAGE_DRIVER=r2`.
Expected to fail locally; that's fine.

## Git

- Local identity is set to `JMBjosemiguel` / `josemiguel.belleza.7@gmail.com`. Do not add
  `Co-Authored-By` trailers.
- Commit messages: one line, plain language, `AILA update <N> <short thing>` where `<N>` is the
  next number after the last `AILA update` commit in `git log` (e.g. `AILA update 4 planner fix`).
- Do not push; the maintainer pushes.
