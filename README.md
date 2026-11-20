# Taskflow

A private task tracker with a React + TypeScript frontend, Express API, Prisma, and PostgreSQL. Docker Compose starts the complete local stack.

## Run with Docker

1. Copy `.env.example` to `.env` and set a unique `JWT_SECRET` (at least 32 random characters).
2. From the project root, run:

   ```sh
   docker compose up --build
   ```

3. Open [http://localhost:5173](http://localhost:5173). The API health check is at [http://localhost:3001/api/health](http://localhost:3001/api/health).

Compose starts PostgreSQL, waits for its health check, initializes the schema with Prisma, then starts the API and Vite frontend. Data is persisted in the `postgres_data` volume.

## Run without Docker

Install Node.js 22+ and PostgreSQL, create a database, copy `.env.example` to `.env`, update `DATABASE_URL` and `JWT_SECRET`, then run:

```sh
npm install
npx prisma db push --schema server/prisma/schema.prisma
npm run dev
```

The client runs on port 5173 and the API on port 3001. For a production build, run `npm run build`.

## Tests

Automated tests use a separate, disposable PostgreSQL database. Never point `TEST_DATABASE_URL` at your normal app database or production.

```sh
# Create this database once in the Compose PostgreSQL instance:
docker compose exec db createdb -U task_tracker -O task_tracker task_tracker_test

export TEST_DATABASE_URL='postgresql://task_tracker:task_tracker@localhost:5432/task_tracker_test?schema=public'
npm run test:ci
npx playwright install chromium
npm run test:e2e
```

`npm run test:ci` runs type checks, shared-schema unit tests, API integration tests, React component tests, and the production build. `npm run test:e2e` runs Playwright in Chromium; it starts the API and client and applies the Prisma schema to the test database. `npm run test:coverage` writes an HTML coverage report under `coverage/`.

The GitHub Actions workflow runs the required checks for every push and pull request. Load tests are isolated in their own temporary Compose project:

```sh
npm run test:load:smoke
npm run test:load:baseline
```

The smoke profile runs with one virtual user; baseline ramps up to five. Both profiles remove their temporary database container/volume on completion and write `load-summary.json`. The baseline load test also runs on a weekday schedule in GitHub Actions.

## Features

- Email/password registration and login with bcrypt-hashed passwords and a seven-day httpOnly session cookie.
- Tasks are private to the logged-in user; API reads and writes are owner-scoped.
- Create, edit, delete, status toggle, priority and due date, title search, and status filtering.
- Shared Zod validation, field-level errors, request error responses, Helmet, and credentialed CORS restricted to the configured client origin.

For local development only, Compose supplies a development database password and fallback JWT secret. Use your own secrets outside local development.
