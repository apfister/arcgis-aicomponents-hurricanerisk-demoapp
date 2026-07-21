import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The MCP hub runs as a separate Node process (npm run hub) on port 8808.
// Vite proxies browser calls at /api/mcp to it so the app talks same-origin.
const HUB_PORT = process.env.MCP_HUB_PORT ?? "8808";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/mcp": {
        target: `http://127.0.0.1:${HUB_PORT}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mcp/, ""),
      },
    },
  },
});
