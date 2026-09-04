import {
  type Ledger,
  type Plan,
  occurrences,
  isDue,
  today,
  fxAt,
  validateLedger,
} from "./ledger.ts";
export function upgradeLedger(input: Ledger, now = new Date()): Ledger {
  const state = structuredClone(input);
  state.holdings ??= [];
  // Existing users requested automatic recording now; never invent earlier unconfirmed contributions.
  state.plans = state.plans.map((p) =>
    p.mode
      ? p
      : {
          ...p,
          mode: "auto",
          autoFrom: today(
            p.market === "US" ? "America/New_York" : "Asia/Shanghai",
            now,
          ),
        },
  );
  return state;
}
export function scheduledInstant(date: string, plan: Plan): string {
  const target = Date.parse(date + "T" + plan.time + ":00Z");
  let value = target;
  const zone = plan.market === "US" ? "America/New_York" : "Asia/Shanghai";
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value));
    const get = (key: string) => parts.find((p) => p.type === key)!.value;
    const observed = Date.parse(
      `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`,
    );
    value += target - observed;
  }
  return new Date(value).toISOString();
}
export function materializeAutomatic(
  input: Ledger,
  now = new Date(),
): { state: Ledger; added: number } {
  const state = upgradeLedger(input, now);
  let added = 0;
  for (const plan of state.plans) {
    if (plan.mode !== "auto" || plan.paused) continue;
    const from = [plan.startDate, plan.autoFrom ?? plan.startDate]
      .sort()
      .at(-1)!;
    const end = today(
      plan.market === "US" ? "America/New_York" : "Asia/Shanghai",
      now,
    );
    const single = { ...state, plans: [plan] };
    for (const o of occurrences(single, from, end)) {
      if (o.done || o.skipped || !isDue(o, now)) continue;
      if (state.entries.length >= 10000)
        throw Error("流水已达上限，请先备份并整理历史记录后再自动记账");
      state.entries.push({
        id: "auto-" + o.key,
        accountId: plan.accountId,
        ...(plan.holdingId ? { holdingId: plan.holdingId } : {}),
        kind: "deposit",
        amount: plan.amount,
        date: o.date,
        fx: fxAt(state, o.date).rate,
        note: "按计划自动记账：" + plan.name + "（不代表实际成交）",
        createdAt: scheduledInstant(o.date, plan),
        planKey: o.key,
        automatic: true,
      });
      added++;
    }
  }
  validateLedger(state);
  return { state, added };
}
