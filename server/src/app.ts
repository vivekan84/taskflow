import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import { Prisma, PrismaClient } from "@prisma/client";
import { credentialsSchema, taskInputSchema, taskPatchSchema } from "@task-tracker/shared";
import { ZodError } from "zod";

const prisma = new PrismaClient();
const cookieName = "task_session";
const app = express();
const loginRateLimit = Number(process.env.LOGIN_RATE_LIMIT ?? 10);

if (!Number.isSafeInteger(loginRateLimit) || loginRateLimit < 1) {
  throw new Error("LOGIN_RATE_LIMIT must be a positive integer");
}

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      requestId?: string;
    }
  }
}

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

const jwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required");
  return secret;
};

app.use((req, _res, next) => {
  req.requestId = crypto.randomUUID();
  next();
});
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(cookieParser());

const requireAuth: express.RequestHandler = (req, _res, next) => {
  const token = req.cookies[cookieName];
  if (!token) return next(new HttpError(401, "UNAUTHORIZED", "Please log in"));
  try {
    const payload = jwt.verify(token, jwtSecret()) as jwt.JwtPayload;
    if (typeof payload.sub !== "string" || !/^\d+$/.test(payload.sub)) {
      throw new HttpError(401, "UNAUTHORIZED", "Please log in");
    }
    req.userId = Number(payload.sub);
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, "UNAUTHORIZED", "Please log in"));
  }
};

const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000
};

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

const auth = express.Router();
auth.post(
  "/register",
  async (req, res, next) => {
    try {
      const { email, password } = credentialsSchema.parse(req.body);
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({ data: { email, passwordHash }, select: { id: true, email: true } });
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return next(new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists"));
      }
      next(error);
    }
  }
);
auth.post(
  "/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: loginRateLimit,
    standardHeaders: true,
    legacyHeaders: false
  }),
  async (req, res, next) => {
    try {
      const { email, password } = credentialsSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
      }
      const token = jwt.sign({}, jwtSecret(), { subject: String(user.id), expiresIn: "7d" });
      res.cookie(cookieName, token, sessionCookieOptions).json({ id: user.id, email: user.email });
    } catch (error) {
      next(error);
    }
  }
);
auth.post("/logout", (_req, res) => {
  res.clearCookie(cookieName, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  res.status(204).end();
});
auth.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, email: true } });
    if (!user) throw new HttpError(401, "UNAUTHORIZED", "Please log in");
    res.json(user);
  } catch (error) {
    next(error);
  }
});
app.use("/api/auth", auth);

const tasks = express.Router();
tasks.use(requireAuth);
tasks.get("/", async (req, res, next) => {
  try {
    const { status, q } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const where: Prisma.TaskWhereInput = { userId: req.userId };
    if (status !== undefined) {
      if (typeof status !== "string" || !["todo", "in_progress", "on_hold", "done"].includes(status)) {
        throw new HttpError(400, "VALIDATION_ERROR", "Invalid status filter", { status: "Invalid status" });
      }
      where.status = status as Prisma.EnumTaskStatusFilter["equals"];
    }
    if (q !== undefined) {
      if (typeof q !== "string") throw new HttpError(400, "VALIDATION_ERROR", "Invalid search query");
      where.title = { contains: q.trim(), mode: "insensitive" };
    }
    const rows = await prisma.task.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit
    });
    res.json(rows);
  } catch (error) {
    next(error);
  }
});
tasks.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const task = Number.isSafeInteger(id) && id > 0
      ? await prisma.task.findFirst({ where: { id, userId: req.userId } })
      : null;
    if (!task) throw new HttpError(404, "NOT_FOUND", "Task not found");
    res.json(task);
  } catch (error) {
    next(error);
  }
});
tasks.post("/", async (req, res, next) => {
  try {
    const input = taskInputSchema.parse(req.body);
    const task = await prisma.task.create({
      data: { ...input, dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null, userId: req.userId! }
    });
    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});
tasks.patch("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const input = taskPatchSchema.parse(req.body);
    if (Object.keys(input).length === 0) throw new HttpError(400, "VALIDATION_ERROR", "Provide at least one field to update");
    const existing = Number.isSafeInteger(id) ? await prisma.task.findFirst({ where: { id, userId: req.userId } }) : null;
    if (!existing) throw new HttpError(404, "NOT_FOUND", "Task not found");
    const data: Prisma.TaskUpdateInput = { ...input };
    if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null;
    res.json(await prisma.task.update({ where: { id }, data }));
  } catch (error) {
    next(error);
  }
});
tasks.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = Number.isSafeInteger(id) ? await prisma.task.findFirst({ where: { id, userId: req.userId } }) : null;
    if (!existing) throw new HttpError(404, "NOT_FOUND", "Task not found");
    await prisma.task.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
app.use("/api/tasks", tasks);

app.use((_req, _res, next) => next(new HttpError(404, "NOT_FOUND", "Route not found")));
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    const fields = Object.fromEntries(error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]));
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Please check your input", fields } });
  }
  if (error instanceof HttpError) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) }
    });
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request" } });
  }
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON request body" } });
  }
  console.error(`[${req.requestId}]`, error);
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
});

export { app, prisma };
