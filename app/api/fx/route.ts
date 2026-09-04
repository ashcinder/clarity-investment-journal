import { getChatGPTUser } from '@/app/chatgpt-auth';
import { validDate, today } from '@/lib/ledger';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!(await getChatGPTUser()))
    return Response.json({ error: '请先登录' }, { status: 401 });
  try {
    const response = await fetch(
      'https://api.frankfurter.dev/v2/rate/USD/CNY',
      { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) throw Error();
    const data = (await response.json()) as { rate: number; date: string };
    if (
      !Number.isFinite(data.rate) ||
      data.rate <= 0 ||
      !validDate(data.date) ||
      data.date > today()
    )
      throw Error();
    return Response.json(
      { rate: data.rate, date: data.date, source: 'Frankfurter · 参考汇率' },
      { headers: { 'Cache-Control': 'private, max-age=3600' } },
    );
  } catch {
    return Response.json(
      { error: '汇率服务暂不可用，已保留上次汇率。你也可以手动设置。' },
      { status: 502 },
    );
  }
}
