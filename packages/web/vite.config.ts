import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Pin root to this file's directory so `index.html` resolves whether Vite is
  // launched from the repo root (npm run dev) or from the package (npm build).
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  server: {
    port: 47824,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:47823",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
