import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./app", import.meta.url)),
    },
  },
  server: {
    // Honor the host/port portless injects (react-router/vite does not pick up
    // PORT/HOST on its own here).
    host: process.env.HOST || undefined,
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    proxy: {
      // Local dev: forward API calls to the Sinatra server via portless.
      "/api": {
        target: "http://fuuka-server.localhost:1355",
        changeOrigin: true,
      },
    },
  },
});
