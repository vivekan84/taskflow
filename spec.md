# Task Tracker CRUD App: Project Spec

Nov 18, 2026 · @Ananthan

A small task tracker where users create, view, edit and delete tasks, built as a React single-page app talking to a Node.js (Express) REST API backed by PostgreSQL. The domain (tasks) is an assumption, now confirmed. Users sign up and log in, and each user sees only their own tasks.

## Scope

Version 1 covers full create, read, update and delete on one entity, with no login.

**In scope**

- List all tasks, with filter by status and search by title
- Create, edit and delete a task
- Mark a task done or not done from the list
- Server-side validation and clear error messages
- Local development with one command per service

* Sign up, log in and log out with email and password
* Each user sees and changes only their own tasks

**Out of scope for v1**

- Password reset by email, social login and admin roles
- File uploads, comments, tags and due-date reminders
- Real-time sync, offline mode and mobile apps
- Hosting and deployment: v1 runs locally only

## Architecture

&#91;embedded content: architecture · 3 components\]

The browser never reaches the database: every read or write goes through a REST call that the API validates first.

## Tech stack

Each layer uses one mainstream tool, so a single developer can build and run the whole app.

| Layer | Choice | Why |
| --- | --- | --- |
| Front end | React with Vite and TypeScript | Fast dev server, simple build |
| Routing | React Router | Standard for multi-page SPAs |
| Server state | TanStack Query | Handles fetching, caching and refetch after changes |
| Forms | React Hook Form with Zod | Shared validation rules with the API |
| Back end | Node.js with Express and TypeScript | Minimal REST API, widely known |
| Database | PostgreSQL | Reliable relational store |
| Data access | Prisma | Typed queries and migrations |
| Testing | Vitest and Supertest | API tests plus component tests |
| Tooling | ESLint, Prettier, dotenv | Consistent code and config |
| Auth | bcrypt and JWT in an httpOnly cookie | Hashed passwords; token not readable by page scripts |

## Data model

One table, `tasks`, holds the task data; a second table, users, holds accounts.

| Field | Type | Rules |
| --- | --- | --- |
| id | integer, auto-increment | Primary key |
| title | string | Required, 1 to 120 characters |
| description | text | Optional, up to 1,000 characters |
| status | enum: `todo`, `in_progress`, `on_hold`, `done` | Required, defaults to `todo` |
| priority | enum: `low`, `medium`, `high` | Required, defaults to `medium` |
| dueDate | date | Optional |
| createdAt | timestamp | Set by the database on insert |
| updatedAt | timestamp | Updated on every change |

Each task also has a `userId` (integer, required, foreign key to `users.id`) that the server sets from the logged-in user.

**users table**

| Field | Type | Rules |
| --- | --- | --- |
| id | integer, auto-increment | Primary key |
| email | string | Required, unique, stored lowercase, valid email format |
| passwordHash | string | Required, bcrypt hash; the plain password is never stored |
| createdAt | timestamp | Set by the database on insert |

## REST API

Five JSON endpoints under `/api/tasks` cover all CRUD operations.

| Operation | Method and path | Success | Notes |
| --- | --- | --- | --- |
| List | `GET /api/tasks` | 200 + array | Query params: `status`, `q` (title search), `page`, `limit` |
| Read one | `GET /api/tasks/:id` | 200 + task | 404 if missing |
| Create | `POST /api/tasks` | 201 + created task | Body validated; 400 on bad input |
| Update | `PATCH /api/tasks/:id` | 200 + updated task | Partial body; 400 or 404 on failure |
| Delete | `DELETE /api/tasks/:id` | 204, no body | 404 if missing |

Auth endpoints sit under `/api/auth`. Every `/api/tasks` route requires a logged-in user, returns 401 otherwise, and works only on that user's tasks.

| Operation | Method and path | Success | Notes |
| --- | --- | --- | --- |
| Register | `POST /api/auth/register` | 201 + user | 400 on bad input; 409 if the email is taken |
| Log in | `POST /api/auth/login` | 200 + user, sets session cookie | 401 on wrong email or password |
| Log out | `POST /api/auth/logout` | 204, clears cookie |  |
| Current user | `GET /api/auth/me` | 200 + user | 401 if not logged in |

Error responses share one shape: `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": { "title": "Required" } } }`. A `GET /api/health` endpoint returns 200 for uptime checks.

## UI screens

Five routes make up the app; the list page does most of the work.

| Route | Screen | What it does |
| --- | --- | --- |
| `/` | Task list | Table of tasks with status filter, title search, a done checkbox, and edit and delete buttons |
| `/tasks/new` | Create form | Fields for every editable property; saves and returns to the list |
| `/tasks/:id/edit` | Edit form | Same form, prefilled; saves and returns to the list |

Two public routes complete the app: `/login` and `/register`, each a single form. A logged-out visitor to any other route is redirected to `/login`, and the header shows the user's email with a Log out button.

Shared behavior:

- Delete asks for confirmation in a dialog before calling the API
- Buttons show a loading state while a request runs
- Empty list shows a short message and a "New task" button
- A failed request shows a dismissible error banner; field errors appear under their inputs
- Layout works from phone width up to desktop

## Validation and error handling

The API is the source of truth for validation; the form repeats the same rules for fast feedback.

- Define the Zod schema once and reuse it in the Express route and the React form (a shared package or copied file)
- Reject unknown fields and trim whitespace on strings before saving
- Map failures to status codes: 400 validation, 404 not found, 500 unexpected
- Centralize errors in one Express error-handling middleware that returns the shared error shape
- Log server errors with a request ID; never return stack traces to the client
- Use parameterized queries through Prisma only, with no string-built SQL
- Enable CORS for the front-end origin only, and set security headers with Helmet

* Require passwords of at least 8 characters, hash them with bcrypt before saving, and never log them
* Send the session token as an httpOnly, SameSite cookie, not in localStorage
* Put a `requireAuth` middleware on every `/api/tasks` route and filter every query by the logged-in user's id, so another user's task returns 404
* Rate-limit the login endpoint
* Allow CORS with credentials for the front-end origin only

## Folder structure

One repository with two apps keeps setup simple and lets both sides share the validation schema.

```
task-tracker/
├── client/                 # React app (Vite)
│   └── src/
│       ├── api/            # fetch helpers and TanStack Query hooks
│       ├── components/     # TaskTable, TaskForm, AuthForm, ConfirmDialog
│       ├── pages/          # TaskListPage, NewTaskPage, EditTaskPage, LoginPage, RegisterPage
│       └── main.tsx
├── server/                 # Express API
│   ├── prisma/             # schema.prisma and migrations
│   └── src/
│       ├── routes/         # tasks.routes.ts, auth.routes.ts
│       ├── controllers/    # tasks and auth controllers
│       ├── middleware/     # requireAuth.ts, errorHandler.ts, validate.ts
│       ├── app.ts
│       └── server.ts
├── shared/                 # Zod schemas used by both sides
├── .env.example
└── README.md
```

## Build plan

Eight milestones, each ending in something that runs. Rough effort for one developer is about 6 to 8 days.

1. **Setup:** create the repo, scaffold `client` and `server` in TypeScript, add linting, and connect to a local PostgreSQL database.
2. **Database:** write the Prisma schema for `users` and `tasks`, run the first migration, and add a seed script.
3. **Auth API:** build register, log in, log out and current-user endpoints with bcrypt, a JWT session cookie and a `requireAuth` middleware, with Supertest tests.
4. **Tasks API:** build the five task endpoints scoped to the logged-in user, with Zod validation and the error middleware, with Supertest tests for each.
5. **Login and register screens:** build both forms, keep the logged-in user in React state, and redirect logged-out visitors to `/login`.
6. **List screen:** fetch and display tasks, add status filter, search and the done toggle.
7. **Forms:** build create and edit pages, delete with confirmation, and field-level errors.
8. **Polish:** add loading and empty states, write the README, and test the full flow by hand with two accounts.

Stretch: containerize with Docker Compose and add GitHub Actions for tests.

## Acceptance criteria

v1 is done when every item below passes.

- [ ] A new task created in the form appears in the list without a page reload
- [ ] Editing a task updates its row and keeps the changes after a refresh
- [ ] Deleting a task removes it only after the user confirms
- [ ] Submitting an empty title shows an error under the field and saves nothing
- [ ] The status filter and title search narrow the list correctly
- [ ] Requesting a missing task ID returns 404 with the standard error shape
- [ ] API tests cover all five endpoints, including one failure case each
- [ ] A new developer can run the app locally by following the README alone

* [ ] A visitor can register, log in and log out; a wrong password returns 401 without saying which field was wrong
* [ ] Opening the list while logged out redirects to the login page
* [ ] User A cannot read, edit or delete user B's tasks (the API returns 404)
* [ ] Passwords exist in the database only as bcrypt hashes

## Decisions

- Entity: task tracker
- Accounts: email and password login from the start
- Database: PostgreSQL
- Language: TypeScript on both the client and the server
- Hosting: local only, with no deployment in v1

Still open: how long a login lasts (assumed 7 days) and the minimum password length (assumed 8 characters).