# Taskflow Test Automation Specification

## 1. Purpose

Create a repeatable test system that checks the Taskflow app on every code change, catches regressions, verifies complete user journeys, and periodically measures API performance.

The automation described here is implemented in the repository. This document records the test strategy and how to extend it safely.

## 2. Current baseline

- The project is an npm-workspaces monorepo with a React/Vite client, Express API, shared Zod schemas, Prisma, and PostgreSQL.
- Vitest and Supertest are installed. The server has API integration tests in `server/test/api.test.ts`.
- The root scripts expose typecheck, unit, API, component, E2E, coverage, CI, and load-test commands.
- `npm test` runs the deterministic CI test pipeline; `TEST_DATABASE_URL` is required for database-backed suites.
- GitHub Actions runs the CI suite on pushes and pull requests; a separate workflow supports scheduled/manual load tests.
- ESLint is not configured; TypeScript checks and production builds are the current static gates.
- The task enums include `todo`, `in_progress`, `on_hold`, `done` and priorities `low`, `medium`, `high`, `critical`. Tests must track the shared schema, Prisma schema, API validation, and UI options together.

## 3. Proposed test layers

Use the test pyramid: many fast unit tests, focused API and component tests, a smaller number of browser journeys, and a separate performance suite.

| Layer | Tool | Purpose | Run frequency |
|---|---|---|---|
| Static checks | TypeScript; add ESLint if desired | Catch type and style problems | Every PR and push |
| Unit | Vitest | Validate shared schemas and isolated logic | Every PR and push |
| API integration | Vitest + Supertest + PostgreSQL | Verify HTTP behavior, persistence, auth, and ownership | Every PR and push |
| Component | Vitest + React Testing Library + jsdom | Verify forms, errors, filters, and user interactions | Every PR and push |
| Browser E2E | Playwright | Verify complete workflows in Chromium | Every PR and push |
| Load/performance | k6 | Measure API throughput, latency, and error rate | Manual and scheduled; not a normal PR gate |

## 4. Exact behavior and regression coverage

Tests should assert externally observable behavior (status codes, response JSON, database state, rendered UI), not private implementation details such as component state names or exact helper call counts.

### 4.1 Shared schema unit tests

Create focused tests for the schemas in `shared/src/index.ts`:

- Task title is required, trimmed, and limited to 120 characters.
- Description is optional, trimmed, and limited to 1,000 characters.
- All supported statuses parse: `todo`, `in_progress`, `on_hold`, `done`.
- All supported priorities parse: `low`, `medium`, `high`, `critical`.
- Unknown task fields are rejected.
- Defaults are `todo`, `medium`, empty description, and no due date.
- Empty due date is accepted; malformed dates and invalid enum values are rejected.
- Email is normalized to lowercase; malformed email and passwords shorter than 8 characters are rejected.
- Patch validation accepts partial valid updates and rejects empty/unknown/invalid updates as specified.

Treat these as regression tests for the recent enum mismatch: a task with status `on_hold` and priority `critical` must pass shared validation and be saveable through the UI and API.

### 4.2 API integration tests

Run against a disposable PostgreSQL test database, not a developer's normal database.

**Authentication**

- Register: valid account returns 201; email is stored lowercase; password is stored as a bcrypt hash and never returned.
- Invalid email/password returns 400 with the shared error shape; duplicate email returns 409.
- Login: valid credentials return 200 and set an httpOnly, SameSite cookie; wrong email and wrong password have the same 401 message.
- Login rate limiting returns the expected rate-limit response after the configured threshold.
- Logout clears the cookie; `/api/auth/me` returns the current user for a valid session and 401 otherwise.

**Tasks**

- Unauthenticated requests to every `/api/tasks` endpoint return 401.
- Create validates required title, limits, enum values (including `on_hold` and `critical`), unknown fields, whitespace trimming, and due date; successful creation returns 201 and persists defaults.
- List returns only the current user's tasks; status and case-insensitive title filters work; page and limit are bounded and applied.
- Read returns 200 for an owned task and the standard 404 shape for a missing or other-user task.
- Patch updates only supplied fields, persists changes, rejects invalid/unknown/empty bodies, and returns 404 for missing or other-user tasks.
- Delete returns 204 for an owned task, then 404 on a subsequent read; deleting another user's task returns 404 and leaves it intact.
- Malformed JSON and invalid query values return a client error with the shared error shape.
- Health endpoint returns 200.

Use two generated test users for isolation checks. Give test records unique identifiers and clean them up in `afterEach`/`afterAll`, even when assertions fail. Do not depend on test ordering or pre-existing database content.

### 4.3 Component tests

Add React Testing Library tests around user-visible behavior:

- Create and edit forms show required/length errors and keep invalid submissions from saving.
- Edit form loads the current task; a valid edit submits changes, including `on_hold` and `critical`.
- API field errors render under the corresponding input; request failures show a dismissible banner.
- Save buttons disable/show progress while a request is pending.
- Task list renders loading, empty, error, and populated states.
- Search and status filters update the displayed rows; the status filter includes `on_hold`.
- Done toggle updates the status; edit/delete controls act on the selected row.
- Delete cancellation sends no request; confirmation deletes the task.
- Auth forms validate input and display generic login failure feedback.

Mock network boundaries for component tests. Keep persistence, cookie, and ownership behavior in API integration/E2E tests.

### 4.4 Browser E2E and acceptance tests

Use Playwright against the full app and an isolated PostgreSQL database. Cover at least:

1. A logged-out visitor opening `/` is redirected to `/login`.
2. A user registers, logs in, sees their email, and can log out.
3. User A creates a task; it appears without a page reload.
4. User A edits title, description, status (including `on_hold`), priority (including `critical`), and due date; values remain after refresh.
5. Search and status filters narrow results correctly.
6. Done checkbox toggles between done and not done.
7. Canceling delete preserves the task; confirming delete removes it.
8. Empty title and invalid form values show field errors and do not save.
9. User B cannot see or change User A's task; direct API attempts return 404.
10. Requesting a missing task displays a useful error/return path.
11. Layout and core task actions work at a narrow phone viewport and desktop viewport.

Use accessible labels/roles in tests. Avoid brittle selectors based on CSS class names, generated IDs, or exact visual layout.

Save Playwright traces, screenshots, and browser logs as CI artifacts on failure. Keep the default PR browser matrix small (for example Chromium); run additional browsers on a schedule or before releases.

## 5. Load and performance test plan

Use k6 against a dedicated local/CI Compose project with a disposable database. Do not load test production or a developer database. Keep load tests out of the default PR gate to avoid noisy results and unnecessary runtime.

### Scenarios

- **Smoke:** 1 virtual user for 30 seconds; health, login, list, create, read, patch, delete.
- **Baseline:** Ramp 1 → 5 → 10 virtual users for approximately 3–5 minutes; mix authenticated list/search/filter reads with a smaller share of task writes.
- **Soak (scheduled/manual):** 5 virtual users for 10–15 minutes to detect growing latency, memory, or database issues.

Authenticate once per virtual user or reuse a test-only session created for that VU. Do not repeatedly hit login at load because the login endpoint is intentionally rate-limited. Use uniquely named test tasks and clean them up, or discard the isolated test database after the run.

Initial thresholds (tune after measuring a local baseline):

- HTTP failure rate below 1%.
- API read p95 below 500 ms.
- API write p95 below 750 ms.
- No unexpected 5xx responses.

Record VUs, duration, request mix, environment, database size, p50/p95/p99 latency, throughput, and failure rate with each run. A threshold failure should block release readiness, not routine development, until a stable baseline is agreed.

## 6. Automation triggers and CI workflow

Create a GitHub Actions workflow for pushes and pull requests targeting the default branch. The workflow should:

1. Check out the code and use the Node version from project documentation.
2. Run `npm ci`.
3. Start an ephemeral PostgreSQL service with a dedicated test database and health check.
4. Set test-only `DATABASE_URL` and `JWT_SECRET` values; never use production secrets.
5. Generate Prisma Client from `server/prisma/schema.prisma` and apply the schema to the test database.
6. Run static checks, unit tests, API integration tests, component tests, and `npm run build`.
7. Start the app for Playwright, run the PR E2E smoke suite, and upload traces/screenshots on failure.
8. Fail the check on any required step failure; do not mark skipped or flaky tests as successful.

Recommended trigger policy:

| Trigger | Required checks |
|---|---|
| Pull request | Static checks, unit, API integration, component, build, core Playwright journeys |
| Push to default branch | Same required checks as PR |
| Nightly schedule | Full browser suite, broader E2E, baseline/soak load test |
| Manual workflow dispatch | Load test and release smoke suite |

Add path filters only after the workflow is reliable. Changes under `shared/`, `server/`, `client/`, Prisma schema, Docker, or workflow configuration must run the full relevant checks.

## 7. Test data and environment rules

- Use a separate database name/URL for automated tests; fail fast if a test is pointed at a known production database.
- Start from a clean database for CI. Do not use production dumps or real personal data.
- Generate unique emails/task titles per test run.
- Tests must be repeatable independently and safe to run in parallel, or explicitly serialize tests that share a database.
- Do not log passwords, JWTs, cookies, or database credentials.
- Load-test secrets and users must be disposable and confined to the test environment.
- Prefer Prisma migrations for durable schema history. Until migrations are added, `prisma db push` is acceptable only against the isolated test database.

## 8. Available scripts

The implemented root scripts are:

```text
npm run typecheck
npm run test:unit
npm run test:api
npm run test:components
npm run test:e2e
npm run test:e2e:ui
npm run test:coverage
npm run test:ci
npm run test:load:smoke
npm run test:load:baseline
```

The API and E2E runners require `TEST_DATABASE_URL` to point to a disposable database. They apply the Prisma schema before tests. Load-test scripts create a unique Compose project and remove its containers and database volume after completion.

## 9. Implemented scope and next steps

Implemented: isolated test DB runners, schema unit tests, React form component tests, API integration tests, Playwright CRUD/auth/isolation journeys, k6 smoke/baseline profiles, and CI/scheduled workflow definitions.

Next: watch the initial CI and scheduled load-test results, tune thresholds against repeated clean runs, and add tests as new acceptance criteria or defects are introduced. ESLint and additional browser engines can be added if needed.

## 10. Definition of done

- A clean install can run every required local test command after installing Chromium.
- CI is configured to run required checks on every PR and push.
- Test failures include enough logs/artifacts to diagnose, without exposing secrets.
- API tests cover each auth/task endpoint and at least one failure case per operation.
- Regression tests prove `on_hold` and `critical` work end-to-end through schema validation, API persistence, and edit form save.
- Browser acceptance tests cover CRUD, authentication, filters, persistence, delete confirmation, and user isolation.
- Load tests are isolated in a uniquely named temporary Compose project, have documented thresholds, and are not accidentally run against production.
- README documents prerequisites, commands, environment variables, and how to inspect failed CI artifacts.
