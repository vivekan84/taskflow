import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const createdEmails: string[] = [];

async function registerAndLogin(page: import("@playwright/test").Page) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  createdEmails.push(email);
  await page.goto("/register");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel(/Password/).fill("e2e-password-123");
  await page.getByRole("button", { name: /Create account/ }).click();
  await expect(page.getByRole("heading", { name: "My tasks" })).toBeVisible();
  return email;
}

async function createTask(
  page: import("@playwright/test").Page,
  title: string,
  status = "todo",
  priority = "medium"
) {
  await page.getByRole("link", { name: /New task/ }).click();
  await page.getByLabel("Task title").fill(title);
  await page.getByLabel("Status").selectOption(status);
  await page.getByLabel("Priority").selectOption(priority);
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

test.afterEach(async () => {
  if (createdEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: [...createdEmails] } } });
    createdEmails.length = 0;
  }
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("redirects logged-out visitors to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Good to see you again." })).toBeVisible();
});

test("registers an account and logs out", async ({ page }) => {
  const email = await registerAndLogin(page);
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("creates, edits, and persists task fields including on_hold and critical", async ({ page }) => {
  await registerAndLogin(page);
  await createTask(page, "Review launch plan", "on_hold", "critical");

  await page.getByRole("link", { name: "Edit Review launch plan" }).click();
  await page.getByLabel("Task title").fill("Updated launch plan");
  await page.getByLabel("Description").fill("Keep this change after refresh");
  await page.getByLabel("Due date").fill("2026-12-01");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Updated launch plan", { exact: true })).toBeVisible();
  await expect(page.getByText("critical", { exact: true })).toBeVisible();
  await expect(page.getByText("on hold", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Updated launch plan", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Edit Updated launch plan" }).click();
  await expect(page.getByLabel("Status")).toHaveValue("on_hold");
  await expect(page.getByLabel("Priority")).toHaveValue("critical");
  await expect(page.getByLabel("Description")).toHaveValue("Keep this change after refresh");
});

test("searches and filters tasks", async ({ page }) => {
  await registerAndLogin(page);
  await createTask(page, "Searchable paused item", "on_hold", "critical");
  await createTask(page, "Searchable normal item", "todo", "low");

  await page.getByLabel("Search tasks").fill("Searchable");
  await page.getByLabel("Filter by status").selectOption("on_hold");
  await expect(page.getByText("Searchable paused item", { exact: true })).toBeVisible();
  await expect(page.getByText("Searchable normal item", { exact: true })).not.toBeVisible();

  await page.getByLabel("Search tasks").fill("does not exist");
  await expect(page.getByRole("heading", { name: "No matching tasks" })).toBeVisible();
});

test("requires delete confirmation before removing a task", async ({ page }) => {
  await registerAndLogin(page);
  await createTask(page, "Task to confirm deletion");
  const row = page.getByRole("row").filter({ hasText: "Task to confirm deletion" });

  page.once("dialog", (dialog) => dialog.dismiss());
  await row.getByRole("button", { name: "Delete Task to confirm deletion" }).click();
  await expect(row).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Delete Task to confirm deletion" }).click();
  await expect(row).not.toBeVisible();
});

test("shows required-title validation without saving", async ({ page }) => {
  await registerAndLogin(page);
  await page.getByRole("link", { name: /New task/ }).click();
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByText("Required")).toBeVisible();
  await expect(page).toHaveURL(/\/tasks\/new$/);
});

test("keeps one user's tasks private from another user", async ({ page }) => {
  await registerAndLogin(page);
  await createTask(page, "Private task for first account");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await registerAndLogin(page);
  await expect(page.getByRole("heading", { name: "All clear for now" })).toBeVisible();
  await expect(page.getByText("Private task for first account")).not.toBeVisible();
});

test("task list remains usable at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await registerAndLogin(page);
  await createTask(page, "Phone-width task");
  await expect(page.getByRole("heading", { name: "My tasks" })).toBeVisible();
  await expect(page.getByText("Phone-width task", { exact: true })).toBeVisible();
});

test("opens task details from the list", async ({ page }) => {
  await registerAndLogin(page);
  await createTask(page, "Review task details", "on_hold", "critical");

  await page.getByRole("link", { name: "View Review task details" }).click();

  await expect(page).toHaveURL(/\/tasks\/\d+$/);
  await expect(page.getByRole("heading", { name: "Review task details" })).toBeVisible();
  await expect(page.getByText("Status: on_hold")).toBeVisible();
  await expect(page.getByText("Priority: critical")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Task" })).toBeVisible();
});
