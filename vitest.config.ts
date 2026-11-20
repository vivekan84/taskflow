import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["shared/test/**/*.test.ts", "server/test/**/*.test.ts", "client/test/**/*.test.tsx"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["shared/src/**/*.ts", "server/src/**/*.ts", "client/src/**/*.tsx"],
      exclude: ["**/*.d.ts"],
      reporter: ["text", "html"]
    }
  }
});
