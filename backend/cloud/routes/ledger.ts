import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";
import { seedLedger, validateLedger } from "../../shared/ledger";
import { materializeAutomatic } from "../../src/automation";
import { validMutationSource } from "../request-security";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return reply({ error: "请先登录后打开你的投资手账" }, 401);
  try {
    const data = seedLedger();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO ledgers (owner_id,data,revision,updated_at) VALUES (?,?,0,?)",
    )
      .bind(user.userId, JSON.stringify(data), new Date().toISOString())
      .run();
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await env.DB.prepare(
        "SELECT data,revision,updated_at FROM ledgers WHERE owner_id = ?",
      )
        .bind(user.userId)
        .first<{ data: string; revision: number; updated_at: string }>();
      if (!row) throw Error("missing ledger");
      const { state, added } = materializeAutomatic(JSON.parse(row.data));
      const serialized = JSON.stringify(state);
      if (serialized === row.data)
        return reply({
          state,
          revision: row.revision,
          updatedAt: row.updated_at,
          autoAdded: 0,
        });
      const updatedAt = new Date().toISOString();
      const update = await env.DB.prepare(
        "UPDATE ledgers SET data=?,revision=revision+1,updated_at=? WHERE owner_id=? AND revision=?",
      )
        .bind(serialized, updatedAt, user.userId, row.revision)
        .run();
      if (update.meta.changes === 1)
        return reply({
          state,
          revision: row.revision + 1,
          updatedAt,
          autoAdded: added,
        });
    }
    return reply({ error: "账本正在更新，请重试" }, 409);
  } catch {
    return reply(
      { error: "账本暂时无法读取，请稍后重试。你的记录不会被覆盖。" },
      503,
    );
  }
}
export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return reply({ error: "请先登录" }, 401);
  if (!validMutationSource(request))
    return reply({ error: "请求来源无效" }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 4_000_000)
      return reply({ error: "账本文件超过 4 MB" }, 413);
    const body = JSON.parse(raw);
    const { state, added } = materializeAutomatic(validateLedger(body.state));
    if (!Number.isSafeInteger(body.revision) || body.revision < 0)
      return reply({ error: "账本版本无效" }, 400);
    const updatedAt = new Date().toISOString();
    const result = await env.DB.prepare(
      "UPDATE ledgers SET data=?, revision=revision+1, updated_at=? WHERE owner_id=? AND revision=?",
    )
      .bind(JSON.stringify(state), updatedAt, user.userId, body.revision)
      .run();
    if (result.meta.changes !== 1)
      return reply(
        { error: "账本已在另一页面更新，请刷新后再保存，避免覆盖新记录。" },
        409,
      );
    return reply({
      state,
      revision: body.revision + 1,
      updatedAt,
      autoAdded: added,
    });
  } catch (e) {
    return reply(
      { error: e instanceof Error ? e.message : "保存失败，请重试" },
      400,
    );
  }
}
