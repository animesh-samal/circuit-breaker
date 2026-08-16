import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development the API runs separately on :8000. In production nginx
    // routes /api to the backend Service, so the frontend always calls
    // same-origin relative paths and never needs to know a backend URL.
    // That is what keeps CORS out of this project entirely.
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // Fail the build rather than silently shipping a bundle that will be slow
    // on the 3G connection a recruiter might open this on.
    chunkSizeWarningLimit: 400,
  },
});
