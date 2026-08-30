# AILA Cloud Deployment Guide

This guide deploys the current AILA system without redesigning the app or changing its core stack.

Target architecture:

```text
Student / QA / Adviser
  -> Cloudflare Pages React frontend
  -> Render Node.js/Express API
  -> Aiven MySQL
  -> Cloudflare R2 private resource files
  -> Gemini API from the backend only
```

## 1. Prerequisites

- GitHub repository access.
- Cloudflare account for Pages and R2.
- Render account for the backend web service.
- Aiven account with a MySQL service.
- Gemini API key from Google AI Studio.
- Node.js 20 or newer locally.
- Local MySQL/XAMPP only for development or exporting current data.

Never commit real values for `GEMINI_API_KEY`, `JWT_SECRET`, database passwords, R2 credentials, or QA passwords.

## 2. GitHub Setup

1. Commit deployment-readiness changes to `main`.
2. Keep `.env` and `backend/.env` local only.
3. Verify `.gitignore` excludes `node_modules`, `dist`, `.env`, and `backend/uploads/*`.
4. Use `main` as the deployable branch.
5. Use feature branches for future work after the first cloud release.

## 3. Aiven MySQL Setup

1. Create an Aiven MySQL service.
2. Create or select database `aila_db`.
3. Save the connection values:
   - host
   - port
   - user
   - password
   - database
   - CA certificate, if Aiven provides one
4. Use SSL in production by setting `DB_SSL=true`.

## 4. Database Import and Migration

Do not run `database/schema.sql` against a managed/cloud database. It contains
`CREATE DATABASE aila_db` + `USE aila_db` + a `DROP TABLE` reset block, so on Aiven it
either creates a stray `aila_db` schema or fails. Use `database/production_schema.sql`
instead — same tables, no database/USE/DROP statements.

For a fresh cloud database (full runbook in `database/AIVEN_MIGRATION.md`):

1. In the Aiven console, note the pre-created database name (for AILA it is `project-aila`).
2. Connect with that database selected and import `database/production_schema.sql`.
3. Import `database/production_baseline.sql` into the same database.
4. Create one admin account deliberately (private bcrypt hash — see the runbook). Do not
   commit the password or hash.
5. Never import `database/seed.sql` in production. `indexes.sql` / `constraints.sql` are
   not needed after `production_schema.sql`.

For migrating existing local data:

1. Export a full backup from local MySQL/phpMyAdmin.
2. Keep a second export with data only.
3. Review user rows and remove local demo accounts if needed.
4. Import schema into Aiven once.
5. Import reviewed data.
6. Verify row counts for users, subjects, resources, planner tasks, chats, quizzes, and feedback.

## 5. Cloudflare R2 Setup

1. Create a private R2 bucket, for example `aila-resources`.
2. Do not make the bucket public.
3. Create an R2 API token or access key with object read/write/delete permission for this bucket.
4. Save:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`
   - `R2_ENDPOINT`
5. Existing local files in `backend/uploads/` are not automatically migrated. Re-upload them through AILA or copy them to R2 and update `resources.file_path` to `r2://resources/...`.

## 6. Render Backend Setup

Manual setup:

1. Create a new Render Web Service from the GitHub repo.
2. Set root directory to `backend`.
3. Build command: `npm ci && npm run validate:deployment`.
4. Start command: `npm start`.
5. Health check path: `/health`.
6. Add backend environment variables from `backend/.env.example`.
7. Deploy and verify `https://your-render-service.onrender.com/health`.

Blueprint setup:

1. Use `render.yaml` from the repo.
2. Fill every `sync: false` environment variable in Render.
3. Confirm `APP_URL` and `CORS_ORIGINS` match the final Cloudflare Pages URL.

## 7. Cloudflare Pages Frontend Setup

1. Create a Pages project from the GitHub repo.
2. Production branch: `main`.
3. Framework preset: Vite.
4. Build command: `npm ci && npm run validate:deployment && npm run build`.
5. Build output directory: `dist`.
6. Add frontend environment variable:
   - `VITE_API_URL=https://your-render-service.onrender.com/api`
7. Deploy.

`public/_redirects` is included so browser refresh works for routes such as `/student/dashboard`, `/student/resources`, and `/admin`.

## 8. Environment Variables

Frontend:

```env
VITE_API_URL=https://your-render-service.onrender.com/api
```

Backend:

```env
NODE_ENV=production
PORT=5000
APP_URL=https://your-cloudflare-pages-site.pages.dev
CORS_ORIGINS=https://your-cloudflare-pages-site.pages.dev

DB_HOST=your-aiven-host                # e.g. project-aila-xxx.a.aivencloud.com
DB_PORT=your-aiven-port                # Aiven assigns a custom port, NOT 3306
DB_USER=avnadmin
DB_PASSWORD=your-aiven-password
DB_NAME=project-aila                   # exact database name from the Aiven console
DB_CONNECTION_LIMIT=5
DB_SSL=true                            # Aiven requires TLS
DB_SSL_CA=your-aiven-ca-certificate    # paste ca.pem contents; use \n for newlines
DB_SSL_REJECT_UNAUTHORIZED=true

JWT_SECRET=long-random-secret
JWT_EXPIRES_IN=1d
BCRYPT_SALT_ROUNDS=10

GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.5-flash
GEMINI_TIMEOUT_MS=30000

STORAGE_DRIVER=r2
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET=aila-resources
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
```

## 9. CORS Configuration

Set `APP_URL` to the production frontend origin.

Use `CORS_ORIGINS` for multiple allowed origins, separated by commas. Example:

```env
CORS_ORIGINS=https://aila.pages.dev,https://preview-branch.aila.pages.dev
```

Do not use `*` with authenticated requests.

## 10. Gemini API Configuration

- The Gemini key belongs only in the backend environment.
- The frontend must never contain `GEMINI_API_KEY`.
- Confirm AI features fail gracefully if quota is exhausted.
- Use Render logs to inspect Gemini errors without exposing the key.

## 11. QA Account Creation

Create a dedicated QA student account after the production database is ready.

Recommended:

- Email: `qa@aila.test` or adviser-approved address.
- Role: `student`.
- Data: isolated QA-only courses, resources, planner tasks, quizzes, chats, and feedback.
- Password: generated privately and shared only through an approved secure channel.

Do not commit the QA password or password hash.

Use the admin reset progress action when the QA account needs to be reused.

## 12. Guest Access Behavior

AILA does not currently have a true guest role.

Public access should be limited to:

- Login page.
- Registration page.

Student features, admin features, uploaded files, chats, courses, planner tasks, quizzes, and learning progress must require authentication.

## 13. Production Testing

Run these checks before sharing the public URL:

1. Frontend route loads.
2. Refresh works on `/student/dashboard`.
3. Refresh works on `/admin`.
4. Backend `/health` returns JSON status.
5. Registration creates a student account.
6. Login returns a JWT and restores session.
7. Student cannot access `/api/admin/dashboard`.
8. Student A cannot open Student B lessons by id.
9. Student A cannot download Student B resources by id.
10. QA can upload PDF/DOC/DOCX/PPT/PPTX/image resources.
11. QA can open/download uploaded files.
12. File object is stored in R2, not Render local disk.
13. Resource delete removes or hides the database row and deletes the storage object.
14. Gemini chat works from the deployed backend.
15. Course generation works.
16. Planner create/update/delete works.
17. Quiz generation and submission works.
18. Admin account can list users/resources/courses.
19. Admin can open/download a student resource.
20. No secrets appear in browser devtools bundled JavaScript.

## 14. Troubleshooting

- `CORS` error: verify `APP_URL` and `CORS_ORIGINS` exactly match the frontend origin.
- `Unable to reach server`: verify `VITE_API_URL` includes `/api`.
- `JWT_SECRET is required`: set backend secret in Render.
- Database connection failure: verify Aiven host, port, password, database name, and SSL values.
- Upload works but download fails: verify `STORAGE_DRIVER=r2` and R2 credentials.
- Refresh returns 404 on frontend routes: verify `_redirects` exists in Cloudflare Pages build output.
- Gemini returns 503/429: verify API key, quota, model, and billing/free-tier limits.
