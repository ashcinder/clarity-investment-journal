"use client";
import {
  useState,
  useEffect,
  useMemo,
  useRef,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowRight,
  Plus,
  LayoutDashboard,
  Wallet,
  CalendarDays,
  BookOpen,
  Settings,
  ChartNoAxesCombined,
  Sprout,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  RefreshCw,
  Check,
  X,
  Search,
  Pencil,
  Archive,
  Trash2,
  Pause,
  Play,
  ShieldCheck,
  Menu,
  CircleHelp,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  NotebookPen,
  SlidersHorizontal,
} from "lucide-react";
import { prepareAccountImage } from "@/lib/account-image";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  categories,
  kinds,
  money,
  pct,
  uid,
  today,
  addDays,
  range,
  accountStats,
  planAccountAmount,
  holdingStats,
  positionStats,
  assetType,
  recordPosition,
  type PositionInput,
  deleteHolding,
  unallocated,
  allocateHolding,
  roiValuation,
  type Holding,
  portfolio,
  fxAt,
  convert,
  occurrences,
  nextOccurrence,
  isDue,
  tradingDay,
  validateLedger,
  sortedEntries,
  type Ledger,
  type Currency,
  type Category,
  type Account,
  type Entry,
  type Plan,
  type Journal,
  type Occurrence,
  type EntryKind,
  type Market,
  type CalendarConfig,
} from "@/lib/ledger";
const TrendChart = lazy(() =>
  import("./portfolio-charts").then((m) => ({ default: m.TrendChart })),
);
const AllocationChart = lazy(() =>
  import("./portfolio-charts").then((m) => ({ default: m.AllocationChart })),
);
type Tab =
  | "overview"
  | "accounts"
  | "plans"
  | "journal"
  | "analysis"
  | "settings";
const navigation = [
  { id: "overview", label: "资产总览", icon: LayoutDashboard },
  { id: "accounts", label: "账户与资产", icon: Wallet },
  { id: "plans", label: "定投计划", icon: CalendarDays },
  { id: "journal", label: "投资手账", icon: BookOpen },
  { id: "analysis", label: "收益分析", icon: ChartNoAxesCombined },
  { id: "settings", label: "偏好设置", icon: Settings },
] as const;
type Modal =
  | {
      kind: "entry";
      entry?: Entry;
      accountId?: string;
      occurrence?: Occurrence;
    }
  | { kind: "account"; account?: Account }
  | { kind: "holding"; accountId: string; holding?: Holding }
  | { kind: "holdingRoi"; holding: Holding }
  | { kind: "plan"; plan?: Plan }
  | { kind: "journal"; journal?: Journal }
  | { kind: "transfer" }
  | { kind: "reset" }
  | { kind: "calendar" }
  | {
      kind: "confirm";
      title: string;
      description: string;
      action: () => Promise<void>;
    };
type ServerData = {
  state: Ledger;
  revision: number;
  updatedAt: string;
  autoAdded?: number;
};
const tzLabel = () => "北京时间";
const frequency = (p: Plan) =>
  p.frequency === "daily"
    ? p.market === "CRYPTO"
      ? "每天"
      : "每个交易日"
    : p.frequency === "weekdays"
      ? "每周一至周五"
      : p.frequency === "weekly"
        ? `每周${["", "一", "二", "三", "四", "五", "六", "日"][p.day]}`
        : `每月 ${p.day} 日`;
const monthBounds = (month: string) => ({
  from: month + "-01",
  to: new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10),
});
function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={"field" + (wide ? " field-wide" : "")}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Empty({
  icon: Icon = NotebookPen,
  title,
  text,
  action,
}: {
  icon?: typeof Wallet;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function AssetIcon({ category }: { category: Category }) {
  const c = categories[category];
  return (
    <span
      className="asset-icon"
      style={{ color: c.color, background: c.color + "14" }}
    >
      {c.symbol}
    </span>
  );
}
function AccountIcon({
  account,
}: {
  account: Pick<Account, "category" | "image">;
}) {
  const [failedImage, setFailedImage] = useState<string>();
  return account.image && failedImage !== account.image ? (
    // Already compressed to a <= 12 KB inline icon; also runs in standalone Vite.
    // oxlint-disable-next-line next/no-img-element
    <img
      className="asset-icon account-image"
      src={account.image}
      alt=""
      width={35}
      height={35}
      onError={() => setFailedImage(account.image)}
    />
  ) : (
    <AssetIcon category={account.category} />
  );
}
function DownloadFile(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "操作失败，请重试";
export default function InvestmentApp() {
  const [data, setData] = useState<ServerData | null>(null);
  const [minute, setMinute] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setMinute(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [modal, setModal] = useState<Modal | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [period, setPeriod] = useState<number | "all">(30);
  const [mobile, setMobile] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [recordFilter, setRecordFilter] = useState("all");
  const [journalTab, setJournalTab] = useState<"entries" | "notes">("entries");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today());
  const [recordPage, setRecordPage] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef(data);
  const saving = useRef(false);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  function navigate(next: Tab) {
    setTab(next);
    setDetailId(null);
    setMobile(false);
    window.history.replaceState(null, "", "#" + next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function save(state: Ledger, message = "已保存") {
    if (saving.current) throw Error("正在保存上一笔记录，请稍候");
    if (!dataRef.current) throw Error("账本尚未加载");
    validateLedger(state);
    saving.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/ledger", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, revision: dataRef.current.revision }),
      });
      const body = (await response.json()) as ServerData & { error: string };
      if (!response.ok) throw Error(body.error);
      dataRef.current = body;
      setData(body);
      setNotice(message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function change(edit: (state: Ledger) => void, message?: string) {
    if (!dataRef.current) return;
    const next = structuredClone(dataRef.current.state);
    edit(next);
    await save(next, message);
  }
  async function syncFx(quiet = false) {
    try {
      const response = await fetch("/api/fx");
      const body = (await response.json()) as {
        date: string;
        rate: number;
        source: string;
        error: string;
      };
      if (!response.ok) throw Error(body.error);
      await change(
        (s) => {
          s.fxRates = s.fxRates.filter((r) => r.date !== body.date);
          s.fxRates.push(body);
        },
        quiet ? "参考汇率已自动更新" : "汇率已更新，历史流水汇率保持不变",
      );
    } catch (e) {
      setNotice(errorText(e));
    }
  }
  async function load() {
    try {
      const response = await fetch("/api/ledger");
      const body = (await response.json()) as ServerData & { error: string };
      if (!response.ok) throw Error(body.error);
      if (
        saving.current ||
        (dataRef.current && body.revision < dataRef.current.revision)
      )
        return;
      dataRef.current = body;
      setData(body);
      setLoadError("");
      if (body.autoAdded) setNotice(`已自动补记 ${body.autoAdded} 笔定投`);
      if (body.state.settings.autoFx && fxAt(body.state).date < today())
        void syncFx(true);
    } catch (e) {
      setLoadError(errorText(e));
    }
  }
  useEffect(() => {
    const task = setTimeout(() => void load(), 0);
    const hash = window.location.hash.slice(1);
    queueMicrotask(() => {
      if (navigation.some((n) => n.id === hash)) setTab(hash as Tab);
    });
    const poll = setInterval(() => {
      if (!saving.current) void load();
    }, 60_000);
    return () => {
      clearTimeout(task);
      clearInterval(poll);
    };
  }, []);
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: "get_investment_summary",
            description:
              "读取已保存账本的总资产、双币种汇总及原币账户收益，不修改记录。",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: (input: unknown) => {
              if (
                !input ||
                typeof input !== "object" ||
                Object.keys(input).length
              )
                throw Error("不接受参数");
              if (!dataRef.current) throw Error("账本尚未加载");
              return {
                usd: portfolio(dataRef.current.state, "USD"),
                cny: portfolio(dataRef.current.state, "CNY"),
              };
            },
          },
          { signal: controller.signal },
        ),
      ).catch(() => {});
      Promise.resolve(
        context.registerTool(
          {
            name: "start_investment_entry",
            description: "打开记账表单供用户填写和确认，不创建流水。",
            inputSchema: {
              type: "object",
              properties: { accountId: { type: "string" } },
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute: (input: unknown) => {
              const i = input as { accountId?: string };
              if (
                !i ||
                typeof i !== "object" ||
                Object.keys(i).some((k) => k !== "accountId") ||
                (i.accountId &&
                  !dataRef.current?.state.accounts.some(
                    (a) => a.id === i.accountId && !a.archived,
                  ))
              )
                throw Error("账户无效");
              setModal({ kind: "entry", accountId: i.accountId });
              return { status: "form_opened" };
            },
          },
          { signal: controller.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => controller.abort();
  }, []);
  const s = data?.state;
  const totals = useMemo(
    () => (s ? portfolio(s, currency) : null),
    [s, currency],
  );
  const usd = useMemo(() => (s ? portfolio(s, "USD") : null), [s]);
  const cny = useMemo(() => (s ? portfolio(s, "CNY") : null), [s]);
  const due = useMemo(
    () =>
      s
        ? occurrences(
            s,
            addDays(today("Asia/Shanghai", new Date(minute)), -90),
            today("Asia/Shanghai", new Date(minute)),
          ).filter(
            (o) =>
              o.plan.mode === "manual" &&
              !o.done &&
              !o.skipped &&
              isDue(o, new Date(minute)),
          )
        : [],
    [s, minute],
  );
  const upcoming = useMemo(
    () =>
      s
        ? occurrences(
            s,
            today("Asia/Shanghai", new Date(minute)),
            addDays(today("Asia/Shanghai", new Date(minute)), 40),
          )
            .filter((o) => !o.done && !o.skipped)
            .slice(0, 5)
        : [],
    [s, minute],
  );
  const monthEvents = useMemo(() => {
    const b = monthBounds(month);
    return s ? occurrences(s, b.from, b.to) : [];
  }, [s, month]);
  const detailAccount = s?.accounts.find((a) => a.id === detailId);
  const activeAccounts = s?.accounts.filter((a) => !a.archived) ?? [];
  const filteredEntries = useMemo(
    () =>
      s
        ? sortedEntries(s.entries)
            .reverse()
            .filter((e) => {
              const a = s.accounts.find((a) => a.id === e.accountId)!;
              return (
                (recordFilter === "all" || e.accountId === recordFilter) &&
                (
                  a.name +
                  " " +
                  (s.holdings?.find((h) => h.id === e.holdingId)?.symbol ??
                    "") +
                  " " +
                  e.note +
                  " " +
                  kinds[e.kind] +
                  " " +
                  e.date
                )
                  .toLowerCase()
                  .includes(search.toLowerCase())
              );
            })
        : [],
    [s, recordFilter, search],
  );
  async function removeEntry(entry: Entry) {
    await change((s) => {
      if (entry.planKey && !s.skipped.includes(entry.planKey))
        s.skipped.push(entry.planKey);
      s.entries = s.entries.filter((e) =>
        entry.transferId
          ? e.transferId !== entry.transferId
          : e.id !== entry.id,
      );
    }, "流水已移除，资产与收益已重算");
  }
  function exportData() {
    if (!s) return;
    DownloadFile(
      `澄明-账本备份-${today()}.json`,
      JSON.stringify(s, null, 2),
      "application/json",
    );
    setNotice("账本备份已下载，包含账户、流水、定投、手记和汇率");
  }
  function exportCsv() {
    if (!s) return;
    const cell = (v: unknown) =>
      '"' +
      String(v)
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const rows = [
      [
        "日期",
        "账户",
        "资产",
        "类型",
        "金额",
        "币种",
        "记账汇率 USD/CNY",
        "备注",
      ],
      ...sortedEntries(s.entries).map((e) => {
        const a = s.accounts.find((a) => a.id === e.accountId)!;
        return [
          e.date,
          a.name,
          s.holdings?.find((h) => h.id === e.holdingId)?.symbol ?? "未分配",
          kinds[e.kind],
          e.amount,
          a.currency,
          e.fx,
          e.note,
        ];
      }),
    ];
    DownloadFile(
      `澄明-资金流水-${today()}.csv`,
      "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n"),
      "text/csv;charset=utf-8",
    );
  }
  async function importData(file: File) {
    try {
      if (file.size > 4_000_000) throw Error("文件不能超过 4 MB");
      const next = validateLedger(JSON.parse(await file.text()));
      setModal({
        kind: "confirm",
        title: "用备份恢复账本？",
        description: `备份包含 ${next.accounts.length} 个账户、${next.entries.length} 条流水。恢复会替换当前账本，请先导出备份。`,
        action: async () => {
          await save(next, "账本已恢复");
        },
      });
    } catch (e) {
      setNotice(errorText(e));
    }
  }
  const modalSubmit = async (fn: () => Promise<void>) => {
    try {
      await fn();
      setModal(null);
    } catch (e) {
      setNotice(errorText(e));
      throw e;
    }
  };
  return (
    <div className="app-shell">
      <aside className={"sidebar" + (mobile ? " mobile-open" : "")}>
        <div className="brand">
          <Sprout size={29} />
          <div>
            澄明<span>CLARITY / 投资手账</span>
          </div>
        </div>
        <div className="workspace-label">我的投资空间</div>
        <nav>
          {navigation.map((n) => (
            <button
              key={n.id}
              onClick={() => navigate(n.id)}
              className={tab === n.id ? "active" : ""}
            >
              <n.icon size={18} />
              {n.label}
              {n.id === "plans" && due.length > 0 && (
                <span className="nav-count">{due.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span>LONG-TERM THINKING</span>
          <p>
            让时间，
            <br />
            成为你的合伙人。
          </p>
          <div className="tiny-line" />
        </div>
        <div className="profile">
          <span className="avatar">我</span>
          <div>
            我的个人账本
            <small>
              <ShieldCheck size={10} /> 独立私有空间
            </small>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          aria-label="关闭导航"
          className="mobile-scrim"
          onClick={() => setMobile(false)}
        />
      )}
      <main className="main">
        <header className="topbar">
          <div className="row">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>
              {s?.settings.name ?? "我的投资空间"} <b>/</b>{" "}
              {navigation.find((n) => n.id === tab)?.label}
            </span>
          </div>
          <div className="row top-right">
            <span className="status">
              <i />
              {busy ? "正在保存…" : data ? "账本已保存" : "正在连接账本"}
            </span>
            <span className="top-date">{today().replaceAll("-", " / ")}</span>
            <button
              className="icon-button"
              title="刷新账本"
              aria-label="刷新账本"
              disabled={busy}
              onClick={() => void load()}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </header>
        {!s || !totals || !usd || !cny ? (
          <div className="page">
            <div
              className={
                "page-heading" +
                (tab === "accounts" && detailAccount
                  ? " account-detail-heading"
                  : "")
              }
            >
              <div>
                <div className="eyebrow">YOUR MONEY, IN PERSPECTIVE</div>
                <h1>每一笔投入，都有回响。</h1>
              </div>
            </div>
            <div className="panel">
              <Empty
                title={loadError ? "暂时无法打开账本" : "正在打开你的投资手账"}
                text={loadError || "读取账户、历史流水与定投计划…"}
                action={
                  loadError && (
                    <Button onClick={() => void load()}>重新连接</Button>
                  )
                }
              />
              {loadError.includes("登录") && (
                // Sites sign-in must use a top-level navigation, never router prefetch.
                // eslint-disable-next-line next/no-html-link-for-pages
                <a
                  href="/signin-with-chatgpt?return_to=%2F"
                  target="_top"
                  className="signin-link"
                >
                  使用 ChatGPT 登录
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  {tab === "overview"
                    ? "YOUR MONEY, IN PERSPECTIVE"
                    : tab === "accounts"
                      ? "A PLACE FOR EVERY ASSET"
                      : tab === "plans"
                        ? "CONSISTENCY, BY DESIGN"
                        : tab === "journal"
                          ? "EVERY STEP TELLS A STORY"
                          : tab === "analysis"
                            ? "BEYOND THE NUMBERS"
                            : "MAKE IT YOURS"}
                </div>
                <h1>
                  {
                    {
                      overview: "看见积累的力量",
                      accounts: "每笔资产，各就其位",
                      plans: "把坚持，写进日历",
                      journal: "记录每一步投资",
                      analysis: "让收益，有据可循",
                      settings: "你的账本，你来定义",
                    }[tab]
                  }
                  <span>。</span>
                </h1>
                <p>
                  {
                    {
                      overview: "四个投资方向，一个清晰的全貌。",
                      accounts: "跨市场、跨账户，始终保持清晰。",
                      plans: "小步投入，让长期计划照常发生。",
                      journal: "留下数字，也留下当时的思考。",
                      analysis: "剔除资金进出，认真看待真实回报。",
                      settings: "管理汇率、交易日历与属于你的数据。",
                    }[tab]
                  }
                </p>
              </div>
              <div className="row">
                {tab === "overview" && (
                  <div className="currency-switch">
                    <button
                      className={currency === "USD" ? "selected" : ""}
                      onClick={() => setCurrency("USD")}
                    >
                      USD
                    </button>
                    <button
                      className={currency === "CNY" ? "selected" : ""}
                      onClick={() => setCurrency("CNY")}
                    >
                      CNY
                    </button>
                  </div>
                )}
                <Button
                  className="primary-button"
                  onClick={() =>
                    setModal(
                      tab === "accounts"
                        ? { kind: "account" }
                        : tab === "plans"
                          ? { kind: "plan" }
                          : tab === "journal" && journalTab === "notes"
                            ? { kind: "journal" }
                            : { kind: "entry" },
                    )
                  }
                >
                  <Plus size={16} />
                  {tab === "accounts"
                    ? "新增账户"
                    : tab === "plans"
                      ? "新建计划"
                      : tab === "journal" && journalTab === "notes"
                        ? "写手记"
                        : "记一笔"}
                </Button>
              </div>
            </div>
            {tab === "overview" && (
              <>
                <div className="stats-grid">
                  <section className="stat-card total-card">
                    <div className="stat-label">
                      总资产 <Wallet size={16} />
                    </div>
                    <div className="hero-number">
                      {money(totals.value, currency).split(".")[0]}
                      <span>
                        .{money(totals.value, currency).split(".")[1]}
                      </span>
                    </div>
                    <p className="secondary-total">
                      ≈{" "}
                      {money(
                        currency === "USD" ? cny.value : usd.value,
                        currency === "USD" ? "CNY" : "USD",
                      )}{" "}
                      <span>{currency === "USD" ? "人民币" : "美元"}</span>
                    </p>
                    <div className="stat-footer">
                      <span>1 USD = {fxAt(s).rate.toFixed(4)} CNY</span>
                      <span>{fxAt(s).date.slice(5)} 参考汇率</span>
                    </div>
                  </section>
                  <section className="stat-card">
                    <div className="stat-label">
                      累计净投入 <ArrowDownLeft size={16} />
                    </div>
                    <div className="stat-number">
                      {money(totals.net, currency)}
                    </div>
                    <p>累计投入 {money(totals.invested, currency)}</p>
                    <div className="stat-footer neutral">
                      已取出 {money(totals.withdrawn, currency)}{" "}
                      <span>按流水汇率</span>
                    </div>
                  </section>
                  <section className="stat-card">
                    <div className="stat-label">
                      累计收益 <ChartNoAxesCombined size={16} />
                    </div>
                    <div
                      className={
                        "stat-number " + (totals.profit >= 0 ? "gain" : "loss")
                      }
                    >
                      {totals.profit > 0 ? "+" : ""}
                      {money(totals.profit, currency)}
                    </div>
                    <p>
                      <span
                        className={
                          "return-tag " + (totals.profit >= 0 ? "gain" : "loss")
                        }
                      >
                        {pct(totals.roi)}
                      </span>{" "}
                      累计投入回报率
                    </p>
                    <div className="stat-footer neutral">
                      {s.entries.some((e) => e.kind === "valuation")
                        ? "已按最新记录估值计算"
                        : "初始估值按本金，等待首次更新"}
                    </div>
                  </section>
                </div>
                <div className="overview-charts">
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          资产生长曲线{" "}
                          <span className="unit-tag">{currency}</span>
                        </h2>
                        <p>让每一次积累，都看得见。</p>
                      </div>
                      <div className="segmented">
                        {[
                          [7, "7 天"],
                          [30, "30 天"],
                          [90, "90 天"],
                          ["all", "全部"],
                        ].map(([v, label]) => (
                          <button
                            key={v}
                            className={period === v ? "selected" : ""}
                            onClick={() => setPeriod(v as number | "all")}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="chart-legend">
                      <span>
                        <i style={{ background: "#168778" }} />
                        总资产
                      </span>
                      <span>
                        <i style={{ background: "#b8c9ce" }} />
                        净投入
                      </span>
                    </div>
                    <Suspense
                      fallback={
                        <div className="chart-placeholder">
                          正在绘制资产曲线…
                        </div>
                      }
                    >
                      <TrendChart
                        state={s}
                        currency={currency}
                        period={period}
                      />
                    </Suspense>
                  </section>
                  <section className="panel allocation">
                    <div className="panel-heading">
                      <div>
                        <h2>资产配置</h2>
                        <p>四个方向，各有位置。</p>
                      </div>
                      <span className="unit-tag">按市值</span>
                    </div>
                    <Suspense fallback={<div className="chart-placeholder" />}>
                      <AllocationChart state={s} currency={currency} />
                    </Suspense>
                  </section>
                </div>
                <div className="section-title">
                  <h2>
                    我的投资组合 <span>{activeAccounts.length} 个账户</span>
                  </h2>
                  <button onClick={() => navigate("accounts")}>
                    管理账户 <ArrowRight size={14} />
                  </button>
                </div>
                <div className="strategy-grid standalone">
                  {Object.entries(categories).map(([key, info]) => {
                    const assets = totals.categoryAssets.filter(
                      (a) => a.category === key,
                    );
                    const native = key === "fund" ? "CNY" : "USD";
                    const value = assets.reduce(
                      (sum, a) =>
                        sum + convert(a.value, a.currency, native, totals.fx),
                      0,
                    );
                    const profit = assets.reduce(
                      (sum, a) =>
                        sum + convert(a.profit, a.currency, native, totals.fx),
                      0,
                    );
                    const plans = s.plans.filter(
                      (p) =>
                        assets.some((a) => a.accountId === p.accountId) &&
                        !p.paused,
                    );
                    return (
                      <button
                        className="strategy-card"
                        key={key}
                        onClick={() => {
                          setCategory(key);
                          navigate("accounts");
                        }}
                      >
                        <div className="row">
                          <AssetIcon category={key as Category} />
                          <ArrowUpRight size={15} className="muted ml-auto" />
                        </div>
                        <h3>{info.label}</h3>
                        <strong>{money(value, native)}</strong>
                        <div className="strategy-profit">
                          <span className={profit >= 0 ? "gain" : "loss"}>
                            {profit > 0 ? "+" : ""}
                            {money(profit, native)}
                          </span>
                          <span>累计收益</span>
                        </div>
                        <div className="strategy-foot">
                          {new Set(assets.map((a) => a.accountId)).size} 个账户{" "}
                          <span>
                            {plans.length
                              ? `${plans.length} 项定投进行中`
                              : "独立策略记录"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="overview-bottom">
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>下一笔，继续积累</h2>
                        <p>
                          {due.length
                            ? `近 90 天有 ${due.length} 笔待确认，确认后才计入资产。`
                            : "计划金额不会提前计入你的资产。"}
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => navigate("plans")}
                      >
                        全部计划 <ArrowRight size={13} />
                      </button>
                    </div>
                    {upcoming.length ? (
                      <div className="upcoming-list">
                        {upcoming.slice(0, 4).map((o) => (
                          <div className="upcoming-item" key={o.key}>
                            <AccountIcon account={o.account} />
                            <div className="grow">
                              <b>{o.plan.name}</b>
                              <small>
                                {o.date.slice(5).replace("-", "月")}日 ·{" "}
                                {o.plan.time} {tzLabel()}
                              </small>
                            </div>
                            <strong>
                              {money(
                                o.plan.amount,
                                o.plan.currency ?? o.account.currency,
                              )}
                            </strong>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!isDue(o) || o.plan.mode !== "manual"}
                              onClick={() =>
                                setModal({
                                  kind: "entry",
                                  occurrence: o,
                                  accountId: o.account.id,
                                })
                              }
                            >
                              {o.plan.mode !== "manual"
                                ? "自动记账"
                                : isDue(o)
                                  ? "确认记录"
                                  : "待执行"}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        title="计划正在休息"
                        text="新增或恢复一项定投，下一步就会出现在这里。"
                      />
                    )}
                  </section>
                  <section className="rhythm-panel">
                    <div className="row">
                      <CalendarCheck size={20} />
                      <span>本周投资节律</span>
                    </div>
                    <div className="week-strip">
                      {range(today(), addDays(today(), 6)).map((date) => {
                        const cn = tradingDay(date, "CN", s.calendar);
                        return (
                          <div
                            key={date}
                            className={date === today() ? "current" : ""}
                          >
                            <small>
                              {
                                ["日", "一", "二", "三", "四", "五", "六"][
                                  new Date(date + "T12:00:00Z").getUTCDay()
                                ]
                              }
                            </small>
                            <strong>{date.slice(8)}</strong>
                            <span
                              className={
                                cn.open ? "market-dot" : "market-dot closed"
                              }
                              title={cn.reason}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="rhythm-note">
                      <i className="market-dot" />
                      中国市场交易日 <span>Crypto 全年可交易</span>
                    </div>
                    <p>
                      不用每天做决定。
                      <br />
                      让好的计划，成为习惯。
                    </p>
                  </section>
                </div>
              </>
            )}
            {tab === "accounts" && !detailAccount && (
              <>
                <div className="toolbar">
                  <div className="filter-tabs">
                    {[
                      ["all", "全部账户"],
                      ...Object.entries(categories).map(([k, v]) => [
                        k,
                        v.label,
                      ]),
                      ["archived", "已归档"],
                    ].map(([key, label]) => (
                      <button
                        className={category === key ? "selected" : ""}
                        key={key}
                        onClick={() => setCategory(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setModal({ kind: "transfer" })}
                  >
                    <ArrowRightLeft size={15} />
                    账户间转账
                  </Button>
                </div>
                <div className="account-grid">
                  {s.accounts
                    .filter((a) =>
                      category === "archived"
                        ? a.archived
                        : !a.archived &&
                          (category === "all" ||
                            a.category === category ||
                            (s.holdings ?? []).some(
                              (h) =>
                                h.accountId === a.id &&
                                assetType(s, h) === category,
                            )),
                    )
                    .map((a) => {
                      const stats = accountStats(s, a);
                      return (
                        <section
                          className={
                            "panel account-card" +
                            (a.archived ? " archived" : "")
                          }
                          key={a.id}
                        >
                          <div className="account-heading">
                            <AccountIcon account={a} />
                            <div className="grow">
                              <h3>{a.name}</h3>
                              <small>
                                {a.platform || "个人账户"} · {a.currency}
                              </small>
                            </div>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={"编辑 " + a.name}
                              onClick={() =>
                                setModal({ kind: "account", account: a })
                              }
                            >
                              <Pencil size={14} />
                            </Button>
                          </div>
                          <div className="account-value">
                            {money(stats.value, a.currency)}
                          </div>
                          <div className="account-metrics">
                            <div>
                              <span>净投入</span>
                              <strong>{money(stats.net, a.currency)}</strong>
                            </div>
                            <div>
                              <span>累计收益</span>
                              <strong
                                className={stats.profit >= 0 ? "gain" : "loss"}
                              >
                                {money(stats.profit, a.currency)}
                              </strong>
                            </div>
                            <div>
                              <span>投入回报率</span>
                              <strong
                                className={stats.profit >= 0 ? "gain" : "loss"}
                              >
                                {pct(stats.roi)}
                              </strong>
                            </div>
                          </div>
                          <div className="account-mark">
                            <Clock3 size={12} />
                            {stats.marked
                              ? `最近估值 ${stats.marked}`
                              : "尚未更新估值 · 按流水金额计"}
                          </div>
                          {a.note && <p className="account-note">{a.note}</p>}
                          <button
                            className="enter-account"
                            onClick={() => {
                              setDetailId(a.id);
                              window.scrollTo({ top: 0, behavior: "instant" });
                            }}
                          >
                            <span>
                              <strong>进入账户</strong>
                              <small>
                                {
                                  (s.holdings ?? []).filter(
                                    (h) => h.accountId === a.id && !h.archived,
                                  ).length
                                }{" "}
                                个资产 · 管理金额与收益率
                              </small>
                            </span>
                            <ArrowRight size={20} />
                          </button>
                          <div className="account-actions">
                            {!a.archived ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setModal({
                                      kind: "entry",
                                      accountId: a.id,
                                      entry: undefined,
                                    })
                                  }
                                >
                                  <Plus size={13} />
                                  记一笔
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setRecordFilter(a.id);
                                    setJournalTab("entries");
                                    navigate("journal");
                                  }}
                                >
                                  查看流水 <ArrowRight size={13} />
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  void change((s) => {
                                    s.accounts.find(
                                      (x) => x.id === a.id,
                                    )!.archived = false;
                                  }, "账户已恢复").catch((e) =>
                                    setNotice(errorText(e)),
                                  )
                                }
                              >
                                恢复账户
                              </Button>
                            )}
                          </div>
                        </section>
                      );
                    })}
                  <button
                    className="add-account-card"
                    onClick={() => setModal({ kind: "account" })}
                  >
                    <span>
                      <Plus size={23} />
                    </span>
                    <h3>新的投资，从这里开始</h3>
                    <p>添加账户，让每笔资产都有归属</p>
                  </button>
                </div>
                <div className="info-strip">
                  <CircleHelp size={15} />
                  归档账户会暂停相关定投；余额和历史收益仍计入总资产。空账户可删除。
                </div>
              </>
            )}
            {tab === "accounts" && detailAccount && (
              <AccountDetail
                state={s}
                account={detailAccount}
                onBack={() => setDetailId(null)}
                onEditAccount={() =>
                  setModal({ kind: "account", account: detailAccount })
                }
                onAdd={() =>
                  setModal({ kind: "holding", accountId: detailAccount.id })
                }
                onEdit={(h) =>
                  setModal({
                    kind: "holding",
                    accountId: detailAccount.id,
                    holding: h,
                  })
                }
                onDelete={(h) =>
                  setModal({
                    kind: "confirm",
                    title: "删除 " + h.name + "？",
                    description:
                      "将删除此资产、关联流水和定投计划，并从账户资产中移除。其他资产不受影响。此操作不可撤销。",
                    action: () =>
                      change(
                        (next) => deleteHolding(next, h),
                        "资产已删除，账户资产已重算",
                      ),
                  })
                }
                onRecords={() => {
                  setRecordFilter(detailAccount.id);
                  setJournalTab("entries");
                  navigate("journal");
                }}
              />
            )}
            {tab === "plans" && (
              <>
                <div className="plan-summary">
                  <div>
                    <span className="round-icon">
                      <CalendarDays size={21} />
                    </span>
                    <div>
                      <small>本月计划投入</small>
                      <strong>
                        {money(
                          monthEvents.reduce(
                            (sum, o) =>
                              sum +
                              convert(
                                o.plan.amount,
                                o.plan.currency ?? o.account.currency,
                                "CNY",
                                fxAt(s).rate,
                              ),
                            0,
                          ),
                          "CNY",
                        )}{" "}
                        <span>
                          ≈{" "}
                          {money(
                            monthEvents.reduce(
                              (sum, o) =>
                                sum +
                                convert(
                                  o.plan.amount,
                                  o.plan.currency ?? o.account.currency,
                                  "USD",
                                  fxAt(s).rate,
                                ),
                              0,
                            ),
                          )}
                        </span>
                      </strong>
                    </div>
                  </div>
                  <div>
                    <small>进行中的计划</small>
                    <strong>
                      {
                        s.plans.filter(
                          (p) =>
                            !p.paused &&
                            activeAccounts.some((a) => a.id === p.accountId),
                        ).length
                      }{" "}
                      <span>项</span>
                    </strong>
                  </div>
                  <div>
                    <small>{month} 已完成</small>
                    <strong>
                      {monthEvents.filter((o) => o.done).length}{" "}
                      <span>/ {monthEvents.length} 笔</span>
                    </strong>
                  </div>
                </div>
                <div className="plan-grid">
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>定投日历</h2>
                      <div className="row">
                        <button
                          className="icon-button"
                          aria-label="上个月"
                          onClick={() => {
                            setMonth(addDays(month + "-01", -1).slice(0, 7));
                            setSelectedDay("");
                          }}
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <strong className="calendar-month">
                          {month.replace("-", " 年 ")} 月
                        </strong>
                        <button
                          className="icon-button"
                          aria-label="下个月"
                          onClick={() => {
                            setMonth(
                              addDays(monthBounds(month).to, 1).slice(0, 7),
                            );
                            setSelectedDay("");
                          }}
                        >
                          <ChevronRight size={17} />
                        </button>
                        <button
                          className="text-button"
                          onClick={() => {
                            setMonth(today().slice(0, 7));
                            setSelectedDay(today());
                          }}
                        >
                          今天
                        </button>
                      </div>
                    </div>
                    <div className="calendar">
                      <div className="calendar-week">
                        {"一二三四五六日".split("").map((d) => (
                          <span key={d}>{d}</span>
                        ))}
                      </div>
                      <div className="calendar-days">
                        {Array.from(
                          {
                            length:
                              (new Date(month + "-01T12:00:00Z").getUTCDay() +
                                6) %
                              7,
                          },
                          (_, i) => (
                            <div className="calendar-blank" key={"blank" + i} />
                          ),
                        )}
                        {range(month + "-01", monthBounds(month).to).map(
                          (date) => {
                            const items = monthEvents.filter(
                              (o) => o.date === date,
                            );
                            const market = tradingDay(date, "CN", s.calendar);
                            return (
                              <button
                                key={date}
                                className={
                                  "calendar-day" +
                                  (date === today() ? " today" : "") +
                                  (date === selectedDay ? " picked" : "") +
                                  (!market.open ? " non-trading" : "")
                                }
                                onClick={() => setSelectedDay(date)}
                              >
                                <span>{Number(date.slice(8))}</span>
                                <small>
                                  {market.open
                                    ? ""
                                    : market.known
                                      ? "休市"
                                      : "待核验"}
                                </small>
                                <div>
                                  {[
                                    ...new Set(
                                      items.map((o) => o.account.category),
                                    ),
                                  ].map((c) => (
                                    <i
                                      className="dot"
                                      key={c}
                                      style={{
                                        background: categories[c].color,
                                      }}
                                    />
                                  ))}
                                </div>
                                {items.some((o) => o.done) && (
                                  <Check size={11} className="day-check" />
                                )}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </div>
                    <div className="calendar-key">
                      <span>
                        <i className="dot" style={{ background: "#238f7d" }} />
                        Crypto
                      </span>
                      <span>
                        <i className="dot" style={{ background: "#7292c5" }} />
                        美股
                      </span>
                      <span>
                        <i className="dot" style={{ background: "#a296c4" }} />
                        基金
                      </span>
                      <small>
                        休市标记为中国市场；所有定投均按北京时间执行，交易日期按对应市场日历判断。
                      </small>
                    </div>
                    {!s.calendar.CN[month.slice(0, 4)] && (
                      <div className="calendar-warning">
                        该年度中国市场日历未核验，基金计划暂不生成。请在设置中更新休市日期。
                      </div>
                    )}
                  </section>
                  <section className="panel day-agenda">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          {selectedDay
                            ? selectedDay.slice(5).replace("-", " 月 ") +
                              " 日安排"
                            : "选择一个日期"}
                        </h2>
                        <p>自动计划到期后入账；手动计划需确认。</p>
                      </div>
                    </div>
                    {monthEvents.filter((o) => o.date === selectedDay)
                      .length ? (
                      monthEvents
                        .filter((o) => o.date === selectedDay)
                        .map((o) => (
                          <div className="agenda-item" key={o.key}>
                            <div className="row">
                              <AccountIcon account={o.account} />
                              <div>
                                <b>{o.plan.name}</b>
                                <small>
                                  {o.plan.time} · {tzLabel()}
                                </small>
                              </div>
                            </div>
                            <div className="agenda-amount">
                              {money(
                                o.plan.amount,
                                o.plan.currency ?? o.account.currency,
                              )}
                              <span>
                                {o.done
                                  ? "已记录"
                                  : o.skipped
                                    ? "已跳过"
                                    : isDue(o)
                                      ? o.plan.mode === "manual"
                                        ? "待确认"
                                        : "待自动记账"
                                      : "待执行"}
                              </span>
                            </div>
                            <div className="row">
                              {!o.done && !o.skipped && (
                                <>
                                  <Button
                                    size="sm"
                                    disabled={
                                      !isDue(o) || o.plan.mode !== "manual"
                                    }
                                    onClick={() =>
                                      setModal({
                                        kind: "entry",
                                        accountId: o.account.id,
                                        occurrence: o,
                                      })
                                    }
                                  >
                                    <Check size={13} />
                                    {o.plan.mode === "manual"
                                      ? "确认记录"
                                      : "自动记账"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      void change((s) => {
                                        s.skipped.push(o.key);
                                      }, "本次已跳过").catch((e) =>
                                        setNotice(errorText(e)),
                                      )
                                    }
                                  >
                                    跳过
                                  </Button>
                                </>
                              )}
                              {o.skipped && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    void change((s) => {
                                      s.skipped = s.skipped.filter(
                                        (k) => k !== o.key,
                                      );
                                    }, "已恢复本次定投").catch((e) =>
                                      setNotice(errorText(e)),
                                    )
                                  }
                                >
                                  撤销跳过
                                </Button>
                              )}
                            </div>
                          </div>
                        ))
                    ) : (
                      <Empty
                        icon={CalendarDays}
                        title="这一天，留给生活"
                        text="暂无定投安排。计划会遵循各市场交易日历。"
                      />
                    )}
                  </section>
                </div>
                {due.length > 0 && (
                  <section className="panel overdue-panel">
                    <div className="panel-heading">
                      <h2>
                        待确认的定投{" "}
                        <span className="unit-tag">{due.length}</span>
                      </h2>
                      <p>最近 90 天 · 更早记录可通过日历查看</p>
                    </div>
                    <div className="upcoming-list">
                      {due.slice(0, 8).map((o) => (
                        <div className="upcoming-item" key={o.key}>
                          <div className="grow">
                            <b>{o.plan.name}</b>
                            <small>
                              {o.date} · {o.plan.time} {tzLabel()}
                            </small>
                          </div>
                          <strong>
                            {money(
                              o.plan.amount,
                              o.plan.currency ?? o.account.currency,
                            )}
                          </strong>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setModal({
                                kind: "entry",
                                occurrence: o,
                                accountId: o.account.id,
                              })
                            }
                          >
                            确认记录
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void change((s) => {
                                s.skipped.push(o.key);
                              }, "本次已跳过").catch((e) =>
                                setNotice(errorText(e)),
                              )
                            }
                          >
                            跳过
                          </Button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                <div className="section-title">
                  <h2>我的定投计划</h2>
                  <span className="muted small">
                    日计划遇休市跳过 · 周/月计划顺延至下一个交易日
                  </span>
                </div>
                <div className="plan-cards">
                  {s.plans.map((p) => {
                    const a = s.accounts.find((a) => a.id === p.accountId)!;
                    return (
                      <section className="panel plan-card" key={p.id}>
                        <div className="row">
                          <AccountIcon account={a} />
                          <div className="grow">
                            <h3>{p.name}</h3>
                            <small>
                              {a.name}
                              {p.holdingId
                                ? " · " +
                                  s.holdings?.find((h) => h.id === p.holdingId)
                                    ?.symbol
                                : ""}{" "}
                              · {p.mode === "manual" ? "手动确认" : "自动记账"}
                            </small>
                          </div>
                          <span
                            className={
                              "plan-status" +
                              (p.paused || a.archived ? " paused" : "")
                            }
                          >
                            {p.paused || a.archived ? "已暂停" : "进行中"}
                          </span>
                        </div>
                        <strong className="plan-amount">
                          {money(p.amount, p.currency ?? a.currency)}
                          <small>/ {frequency(p)}</small>
                        </strong>
                        <p>
                          {p.time} · {tzLabel()} ·{" "}
                          {p.market === "CRYPTO"
                            ? "全年可交易"
                            : p.market === "CN"
                              ? "中国市场交易日"
                              : "美国市场交易日"}
                        </p>
                        <div className="plan-next">
                          <CalendarDays size={12} />
                          下次：
                          {a.archived || p.paused
                            ? "暂停中"
                            : (nextOccurrence(s, p) ?? "日历待更新")}
                        </div>
                        <div className="account-actions">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setModal({ kind: "plan", plan: p })}
                          >
                            <Pencil size={12} />
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={a.archived}
                            onClick={() =>
                              void change(
                                (s) => {
                                  s.plans.find((x) => x.id === p.id)!.paused =
                                    !p.paused;
                                  if (p.paused)
                                    s.plans.find(
                                      (x) => x.id === p.id,
                                    )!.autoFrom = today();
                                },
                                p.paused ? "定投已恢复" : "定投已暂停",
                              ).catch((e) => setNotice(errorText(e)))
                            }
                          >
                            {p.paused ? (
                              <Play size={12} />
                            ) : (
                              <Pause size={12} />
                            )}{" "}
                            {p.paused ? "恢复" : "暂停"}
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={"删除计划 " + p.name}
                            onClick={() =>
                              setModal({
                                kind: "confirm",
                                title: "删除这项定投计划？",
                                description:
                                  "已确认的历史流水会保留。此操作只移除未来安排。",
                                action: () =>
                                  change((s) => {
                                    s.plans = s.plans.filter(
                                      (x) => x.id !== p.id,
                                    );
                                  }, "计划已删除"),
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </section>
                    );
                  })}
                </div>
                <div className="info-strip">
                  <CircleHelp size={15} />
                  自动模式按设定金额记账，无需逐笔填写。关闭页面期间的到期记录会在下次打开时补齐；这不代表实际扣款或成交。
                </div>
              </>
            )}
            {tab === "journal" && (
              <>
                <div className="toolbar">
                  <div className="filter-tabs">
                    <button
                      className={journalTab === "entries" ? "selected" : ""}
                      onClick={() => setJournalTab("entries")}
                    >
                      资金流水 <span>{s.entries.length}</span>
                    </button>
                    <button
                      className={journalTab === "notes" ? "selected" : ""}
                      onClick={() => setJournalTab("notes")}
                    >
                      投资手记 <span>{s.journals.length}</span>
                    </button>
                  </div>
                  <div className="row">
                    {journalTab === "entries" && (
                      <>
                        <div className="search-input">
                          <Search size={15} />
                          <Input
                            placeholder="搜索账户、日期或备注"
                            aria-label="搜索流水"
                            value={search}
                            onChange={(e) => {
                              setSearch(e.target.value);
                              setRecordPage(0);
                            }}
                          />
                        </div>
                        <NativeSelect
                          aria-label="筛选账户"
                          value={recordFilter}
                          onChange={(e) => {
                            setRecordFilter(e.target.value);
                            setRecordPage(0);
                          }}
                        >
                          <option value="all">全部账户</option>
                          {s.accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </NativeSelect>
                        <Button variant="outline" onClick={exportCsv}>
                          <Download size={14} />
                          导出
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {journalTab === "entries" ? (
                  <section className="panel">
                    {filteredEntries.length ? (
                      <>
                        <div className="table-scroll">
                          <Table className="data-table">
                            <TableHeader>
                              <TableRow>
                                <TableHead>日期 / 账户</TableHead>
                                <TableHead>类型</TableHead>
                                <TableHead className="right">金额</TableHead>
                                <TableHead>备注</TableHead>
                                <TableHead className="right">操作</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredEntries
                                .slice(recordPage * 20, recordPage * 20 + 20)
                                .map((e) => {
                                  const a = s.accounts.find(
                                    (a) => a.id === e.accountId,
                                  )!;
                                  return (
                                    <TableRow key={e.id}>
                                      <TableCell>
                                        <div className="row">
                                          <AccountIcon account={a} />
                                          <div>
                                            <strong>{a.name}</strong>
                                            <small>
                                              {e.date}
                                              {e.holdingId
                                                ? " · " +
                                                  s.holdings?.find(
                                                    (h) => h.id === e.holdingId,
                                                  )?.symbol
                                                : ""}
                                            </small>
                                          </div>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <span className={"entry-tag " + e.kind}>
                                          {e.transferId
                                            ? "内部转账"
                                            : kinds[e.kind]}
                                        </span>
                                        {e.planKey && (
                                          <small>
                                            {e.automatic
                                              ? "自动定投"
                                              : "定投记录"}
                                          </small>
                                        )}
                                      </TableCell>
                                      <TableCell className="right">
                                        <strong
                                          className={
                                            e.kind === "income"
                                              ? "gain"
                                              : e.kind === "fee"
                                                ? "loss"
                                                : ""
                                          }
                                        >
                                          {money(e.amount, a.currency)}
                                        </strong>
                                        <small>
                                          {a.currency} · 汇率 {e.fx.toFixed(4)}
                                        </small>
                                      </TableCell>
                                      <TableCell className="note-cell">
                                        {e.note || "—"}
                                      </TableCell>
                                      <TableCell>
                                        <div className="row justify-end">
                                          {!e.transferId && (
                                            <Button
                                              variant="ghost"
                                              size="icon-sm"
                                              aria-label={"编辑流水 " + e.id}
                                              onClick={() =>
                                                setModal({
                                                  kind: "entry",
                                                  entry: e,
                                                })
                                              }
                                            >
                                              <Pencil size={13} />
                                            </Button>
                                          )}
                                          <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={"删除流水 " + e.id}
                                            onClick={() =>
                                              setModal({
                                                kind: "confirm",
                                                title: e.transferId
                                                  ? "移除这笔转账？"
                                                  : "移除这条流水？",
                                                description: e.transferId
                                                  ? "转出与转入记录会一并移除，账户余额将重新计算。"
                                                  : "历史资产与收益会重新计算。删除的定投会标记为跳过，不会自动重新生成。",
                                                action: () => removeEntry(e),
                                              })
                                            }
                                          >
                                            <Trash2 size={13} />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="pagination">
                          <span>共 {filteredEntries.length} 条记录</span>
                          <div className="row">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={recordPage === 0}
                              onClick={() => setRecordPage((p) => p - 1)}
                            >
                              <ChevronLeft size={13} />
                              上一页
                            </Button>
                            <span>
                              {recordPage + 1} /{" "}
                              {Math.ceil(filteredEntries.length / 20)}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={
                                (recordPage + 1) * 20 >= filteredEntries.length
                              }
                              onClick={() => setRecordPage((p) => p + 1)}
                            >
                              下一页
                              <ChevronRight size={13} />
                            </Button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <Empty
                        title="还没有匹配的记录"
                        text="调整筛选条件，或记下你的第一笔投资。"
                      />
                    )}
                  </section>
                ) : s.journals.length ? (
                  <div className="notes-grid">
                    {[...s.journals]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((j) => (
                        <article className="panel note-card" key={j.id}>
                          <div className="row">
                            <span className="note-tag">
                              {j.tag || "投资思考"}
                            </span>
                            <span className="grow" />
                            <small>{j.date}</small>
                          </div>
                          <h2>{j.title}</h2>
                          <p>{j.body}</p>
                          <div className="row">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setModal({ kind: "journal", journal: j })
                              }
                            >
                              <Pencil size={12} />
                              编辑
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={"删除手记 " + j.title}
                              onClick={() =>
                                setModal({
                                  kind: "confirm",
                                  title: "删除这篇手记？",
                                  description:
                                    "删除后无法恢复，请确认已保留需要的内容。",
                                  action: () =>
                                    change((s) => {
                                      s.journals = s.journals.filter(
                                        (x) => x.id !== j.id,
                                      );
                                    }, "手记已删除"),
                                })
                              }
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </article>
                      ))}
                  </div>
                ) : (
                  <section className="panel">
                    <Empty
                      title="写下第一篇投资手记"
                      text="为什么买入？如何看待波动？把当时的判断，留给未来的自己。"
                      action={
                        <Button onClick={() => setModal({ kind: "journal" })}>
                          <Plus size={14} />
                          写一篇手记
                        </Button>
                      }
                    />
                  </section>
                )}
              </>
            )}
            {tab === "analysis" && (
              <>
                <div className="analysis-intro">
                  <div>
                    <ChartNoAxesCombined size={25} />
                    <h2>回报，从清晰的记录开始。</h2>
                    <p>
                      账户收益 = 最新估值 + 累计取出 −
                      累计投入。已记账的分红与手续费会计入收益。
                    </p>
                  </div>
                  <div className="currency-switch">
                    <button
                      className={currency === "USD" ? "selected" : ""}
                      onClick={() => setCurrency("USD")}
                    >
                      USD
                    </button>
                    <button
                      className={currency === "CNY" ? "selected" : ""}
                      onClick={() => setCurrency("CNY")}
                    >
                      CNY
                    </button>
                  </div>
                </div>
                <div className="analysis-stats">
                  <section className="panel">
                    <small>累计收益 · 含汇率影响</small>
                    <strong className={totals.profit >= 0 ? "gain" : "loss"}>
                      {money(totals.profit, currency)}
                    </strong>
                  </section>
                  <section className="panel">
                    <small>累计投入回报率</small>
                    <strong>{pct(totals.roi)}</strong>
                  </section>
                  <section className="panel">
                    <small>估值记录</small>
                    <strong>
                      {s.entries.filter((e) => e.kind === "valuation").length}
                      <span> 次</span>
                    </strong>
                  </section>
                  <section className="panel">
                    <small>已记录费用 · 当前汇率折算</small>
                    <strong>
                      {money(
                        s.accounts.reduce(
                          (sum, a) =>
                            sum +
                            convert(
                              accountStats(s, a).fees,
                              a.currency,
                              currency,
                              fxAt(s).rate,
                            ),
                          0,
                        ),
                        currency,
                      )}
                    </strong>
                  </section>
                </div>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>累计收益曲线</h2>
                      <p>现金流按记账汇率折算；当前市值使用最新参考汇率。</p>
                    </div>
                  </div>
                  <Suspense fallback={<div className="chart-placeholder" />}>
                    <TrendChart
                      state={s}
                      currency={currency}
                      period="all"
                      mode="profit"
                    />
                  </Suspense>
                </section>
                <section className="panel returns-table">
                  <div className="panel-heading">
                    <h2>各账户表现</h2>
                    <span className="muted small">原币口径 · 含归档账户</span>
                  </div>
                  <div className="table-scroll">
                    <Table className="data-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead>账户</TableHead>
                          <TableHead className="right">当前估值</TableHead>
                          <TableHead className="right">净投入</TableHead>
                          <TableHead className="right">累计收益</TableHead>
                          <TableHead className="right">投入回报率</TableHead>
                          <TableHead>估值日期</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {totals.assets.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell>
                              <strong>{a.name}</strong>
                              <small>
                                {a.currency}
                                {a.archived ? " · 已归档" : ""}
                              </small>
                            </TableCell>
                            <TableCell className="right">
                              {money(a.value, a.currency)}
                            </TableCell>
                            <TableCell className="right">
                              {money(a.net, a.currency)}
                            </TableCell>
                            <TableCell
                              className={
                                "right " + (a.profit >= 0 ? "gain" : "loss")
                              }
                            >
                              {money(a.profit, a.currency)}
                            </TableCell>
                            <TableCell
                              className={
                                "right " + (a.profit >= 0 ? "gain" : "loss")
                              }
                            >
                              {pct(a.roi)}
                            </TableCell>
                            <TableCell>{a.marked ?? "尚未估值"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
                <div className="methodology">
                  <h3>
                    <CircleHelp size={16} />
                    读懂这些数字
                  </h3>
                  <p>
                    投入回报率 = 累计收益 ÷
                    累计投入。这是简单累计回报率，未按资金停留时间加权，也不做年化。内部转账不影响组合总投入和收益；账户层面则按转入、转出计算。
                  </p>
                  <p>
                    估值请填写账户当前总价值（网格填写总权益）。已包含在估值中的收益不要再次记为收入。资金取出属于现金流，不等于亏损。未更新估值的账户暂按流水金额显示。
                  </p>
                </div>
              </>
            )}
            {tab === "settings" && (
              <>
                <SettingsPanel
                  state={s}
                  busy={busy}
                  onSave={save}
                  onSyncFx={() => syncFx()}
                  onExport={exportData}
                  onExportCsv={exportCsv}
                  onImport={() => importRef.current?.click()}
                  onCalendar={() => setModal({ kind: "calendar" })}
                />
                <section className="panel reset-panel">
                  <div>
                    <h2>清空测试数据</h2>
                    <p>
                      删除资产、流水、定投与手记，可选择保留账户。清空后不会重新生成示例数据。
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setModal({ kind: "reset" })}
                  >
                    <Trash2 size={14} />
                    清空数据
                  </Button>
                </section>
              </>
            )}
            <footer className="page-footer">
              <span>
                <Sprout size={12} /> 澄明 · 让每一笔投资，有迹可循。
              </span>
              <span>
                {data.updatedAt
                  ? "最近保存 " +
                    new Date(data.updatedAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Shanghai",
                    })
                  : ""}{" "}
                · 北京时间
              </span>
            </footer>
          </div>
        )}
      </main>
      <input
        ref={importRef}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importData(file);
          e.target.value = "";
        }}
      />
      {notice && (
        <output className="toast">
          <CheckCircle2 size={17} />
          <span>{notice}</span>
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </output>
      )}
      {s && modal && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setModal(null);
          }}
        >
          <DialogContent className="app-dialog">
            <DialogTitle>
              {modal.kind === "entry"
                ? modal.entry
                  ? "编辑资金记录"
                  : modal.occurrence
                    ? "确认本次定投"
                    : "记下新的变化"
                : modal.kind === "account"
                  ? modal.account
                    ? "编辑账户"
                    : "新增投资账户"
                  : modal.kind === "plan"
                    ? modal.plan
                      ? "编辑定投计划"
                      : "创建定投计划"
                    : modal.kind === "journal"
                      ? "写一篇投资手记"
                      : modal.kind === "transfer"
                        ? "账户间转账"
                        : modal.kind === "calendar"
                          ? "管理交易日历"
                          : modal.kind === "reset"
                            ? "清空测试数据"
                            : modal.kind === "holding"
                              ? modal.holding
                                ? "编辑账户资产"
                                : "添加账户资产"
                              : modal.kind === "holdingRoi"
                                ? "填写资产收益率"
                                : modal.title}
            </DialogTitle>
            <DialogDescription>
              {modal.kind === "confirm"
                ? modal.description
                : modal.kind === "entry"
                  ? "填写实际发生的金额。保存后，资产曲线与收益会自动重算。"
                  : modal.kind === "transfer"
                    ? "仅支持同币种转账，两边同时入账，不增加组合总投入。"
                    : modal.kind === "calendar"
                      ? "按交易所公告填写整年的休市日期，周末会自动排除。"
                      : "为你的长期记录，设置清晰的起点。"}
            </DialogDescription>
            {modal.kind === "entry" && (
              <EntryForm
                state={s}
                entry={modal.entry}
                accountId={modal.accountId}
                occurrence={modal.occurrence}
                busy={busy}
                onSubmit={(entry) =>
                  modalSubmit(() =>
                    change((s) => {
                      if (modal.entry)
                        s.entries = s.entries.map((e) =>
                          e.id === entry.id ? entry : e,
                        );
                      else s.entries.push(entry);
                    }, "记录已保存，资产与收益已更新"),
                  )
                }
              />
            )}
            {modal.kind === "account" && (
              <AccountForm
                state={s}
                account={modal.account}
                busy={busy}
                onSubmit={(account) =>
                  modalSubmit(() =>
                    change((s) => {
                      if (modal.account)
                        s.accounts = s.accounts.map((a) =>
                          a.id === account.id ? account : a,
                        );
                      else s.accounts.push(account);
                    }, "账户已保存"),
                  )
                }
                onArchive={
                  modal.account
                    ? () =>
                        modalSubmit(() =>
                          change((s) => {
                            s.accounts.find(
                              (a) => a.id === modal.account!.id,
                            )!.archived = true;
                            s.plans
                              .filter((p) => p.accountId === modal.account!.id)
                              .forEach((p) => (p.paused = true));
                          }, "账户已归档，历史余额仍计入组合"),
                        )
                    : undefined
                }
                onDelete={
                  modal.account &&
                  !s.entries.some((e) => e.accountId === modal.account!.id) &&
                  !s.plans.some((p) => p.accountId === modal.account!.id) &&
                  !(s.holdings ?? []).some(
                    (h) => h.accountId === modal.account!.id,
                  )
                    ? () =>
                        modalSubmit(() =>
                          change((s) => {
                            s.accounts = s.accounts.filter(
                              (a) => a.id !== modal.account!.id,
                            );
                          }, "空账户已删除"),
                        )
                    : undefined
                }
              />
            )}
            {modal.kind === "reset" && (
              <ResetForm
                busy={busy}
                onExport={exportData}
                onSubmit={async (keepAccounts) => {
                  if (saving.current || !dataRef.current)
                    throw Error("请等待当前保存完成");
                  saving.current = true;
                  setBusy(true);
                  try {
                    const response = await fetch("/api/reset", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        revision: dataRef.current.revision,
                        confirmation: "清空",
                        keepAccounts,
                      }),
                    });
                    const body = (await response.json()) as ServerData & {
                      error: string;
                    };
                    if (!response.ok) throw Error(body.error);
                    dataRef.current = body;
                    setData(body);
                    setDetailId(null);
                    setModal(null);
                    setNotice("数据已清空，可以开始记录真实资产");
                  } finally {
                    saving.current = false;
                    setBusy(false);
                  }
                }}
              />
            )}
            {modal.kind === "holding" && (
              <HoldingForm
                state={s}
                accountId={modal.accountId}
                holding={modal.holding}
                busy={busy}
                onSubmit={(holding, amount, source, _roi, position) =>
                  modalSubmit(() =>
                    change((next) => {
                      next.holdings ??= [];
                      if (modal.holding)
                        next.holdings = next.holdings.map((h) =>
                          h.id === holding.id ? holding : h,
                        );
                      else {
                        next.holdings.push(holding);
                        if (amount > 0)
                          next.entries.push(
                            ...allocateHolding(next, holding, amount, source),
                          );
                      }
                      next.entries.push(
                        recordPosition(next, holding, position),
                      );
                    }, "资产持仓已保存，数量与市值已更新"),
                  )
                }
                onRemove={
                  modal.holding
                    ? () => {
                        const h = modal.holding!;
                        setModal({
                          kind: "confirm",
                          title: "删除 " + h.name + "？",
                          description:
                            "此资产、关联流水和定投计划将被删除，其资产也会从账户中移除。此操作不可撤销。",
                          action: () =>
                            change(
                              (next) => deleteHolding(next, h),
                              "资产已删除，账户资产已重算",
                            ),
                        });
                      }
                    : undefined
                }
              />
            )}
            {modal.kind === "holdingRoi" && (
              <HoldingRoiForm
                state={s}
                holding={modal.holding}
                busy={busy}
                onSubmit={(rate, date) =>
                  modalSubmit(() =>
                    change((next) => {
                      next.entries.push(
                        roiValuation(next, modal.holding, rate, date),
                      );
                    }, "收益率已记录，估值与图表已更新"),
                  )
                }
              />
            )}
            {modal.kind === "plan" && (
              <PlanForm
                state={s}
                plan={modal.plan}
                busy={busy}
                onSubmit={(plan) =>
                  modalSubmit(() =>
                    change((s) => {
                      if (modal.plan)
                        s.plans = s.plans.map((p) =>
                          p.id === plan.id ? plan : p,
                        );
                      else s.plans.push(plan);
                    }, "定投计划已保存"),
                  )
                }
              />
            )}
            {modal.kind === "journal" && (
              <JournalForm
                journal={modal.journal}
                busy={busy}
                onSubmit={(journal) =>
                  modalSubmit(() =>
                    change((s) => {
                      if (modal.journal)
                        s.journals = s.journals.map((j) =>
                          j.id === journal.id ? journal : j,
                        );
                      else s.journals.push(journal);
                    }, "投资手记已保存"),
                  )
                }
              />
            )}
            {modal.kind === "transfer" && (
              <TransferForm
                state={s}
                busy={busy}
                onSubmit={(entries) =>
                  modalSubmit(() =>
                    change((s) => {
                      s.entries.push(...entries);
                    }, "转账已记录，组合总投入保持不变"),
                  )
                }
              />
            )}
            {modal.kind === "calendar" && (
              <CalendarForm
                state={s}
                busy={busy}
                onSubmit={(calendar) =>
                  modalSubmit(() =>
                    change((s) => {
                      s.calendar = calendar;
                    }, "交易日历已更新"),
                  )
                }
              />
            )}
            {modal.kind === "confirm" && (
              <div className="dialog-buttons">
                <Button variant="outline" onClick={() => setModal(null)}>
                  取消
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void modalSubmit(modal.action).catch(() => {})}
                >
                  {busy ? "正在处理…" : "确认"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
function FormShell({
  children,
  onSubmit,
  busy,
  label = "保存记录",
  footer,
}: {
  children: ReactNode;
  onSubmit: () => Promise<void>;
  busy: boolean;
  label?: string;
  footer?: ReactNode;
}) {
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await onSubmit();
        } catch (e) {
          setError(errorText(e));
        }
      }}
    >
      <div className="form-grid">{children}</div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="form-footer">
        {footer}
        <Button type="submit" className="primary-button" disabled={busy}>
          {busy ? "正在保存…" : label}
        </Button>
      </div>
    </form>
  );
}
function EntryForm({
  state,
  entry,
  accountId,
  occurrence,
  busy,
  onSubmit,
}: {
  state: Ledger;
  entry?: Entry;
  accountId?: string;
  occurrence?: Occurrence;
  busy: boolean;
  onSubmit: (e: Entry) => Promise<void>;
}) {
  const [aid, setAid] = useState(
    entry?.accountId ??
      accountId ??
      state.accounts.find((a) => !a.archived)?.id ??
      "",
  );
  const [holdingId, setHoldingId] = useState(
    entry?.holdingId ?? occurrence?.plan.holdingId ?? "",
  );
  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? "deposit");
  const [amount, setAmount] = useState(
    String(
      entry?.amount ??
        (occurrence
          ? planAccountAmount(state, occurrence.plan, occurrence.date)
          : ""),
    ),
  );
  const [date, setDate] = useState(entry?.date ?? occurrence?.date ?? today());
  const [fx, setFx] = useState(String(entry?.fx ?? fxAt(state, date).rate));
  const [note, setNote] = useState(
    entry?.note ??
      (occurrence
        ? `定投：${occurrence.plan.name} · ${money(occurrence.plan.amount, occurrence.plan.currency ?? state.accounts.find((a) => a.id === occurrence.plan.accountId)!.currency)}（北京时间）`
        : ""),
  );
  const account = state.accounts.find((a) => a.id === aid);
  const locked = !!occurrence || !!entry?.planKey;
  return (
    <FormShell
      busy={busy}
      onSubmit={async () => {
        if (!account) throw Error("请先新增一个账户");
        await onSubmit({
          id: entry?.id ?? uid(),
          accountId: aid,
          ...(holdingId ? { holdingId } : {}),
          ...(entry?.automatic ? { automatic: true } : {}),
          ...(entry?.quantitySet !== undefined
            ? { quantitySet: entry.quantitySet }
            : {}),
          ...(entry?.quantityDelta !== undefined
            ? { quantityDelta: entry.quantityDelta }
            : {}),
          ...(entry?.unitPrice !== undefined
            ? { unitPrice: entry.unitPrice }
            : {}),
          ...(entry?.unitCost !== undefined
            ? { unitCost: entry.unitCost }
            : {}),
          ...(entry?.principalAdjustment !== undefined
            ? { principalAdjustment: entry.principalAdjustment }
            : {}),
          kind,
          amount: Number(amount),
          date,
          fx: Number(fx),
          note,
          createdAt: entry?.createdAt ?? new Date().toISOString(),
          ...(entry?.planKey || occurrence
            ? { planKey: entry?.planKey ?? occurrence!.key }
            : {}),
        });
      }}
    >
      <Field label="投资账户" wide>
        <NativeSelect
          value={aid}
          disabled={locked}
          onChange={(e) => {
            setAid(e.target.value);
            setHoldingId("");
          }}
          required
        >
          {state.accounts
            .filter((a) => !a.archived || a.id === aid)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
        </NativeSelect>
      </Field>
      <HoldingSelect
        state={state}
        accountId={aid}
        value={holdingId}
        onChange={setHoldingId}
        disabled={locked}
      />
      <Field label="记录类型">
        <NativeSelect
          value={kind}
          disabled={locked}
          onChange={(e) => {
            const k = e.target.value as EntryKind;
            setKind(k);
            if (k === "valuation" && account)
              setAmount(
                String(
                  accountStats(state, account, today(), holdingId || undefined)
                    .value,
                ),
              );
          }}
        >
          {Object.entries(kinds).map(([k, l]) => (
            <option value={k} key={k}>
              {l}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={`金额（${account?.currency ?? "USD"}）`}>
        <Input
          type="number"
          min={kind === "valuation" ? 0 : 0.00000001}
          max={1e12}
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          required
        />
      </Field>
      <Field label="记账日期">
        <Input
          type="date"
          min="2000-01-01"
          max={today()}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setFx(String(fxAt(state, e.target.value).rate));
          }}
          required
        />
      </Field>
      <Field
        label="记账汇率 · 1 USD = CNY"
        hint="历史流水保留此汇率；可填写实际兑换汇率。"
      >
        <Input
          type="number"
          min="0.01"
          max="1000"
          step="any"
          value={fx}
          onChange={(e) => setFx(e.target.value)}
          required
        />
      </Field>
      <Field label="备注" wide>
        <Textarea
          maxLength={2000}
          placeholder="记下这笔变化的原因…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="form-tip field-wide">
        {kind === "valuation"
          ? "填写此刻账户的总价值，而不是盈亏金额。网格请填写总权益。已包含的收益无需重复入账。"
          : kind === "deposit"
            ? "记录新投入的资金。买入后的市场涨跌，请通过“估值更新”记录。"
            : kind === "withdraw"
              ? "取出是资金流出，不是亏损；系统会保留取出前产生的收益。"
              : kind === "income"
                ? "仅记录尚未包含在最近估值中的收入。已在账户总权益内体现的收益请勿重复记账。"
                : "手续费会从账户价值扣除并计入收益。已包含在估值中的费用请勿重复记账。"}
      </div>
    </FormShell>
  );
}
function AccountForm({
  state,
  account,
  busy,
  onSubmit,
  onArchive,
  onDelete,
}: {
  state: Ledger;
  account?: Account;
  busy: boolean;
  onSubmit: (a: Account) => Promise<void>;
  onArchive?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(account?.name ?? "");
  const [platform, setPlatform] = useState(account?.platform ?? "");
  const [category, setCategory] = useState<Category>(
    account?.category ?? "crypto",
  );
  const [note, setNote] = useState(account?.note ?? "");
  const [image, setImage] = useState(account?.image);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const [imageDragOver, setImageDragOver] = useState(false);
  const imageDragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageJob = useRef(false);
  async function selectImage(file: File) {
    if (busy || imageJob.current) return;
    imageJob.current = true;
    setImageBusy(true);
    setImageError("");
    try {
      setImage(await prepareAccountImage(file));
    } catch (error) {
      setImageError(errorText(error));
    } finally {
      imageJob.current = false;
      setImageBusy(false);
    }
  }
  const hasHistory =
    !!account &&
    (state.entries.some((e) => e.accountId === account.id) ||
      state.plans.some((p) => p.accountId === account.id));
  return (
    <FormShell
      busy={busy || imageBusy}
      label="保存账户"
      onSubmit={() => {
        if (imageJob.current)
          return Promise.reject(new Error("图片正在处理，请稍等。"));
        return onSubmit({
          id: account?.id ?? uid(),
          name: name.trim(),
          platform: platform.trim(),
          category,
          currency: category === "fund" ? "CNY" : "USD",
          archived: account?.archived ?? false,
          note,
          ...(image ? { image } : {}),
        });
      }}
      footer={
        <div className="row">
          {onArchive && !account?.archived && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void onArchive().catch(() => {})}
            >
              <Archive size={13} />
              归档
            </Button>
          )}
          {onDelete && (
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => void onDelete().catch(() => {})}
            >
              <Trash2 size={13} />
              删除空账户
            </Button>
          )}
        </div>
      }
    >
      <div
        className={`account-image-editor field-wide${imageDragOver ? " is-drag-over" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (busy || imageJob.current || !event.dataTransfer.types.includes("Files")) return;
          imageDragDepth.current += 1;
          setImageDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = busy || imageJob.current ? "none" : "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          imageDragDepth.current = Math.max(0, imageDragDepth.current - 1);
          if (imageDragDepth.current === 0) setImageDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          imageDragDepth.current = 0;
          setImageDragOver(false);
          if (busy || imageJob.current) return;
          const files = event.dataTransfer.files;
          if (files.length !== 1) {
            setImageError(files.length > 1 ? "每次请拖入一张图片。" : "请拖入电脑中的 PNG、JPG、WebP 或 SVG 图片文件。");
            return;
          }
          void selectImage(files[0]);
        }}
      >
        <div className="account-image-preview">
          <AccountIcon account={{ category, image }} />
        </div>
        <div className="account-image-controls">
          <strong>{imageDragOver ? "松开即可上传图片" : "账户图片"}</strong>
          <p id="account-image-hint">
            拖动图片到此处，或点击上传。支持 PNG、JPG、WebP、SVG，最大 5 MB。
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
            aria-label="选择账户图片"
            aria-describedby="account-image-hint"
            hidden
            disabled={busy || imageBusy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void selectImage(file);
            }}
          />
          <div className="row account-image-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || imageBusy}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={14} />
              {imageBusy ? "正在处理…" : image ? "更换图片" : "上传图片"}
            </Button>
            {image && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || imageBusy}
                onClick={() => {
                  setImage(undefined);
                  setImageError("");
                }}
              >
                恢复默认图标
              </Button>
            )}
          </div>
          {imageError && (
            <p role="alert" className="form-error">
              {imageError}
            </p>
          )}
          <output className="sr-only">
            {imageBusy
              ? "正在处理图片"
              : image
                ? "图片已准备好，保存账户后生效"
                : "使用默认图标"}
          </output>
        </div>
      </div>
      <Field label="账户名称" wide>
        <Input
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：交易所 A · BTC 现货"
          required
        />
      </Field>
      <Field
        label="投资方向"
        hint={hasHistory ? "已有流水或计划的账户不支持变更类别。" : undefined}
      >
        <NativeSelect
          value={category}
          disabled={hasHistory}
          onChange={(e) => setCategory(e.target.value as Category)}
        >
          {Object.entries(categories).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="记账币种">
        <Input
          value={category === "fund" ? "CNY · 人民币" : "USD · 美元"}
          readOnly
        />
      </Field>
      <Field label="平台 / 券商" wide>
        <Input
          maxLength={80}
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          placeholder="例如：Binance、OKX、券商或基金平台"
        />
      </Field>
      <Field label="账户说明" wide>
        <Textarea
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="币种、基金代码、网格参数或账户用途…"
        />
      </Field>
      {!account && (
        <div className="form-tip field-wide">
          新账户从零开始。创建后，使用“记一笔 →
          投入”记录本金，再更新当前总估值。
        </div>
      )}
    </FormShell>
  );
}
function PlanForm({
  state,
  plan,
  busy,
  onSubmit,
}: {
  state: Ledger;
  plan?: Plan;
  busy: boolean;
  onSubmit: (p: Plan) => Promise<void>;
}) {
  const [aid, setAid] = useState(
    plan?.accountId ?? state.accounts.find((a) => !a.archived)?.id ?? "",
  );
  const [holdingId, setHoldingId] = useState(plan?.holdingId ?? "");
  const [mode, setMode] = useState<"auto" | "manual">(plan?.mode ?? "auto");
  const [planCurrency, setPlanCurrency] = useState<Currency>(
    plan?.currency ??
      state.accounts.find(
        (a) =>
          a.id ===
          (plan?.accountId ?? state.accounts.find((a) => !a.archived)?.id),
      )?.currency ??
      "USD",
  );
  const [name, setName] = useState(plan?.name ?? "");
  const [amount, setAmount] = useState(String(plan?.amount ?? ""));
  const [freq, setFreq] = useState<Plan["frequency"]>(
    plan?.frequency ?? "monthly",
  );
  const [day, setDay] = useState(plan?.day ?? 1);
  const [time, setTime] = useState(plan?.time ?? "14:00");
  const [start, setStart] = useState(plan?.startDate ?? today());
  const a = state.accounts.find((a) => a.id === aid);
  const selectedType =
    state.holdings?.find((h) => h.id === holdingId)?.assetType ?? a?.category;
  const market: Market =
    selectedType === "fund" ? "CN" : selectedType === "stock" ? "US" : "CRYPTO";
  return (
    <FormShell
      busy={busy}
      label="保存计划"
      onSubmit={async () => {
        if (!a) throw Error("请先新增账户");
        await onSubmit({
          id: plan?.id ?? uid(),
          accountId: aid,
          ...(holdingId ? { holdingId } : {}),
          mode,
          currency: planCurrency,
          autoFrom: plan ? [start, today()].sort().at(-1)! : start,
          name: name.trim(),
          amount: Number(amount),
          frequency: freq,
          day,
          time,
          startDate: start,
          market,
          paused: plan?.paused ?? false,
        });
      }}
    >
      <Field label="计划名称" wide>
        <Input
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：每个月，给未来一点积累"
          required
        />
      </Field>
      <Field label="投资账户" wide>
        <NativeSelect
          value={aid}
          onChange={(e) => {
            setAid(e.target.value);
            setHoldingId("");
          }}
          required
        >
          {state.accounts
            .filter((a) => !a.archived || a.id === aid)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
        </NativeSelect>
      </Field>
      <HoldingSelect
        state={state}
        accountId={aid}
        value={holdingId}
        onChange={setHoldingId}
      />
      <Field
        label="记账方式"
        wide
        hint="自动模式到期直接记录预设金额；离线期间的记录下次打开时补齐。"
      >
        <NativeSelect
          value={mode}
          onChange={(e) => setMode(e.target.value as "auto" | "manual")}
        >
          <option value="auto">自动记账 · 无需逐笔操作</option>
          <option value="manual">手动确认 · 按实际金额记账</option>
        </NativeSelect>
      </Field>
      <Field label="定投币种">
        <NativeSelect
          value={planCurrency}
          onChange={(e) => setPlanCurrency(e.target.value as Currency)}
        >
          <option value="USD">USD · 美元</option>
          <option value="CNY">CNY · 人民币</option>
        </NativeSelect>
      </Field>
      <Field label={`每次投入（${planCurrency}）`}>
        <Input
          type="number"
          min="0.01"
          max={1e12}
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </Field>
      <Field label="投入频率">
        <NativeSelect
          value={freq}
          onChange={(e) => {
            setFreq(e.target.value as Plan["frequency"]);
            setDay(1);
          }}
        >
          <option value="daily">
            {market === "CRYPTO" ? "每天" : "每个交易日"}
          </option>
          <option value="weekdays">每周一至周五（市场休市跳过）</option>
          <option value="weekly">每周</option>
          <option value="monthly">每月</option>
        </NativeSelect>
      </Field>
      {(freq === "weekly" || freq === "monthly") && (
        <Field label={freq === "monthly" ? "每月日期" : "每周日期"}>
          <NativeSelect
            value={day}
            onChange={(e) => setDay(Number(e.target.value))}
          >
            {Array.from({ length: freq === "monthly" ? 31 : 7 }, (_, i) => (
              <option value={i + 1} key={i}>
                {freq === "monthly"
                  ? `${i + 1} 日`
                  : `星期${"一二三四五六日"[i]}`}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      <Field label="执行时间 · 北京时间">
        <Input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          required
        />
      </Field>
      <Field label="开始日期">
        <Input
          type="date"
          min="2000-01-01"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
        />
      </Field>
      {a && planCurrency !== a.currency && (
        <div className="form-tip field-wide">
          账户以 {a.currency} 记账，每笔{" "}
          {money(Number(amount) || 0, planCurrency)}{" "}
          将按当日账本汇率换算。目前约为{" "}
          {money(
            convert(
              Number(amount) || 0,
              planCurrency,
              a.currency,
              fxAt(state).rate,
            ),
            a.currency,
          )}
          。
        </div>
      )}
      <div className="form-tip field-wide">
        所有执行时间均为北京时间（UTC+8）。
        {market === "CRYPTO"
          ? "Crypto 每天均可交易，包含周末与节假日。"
          : `${market === "CN" ? "中国" : "美国"}市场自动排除周末与已核验节假日。日计划休市跳过，周/月计划顺延。`}{" "}
        每月 29–31
        日遇短月份按月末安排。新计划从开始日期自动补记；修改计划从今天起生效，历史流水保持不变。
      </div>
    </FormShell>
  );
}
function JournalForm({
  journal,
  busy,
  onSubmit,
}: {
  journal?: Journal;
  busy: boolean;
  onSubmit: (j: Journal) => Promise<void>;
}) {
  const [title, setTitle] = useState(journal?.title ?? "");
  const [body, setBody] = useState(journal?.body ?? "");
  const [date, setDate] = useState(journal?.date ?? today());
  const [tag, setTag] = useState(journal?.tag ?? "投资复盘");
  return (
    <FormShell
      busy={busy}
      label="保存手记"
      onSubmit={() =>
        onSubmit({
          id: journal?.id ?? uid(),
          title: title.trim(),
          body,
          date,
          tag,
        })
      }
    >
      <Field label="标题" wide>
        <Input
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="今天，我想记住什么？"
          required
        />
      </Field>
      <Field label="日期">
        <Input
          type="date"
          value={date}
          max={today()}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </Field>
      <Field label="分类">
        <NativeSelect value={tag} onChange={(e) => setTag(e.target.value)}>
          {["投资复盘", "买入逻辑", "策略调整", "市场观察", "月度总结"].map(
            (t) => (
              <option key={t}>{t}</option>
            ),
          )}
        </NativeSelect>
      </Field>
      <Field label="正文" wide>
        <Textarea
          maxLength={10000}
          rows={7}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="记录你的判断、情绪与下一步。长期来看，思考和数字一样值得保存。"
        />
      </Field>
    </FormShell>
  );
}
function TransferForm({
  state,
  busy,
  onSubmit,
}: {
  state: Ledger;
  busy: boolean;
  onSubmit: (e: Entry[]) => Promise<void>;
}) {
  const accounts = state.accounts.filter((a) => !a.archived);
  const [from, setFrom] = useState(accounts[0]?.id ?? "");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const a = accounts.find((a) => a.id === from);
  return (
    <FormShell
      busy={busy}
      label="记录转账"
      onSubmit={async () => {
        if (!from || !to || from === to)
          throw Error("请选择不同的转出和转入账户");
        const transferId = uid();
        const common = {
          amount: Number(amount),
          date,
          fx: fxAt(state, date).rate,
          note: note || "账户间资金调整",
          transferId,
        };
        await onSubmit([
          {
            ...common,
            id: uid(),
            accountId: from,
            kind: "withdraw",
            createdAt: new Date().toISOString(),
          },
          {
            ...common,
            id: uid(),
            accountId: to,
            kind: "deposit",
            createdAt: new Date(Date.now() + 1).toISOString(),
          },
        ]);
      }}
    >
      <Field label="转出账户">
        <NativeSelect
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setTo("");
          }}
          required
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="转入账户">
        <NativeSelect
          value={to}
          onChange={(e) => setTo(e.target.value)}
          required
        >
          <option value="">选择同币种账户</option>
          {accounts
            .filter((b) => b.id !== from && b.currency === a?.currency)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </NativeSelect>
      </Field>
      <Field
        label={`转账金额（${a?.currency ?? "USD"}）`}
        hint={
          a
            ? "当前余额 " + money(accountStats(state, a).value, a.currency)
            : undefined
        }
      >
        <Input
          type="number"
          min="0.01"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </Field>
      <Field label="转账日期">
        <Input
          type="date"
          max={today()}
          min="2000-01-01"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </Field>
      <Field label="备注" wide>
        <Textarea
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例如：将现货资产的一部分转到账户 B"
        />
      </Field>
    </FormShell>
  );
}
function CalendarForm({
  state,
  busy,
  onSubmit,
}: {
  state: Ledger;
  busy: boolean;
  onSubmit: (c: CalendarConfig) => Promise<void>;
}) {
  const [market, setMarket] = useState<"CN" | "US">("CN");
  const [year, setYear] = useState(today().slice(0, 4));
  const [dates, setDates] = useState(
    (state.calendar.CN[year] ?? []).join("\n"),
  );
  const [verified, setVerified] = useState(false);
  return (
    <FormShell
      busy={busy}
      label="保存已核验日历"
      onSubmit={async () => {
        if (!verified) throw Error("请核验交易所整年休市公告后勾选确认");
        const next = structuredClone(state.calendar);
        next[market][year] = [
          ...new Set(dates.split(/[\s,，]+/).filter(Boolean)),
        ].sort();
        validateLedger({ ...state, calendar: next });
        await onSubmit(next);
      }}
    >
      <Field label="市场">
        <NativeSelect
          value={market}
          onChange={(e) => {
            const m = e.target.value as "CN" | "US";
            setMarket(m);
            setDates((state.calendar[m][year] ?? []).join("\n"));
            setVerified(false);
          }}
        >
          <option value="CN">中国市场</option>
          <option value="US">美国市场</option>
        </NativeSelect>
      </Field>
      <Field label="年份">
        <Input
          type="number"
          min="2000"
          max="2099"
          value={year}
          onChange={(e) => {
            setYear(e.target.value);
            setDates((state.calendar[market][e.target.value] ?? []).join("\n"));
            setVerified(false);
          }}
          required
        />
      </Field>
      <Field
        label="整年休市日期 · 每行一个 YYYY-MM-DD"
        wide
        hint="周末自动排除；调休周末不作为开市日。"
      >
        <Textarea
          rows={8}
          maxLength={5000}
          value={dates}
          onChange={(e) => {
            setDates(e.target.value);
            setVerified(false);
          }}
          placeholder="2027-01-01"
        />
      </Field>
      <label className="check-field field-wide">
        <input
          type="checkbox"
          checked={verified}
          onChange={(e) => setVerified(e.target.checked)}
        />
        我已核对交易所公告，以上包含该年度完整节假日休市日期。
      </label>
    </FormShell>
  );
}
function SettingsPanel({
  state,
  busy,
  onSave,
  onSyncFx,
  onExport,
  onExportCsv,
  onImport,
  onCalendar,
}: {
  state: Ledger;
  busy: boolean;
  onSave: (s: Ledger, m?: string) => Promise<void>;
  onSyncFx: () => Promise<void>;
  onExport: () => void;
  onExportCsv: () => void;
  onImport: () => void;
  onCalendar: () => void;
}) {
  const [name, setName] = useState(state.settings.name);
  const [budget, setBudget] = useState(String(state.settings.monthlyBudget));
  const [autoFx, setAutoFx] = useState(state.settings.autoFx);
  const [rate, setRate] = useState(String(fxAt(state).rate));
  const [rateDate, setRateDate] = useState(today());
  const [syncing, setSyncing] = useState(false);
  const currentMonth = monthBounds(today().slice(0, 7));
  const planned = occurrences(state, currentMonth.from, currentMonth.to).reduce(
    (sum, o) =>
      sum +
      convert(
        o.plan.amount,
        o.plan.currency ?? o.account.currency,
        "CNY",
        fxAt(state).rate,
      ),
    0,
  );
  return (
    <div className="settings-grid">
      <section className="panel settings-card">
        <div className="settings-title">
          <SlidersHorizontal size={20} />
          <div>
            <h2>账本偏好</h2>
            <p>为你的投资空间设定节奏。</p>
          </div>
        </div>
        <FormShell
          busy={busy}
          label="保存偏好"
          onSubmit={() =>
            onSave(
              {
                ...state,
                settings: {
                  name: name.trim(),
                  monthlyBudget: Number(budget),
                  autoFx,
                },
              },
              "偏好已保存",
            )
          }
        >
          <Field label="投资空间名称" wide>
            <Input
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field
            label="每月投入预算（人民币）"
            wide
            hint={`本月计划约 ${money(planned, "CNY")}。预算用于比较，不会改变定投金额。`}
          >
            <Input
              type="number"
              min="0"
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              required
            />
          </Field>
          <label className="check-field field-wide">
            <input
              type="checkbox"
              checked={autoFx}
              onChange={(e) => setAutoFx(e.target.checked)}
            />
            打开账本时自动更新过期参考汇率
          </label>
        </FormShell>
      </section>
      <section className="panel settings-card">
        <div className="settings-title">
          <ArrowRightLeft size={20} />
          <div>
            <h2>美元 / 人民币汇率</h2>
            <p>资产统一折算，原币记录始终保留。</p>
          </div>
        </div>
        <div className="fx-display">
          <span>1 USD</span>
          <ArrowRight size={18} />
          <strong>
            {fxAt(state).rate.toFixed(4)} <small>CNY</small>
          </strong>
        </div>
        <div className="fx-source">
          {fxAt(state).source} · {fxAt(state).date}
        </div>
        <Button
          variant="outline"
          disabled={syncing || busy}
          onClick={async () => {
            setSyncing(true);
            try {
              await onSyncFx();
            } finally {
              setSyncing(false);
            }
          }}
        >
          <RefreshCw size={14} className={syncing ? "spin" : ""} />
          {syncing ? "更新中…" : "获取最新参考汇率"}
        </Button>
        <div className="settings-divider" />
        <FormShell
          busy={busy}
          label="保存手动汇率"
          onSubmit={() =>
            onSave(
              {
                ...state,
                fxRates: [
                  ...state.fxRates.filter((r) => r.date !== rateDate),
                  { date: rateDate, rate: Number(rate), source: "手动设置" },
                ],
              },
              "手动汇率已保存，历史流水保持原汇率",
            )
          }
        >
          <Field label="汇率">
            <Input
              type="number"
              min="0.01"
              max="1000"
              step="any"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
            />
          </Field>
          <Field label="适用日期">
            <Input
              type="date"
              max={today()}
              value={rateDate}
              onChange={(e) => setRateDate(e.target.value)}
              required
            />
          </Field>
        </FormShell>
      </section>
      <section className="panel settings-card">
        <div className="settings-title">
          <CalendarCheck size={20} />
          <div>
            <h2>交易日历</h2>
            <p>基于交易所公告，而非普通工作日历。</p>
          </div>
        </div>
        <div className="market-setting">
          <b>Crypto</b>
          <span className="gain">365 天可安排</span>
        </div>
        <div className="market-setting">
          <b>中国市场</b>
          <span>{Object.keys(state.calendar.CN).join("、")} 已核验</span>
        </div>
        <div className="market-setting">
          <b>美国市场</b>
          <span>{Object.keys(state.calendar.US).join("、")} 已核验</span>
        </div>
        <p className="settings-help">
          未核验年份不会生成基金或美股定投。基金若有额外暂停申购日，可在相应市场日历中补充休市日期；不同基金的特殊安排请以基金公告为准。
        </p>
        <Button variant="outline" onClick={onCalendar}>
          <CalendarDays size={14} />
          更新交易日历
        </Button>
        <div className="source-links">
          <a
            href="https://www.sse.com.cn/disclosure/announcement/general/c/c_20251222_10802507.shtml"
            target="_blank"
            rel="noreferrer"
          >
            上交所 2026 年休市公告 ↗
          </a>
          <a
            href="https://www.nyse.com/trade/hours-calendars"
            target="_blank"
            rel="noreferrer"
          >
            NYSE 交易日历 ↗
          </a>
        </div>
      </section>
      <section className="panel settings-card">
        <div className="settings-title">
          <ShieldCheck size={20} />
          <div>
            <h2>数据与备份</h2>
            <p>让长期积累，也拥有长期保存。</p>
          </div>
        </div>
        <div className="backup-stats">
          <span>
            <b>{state.accounts.length}</b> 个账户
          </span>
          <span>
            <b>{state.entries.length}</b> 条流水
          </span>
          <span>
            <b>{state.journals.length}</b> 篇手记
          </span>
        </div>
        <p className="settings-help">
          数据保存在你的私有账本中。完整备份包含所有账户、流水、计划、汇率与手记，可随时恢复。
        </p>
        <div className="backup-buttons">
          <Button variant="outline" onClick={onExport}>
            <Download size={14} />
            导出完整备份
          </Button>
          <Button variant="outline" onClick={onImport}>
            <Upload size={14} />
            从备份恢复
          </Button>
          <Button variant="ghost" onClick={onExportCsv}>
            导出流水 CSV <ArrowUpRight size={13} />
          </Button>
        </div>
        <div className="settings-divider" />
        <h3 className="small-title">关于估值更新</h3>
        <p className="settings-help">
          支持手动填写各资产累计收益率或更新账户总估值，资产占比、曲线与收益随之重算。自动定投按预设金额入账，离线期间在下次打开时补齐；没有连接券商或交易所实际扣款。
        </p>
        <a
          className="source-link"
          href="https://frankfurter.dev/"
          target="_blank"
          rel="noreferrer"
        >
          汇率数据：Frankfurter ↗
        </a>
      </section>
    </div>
  );
}

function HoldingSelect({
  state,
  accountId,
  value,
  onChange,
  disabled = false,
}: {
  state: Ledger;
  accountId: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label="归属资产" wide>
      <NativeSelect
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">账户未分配资金（估值时为账户总额）</option>
        {(state.holdings ?? [])
          .filter(
            (h) => h.accountId === accountId && (!h.archived || h.id === value),
          )
          .map((h) => (
            <option key={h.id} value={h.id}>
              {h.symbol} · {h.name}
              {h.archived ? " · 已归档" : ""}
            </option>
          ))}
      </NativeSelect>
    </Field>
  );
}
function HoldingForm({
  state,
  accountId,
  holding,
  busy,
  onSubmit,
  onRemove,
}: {
  state: Ledger;
  accountId: string;
  holding?: Holding;
  busy: boolean;
  onSubmit: (
    h: Holding,
    amount: number,
    source: "existing" | "new",
    roi: number | null,
    position: PositionInput,
  ) => Promise<void>;
  onRemove?: () => void;
}) {
  const account = state.accounts.find((a) => a.id === accountId)!;
  const initial = holding ? positionStats(state, holding) : null;
  const [name, setName] = useState(holding?.name ?? "");
  const [symbol, setSymbol] = useState(holding?.symbol ?? "");
  const [type, setType] = useState<Category>(
    holding?.assetType ?? account.category,
  );
  const [quantity, setQuantity] = useState(
    initial?.quantity != null ? String(initial.quantity) : "",
  );
  const [cost, setCost] = useState(
    initial?.unitCost != null ? String(initial.unitCost) : "",
  );
  const [price, setPrice] = useState(
    initial?.quantity && initial.quantity > 0
      ? String(initial.value / initial.quantity)
      : "",
  );
  const [margin, setMargin] = useState(initial ? String(initial.invested) : "");
  const [equity, setEquity] = useState(initial ? String(initial.value) : "");
  const [mode, setMode] = useState("price");
  const [roi, setRoi] = useState(
    initial?.roi != null ? String(Number(initial.roi.toFixed(6))) : "0",
  );
  const [side, setSide] = useState(holding?.side ?? "neutral");
  const [leverage, setLeverage] = useState(String(holding?.leverage ?? 1));
  const [source, setSource] = useState<"new" | "existing">("new");
  const grid = type === "grid";
  const principal = grid ? Number(margin) : Number(quantity) * Number(cost);
  const currentPrice =
    mode === "roi" ? Number(cost) * (1 + Number(roi) / 100) : Number(price);
  const value = grid
    ? mode === "roi"
      ? Number(margin) * (1 + Number(roi) / 100)
      : Number(equity)
    : Number(quantity) * currentPrice;
  const unit = type === "stock" ? "股" : type === "fund" ? "份" : "个";
  return (
    <FormShell
      busy={busy}
      label={holding ? "保存资产" : "添加资产"}
      footer={
        onRemove && (
          <Button type="button" variant="ghost" onClick={onRemove}>
            <Trash2 size={13} />
            删除资产
          </Button>
        )
      }
      onSubmit={() =>
        onSubmit(
          {
            id: holding?.id ?? uid(),
            accountId,
            name: name.trim(),
            symbol: symbol.trim().toUpperCase() || name.trim().slice(0, 30),
            archived: holding?.archived ?? false,
            assetType: type,
            ...(grid ? { side, leverage: Number(leverage) } : {}),
          },
          principal,
          source,
          null,
          {
            quantity: Number(quantity),
            unitCost: grid ? 0 : Number(cost),
            unitPrice: grid ? 0 : currentPrice,
            margin: grid ? Number(margin) : 0,
            equity: grid ? value : 0,
          },
        )
      }
    >
      <Field label="资产名称">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="比特币 / SPY / 白酒基金"
          maxLength={80}
          required
        />
      </Field>
      <Field label="代码 / 交易对">
        <Input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="BTC / SPY / BTCUSDT"
          maxLength={30}
        />
      </Field>
      <Field label="资产类型">
        <NativeSelect
          value={type}
          disabled={!!holding}
          onChange={(e) => setType(e.target.value as Category)}
        >
          <option value="crypto">加密货币现货</option>
          <option value="stock">美股 / ETF</option>
          <option value="grid">合约网格仓位</option>
          <option value="fund">基金</option>
        </NativeSelect>
      </Field>
      <Field
        label={grid ? "仓位数量（资产币）" : `持有数量（${unit}）`}
        hint="支持小数，可随时更新实际数量"
      >
        <Input
          type="number"
          min="0"
          max="1000000000000"
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
        />
      </Field>
      {grid ? (
        <>
          <Field label="仓位方向">
            <NativeSelect
              value={side}
              onChange={(e) =>
                setSide(e.target.value as "long" | "short" | "neutral")
              }
            >
              <option value="neutral">中性网格</option>
              <option value="long">做多网格</option>
              <option value="short">做空网格</option>
            </NativeSelect>
          </Field>
          <Field label="杠杆倍数">
            <Input
              type="number"
              min="1"
              max="1000"
              step="any"
              value={leverage}
              onChange={(e) => setLeverage(e.target.value)}
              required
            />
          </Field>
          <Field label={`投入保证金（${account.currency}）`}>
            <Input
              type="number"
              min="0"
              max="1000000000000"
              step="any"
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
              required
            />
          </Field>
        </>
      ) : (
        <Field label={`平均成本（${account.currency} / ${unit}）`}>
          <Input
            type="number"
            min="0"
            max="1000000000000"
            step="any"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            required
          />
        </Field>
      )}
      <Field label="估值填写方式">
        <NativeSelect value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="price">
            {grid ? "填写当前权益" : "填写当前单价 / 净值"}
          </option>
          <option value="roi">手动填写收益率</option>
        </NativeSelect>
      </Field>
      {mode === "roi" ? (
        <Field label="收益率（%）">
          <Input
            type="number"
            min="-100"
            max="100000"
            step="any"
            value={roi}
            onChange={(e) => setRoi(e.target.value)}
            required
          />
        </Field>
      ) : (
        <Field
          label={
            grid
              ? `当前权益（${account.currency}）`
              : `当前单价 / 净值（${account.currency}）`
          }
        >
          <Input
            type="number"
            min="0"
            max="1000000000000"
            step="any"
            value={grid ? equity : price}
            onChange={(e) =>
              grid ? setEquity(e.target.value) : setPrice(e.target.value)
            }
            required
          />
        </Field>
      )}
      {!holding && unallocated(state, account) > 0 && (
        <Field label="本金来源" wide>
          <NativeSelect
            value={source}
            onChange={(e) => setSource(e.target.value as "new" | "existing")}
          >
            <option value="new">新录入资产</option>
            <option value="existing">
              使用旧版账户余额（
              {money(unallocated(state, account), account.currency)}）
            </option>
          </NativeSelect>
        </Field>
      )}
      <div className="holding-preview field-wide">
        <span>
          {grid
            ? "仓位权益（不将杠杆名义价值计入总资产）"
            : "资产市值 = 持有数量 × 当前单价"}
        </span>
        <strong>{money(value, account.currency)}</strong>
        <small>
          成本 {money(principal, account.currency)} · 收益{" "}
          {money(value - principal, account.currency)} ·{" "}
          {pct(principal > 0 ? ((value - principal) / principal) * 100 : null)}
        </small>
      </div>
      {holding && initial?.quantity == null && (
        <div className="form-tip field-wide">
          这条旧记录只有金额，请补充实际数量和平均成本后保存。
        </div>
      )}
    </FormShell>
  );
}

function HoldingRoiForm({
  state,
  holding,
  busy,
  onSubmit,
}: {
  state: Ledger;
  holding: Holding;
  busy: boolean;
  onSubmit: (rate: number, date: string) => Promise<void>;
}) {
  const [rate, setRate] = useState("");
  const [date, setDate] = useState(today());
  const stats = holdingStats(state, holding, date);
  const account = state.accounts.find((a) => a.id === holding.accountId)!;
  const estimate = stats.invested * (1 + Number(rate) / 100) - stats.withdrawn;
  return (
    <FormShell
      busy={busy}
      label="更新收益与估值"
      onSubmit={() => onSubmit(Number(rate), date)}
    >
      <div className="roi-summary field-wide">
        <strong>
          {holding.symbol} · {holding.name}
        </strong>
        <span>{account.name}</span>
        <div>
          累计投入 {money(stats.invested, account.currency)} · 当前回报率{" "}
          {pct(stats.roi)}
        </div>
      </div>
      <Field
        label="累计投入收益率（%）"
        hint="填写该资产自开始记录以来的累计回报，不是当日涨跌幅"
      >
        <Input
          type="number"
          min="-100"
          max="100000"
          step="any"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="例如 8.5 或 -2.3"
          required
        />
      </Field>
      <Field label="估值日期">
        <Input
          type="date"
          min="2000-01-01"
          max={today()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </Field>
      <div className="form-tip field-wide">
        {rate !== "" && (
          <>
            对应估值：<strong>{money(estimate, account.currency)}</strong>
            <br />
          </>
        )}
        估值 = 累计投入 ×（1 + 收益率）−
        累计转出。保存会新增一条估值记录，可在投资手账中修改或删除。
      </div>
    </FormShell>
  );
}

function AccountDetail({
  state,
  account,
  onBack,
  onEditAccount,
  onAdd,
  onEdit,
  onDelete,
  onRecords,
}: {
  state: Ledger;
  account: Account;
  onBack: () => void;
  onEditAccount: () => void;
  onAdd: () => void;
  onEdit: (h: Holding) => void;
  onDelete: (h: Holding) => void;
  onRecords: () => void;
}) {
  const stats = accountStats(state, account);
  const positions = (state.holdings ?? []).filter(
    (h) => h.accountId === account.id && !h.archived,
  );
  return (
    <div className="account-detail">
      <div className="detail-toolbar">
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft size={16} />
          全部账户
        </Button>
        <Button variant="outline" onClick={onEditAccount}>
          <Pencil size={13} />
          编辑账户
        </Button>
      </div>
      <section className="panel detail-summary">
        <div className="detail-identity">
          <AccountIcon account={account} />
          <div>
            <span>
              {account.platform || "个人账户"} · {account.currency}
            </span>
            <h2>{account.name}</h2>
            <p>
              {positions.length} 个资产{account.archived ? " · 账户已归档" : ""}
            </p>
          </div>
        </div>
        <div className="detail-total">
          <span>账户总资产</span>
          <strong>{money(stats.value, account.currency)}</strong>
        </div>
        <div className="detail-return">
          <span>累计收益</span>
          <strong className={stats.profit >= 0 ? "gain" : "loss"}>
            {money(stats.profit, account.currency)}
          </strong>
          <small className={stats.profit >= 0 ? "gain" : "loss"}>
            {pct(stats.roi)}
          </small>
        </div>
      </section>
      <section className="panel detail-holdings">
        <div className="panel-header">
          <div>
            <h2>我的资产</h2>
            <p>直接记录数量、成本和价格；同一账户可持有多项资产。</p>
          </div>
          <Button
            className="primary-button"
            onClick={onAdd}
            disabled={account.archived}
          >
            <Plus size={15} />
            添加资产
          </Button>
        </div>
        {positions.length ? (
          <div className="table-scroll">
            <Table className="data-table holding-table">
              <TableHeader>
                <TableRow>
                  <TableHead>资产名称</TableHead>
                  <TableHead className="right">持有数量 / 仓位</TableHead>
                  <TableHead className="right">成本 / 保证金</TableHead>
                  <TableHead className="right">单价 / 净值</TableHead>
                  <TableHead className="right">收益率</TableHead>
                  <TableHead className="right">当前估值</TableHead>
                  <TableHead className="right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((h) => {
                  const hs = positionStats(state, h);
                  return (
                    <TableRow key={h.id}>
                      <TableCell>
                        <div className="row">
                          <span className="holding-symbol">
                            {h.symbol.slice(0, 3)}
                          </span>
                          <div>
                            <strong>{h.name}</strong>
                            {h.symbol !== h.name && <small>{h.symbol}</small>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="right">
                        {hs.quantity === null
                          ? "待补充"
                          : hs.quantity.toLocaleString("zh-CN", {
                              maximumFractionDigits: 10,
                            })}
                        {assetType(state, h) === "grid"
                          ? ` · ${h.leverage ?? 1}×`
                          : assetType(state, h) === "stock"
                            ? " 股"
                            : assetType(state, h) === "fund"
                              ? " 份"
                              : " 个"}
                      </TableCell>
                      <TableCell className="right">
                        {money(hs.invested, account.currency)}
                      </TableCell>
                      <TableCell className="right">
                        {assetType(state, h) === "grid"
                          ? "按总权益"
                          : hs.quantity && hs.quantity > 0
                            ? money(hs.value / hs.quantity, account.currency)
                            : "—"}
                      </TableCell>
                      <TableCell
                        className={
                          "right " + (hs.profit >= 0 ? "gain" : "loss")
                        }
                      >
                        {pct(hs.roi)}
                      </TableCell>
                      <TableCell className="right">
                        <strong>{money(hs.value, account.currency)}</strong>
                      </TableCell>
                      <TableCell>
                        <div className="holding-controls">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEdit(h)}
                            disabled={account.archived}
                          >
                            <Pencil size={12} />
                            编辑
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDelete(h)}
                          >
                            <Trash2 size={12} />
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty
            icon={Wallet}
            title="添加这个账户的第一个资产"
            text="添加币种、股票、基金或网格仓位，按数量与价格汇总资产。"
            action={
              <Button onClick={onAdd} disabled={account.archived}>
                <Plus size={14} />
                添加资产
              </Button>
            }
          />
        )}
        <div className="detail-balance">
          <span>
            账户未分配资金{" "}
            <strong>
              {money(unallocated(state, account), account.currency)}
            </strong>
          </span>
          <Button variant="ghost" size="sm" onClick={onRecords}>
            查看账户流水 <ArrowRight size={13} />
          </Button>
        </div>
      </section>
    </div>
  );
}

function ResetForm({
  busy,
  onExport,
  onSubmit,
}: {
  busy: boolean;
  onExport: () => void;
  onSubmit: (keep: boolean) => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [keep, setKeep] = useState(true);
  return (
    <FormShell
      busy={busy}
      label="确认清空"
      onSubmit={async () => {
        if (confirmation !== "清空") throw Error("请输入“清空”确认操作");
        await onSubmit(keep);
      }}
    >
      <div className="form-tip field-wide">
        将删除所有资产、流水、定投计划和手记，无法撤销。汇率与交易日历保留。建议先下载备份。
      </div>
      <Field label="清空范围" wide>
        <NativeSelect
          value={keep ? "keep" : "all"}
          onChange={(e) => setKeep(e.target.value === "keep")}
        >
          <option value="keep">保留账户，只清空投资数据</option>
          <option value="all">全部清空，包括账户</option>
        </NativeSelect>
      </Field>
      <Field label="输入“清空”确认" wide>
        <Input
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="清空"
          required
        />
      </Field>
      <Button type="button" variant="outline" onClick={onExport}>
        <Download size={14} />
        先下载备份
      </Button>
    </FormShell>
  );
}
