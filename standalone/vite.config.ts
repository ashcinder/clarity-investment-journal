import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { fileURLToPath } from "node:url";
const project = fileURLToPath(new URL("../", import.meta.url));
export default defineConfig({
  root: project + "standalone/web",
  publicDir: project + "public",
  plugins: [react()],
  resolve: { alias: { "@": project } },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: project + "standalone-dist", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:" + (process.env.CLARITY_PORT || 4318),
        changeOrigin: true,
      },
    },
  },
});
