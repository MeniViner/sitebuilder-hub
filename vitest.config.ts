import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup/env.ts"],
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 10_000
  }
});
