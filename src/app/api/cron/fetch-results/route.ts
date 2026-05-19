// 比分抓取 cron 端点。
//
// 触发:任意 scheduler(vercel.json 配置每 15 min 调一次)
// 鉴权:Authorization: Bearer <CRON_SECRET>
//
// 行为:从 openfootball/worldcup.json 拉 2026 比赛数据,把完赛的(score.ft 已有)
// 同步到 match_results,并把对应 matches.status 改成 'finished'。
//
// 幂等:upsert 模式,重复跑无副作用。
//
// 不在窗口内时(比赛尚未开始 / 已全部结束),抓取依然会跑但 matched=0。

import { NextResponse } from 'next/server';
import { syncResults } from '@/lib/results-sync';

export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const summary = await syncResults(2026);
    return NextResponse.json({
      ok: true,
      ...summary,
      duration_ms: Date.now() - startedAt,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: (e as Error).message,
      duration_ms: Date.now() - startedAt,
    }, { status: 500 });
  }
}
