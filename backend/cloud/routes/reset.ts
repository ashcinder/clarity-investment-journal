import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";
import { clearLedger, validateLedger } from "../../../shared/ledger";
import { validMutationSource } from "../request-security";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!validMutationSource(request))
    return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const body = (await request.json()) as {
      confirmation?: string;
      keepAccounts: boolean;
      revision: number;
    };
    if (
      body.confirmation !== "清空" ||
      typeof body.keepAccounts !== "boolean" ||
      !Number.isSafeInteger(body.revision)
    )
      return Response.json(
        { error: "请输入“清空”并选择清空范围" },
        { status: 400 },
      );
    const row = await env.DB.prepare(
      "SELECT data,revision FROM ledgers WHERE owner_id=?",
    )
      .bind(user.userId)
      .first<{ data: string; revision: number }>();
    if (!row || row.revision !== body.revision)
      return Response.json(
        { error: "账本已更新，请刷新后重试" },
        { status: 409 },
      );
    const state = clearLedger(
        validateLedger(JSON.parse(row.data)),
        body.keepAccounts,
      ),
      updatedAt = new Date().toISOString();
    const result = await env.DB.prepare(
      "UPDATE ledgers SET data=?,revision=revision+1,updated_at=? WHERE owner_id=? AND revision=?",
    )
      .bind(JSON.stringify(state), updatedAt, user.userId, body.revision)
      .run();
    if (result.meta.changes !== 1)
      return Response.json(
        { error: "账本已更新，请刷新后重试" },
        { status: 409 },
      );
    return Response.json(
      { state, revision: body.revision + 1, updatedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "清空失败，记录未被覆盖" }, { status: 400 });
  }
}
