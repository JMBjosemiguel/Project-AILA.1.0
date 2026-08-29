# AILA Backend

Express.js backend foundation for AILA.

## Setup

1. Copy `.env.example` to `.env`.
2. Update database and JWT values.
3. Import `../database/schema.sql` and `../database/seed.sql` into MySQL/MariaDB.
4. Run the backend:

```bash
npm run dev
```

## Auth Routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

All non-auth modules are scaffolded and return `501 Not Implemented` until their CRUD phase is built.
