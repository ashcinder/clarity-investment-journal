import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  emptyLedger,
  validateLedger,
  clearLedger,
  validDate,
  today,
} from "../lib/ledger.ts";
import { materializeAutomatic } from "../lib/automation.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.CLARITY_PORT || 4318);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error("CLARITY_PORT 无效");
const dbPath = resolve(
  process.env.CLARITY_DB_PATH || resolve(root, ".data/clarity.sqlite"),
);
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS ledgers (owner_id TEXT PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)",
);
db.prepare("INSERT OR IGNORE INTO ledgers VALUES (?,?,0,?)").run(
  "local",
  JSON.stringify(emptyLedger()),
  new Date().toISOString(),
);
const read = () => {
  const r = db.prepare("SELECT * FROM ledgers WHERE owner_id=?").get("local");
  return {
    state: JSON.parse(r.data),
    revision: r.revision,
    updatedAt: r.updated_at,
  };
};
const save = (state, revision) => {
  const updatedAt = new Date().toISOString();
  const r = db
    .prepare(
      "UPDATE ledgers SET data=?,revision=revision+1,updated_at=? WHERE owner_id=? AND revision=?",
    )
    .run(JSON.stringify(state), updatedAt, "local", revision);
  if (r.changes !== 1) return null;
  return { state, revision: revision + 1, updatedAt };
};
const synchronize = () => {
  const old = read();
  const result = materializeAutomatic(old.state);
  if (JSON.stringify(result.state) === JSON.stringify(old.state))
    return { ...old, autoAdded: 0 };
  return { ...save(result.state, old.revision), autoAdded: result.added };
};
const json = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
};
async function bodyOf(req) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw Error("请使用 JSON 请求");
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 4_000_000) throw Error("请求超过 4 MB");
  }
  return JSON.parse(raw);
}
const staticRoot = resolve(root, "standalone-dist");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const server = http.createServer(async (req, res) => {
  try {
    if (
      !["127.0.0.1:" + port, "localhost:" + port].includes(req.headers.host)
    ) {
      json(res, 403, { error: "只允许本机访问" });
      return;
    }
    const allowedOrigins = [
      "http://127.0.0.1:" + port,
      "http://localhost:" + port,
    ];
    if (process.env.CLARITY_DEV === "1")
      allowedOrigins.push("http://127.0.0.1:5173");
    if (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) {
      json(res, 403, { error: "请求来源无效" });
      return;
    }
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    if (url.pathname === "/api/health") {
      json(res, 200, {
        status: "ok",
        storage: "sqlite",
        timezone: "Asia/Shanghai",
      });
      return;
    }
    if (url.pathname === "/api/ledger" && req.method === "GET") {
      json(res, 200, synchronize());
      return;
    }
    if (url.pathname === "/api/ledger" && req.method === "PUT") {
      const body = await bodyOf(req);
      if (!Number.isSafeInteger(body.revision)) throw Error("版本无效");
      const result = materializeAutomatic(validateLedger(body.state));
      const saved = save(result.state, body.revision);
      json(
        res,
        saved ? 200 : 409,
        saved
          ? { ...saved, autoAdded: result.added }
          : { error: "账本已更新，请刷新后保存" },
      );
      return;
    }
    if (url.pathname === "/api/reset" && req.method === "POST") {
      const body = await bodyOf(req);
      if (
        body.confirmation !== "清空" ||
        typeof body.keepAccounts !== "boolean" ||
        !Number.isSafeInteger(body.revision)
      )
        throw Error("请输入“清空”并选择范围");
      const old = read();
      if (body.revision !== old.revision) {
        json(res, 409, { error: "账本已更新，请刷新后清空" });
        return;
      }
      json(
        res,
        200,
        save(clearLedger(old.state, body.keepAccounts), body.revision),
      );
      return;
    }
    if (url.pathname === "/api/fx" && req.method === "GET") {
      try {
        const response = await fetch(
          "https://api.frankfurter.dev/v2/rate/USD/CNY",
          { signal: AbortSignal.timeout(8000) },
        );
        if (!response.ok) throw Error();
        const data = await response.json();
        if (
          !Number.isFinite(data.rate) ||
          data.rate <= 0 ||
          !validDate(data.date) ||
          data.date > today()
        )
          throw Error();
        json(res, 200, { ...data, source: "Frankfurter · 参考汇率" });
      } catch {
        json(res, 502, { error: "汇率暂不可用，可在设置中手动填写" });
      }
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      json(res, 404, { error: "接口不存在" });
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      json(res, 405, { error: "不支持此操作" });
      return;
    }
    let file = resolve(staticRoot, "." + decodeURIComponent(url.pathname));
    if (file !== staticRoot && !file.startsWith(staticRoot + sep)) {
      json(res, 403, { error: "路径无效" });
      return;
    }
    if (!existsSync(file) || !statSync(file).isFile())
      file = resolve(staticRoot, "index.html");
    if (!existsSync(file)) {
      json(res, 503, {
        error:
          "请先运行 npm run local:build，或使用开发前端 http://127.0.0.1:5173",
      });
      return;
    }
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control":
        extname(file) === ".html" ? "no-cache" : "public, max-age=3600",
    });
    res.end(req.method === "HEAD" ? undefined : readFileSync(file));
  } catch (error) {
    json(res, 400, { error: error.message || "操作失败" });
  }
});
const timer = setInterval(() => {
  try {
    synchronize();
  } catch (error) {
    console.error("自动记账未完成：", error.message);
  }
}, 60000);
timer.unref();
server.listen(port, "127.0.0.1", () => {
  console.log(
    `澄明已启动：http://127.0.0.1:${port}\nSQLite 数据库：${dbPath}\n按 Ctrl+C 停止。重启后数据保留。`,
  );
});
server.on("error", (error) => {
  console.error(error.message);
  db.close();
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
