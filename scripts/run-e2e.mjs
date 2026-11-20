import "dotenv/config";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Set TEST_DATABASE_URL to a disposable PostgreSQL test database before running browser tests.");
}

const env = { ...process.env, DATABASE_URL: databaseUrl };
const prismaCli = fileURLToPath(import.meta.resolve("prisma/build/index.js"));
const playwrightCli = fileURLToPath(import.meta.resolve("@playwright/test/cli"));

execFileSync(process.execPath, [prismaCli, "db", "push", "--schema", "server/prisma/schema.prisma"], {
  stdio: "inherit",
  env
});
execFileSync(process.execPath, [playwrightCli, "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env
});
