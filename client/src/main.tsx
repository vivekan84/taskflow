import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { credentialsSchema, taskInputSchema, type TaskInput } from "@task-tracker/shared";
import { api, type ApiError, type Task, type TaskDraft, type User } from "./api";
import  TaskDetailsPage from "./pages/TaskDetailsPage";
import "./style.css";

export const queryClient = new QueryClient();
const AuthContext = createContext<{ user: User | null; setUser: (user: User | null) => void } | null>(null);
const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("Auth context is missing");
  return context;
};

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null)).finally(() => setLoaded(true));
  }, []);
  const authValue = useMemo(() => ({ user, setUser }), [user]);
  if (!loaded) return <div className="screen-loading"><span className="spinner" /> Loading Taskflow…</div>;
  return (
    <AuthContext.Provider value={authValue}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthPage mode="login" />} />
        <Route path="/register" element={user ? <Navigate to="/" replace /> : <AuthPage mode="register" />} />
        <Route element={user ? <AppLayout /> : <Navigate to="/login" replace />}>
          <Route path="/" element={<TaskListPage />} />
          <Route path="/tasks/new" element={<TaskFormPage />} />
          <Route path="/tasks/:id/edit" element={<TaskFormPage />} />
          <Route path="/tasks/:id" element={<TaskDetailsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthContext.Provider>
  );
}

function AppLayout() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      setUser(null);
      queryClient.clear();
      navigate("/login");
    }
  });
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/"><span className="brand-icon">✓</span> taskflow</Link>
        <div className="account">
          <span className="avatar">{user?.email.slice(0, 1).toUpperCase()}</span>
          <span className="account-email">{user?.email}</span>
          <button className="text-button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Logging out…" : "Log out"}
          </button>
        </div>
      </header>
      <main className="page-container"><Outlet /></main>
      <footer className="footer">Small steps, steady progress.</footer>
    </div>
  );
}

function TaskListPage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [banner, setBanner] = useState("");
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["tasks", status, search], queryFn: () => api.listTasks(status, search) });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<TaskDraft> }) => api.updateTask(String(id), patch),
    onSuccess: () => client.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (error) => setBanner(error.message)
  });
  const remove = useMutation({
    mutationFn: api.deleteTask,
    onSuccess: () => client.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (error) => setBanner(error.message)
  });
  const tasks = query.data ?? [];
  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">YOUR WORKSPACE</p><h1>My tasks</h1><p className="subtitle">A little progress each day adds up.</p></div>
        <Link className="button button-primary" to="/tasks/new"><span>＋</span> New task</Link>
      </div>
      {banner && <ErrorBanner message={banner} onClose={() => setBanner("")} />}
      <section className="task-card">
        <div className="toolbar">
          <label className="search-box"><span>⌕</span><input aria-label="Search tasks" placeholder="Search tasks…" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label>
          <label className="filter-control"><span>Filter</span><select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All tasks</option><option value="todo">To do</option><option value="in_progress">In progress</option><option value="on_hold">On hold</option><option value="done">Done</option>
          </select></label>
        </div>
        {query.isLoading ? <div className="state-message"><span className="spinner" /> Loading tasks…</div>
          : query.isError ? <div className="state-message error-text">Couldn’t load your tasks. <button className="text-button" onClick={() => query.refetch()}>Try again</button></div>
          : tasks.length === 0 ? <EmptyState filtered={Boolean(status || search)} />
          : <div className="table-scroll"><table><thead><tr><th className="check-col"></th><th>TASK</th><th>PRIORITY</th><th>STATUS</th><th>DUE DATE</th><th></th></tr></thead>
            <tbody>{tasks.map((task) => <TaskRow key={task.id} task={task}
              onToggle={() => update.mutate({ id: task.id, patch: { status: task.status === "done" ? "todo" : "done" } })}
              onDelete={() => { if (window.confirm(`Delete “${task.title}”? This cannot be undone.`)) remove.mutate(task.id); }}
            />)}</tbody></table></div>}
        {!query.isLoading && tasks.length > 0 && <div className="list-foot">{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</div>}
      </section>
    </>
  );
}

function TaskRow({ task, onToggle, onDelete }: { task: Task; onToggle: () => void; onDelete: () => void }) {
  const titleId = `task-${task.id}`;
  return <tr className={task.status === "done" ? "task-done" : ""}>
    <td className="check-col"><input id={titleId} type="checkbox" checked={task.status === "done"} onChange={onToggle} aria-label={`Mark ${task.title} ${task.status === "done" ? "not done" : "done"}`} /></td>
    <td className="task-title-cell"><label htmlFor={titleId}>{task.title}</label>{task.description && <small>{task.description}</small>}</td>
    <td><span className={`priority priority-${task.priority}`}><i />{task.priority}</span></td>
    <td><span className={`status status-${task.status}`}>{task.status.replace("_", " ")}</span></td>
    <td className="due-date">{task.dueDate ? new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"}</td>
    <td className="row-actions"><Link className="icon-button" aria-label={`View ${task.title}`} title="View task" to={`/tasks/${task.id}`}>👁</Link><Link className="icon-button" aria-label={`Edit ${task.title}`} title="Edit task" to={`/tasks/${task.id}/edit`}>↗</Link><button className="icon-button delete-action" aria-label={`Delete ${task.title}`} title="Delete task" onClick={onDelete}>×</button></td>
  </tr>;
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return <div className="empty-state"><div className="empty-art"><span>✓</span></div><h2>{filtered ? "No matching tasks" : "All clear for now"}</h2><p>{filtered ? "Try changing your search or filters." : "Create your first task and make some progress."}</p>{!filtered && <Link className="button button-primary" to="/tasks/new">Create a task</Link>}</div>;
}

function TaskFormPage() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const client = useQueryClient();
  const [banner, setBanner] = useState("");
  const taskQuery = useQuery({ queryKey: ["task", id], queryFn: () => api.getTask(id!), enabled: isEditing });
  const form = useForm<TaskInput>({
    resolver: zodResolver(taskInputSchema),
    values: taskQuery.data ? {
      title: taskQuery.data.title,
      description: taskQuery.data.description,
      status: taskQuery.data.status,
      priority: taskQuery.data.priority,
      dueDate: taskQuery.data.dueDate?.slice(0, 10) ?? ""
    } : undefined,
    defaultValues: { title: "", description: "", status: "todo", priority: "medium", dueDate: "" }
  });
  const mutation = useMutation({
    mutationFn: (data: TaskDraft) => isEditing ? api.updateTask(id!, data) : api.createTask(data),
    onSuccess: () => { client.invalidateQueries({ queryKey: ["tasks"] }); navigate("/"); },
    onError: (error: ApiError) => {
      setBanner(error.message);
      for (const [field, message] of Object.entries(error.fields ?? {})) {
        if (field in form.getValues()) form.setError(field as keyof TaskInput, { message });
      }
    }
  });
  if (isEditing && taskQuery.isLoading) return <div className="state-message"><span className="spinner" /> Loading task…</div>;
  if (isEditing && taskQuery.isError) return <div className="state-message error-text">Task not found or unavailable. <Link to="/">Return to tasks</Link></div>;
  const submit = form.handleSubmit((data) => {
    setBanner("");
    mutation.mutate({ ...data, description: data.description ?? "", dueDate: data.dueDate ?? "" });
  });
  return <div className="form-page">
    <Link className="back-link" to="/">← Back to tasks</Link>
    <div className="page-heading form-heading"><div><p className="eyebrow">{isEditing ? "MAKE IT BETTER" : "GET IT OUT OF YOUR HEAD"}</p><h1>{isEditing ? "Edit task" : "Create a task"}</h1><p className="subtitle">{isEditing ? "Update the details below." : "Break it down. You’ve got this."}</p></div></div>
    <form className="form-card" onSubmit={submit} noValidate>
      {banner && <ErrorBanner message={banner} onClose={() => setBanner("")} />}
      <Field label="Task title" error={form.formState.errors.title?.message}><input autoFocus placeholder="e.g. Plan the product launch" maxLength={120} {...form.register("title")} /></Field>
      <Field label="Description" hint="Optional · up to 1,000 characters" error={form.formState.errors.description?.message}><textarea rows={4} placeholder="Add a few details to help you get started…" maxLength={1000} {...form.register("description")} /></Field>
      <div className="form-grid">
        <Field label="Status" error={form.formState.errors.status?.message}><select {...form.register("status")}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="on_hold">On hold</option><option value="done">Done</option></select></Field>
        <Field label="Priority" error={form.formState.errors.priority?.message}><select {...form.register("priority")}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field>
      </div>
      <Field label="Due date" hint="Optional"><input type="date" {...form.register("dueDate")} /></Field>
      <div className="form-actions"><Link className="button button-quiet" to="/">Cancel</Link><button className="button button-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending && <span className="spinner spinner-light" />}{mutation.isPending ? "Saving…" : isEditing ? "Save changes" : "Create task"}</button></div>
    </form>
  </div>;
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return <label className="field"><span className="field-label">{label}{hint && <small>{hint}</small>}</span>{children}{error && <span className="field-error">{error}</span>}</label>;
}

function AuthPage({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [banner, setBanner] = useState("");
  const form = useForm<{ email: string; password: string }>({ resolver: zodResolver(credentialsSchema), defaultValues: { email: "", password: "" } });
  const mutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      isRegister ? api.register(email, password).then(() => api.login(email, password)) : api.login(email, password),
    onSuccess: (user) => {
      setUser(user);
      queryClient.invalidateQueries();
      const from = (location.state as { from?: string } | null)?.from ?? "/";
      navigate(from, { replace: true });
    },
    onError: (error: ApiError) => {
      setBanner(error.message);
      for (const [field, message] of Object.entries(error.fields ?? {})) {
        if (field === "email" || field === "password") form.setError(field, { message });
      }
    }
  });
  return <div className="auth-page">
    <div className="auth-panel">
      <Link to="/" className="brand auth-brand"><span className="brand-icon">✓</span> taskflow</Link>
      <div className="auth-heading"><p className="eyebrow">{isRegister ? "A FRESH START" : "WELCOME BACK"}</p><h1>{isRegister ? "Make room for progress." : "Good to see you again."}</h1><p>{isRegister ? "Create an account to keep your tasks in one calm place." : "Log in to pick up right where you left off."}</p></div>
      <form className="auth-form" onSubmit={form.handleSubmit((data) => { setBanner(""); mutation.mutate(data); })} noValidate>
        {banner && <ErrorBanner message={banner} onClose={() => setBanner("")} />}
        <Field label="Email address" error={form.formState.errors.email?.message}><input autoComplete="email" type="email" placeholder="you@example.com" {...form.register("email")} /></Field>
        <Field label="Password" hint={isRegister ? "At least 8 characters" : undefined} error={form.formState.errors.password?.message}><input autoComplete={isRegister ? "new-password" : "current-password"} type="password" placeholder="Enter your password" {...form.register("password")} /></Field>
        <button className="button button-primary auth-submit" type="submit" disabled={mutation.isPending}>{mutation.isPending && <span className="spinner spinner-light" />}{mutation.isPending ? "Please wait…" : isRegister ? "Create account" : "Log in"}<span>→</span></button>
      </form>
      <p className="auth-switch">{isRegister ? "Already have an account?" : "New to Taskflow?"} <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "Log in" : "Create an account"}</Link></p>
      <p className="auth-footnote">Your tasks are private and only visible to you.</p>
    </div>
    <div className="auth-aside"><div className="aside-glow" /><div className="aside-content"><div className="mini-card"><div className="mini-card-top"><span className="mini-dot" /> TODAY’S FOCUS</div><div className="mini-task"><span className="mini-check">✓</span><span>Make progress, not perfection</span></div><div className="mini-task muted"><span className="mini-circle" /><span>One thing at a time</span></div><div className="progress-track"><span /></div><small>YOU’RE DOING GREAT</small></div><p className="aside-quote">“The secret of getting ahead is getting started.”</p><span className="aside-credit">— Mark Twain</span></div></div>
  </div>;
}

function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="error-banner" role="alert"><span>!</span><p>{message}</p><button aria-label="Dismiss error" onClick={onClose}>×</button></div>;
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></React.StrictMode>
  );
}
