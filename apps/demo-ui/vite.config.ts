import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/agent": "http://localhost:8080",
      "/health": "http://localhost:8080",
      "/memory": "http://localhost:8080"
    }
  }
});
