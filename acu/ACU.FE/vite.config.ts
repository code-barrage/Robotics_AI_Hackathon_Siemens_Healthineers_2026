import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Inject build metadata at compile time so the About screen can display it.
  // __BUILD_TIME__ is replaced with a literal ISO-8601 string at build start.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    proxy: {
      // ACU_PROXY_TARGET lets the CT portal switch this dashboard between the local and hosted ACU.
      "/api": {
        target: process.env.ACU_PROXY_TARGET || "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});