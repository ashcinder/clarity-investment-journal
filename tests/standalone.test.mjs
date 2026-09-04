import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordPosition, today } from "../lib/ledger.ts";
test("standalone frontend/API/SQLite persist assets across restart and support safe reset", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clarity-test-"));
  const origin = "http://127.0.0.1:44318";
  let child;
  let output = "";
  const start = async () => {
    child = spawn(process.execPath, ["standalone/server.mjs"], {
      env: {
        ...process.env,
        CLARITY_PORT: "44318",
        CLARITY_DB_PATH: join(dir, "test.sqlite"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (x) => (output += x));
    child.stderr.on("data", (x) => (output += x));
    for (let i = 0; i < 60; i++) {
      if (child.exitCode !== null) throw Error(output);
      if (output.includes("澄明已启动")) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error("Server did not start: " + output);
  };
  const stop = () =>
    new Promise((r) => {
      if (child.exitCode !== null) return r();
      child.once("exit", r);
      child.kill("SIGTERM");
    });
  const get = () => fetch(origin + "/api/ledger").then((r) => r.json());
  const send = (path, method, body, extra = {}) =>
    fetch(origin + path, {
      method: method === "POST" ? "POST" : "PUT",
      headers: { "Content-Type": "application/json", Origin: origin, ...extra },
      body: JSON.stringify(body),
    });
  try {
    await start();
    assert.equal((await fetch(origin + "/")).status, 200);
    assert.equal((await fetch(origin + "/api/health")).status, 200);
    let d = await get();
    assert.equal(d.state.entries.length, 0);
    d.state.accounts.push({
      id: "a",
      name: "账户",
      category: "crypto",
      currency: "USD",
      platform: "",
      note: "",
      archived: false,
    });
    const h = {
      id: "btc",
      accountId: "a",
      name: "比特币",
      symbol: "BTC",
      assetType: "crypto",
      archived: false,
    };
    d.state.holdings.push(h);
    d.state.entries.push(
      recordPosition(
        d.state,
        h,
        {
          quantity: 0.02,
          unitCost: 60000,
          unitPrice: 65000,
          margin: 0,
          equity: 0,
        },
        today(),
      ),
    );
    let res = await send("/api/ledger", "PUT", d);
    assert.equal(res.status, 200);
    d = await res.json();
    assert.equal(d.state.entries[0].amount, 1300);
    assert.equal(
      (await send("/api/ledger", "PUT", { ...d, revision: 0 })).status,
      409,
    );
    assert.equal(
      (
        await send("/api/reset", "POST", {
          revision: d.revision,
          confirmation: "wrong",
          keepAccounts: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await send(
          "/api/reset",
          "POST",
          { revision: d.revision, confirmation: "清空", keepAccounts: true },
          { Origin: "https://example.com" },
        )
      ).status,
      403,
    );
    await stop();
    output = "";
    await start();
    d = await get();
    assert.equal(d.state.entries[0].quantitySet, 0.02);
    res = await send("/api/reset", "POST", {
      revision: d.revision,
      confirmation: "清空",
      keepAccounts: true,
    });
    assert.equal(res.status, 200);
    d = await get();
    assert.equal(d.state.entries.length, 0);
    assert.equal(d.state.accounts.length, 1);
    assert.equal(d.state.plans.length, 0);
    res = await send("/api/reset", "POST", {
      revision: d.revision,
      confirmation: "清空",
      keepAccounts: false,
    });
    assert.equal(res.status, 200);
    assert.equal((await get()).state.accounts.length, 0);
  } finally {
    if (child && child.exitCode === null) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
