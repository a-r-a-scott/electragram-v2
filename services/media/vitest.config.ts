import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/db/client.ts", "src/db/migrate.ts", "src/app.ts", "src/services/s3.ts", "src/services/auth.ts"],
      thresholds: {
        lines: 55,
        functions: 55,
        branches: 45,
        statements: 55,
      },
      reporter: ["text", "lcov", "json-summary"],
    },
    testTimeout: 30_000,
  },
});
