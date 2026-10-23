/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Test-only config. Kept separate from vite.config.ts so the production build
// pipeline is untouched. jsdom gives hooks/components a DOM; setup wires
// jest-dom matchers.
export default defineConfig({
  plugins: [react()],
  define: {
    // deviceApi/build metadata reference this Vite-injected constant.
    __BUILD_TIME__: JSON.stringify("test"),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },
});
