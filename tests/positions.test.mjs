import test from "node:test";
import assert from "node:assert/strict";
import {
  seedLedger,
  emptyLedger,
  clearLedger,
  recordPosition,
  positionStats,
  portfolio,
  validateLedger,
  deleteHolding,
  today,
} from "../shared/ledger.ts";
import { materializeAutomatic } from "../backend/src/automation.ts";
const date = today();
const input = (quantity, unitCost, unitPrice) => ({
  quantity,
  unitCost,
  unitPrice,
  margin: 0,
  equity: 0,
});
function fixture() {
  const s = emptyLedger();
  s.accounts = [
    {
      id: "wallet",
      name: "我的账户",
      currency: "USD",
      category: "crypto",
      platform: "test",
      archived: false,
      note: "",
    },
  ];
  return s;
}
function add(s, id, type, data) {
  const h = {
    id,
    accountId: "wallet",
    symbol: id,
    name: id,
    archived: false,
    assetType: type,
  };
  s.holdings.push(h);
  s.entries.push(recordPosition(s, h, data, date));
  return h;
}
test("one account contains crypto counts and fractional US shares with independent valuations", () => {
  const s = fixture();
  const btc = add(s, "BTC", "crypto", input(0.02, 60000, 65000));
  const spy = add(s, "SPY", "stock", input(1.5, 500, 550));
  validateLedger(s);
  assert.equal(positionStats(s, btc).quantity, 0.02);
  assert.equal(positionStats(s, spy).quantity, 1.5);
  assert.equal(portfolio(s).value, 2125);
  assert.equal(portfolio(s).profit, 175);
  assert.equal(
    portfolio(s).categoryAssets.find((a) => a.id === "SPY").category,
    "stock",
  );
  s.entries.push(recordPosition(s, btc, input(0.01, 60000, 62000), date));
  assert.equal(positionStats(s, btc).value, 620);
  assert.equal(portfolio(s).value, 1445);
});
test("fund units use NAV; grid totals use equity, never leveraged notional", () => {
  const s = fixture();
  s.accounts[0].currency = "CNY";
  s.accounts[0].category = "fund";
  const fund = add(s, "FUND", "fund", input(100, 1.2, 1.1));
  const grid = add(s, "GRID", "grid", {
    quantity: 0.03,
    unitCost: 0,
    unitPrice: 0,
    margin: 20,
    equity: 23,
  });
  grid.leverage = 10;
  grid.side = "long";
  validateLedger(s);
  assert.equal(positionStats(s, fund).value, 110);
  assert.equal(positionStats(s, grid).value, 23);
  assert.equal(portfolio(s, "CNY").value, 133);
});
test("automatic contribution adds estimated units using last recorded price", () => {
  const s = fixture();
  const h = add(s, "ETH", "crypto", input(1, 2000, 2500));
  s.entries[0].date = "2026-09-01";
  s.plans = [
    {
      id: "p",
      accountId: "wallet",
      holdingId: h.id,
      name: "买入",
      amount: 50,
      currency: "USD",
      frequency: "daily",
      day: 1,
      time: "00:00",
      market: "CRYPTO",
      mode: "auto",
      autoFrom: date,
      startDate: date,
      paused: false,
    },
  ];
  const result = materializeAutomatic(s);
  assert.equal(result.added, 1);
  assert.equal(positionStats(result.state, h).quantity, 1.02);
  assert.equal(positionStats(result.state, h).value, 2550);
});
test("clear data removes automatic plans and never restores test entries", () => {
  const s = seedLedger();
  for (const keep of [true, false]) {
    const cleared = clearLedger(s, keep);
    validateLedger(cleared);
    assert.equal(cleared.accounts.length, keep ? s.accounts.length : 0);
    assert.equal(materializeAutomatic(cleared).state.entries.length, 0);
    assert.equal(cleared.plans.length, 0);
    assert.equal(cleared.holdings.length, 0);
  }
});
test("delete one position leaves the other quantities and values intact", () => {
  const s = fixture();
  const a = add(s, "BTC", "crypto", input(0.1, 50000, 60000));
  const b = add(s, "SOL", "crypto", input(3, 100, 150));
  deleteHolding(s, a);
  validateLedger(s);
  assert.equal(positionStats(s, b).quantity, 3);
  assert.equal(portfolio(s).value, 450);
});
