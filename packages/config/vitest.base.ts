import { defineConfig, mergeConfig } from "vitest/config";
import type { UserConfig } from "vitest/config";

export const baseVitestConfig = defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov", "html"],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
      exclude: [
        "node_modules/**",
        "dist/**",
        "**/*.d.ts",
        "**/*.config.*",
        "**/generated/**",
        "src/index.ts",
      ],
    },
    reporters: ["verbose"],
    testTimeout: 10000,
    hookTimeout: 30000,
  },
});

export function createVitestConfig(overrides: UserConfig = {}) {
  return mergeConfig(baseVitestConfig, overrides);
}
