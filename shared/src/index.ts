import { z } from "zod";

export const taskStatusSchema = z.enum(["todo", "in_progress", "on_hold", "done"]);
export const taskPrioritySchema = z.enum(["low", "medium", "high", "critical"]);

export const taskInputSchema = z
  .object({
    title: z.string().trim().min(1, "Required").max(120, "Must be 120 characters or fewer"),
    description: z.string().trim().max(1000, "Must be 1,000 characters or fewer").optional().default(""),
    status: taskStatusSchema.default("todo"),
    priority: taskPrioritySchema.default("medium"),
    dueDate: z.union([z.literal(""), z.string().date()]).optional().default("")
  })
  .strict();

export const taskPatchSchema = taskInputSchema.partial().strict();

export const credentialsSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email address").transform((value) => value.toLowerCase()),
    password: z.string().min(8, "Password must be at least 8 characters")
  })
  .strict();

export type TaskInput = z.infer<typeof taskInputSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
