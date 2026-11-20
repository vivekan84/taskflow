import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = __ENV.BASE_URL || "http://localhost:3001";
const smoke = __ENV.LOAD_PROFILE === "smoke";

export const options = {
  stages: smoke
    ? [{ duration: "30s", target: 1 }]
    : [
        { duration: "30s", target: 1 },
        { duration: "60s", target: 3 },
        { duration: "60s", target: 5 },
        { duration: "30s", target: 0 }
      ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{operation:read}": ["p(95)<500"],
    "http_req_duration{operation:write}": ["p(95)<750"]
  }
};

export function setup() {
  const health = http.get(`${baseUrl}/api/health`, { tags: { operation: "read" } });
  if (!check(health, { "API is healthy": (response) => response.status === 200 })) {
    throw new Error("Load-test API health check failed");
  }

  const email = `load-${Date.now()}@example.test`;
  const password = "load-test-password";
  const registered = http.post(
    `${baseUrl}/api/auth/register`,
    JSON.stringify({ email, password }),
    { headers: { "Content-Type": "application/json" }, tags: { operation: "auth" } }
  );
  if (!check(registered, { "load-test account registered": (response) => response.status === 201 })) {
    throw new Error(`Load-test user registration failed with ${registered.status}`);
  }
  return { email, password };
}

let sessionCookie = "";

export default function (credentials) {
  if (!sessionCookie) {
    const login = http.post(
      `${baseUrl}/api/auth/login`,
      JSON.stringify(credentials),
      { headers: { "Content-Type": "application/json" }, tags: { operation: "auth" } }
    );
    if (!check(login, { "load-test user logged in": (response) => response.status === 200 })) return;
    const cookieValue = login.cookies.task_session?.[0]?.value;
    if (!cookieValue) throw new Error("Login response did not include a task_session cookie");
    sessionCookie = `task_session=${cookieValue}`;
  }

  const title = `load-${__VU}-${__ITER}`;
  const headers = {
    "Content-Type": "application/json",
    Cookie: sessionCookie
  };
  const created = http.post(
    `${baseUrl}/api/tasks`,
    JSON.stringify({ title, status: "on_hold", priority: "critical" }),
    { headers, tags: { operation: "write" } }
  );
  if (!check(created, { "task created": (response) => response.status === 201 })) {
    if (__ITER === 0) console.error(`Task creation failed with ${created.status}: ${created.body}`);
    sleep(1);
    return;
  }

  const taskId = created.json("id");
  check(http.get(`${baseUrl}/api/tasks?q=${encodeURIComponent(title)}`, { headers, tags: { operation: "read" } }), {
    "task appears in search": (response) => response.status === 200 && response.json().some((task) => task.id === taskId)
  });
  check(http.get(`${baseUrl}/api/tasks/${taskId}`, { headers, tags: { operation: "read" } }), {
    "task can be read": (response) => response.status === 200
  });
  check(http.patch(
    `${baseUrl}/api/tasks/${taskId}`,
    JSON.stringify({ status: "done" }),
    { headers, tags: { operation: "write" } }
  ), { "task can be updated": (response) => response.status === 200 && response.json("status") === "done" });
  check(http.del(`${baseUrl}/api/tasks/${taskId}`, null, { headers, tags: { operation: "write" } }), {
    "task can be deleted": (response) => response.status === 204
  });
  sleep(0.2);
}
