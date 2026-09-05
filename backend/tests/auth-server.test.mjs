import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

test("password login protects the server ledger and serves the built frontend", async () => {
  const directory = await mkdtemp(join(tmpdir(), "clarity-auth-test-"));
  const databasePath = join(directory, "test.sqlite");
  const legacyDatabase = new DatabaseSync(databasePath);
  legacyDatabase.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  legacyDatabase.close();
  const origin = "http://127.0.0.1:44320";
  let output = "";
  const child = spawn(process.execPath, ["backend/src/server.mjs"], {
    env: {
      ...process.env,
      CLARITY_PORT: "44320",
      CLARITY_PUBLIC_ORIGIN: origin,
      CLARITY_FRONTEND_ORIGIN: origin,
      CLARITY_FRONTEND_DIR: resolve("frontend/dist"),
      CLARITY_DB_PATH: databasePath,
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
      registrationEnabled: true,
      email: null,
    });

    const weakRegistration = await request("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@example.com", password: "short" }),
    });
    assert.equal(weakRegistration.status, 400);

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
    const ownerLedger = await ledger.json();
    assert.equal(ownerLedger.authMode, "password");
    assert.equal(ownerLedger.user.email, "owner@example.com");

    const registration = await request("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "new@example.com",
        password: "a secure password",
      }),
    });
    assert.equal(registration.status, 201);
    const newCookie = registration.headers.get("set-cookie");
    assert.match(newCookie, /clarity_session=/);
    const newLedgerResponse = await request("/api/ledger", {
      headers: { Cookie: newCookie },
    });
    const newLedger = await newLedgerResponse.json();
    assert.equal(newLedger.state.accounts.length, 0);
    assert.equal(newLedger.user.email, "new@example.com");
    newLedger.state.settings.cnyPerUsd = 6.25;
    const saveNew = await request("/api/ledger", {
      method: "PUT",
      headers: {
        Cookie: newCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newLedger),
    });
    assert.equal(saveNew.status, 200);
    const ownerAgain = await request("/api/ledger", {
      headers: { Cookie: cookie },
    });
    assert.notEqual(
      (await ownerAgain.json()).state.settings.cnyPerUsd,
      6.25,
    );

    const duplicate = await request("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "NEW@example.com",
        password: "another secure password",
      }),
    });
    assert.equal(duplicate.status, 409);

    const changePassword = await request("/api/change-password", {
      method: "POST",
      headers: {
        Cookie: newCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "a secure password",
        newPassword: "a newer secure password",
      }),
    });
    assert.equal(changePassword.status, 200);
    const renewedCookie = changePassword.headers.get("set-cookie");
    assert.match(renewedCookie, /clarity_session=/);
    assert.equal(
      (await request("/api/ledger", { headers: { Cookie: newCookie } })).status,
      401,
    );
    assert.equal(
      (
        await request("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "new@example.com",
            password: "a secure password",
          }),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "new@example.com",
            password: "a newer secure password",
          }),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request("/api/ledger", {
          headers: { Cookie: renewedCookie },
        })
      ).status,
      200,
    );

    const logout = await request("/api/logout", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal(
      (
        await request("/api/ledger", {
          headers: { Cookie: "clarity_session=" },
        })
      ).status,
      401,
    );
  } finally {
    if (child.exitCode === null)
      await new Promise((done) => {
        child.once("exit", done);
        child.kill("SIGTERM");
      });
    await rm(directory, { recursive: true, force: true });
  }
});
