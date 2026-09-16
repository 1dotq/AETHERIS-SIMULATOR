import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/game-server/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});

