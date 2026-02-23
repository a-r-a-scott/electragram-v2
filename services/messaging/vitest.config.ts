import { createVitestConfig } from "@electragram/config/vitest";
export default createVitestConfig({
  test: { include: ["tests/**/*.test.ts", "src/**/*.test.ts"] },
});
