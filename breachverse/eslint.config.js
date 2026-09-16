import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error"
    }
  },
  {
    files: ["apps/web/**/*.ts", "apps/web/**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "@breachverse/domain", message: "Browser code must consume projected protocol types only." },
          { name: "@breachverse/engine", message: "Authoritative game logic is server-only." },
          { name: "@breachverse/scenarios", message: "Authoritative scenarios are server-only." }
        ]
      }]
    },
    languageOptions: {
      globals: {
        document: "readonly",
        window: "readonly",
        WebSocket: "readonly",
        HTMLElement: "readonly",
        HTMLCanvasElement: "readonly",
        WheelEvent: "readonly",
        PointerEvent: "readonly",
        ResizeObserver: "readonly"
      }
    }
  },
  {
    files: ["apps/game-server/**/*.ts"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly"
      }
    }
  }
);
