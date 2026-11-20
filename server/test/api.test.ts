import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, prisma } from "../src/app";

describe("Task tracker API", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const emailA = `user-a-${suffix}@example.test`;
  const emailB = `user-b-${suffix}@example.test`;
  let cookieA = "";
  let cookieB = "";
  let taskId = 0;

  beforeAll(async () => {
    process.env.JWT_SECRET = "test-secret-with-enough-randomness";
    await request(app).post("/api/auth/register").send({ email: emailA, password: "password-a-123" }).expect(201);
    await request(app).post("/api/auth/register").send({ email: emailB, password: "password-b-123" }).expect(201);
    cookieA = (await request(app).post("/api/auth/login").send({ email: emailA, password: "password-a-123" }).expect(200)).headers["set-cookie"][0];
    cookieB = (await request(app).post("/api/auth/login").send({ email: emailB, password: "password-b-123" }).expect(200)).headers["set-cookie"][0];
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    await prisma.$disconnect();
  });

  it("reports health and rejects anonymous task access", async () => {
    await request(app).get("/api/health").expect(200, { status: "ok" });
    const response = await request(app).get("/api/tasks").expect(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("registers accounts with hashed passwords and rejects duplicate or invalid registration", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: emailA } });
    expect(user.passwordHash).not.toBe("password-a-123");
    await request(app).post("/api/auth/register").send({ email: emailA, password: "password-a-123" }).expect(409);
    const response = await request(app).post("/api/auth/register").send({ email: "bad", password: "short" }).expect(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns a generic authentication error for an incorrect password", async () => {
    const response = await request(app).post("/api/auth/login").send({ email: emailA, password: "wrong-password" }).expect(401);
    expect(response.body.error.message).toBe("Email or password is incorrect");
  });

  it("rate limits repeated login attempts", async () => {
    for (let attempt = 0; attempt < 7; attempt += 1) {
      await request(app).post("/api/auth/login").send({ email: emailA, password: "wrong-password" }).expect(401);
    }
    await request(app).post("/api/auth/login").send({ email: emailA, password: "wrong-password" }).expect(429);
  });

  it("creates, lists, reads, updates, and deletes only the current user's tasks", async () => {
    const created = await request(app).post("/api/tasks").set("Cookie", cookieA).send({
      title: "  Ship the first version  ",
      description: "A private task",
      status: "on_hold",
      priority: "critical",
      dueDate: "2026-12-01"
    }).expect(201);
    taskId = created.body.id;
    expect(created.body.title).toBe("Ship the first version");
    expect(created.body.status).toBe("on_hold");
    expect(created.body.priority).toBe("critical");

    await request(app).get("/api/tasks").set("Cookie", cookieA).query({ q: "first", status: "on_hold" })
      .expect(200).expect((response) => expect(response.body.map((task: { id: number }) => task.id)).toContain(taskId));
    await request(app).get(`/api/tasks/${taskId}`).set("Cookie", cookieA).expect(200);
    await request(app).get(`/api/tasks/${taskId}`).set("Cookie", cookieB).expect(404);
    await request(app).patch(`/api/tasks/${taskId}`).set("Cookie", cookieB).send({ title: "Not yours" }).expect(404);
    await request(app).delete(`/api/tasks/${taskId}`).set("Cookie", cookieB).expect(404);

    const invalid = await request(app).post("/api/tasks").set("Cookie", cookieA).send({ title: " " }).expect(400);
    expect(invalid.body.error.fields.title).toBe("Required");

    await request(app).patch(`/api/tasks/${taskId}`).set("Cookie", cookieA).send({ status: "done" })
      .expect(200).expect((response) => expect(response.body.status).toBe("done"));
    await request(app).delete(`/api/tasks/${taskId}`).set("Cookie", cookieA).expect(204);
    const missing = await request(app).get(`/api/tasks/${taskId}`).set("Cookie", cookieA).expect(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
    await request(app).delete(`/api/tasks/${taskId}`).set("Cookie", cookieA).expect(404);
  });

  it("clears the session and requires authentication for the current-user endpoint", async () => {
    await request(app).get("/api/auth/me").expect(401);
    await request(app).post("/api/auth/logout").set("Cookie", cookieA).expect(204);
  });
});
