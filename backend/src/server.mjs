import http from "node:http";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  emptyLedger,
  validateLedger,
  clearLedger,
  validDate,
  today,
} from "../shared/ledger.ts";
import { materializeAutomatic } from "./automation.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.CLARITY_PORT || 4318);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error("CLARITY_PORT 无效");
const dbPath = resolve(
  process.env.CLARITY_DB_PATH || resolve(root, "data/clarity.sqlite"),
);
const frontendDir = process.env.CLARITY_FRONTEND_DIR
  ? resolve(process.env.CLARITY_FRONTEND_DIR)
  : "";
const bindHost = process.env.CLARITY_BIND_HOST || "127.0.0.1";
const publicOrigin = process.env.CLARITY_PUBLIC_ORIGIN
  ? new URL(process.env.CLARITY_PUBLIC_ORIGIN)
  : null;
const loginEmail = process.env.CLARITY_LOGIN_EMAIL || "";
const loginPassword = process.env.CLARITY_LOGIN_PASSWORD || "";
const sessionSecret = process.env.CLARITY_SESSION_SECRET || "";
const authValues = [loginEmail, loginPassword, sessionSecret].filter(Boolean);
if (authValues.length > 0 && authValues.length < 3)
  throw Error(
    "登录配置不完整，请同时设置 CLARITY_LOGIN_EMAIL、CLARITY_LOGIN_PASSWORD 和 CLARITY_SESSION_SECRET",
  );
const authEnabled = authValues.length === 3;
const registrationEnabled =
  authEnabled && process.env.CLARITY_ALLOW_REGISTRATION !== "false";
const sessionSeconds = 7 * 24 * 60 * 60;
const loginFailures = new Map();
const registrations = new Map();
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(
  `PRAGMA journal_mode=WAL;
   CREATE TABLE IF NOT EXISTS ledgers (
     owner_id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     revision INTEGER NOT NULL DEFAULT 0,
     updated_at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL COLLATE NOCASE UNIQUE,
     password_hash TEXT NOT NULL,
     created_at TEXT NOT NULL
   );`,
);
const hashPassword = (password, salt = randomBytes(16).toString("hex")) =>
  `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const verifyPassword = (password, stored) => {
  const [salt, encoded, extra] = stored.split(":");
  if (!salt || !encoded || extra || !/^[a-f\d]{128}$/i.test(encoded)) return false;
  const expected = Buffer.from(encoded, "hex");
  const supplied = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, supplied);
};
const normalizedEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";
const validEmail = (email) =>
  email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validNewPassword = (password) =>
  typeof password === "string" && password.length >= 8 && password.length <= 128;
const now = () => new Date().toISOString();
if (authEnabled) {
  const email = normalizedEmail(loginEmail);
  const existing = db.prepare("SELECT id FROM users WHERE email=?").get(email);
  if (!existing) {
    db.prepare(
      "INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)",
    ).run("local", email, hashPassword(loginPassword), now());
  }
}
db.prepare("INSERT OR IGNORE INTO ledgers VALUES (?,?,0,?)").run(
  "local",
  JSON.stringify(emptyLedger()),
  now(),
);
const ensureLedger = (ownerId) => {
  db.prepare("INSERT OR IGNORE INTO ledgers VALUES (?,?,0,?)").run(
    ownerId,
    JSON.stringify(emptyLedger()),
    now(),
  );
};
const read = (ownerId) => {
  ensureLedger(ownerId);
  const r = db.prepare("SELECT * FROM ledgers WHERE owner_id=?").get(ownerId);
  return {
    state: JSON.parse(r.data),
    revision: r.revision,
    updatedAt: r.updated_at,
  };
};
const save = (ownerId, state, revision) => {
  const updatedAt = now();
  const r = db
    .prepare(
      "UPDATE ledgers SET data=?,revision=revision+1,updated_at=? WHERE owner_id=? AND revision=?",
    )
    .run(JSON.stringify(state), updatedAt, ownerId, revision);
  if (r.changes !== 1) return null;
  return { state, revision: revision + 1, updatedAt };
};
const synchronize = (ownerId) => {
  const old = read(ownerId);
  const result = materializeAutomatic(old.state);
  if (JSON.stringify(result.state) === JSON.stringify(old.state))
    return { ...old, autoAdded: 0 };
  return {
    ...save(ownerId, result.state, old.revision),
    autoAdded: result.added,
  };
};
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};
const json = (res, status, data, headers = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...securityHeaders,
    ...headers,
  });
  res.end(JSON.stringify(data));
};
const digest = (value) => createHash("sha256").update(value).digest();
const sameText = (left, right) => timingSafeEqual(digest(left), digest(right));
const signature = (payload) =>
  createHmac("sha256", sessionSecret).update(payload).digest("base64url");
const createSession = (user) => {
  const payload = Buffer.from(
    JSON.stringify({
      userId: user.id,
      email: user.email,
      expires: Date.now() + sessionSeconds * 1000,
    }),
  ).toString("base64url");
  return payload + "." + signature(payload);
};
const sessionUser = (req) => {
  if (!authEnabled) return { id: "local", email: null };
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("clarity_session="));
  if (!cookie) return null;
  const token = cookie.slice("clarity_session=".length);
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  if (!sameText(suppliedSignature, signature(payload))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      typeof session.userId !== "string" ||
      typeof session.email !== "string" ||
      session.expires <= Date.now()
    )
      return null;
    const user = db
      .prepare("SELECT id,email FROM users WHERE id=? AND email=?")
      .get(session.userId, session.email);
    return user || null;
  } catch {
    return null;
  }
};
const sessionCookie = (token, maxAge = sessionSeconds) =>
  `clarity_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}` +
  (publicOrigin?.protocol === "https:" ? "; Secure" : "");
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
async function staticFile(res, file, cache = true) {
  const body = await readFile(file);
  res.writeHead(200, {
    "Content-Type": mimeTypes[extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": cache ? "public, max-age=31536000, immutable" : "no-cache",
    ...securityHeaders,
  });
  res.end(body);
}
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
const server = http.createServer(async (req, res) => {
  try {
    const allowedHosts = new Set([
      "127.0.0.1:" + port,
      "localhost:" + port,
      publicOrigin?.host,
    ]);
    if (!allowedHosts.has(req.headers.host)) {
      json(res, 403, { error: "只允许本机访问" });
      return;
    }
    const allowedOrigins = new Set([
      "http://127.0.0.1:" + port,
      "http://localhost:" + port,
    ]);
    const frontendOrigin = new URL(
      process.env.CLARITY_FRONTEND_ORIGIN || "http://127.0.0.1:5173",
    );
    allowedOrigins.add(frontendOrigin.origin);
    if (publicOrigin) allowedOrigins.add(publicOrigin.origin);
    if (["127.0.0.1", "localhost"].includes(frontendOrigin.hostname)) {
      const frontendPort = frontendOrigin.port ? ":" + frontendOrigin.port : "";
      allowedOrigins.add(
        `${frontendOrigin.protocol}//127.0.0.1${frontendPort}`,
      );
      allowedOrigins.add(
        `${frontendOrigin.protocol}//localhost${frontendPort}`,
      );
    }
    if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) {
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
    if (url.pathname === "/api/session" && req.method === "GET") {
      const user = sessionUser(req);
      json(res, 200, {
        authenticated: Boolean(user),
        authEnabled,
        registrationEnabled,
        email: user?.email ?? null,
      });
      return;
    }
    if (url.pathname === "/api/login" && req.method === "POST") {
      if (!authEnabled) {
        json(res, 404, { error: "此环境未启用密码登录" });
        return;
      }
      const client = req.socket.remoteAddress || "unknown";
      let failed = loginFailures.get(client);
      if (failed?.blockedUntil && failed.blockedUntil <= Date.now()) {
        loginFailures.delete(client);
        failed = null;
      }
      if (failed?.blockedUntil > Date.now()) {
        json(res, 429, { error: "尝试次数过多，请稍后再试" });
        return;
      }
      const body = await bodyOf(req);
      const email = normalizedEmail(body.email);
      const user = validEmail(email)
        ? db
            .prepare("SELECT id,email,password_hash FROM users WHERE email=?")
            .get(email)
        : null;
      const valid =
        user &&
        typeof body.password === "string" &&
        body.password.length <= 128 &&
        verifyPassword(body.password, user.password_hash);
      if (!valid) {
        const attempts = (failed?.attempts || 0) + 1;
        loginFailures.set(client, {
          attempts,
          blockedUntil: attempts >= 5 ? Date.now() + 15 * 60 * 1000 : 0,
        });
        json(res, 401, { error: "邮箱或密码不正确" });
        return;
      }
      loginFailures.delete(client);
      json(
        res,
        200,
        { authenticated: true, email: user.email },
        { "Set-Cookie": sessionCookie(createSession(user)) },
      );
      return;
    }
    if (url.pathname === "/api/register" && req.method === "POST") {
      if (!registrationEnabled) {
        json(res, 403, { error: "此环境未开放注册" });
        return;
      }
      const client = req.socket.remoteAddress || "unknown";
      const recentRegistrations = (registrations.get(client) || []).filter(
        (time) => time > Date.now() - 60 * 60 * 1000,
      );
      if (recentRegistrations.length >= 5) {
        json(res, 429, { error: "注册次数过多，请稍后再试" });
        return;
      }
      const body = await bodyOf(req);
      const email = normalizedEmail(body.email);
      if (!validEmail(email)) throw Error("请输入有效的邮箱地址");
      if (!validNewPassword(body.password))
        throw Error("密码需要 8–128 个字符");
      if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email)) {
        json(res, 409, { error: "该邮箱已经注册，请直接登录" });
        return;
      }
      const user = { id: randomUUID(), email };
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          "INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)",
        ).run(user.id, user.email, hashPassword(body.password), now());
        ensureLedger(user.id);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        if (String(error.message).includes("UNIQUE")) {
          json(res, 409, { error: "该邮箱已经注册，请直接登录" });
          return;
        }
        throw error;
      }
      registrations.set(client, [...recentRegistrations, Date.now()]);
      json(
        res,
        201,
        { authenticated: true, email: user.email },
        { "Set-Cookie": sessionCookie(createSession(user)) },
      );
      return;
    }
    if (url.pathname === "/api/logout" && req.method === "POST") {
      json(
        res,
        200,
        { authenticated: false },
        { "Set-Cookie": sessionCookie("", 0) },
      );
      return;
    }
    const user = url.pathname.startsWith("/api/") ? sessionUser(req) : null;
    if (url.pathname.startsWith("/api/") && !user) {
      json(res, 401, { error: "请先登录投资手账" });
      return;
    }
    if (url.pathname === "/api/ledger" && req.method === "GET") {
      json(res, 200, {
        ...synchronize(user.id),
        authMode: authEnabled ? "password" : "none",
        user: authEnabled ? { email: user.email } : null,
      });
      return;
    }
    if (url.pathname === "/api/ledger" && req.method === "PUT") {
      const body = await bodyOf(req);
      if (!Number.isSafeInteger(body.revision)) throw Error("版本无效");
      const result = materializeAutomatic(validateLedger(body.state));
      const saved = save(user.id, result.state, body.revision);
      json(
        res,
        saved ? 200 : 409,
        saved
          ? {
              ...saved,
              autoAdded: result.added,
              authMode: authEnabled ? "password" : "none",
              user: authEnabled ? { email: user.email } : null,
            }
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
      const old = read(user.id);
      if (body.revision !== old.revision) {
        json(res, 409, { error: "账本已更新，请刷新后清空" });
        return;
      }
      json(
        res,
        200,
        {
          ...save(
            user.id,
            clearLedger(old.state, body.keepAccounts),
            body.revision,
          ),
          authMode: authEnabled ? "password" : "none",
          user: authEnabled ? { email: user.email } : null,
        },
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
    if (frontendDir && ["GET", "HEAD"].includes(req.method || "")) {
      const requested =
        url.pathname === "/"
          ? "index.html"
          : decodeURIComponent(url.pathname).replace(/^\/+/, "");
      const file = resolve(frontendDir, requested);
      if (file !== frontendDir && !file.startsWith(frontendDir + sep)) {
        json(res, 400, { error: "路径无效" });
        return;
      }
      try {
        if (!(await stat(file)).isFile()) throw Error("not a file");
        await staticFile(res, file, requested === "index.html" ? false : true);
      } catch {
        if (extname(requested)) {
          json(res, 404, { error: "文件不存在" });
          return;
        }
        await staticFile(res, resolve(frontendDir, "index.html"), false);
      }
      return;
    }
    if (url.pathname === "/") {
      json(res, 200, {
        service: "澄明 API",
        frontend:
          process.env.CLARITY_FRONTEND_ORIGIN || "http://127.0.0.1:5173",
      });
      return;
    }
    json(res, 404, { error: "这里只提供后端 API，请打开前端页面" });
  } catch (error) {
    json(res, 400, { error: error.message || "操作失败" });
  }
});
const timer = setInterval(() => {
  try {
    for (const { owner_id: ownerId } of db
      .prepare("SELECT owner_id FROM ledgers")
      .all())
      synchronize(ownerId);
  } catch (error) {
    console.error("自动记账未完成：", error.message);
  }
}, 60000);
timer.unref();
server.listen(port, bindHost, () => {
  console.log(
    `澄明服务已启动：http://${bindHost}:${port}\nSQLite 数据库：${dbPath}\n${authEnabled ? "密码登录已启用" : "密码登录未启用"}。按 Ctrl+C 停止。重启后数据保留。`,
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
