import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    headers: {
      "Content-Security-Policy":
        "frame-ancestors 'self' https://discord.com https://*.discord.com;"
    }
  }
});