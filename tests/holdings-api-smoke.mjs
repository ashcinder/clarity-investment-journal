import assert from "node:assert/strict";
const origin = process.env.CLARITY_TEST_ORIGIN || "http://127.0.0.1:3001";
assert.equal(new URL(origin).hostname, "127.0.0.1");
const login = await fetch(origin + "/signin-with-chatgpt?return_to=%2F", {
  redirect: "manual",
});
const cookie = login.headers.get("set-cookie").split(";")[0];
const get = () =>
  fetch(origin + "/api/ledger", { headers: { Cookie: cookie } }).then((r) =>
    r.json(),
  );
const put = async (data) => {
  const r = await fetch(origin + "/api/ledger", {
    method: "PUT",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  return body;
};
const id = "fixture-" + crypto.randomUUID();
let data = await get();
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
}).format(new Date());
try {
  data.state.accounts.push({
    id,
    name: "临时API账户",
    platform: "test",
    currency: "USD",
    category: "crypto",
    archived: false,
    note: "",
  });
  data.state.holdings.push({
    id: id + "-h",
    accountId: id,
    symbol: "DOGE",
    name: "测试标的",
    archived: false,
  });
  data.state.plans.push({
    id: id + "-p",
    accountId: id,
    holdingId: id + "-h",
    name: "临时API自动计划",
    amount: 3,
    frequency: "daily",
    day: 1,
    time: "00:00",
    market: "CRYPTO",
    mode: "auto",
    autoFrom: date,
    startDate: date,
    paused: false,
  });
  data = await put(data);
  assert.equal(data.state.entries.filter((e) => e.accountId === id).length, 1);
  assert.equal(data.state.entries.find((e) => e.accountId === id).amount, 3);
  const reads = await Promise.all([get(), get(), get()]);
  assert.ok(
    reads.every(
      (d) => d.state.entries.filter((e) => e.accountId === id).length === 1,
    ),
  );
  data = reads[0];
  data.state.accounts.find((a) => a.id === id).name = "账户编辑成功";
  data.state.holdings.find((h) => h.accountId === id).symbol = "SOL";
  data.state.plans.find((p) => p.accountId === id).paused = true;
  data = await put(data);
  let e = data.state.entries.find((e) => e.accountId === id);
  e.amount = 4;
  data = await put(data);
  assert.equal(data.state.entries.find((e) => e.accountId === id).amount, 4);
  e = data.state.entries.find((e) => e.accountId === id);
  data.state.skipped.push(e.planKey);
  data.state.entries = data.state.entries.filter((e) => e.accountId !== id);
  data.state.plans.find((p) => p.accountId === id).paused = false;
  data = await put(data);
  assert.equal(data.state.entries.filter((e) => e.accountId === id).length, 0);
  data.state.plans = data.state.plans.filter((p) => p.accountId !== id);
  data.state.holdings = data.state.holdings.filter((h) => h.accountId !== id);
  data.state.accounts = data.state.accounts.filter((a) => a.id !== id);
  data = await put(data);
  console.log(
    "Passed: account/holding/plan/entry create, read, edit, delete; automatic target deposit; concurrent read idempotency; deleted occurrence stays skipped.",
  );
} finally {
  data = await get();
  data.state.entries = data.state.entries.filter((e) => e.accountId !== id);
  data.state.plans = data.state.plans.filter((p) => p.accountId !== id);
  data.state.holdings = data.state.holdings.filter((h) => h.accountId !== id);
  data.state.accounts = data.state.accounts.filter((a) => a.id !== id);
  data.state.skipped = data.state.skipped.filter((k) => !k.startsWith(id));
  await put(data);
}
