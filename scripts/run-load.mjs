import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const profile = process.argv[2];
if (profile !== "smoke" && profile !== "baseline") {
  throw new Error("Choose a load profile: smoke or baseline.");
}

const project = `taskflow-load-${Date.now()}-${process.pid}`;
const summaryPath = resolve("load-summary.json");
const compose = [
  "compose",
  "-p",
  project,
  "-f",
  "docker-compose.load.yml"
];
let runError;

try {
  execFileSync("docker", [...compose, "up", "--build", "--abort-on-container-exit", "--exit-code-from", "loadtest"], {
    stdio: "inherit",
    env: { ...process.env, LOAD_PROFILE: profile }
  });
} catch (error) {
  runError = error;
} finally {
  try {
    execFileSync("docker", [...compose, "cp", "loadtest:/tmp/summary.json", summaryPath], { stdio: "inherit" });
  } catch (copyError) {
    if (!runError) runError = copyError;
    else console.error("Could not copy the isolated load-test summary.", copyError);
  }
  try {
    execFileSync("docker", [...compose, "down", "--volumes", "--remove-orphans"], { stdio: "inherit" });
  } catch (cleanupError) {
    if (!runError) runError = cleanupError;
    else console.error("Could not remove the isolated load-test Compose project.", cleanupError);
  }
}

if (runError) {
  process.exitCode = runError.status ?? 1;
}
