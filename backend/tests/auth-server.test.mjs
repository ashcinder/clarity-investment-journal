import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("password login protects the server ledger and serves the built frontend", async () => {
  const directory = await mkdtemp(join(tmpdir(), "clarity-auth-test-"));
  const origin = "http://127.0.0.1:44320";
  let output = "";
  const child = spawn(process.execPath, ["backend/src/server.mjs"], {
    env: {
      ...process.env,
      CLARITY_PORT: "44320",
      CLARITY_PUBLIC_ORIGIN: origin,
      CLARITY_FRONTEND_ORIGIN: origin,
      CLARITY_FRONTEND_DIR: resolve("frontend/dist"),
      CLARITY_DB_PATH: join(directory, "test.sqlite"),
      CLARITY_LOGIN_EMAIL: "owner@example.com",
      CLARITY_LOGIN_PASSWORD: "correct horse battery staple",
      CLARITY_SESSION_SECRET: "test-secret-with-more-than-thirty-two-characters",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const request = (path, options = {}) =>
    fetch(origin + path, {
      ...options,
      headers: { Origin: origin, ...options.headers },
    });
  try {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (child.exitCode !== null) throw Error(output);
      if (output.includes("澄明服务已启动")) break;
      await new Promise((done) => setTimeout(done, 50));
    }
    assert.match(output, /密码登录已启用/);
    assert.equal((await request("/")).status, 200);
    assert.equal((await request("/api/health")).status, 200);
    assert.equal((await request("/api/ledger")).status, 401);
    assert.deepEqual(await (await request("/api/session")).json(), {
      authenticated: false,
      authEnabled: true,
      email: "owner@example.com",
    });

    const wrong = await request("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@example.com", password: "wrong" }),
    });
    assert.equal(wrong.status, 401);

    const login = await request("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@example.com",
        password: "correct horse battery staple",
      }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie");
    assert.match(cookie, /clarity_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    const ledger = await request("/api/ledger", { headers: { Cookie: cookie } });
    assert.equal(ledger.status, 200);
    assert.equal((await ledger.json()).authMode, "password");

    const logout = await request("/api/logout", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  } finally {
    if (child.exitCode === null)
      await new Promise((done) => {
        child.once("exit", done);
        child.kill("SIGTERM");
      });
    await rm(directory, { recursive: true, force: true });
  }
});
