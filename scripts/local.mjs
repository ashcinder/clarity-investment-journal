import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  console.error("请安装 Node.js 22.18 或更新版本");
  process.exit(1);
}
const dev = process.argv.includes("--dev");
const children = [];
function run(file, args, env = {}) {
  const child = spawn(file, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  children.push(child);
  return child;
}
if (!dev) {
  const result = await new Promise((resolve) =>
    run(process.execPath, [
      "node_modules/vite/bin/vite.js",
      "build",
      "--config",
      "standalone/vite.config.ts",
    ]).on("exit", resolve),
  );
  if (result !== 0) process.exit(result || 1);
}
const backend = run(
  process.execPath,
  ["standalone/server.mjs"],
  dev ? { CLARITY_DEV: "1" } : {},
);
if (dev)
  run(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--config",
    "standalone/vite.config.ts",
  ]);
backend.on("exit", (code) => {
  for (const child of children) if (child !== backend) child.kill();
  process.exitCode = code || 0;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
  });
