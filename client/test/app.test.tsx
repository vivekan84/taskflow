// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App, queryClient } from "../src/main";
import { api, type Task, type User } from "../src/api";

vi.mock("../src/api", () => ({
  api: {
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    listTasks: vi.fn(),
    getTask: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn()
  }
}));

const mockedApi = vi.mocked(api);
const user: User = { id: 8, email: "tester@example.test" };
const task: Task = {
  id: 21,
  title: "Review the launch plan",
  description: "Confirm the checklist",
  status: "on_hold",
  priority: "critical",
  dueDate: "2026-12-01T00:00:00.000Z",
  createdAt: "2026-11-18T00:00:00.000Z",
  updatedAt: "2026-11-18T00:00:00.000Z"
};

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  queryClient.clear();
  vi.resetAllMocks();
  mockedApi.me.mockRejectedValue(new Error("Not logged in"));
  mockedApi.listTasks.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe("Taskflow forms", () => {
  it("shows field errors and does not submit invalid login data", async () => {
    const userActions = userEvent.setup();
    renderAt("/login");

    await userActions.click(await screen.findByRole("button", { name: /Log in/ }));

    expect(await screen.findByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(mockedApi.login).not.toHaveBeenCalled();
  });

  it("loads and saves an edit with the new status and priority values", async () => {
    const userActions = userEvent.setup();
    mockedApi.me.mockResolvedValue(user);
    mockedApi.getTask.mockResolvedValue(task);
    mockedApi.updateTask.mockResolvedValue({ ...task, title: "Updated launch plan" });
    renderAt("/tasks/21/edit");

    const title = await screen.findByDisplayValue(task.title);
    expect(screen.getByLabelText("Status")).toHaveValue("on_hold");
    expect(screen.getByLabelText("Priority")).toHaveValue("critical");
    await userActions.clear(title);
    await userActions.type(title, "Updated launch plan");
    await userActions.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockedApi.updateTask).toHaveBeenCalledWith("21", {
        title: "Updated launch plan",
        description: task.description,
        status: "on_hold",
        priority: "critical",
        dueDate: "2026-12-01"
      });
    });
  });
});
