export type User = { id: number; email: string };
export type Task = {
  id: number;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "on_hold" | "done";
  priority: "low" | "medium" | "high" | "critical";
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};
export type TaskDraft = {
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  dueDate: string;
};
export type ApiError = Error & { fields?: Record<string, string> };

const apiBase = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = new Error(body?.error?.message ?? "Request failed") as ApiError;
    error.fields = body?.error?.fields;
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<User>("/auth/me"),
  login: (email: string, password: string) =>
    request<User>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) =>
    request<User>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  listTasks: (status: string, q: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    return request<Task[]>(`/tasks${params.size ? `?${params}` : ""}`);
  },
  getTask: (id: string) => request<Task>(`/tasks/${id}`),
  createTask: (task: TaskDraft) => request<Task>("/tasks", { method: "POST", body: JSON.stringify(task) }),
  updateTask: (id: string, task: TaskDraft | Partial<TaskDraft>) =>
    request<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(task) }),
  deleteTask: (id: number) => request<void>(`/tasks/${id}`, { method: "DELETE" })
};
