import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const generated = [
  ".next",
  ".vinext",
  ".wrangler",
  "dist",
  "frontend/dist",
  "outputs",
  "tsconfig.tsbuildinfo",
];
await Promise.all(
  generated.map((path) =>
    rm(resolve(root, path), { recursive: true, force: true }),
  ),
);
console.log(
  "已清理构建缓存和临时输出；frontend、backend 与本地数据库均已保留。",
);
