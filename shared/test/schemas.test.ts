import { describe, expect, it } from "vitest";
import { credentialsSchema, taskInputSchema, taskPatchSchema } from "../src";

describe("taskInputSchema", () => {
  it("trims text and applies defaults", () => {
    expect(taskInputSchema.parse({ title: "  Ship it  " })).toEqual({
      title: "Ship it",
      description: "",
      status: "todo",
      priority: "medium",
      dueDate: ""
    });
  });

  it("accepts every supported status and priority", () => {
    for (const status of ["todo", "in_progress", "on_hold", "done"]) {
      for (const priority of ["low", "medium", "high", "critical"]) {
        expect(taskInputSchema.safeParse({ title: "Task", status, priority }).success).toBe(true);
      }
    }
  });

  it("rejects empty or oversized titles, oversized descriptions, invalid dates, and unknown fields", () => {
    expect(taskInputSchema.safeParse({ title: " " }).success).toBe(false);
    expect(taskInputSchema.safeParse({ title: "x".repeat(121) }).success).toBe(false);
    expect(taskInputSchema.safeParse({ title: "Task", description: "x".repeat(1001) }).success).toBe(false);
    expect(taskInputSchema.safeParse({ title: "Task", dueDate: "2026-02-30" }).success).toBe(false);
    expect(taskInputSchema.safeParse({ title: "Task", extra: true }).success).toBe(false);
  });

  it("accepts partial patches and rejects invalid patch values", () => {
    expect(taskPatchSchema.parse({ status: "on_hold" })).toEqual({ status: "on_hold" });
    expect(taskPatchSchema.safeParse({ title: "" }).success).toBe(false);
    expect(taskPatchSchema.safeParse({ priority: "urgent" }).success).toBe(false);
    expect(taskPatchSchema.safeParse({}).success).toBe(true);
  });
});

describe("credentialsSchema", () => {
  it("normalizes email and requires a valid email and eight-character password", () => {
    expect(credentialsSchema.parse({ email: "  USER@example.com ", password: "password123" }).email)
      .toBe("user@example.com");
    expect(credentialsSchema.safeParse({ email: "not-an-email", password: "password123" }).success).toBe(false);
    expect(credentialsSchema.safeParse({ email: "user@example.com", password: "short" }).success).toBe(false);
  });
});
