import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("./", import.meta.url));
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, root, ""), ...process.env };
  const port = Number(env.CLARITY_FRONTEND_PORT || 5173);
  const proxy = {
    "/api": {
      target:
        env.CLARITY_API_URL || "http://127.0.0.1:" + (env.CLARITY_PORT || 4318),
      changeOrigin: true,
    },
  };
  return {
    root,
    publicDir: "public",
    plugins: [react()],
    resolve: { alias: { "@": root + "src" } },
    css: { postcss: { plugins: [tailwindcss()] } },
    build: { outDir: "dist", emptyOutDir: true },
    server: { host: "127.0.0.1", port, strictPort: true, proxy },
    preview: { host: "127.0.0.1", port, strictPort: true, proxy },
  };
});
