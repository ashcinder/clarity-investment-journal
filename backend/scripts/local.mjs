import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(
  new URL("../../frontend/package.json", import.meta.url),
);
const vite = resolve(
  dirname(require.resolve("vite/package.json")),
  "bin/vite.js",
);
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error("请安装 Node.js 22.18 或更新版本");
  process.exit(1);
}
const dev = process.argv.includes("--dev"),
  startOnly = process.argv.includes("--start");
const children = new Set();
let stopping = false;
function run(args, cwd, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: resolve(root, cwd),
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
}
if (!dev && !startOnly) {
  const code = await new Promise((resolve) => {
    const child = run([vite, "build"], "frontend");
    child.once("error", () => resolve(1));
    child.once("exit", resolve);
  });
  if (code !== 0) process.exit(code || 1);
}
const frontendPort = process.env.CLARITY_FRONTEND_PORT || "5173";
const backend = run(
  [...(dev ? ["--watch"] : []), "src/server.mjs"],
  "backend",
  {
    CLARITY_FRONTEND_ORIGIN:
      process.env.CLARITY_FRONTEND_ORIGIN || "http://127.0.0.1:" + frontendPort,
  },
);
const frontend = run([vite, ...(dev ? [] : ["preview"])], "frontend");
for (const child of [backend, frontend]) {
  child.once("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.once("exit", (code) => stop(code || 0));
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
