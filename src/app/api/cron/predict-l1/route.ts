// L1 单场预测 cron 端点。
//
// 触发:任何 scheduler 都行(Vercel Cron / GitHub Actions / 自家 cron / etc.)
// 鉴权:Authorization: Bearer <CRON_SECRET>
//
// 行为:调 runPredictL1() 自动模式 — 若下一场比赛 ≤6h 后开赛,则把那一天(ET)
// 的所有比赛 × 8 家活跃模型批量预测。否则返回「未进入触发窗口」。
//
// Dev 环境(NODE_ENV !== 'production')额外支持 query 参数覆盖,方便本地调试:
//   ?date=YYYY-MM-DD          指定 ET 日期
//   ?match_ids=M001,M002      指定具体比赛 ID 列表
//
// 幂等:跳过 predictions_l1 已存在的组合;P2002 unique violation 视为正常重复。

import { NextResponse } from 'next/server';
import { runPredictL1 } from '@/lib/predict-l1';

export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'missing OPENROUTER_API_KEY' }, { status: 500 });
  }

  // Dev-only 覆盖
  const url = new URL(request.url);
  const isDev = process.env.NODE_ENV !== 'production';
  const date = isDev ? (url.searchParams.get('date') ?? undefined) : undefined;
  const matchIdsRaw = isDev ? url.searchParams.get('match_ids') : null;
  const matchIds = matchIdsRaw ? matchIdsRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;

  const result = await runPredictL1({ apiKey, date, matchIds });
  return NextResponse.json({ ok: true, ...result });
}
