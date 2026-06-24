import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envDir: "../..",
  plugins: [react()],
  server: {
    proxy: {
      "/api/v1": {
        target: "http://localhost:4001",
        changeOrigin: true
      }
    }
  }
});
