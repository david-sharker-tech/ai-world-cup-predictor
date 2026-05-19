// L1 单场预测核心管线 — 被 cron 端点和 CLI 脚本共用。
//
// 三种调用方式:
//   1. runPredictL1({ matchIds: ['M001','M002'] })  — 显式指定比赛
//   2. runPredictL1({ date: '2026-06-11' })          — 指定 ET 日期,跑当日全部
//   3. runPredictL1({})                              — 自动:取下一场,若 ≤6h 后开赛,
//                                                    则跑「那一天(ET)」的所有比赛
//
// 时区约定:date 字段一律 ET(America/New_York),与 wc2026_schedule.json 一致。
// 世界杯 6-7 月全在 EDT (UTC-4),硬编码 UTC-4。
//
// 幂等:跳过 predictions_l1 已存在的 (match_id, model_id) 组合。

import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { AI_MODELS, type AiModelId } from './ai-models';
import { SYSTEM_PROMPT, buildUserPrompt, PROMPT_VERSION } from './prompts';
import { callWithRetry } from './openrouter';
import { logAttempts, summarizeCall } from './api-logs';
import { withConcurrency } from './concurrency';

const LOOKAHEAD_HOURS = 6;
const DEFAULT_CONCURRENCY = 4;

export interface PredictL1Result {
  scope: { date?: string; match_ids: string[] };
  tasks_total: number;
  succeeded: number;
  failed: number;
  duration_ms: number;
  results: string[];
  reason?: string;     // 当 tasks_total = 0 时,简短描述为什么
}

export interface PredictL1Options {
  apiKey: string;
  date?: string;        // ET 'YYYY-MM-DD' — 优先级低于 matchIds
  matchIds?: string[];  // 显式比赛 ID 列表
  concurrency?: number;
}

export async function runPredictL1(opts: PredictL1Options): Promise<PredictL1Result> {
  const start = Date.now();
  let scopeDate: string | undefined;

  // ---- 1. 确定要处理的比赛 ----
  let matches;
  if (opts.matchIds?.length) {
    matches = await prisma.matches.findMany({
      where: {
        id: { in: opts.matchIds },
        home_team_id: { not: null },
        away_team_id: { not: null },
      },
      include: { home_team: true, away_team: true },
    });
  } else if (opts.date) {
    scopeDate = opts.date;
    const [from, to] = etDayBoundsUtc(opts.date);
    matches = await prisma.matches.findMany({
      where: {
        kickoff_at: { gte: from, lte: to },
        home_team_id: { not: null },
        away_team_id: { not: null },
        status: 'scheduled',
      },
      include: { home_team: true, away_team: true },
    });
  } else {
    // 自动:取下一场比赛 → 若 ≤6h 后开赛 → 跑那一天(ET)的所有比赛
    const next = await prisma.matches.findFirst({
      where: {
        kickoff_at: { gt: new Date() },
        home_team_id: { not: null },
        away_team_id: { not: null },
        status: 'scheduled',
      },
      orderBy: { kickoff_at: 'asc' },
    });
    if (!next) {
      return emptyResult(start, scopeDate, '没有即将开赛的比赛');
    }
    const hoursAway = (next.kickoff_at.getTime() - Date.now()) / 3600_000;
    if (hoursAway > LOOKAHEAD_HOURS) {
      return emptyResult(start, scopeDate, `下一场比赛在 ${hoursAway.toFixed(1)}h 后,未进入 ${LOOKAHEAD_HOURS}h 触发窗口`);
    }
    scopeDate = etDateString(next.kickoff_at);
    const [from, to] = etDayBoundsUtc(scopeDate);
    matches = await prisma.matches.findMany({
      where: {
        kickoff_at: { gte: from, lte: to },
        home_team_id: { not: null },
        away_team_id: { not: null },
        status: 'scheduled',
      },
      include: { home_team: true, away_team: true },
    });
  }

  if (matches.length === 0) {
    return emptyResult(start, scopeDate, '所选范围内无对阵已定的比赛');
  }

  // ---- 2. 过滤已有预测 ----
  const existing = await prisma.predictions_l1.findMany({
    where: { match_id: { in: matches.map(m => m.id) } },
    select: { match_id: true, model_id: true },
  });
  const existingSet = new Set(existing.map(r => `${r.match_id}:${r.model_id}`));

  // ---- 3. 活跃模型 ----
  const activeRows = await prisma.ai_models.findMany({
    where: { is_active: true },
    select: { id: true },
  });
  const activeIds = new Set(activeRows.map(r => r.id as AiModelId));
  const activeModels = AI_MODELS.filter(m => activeIds.has(m.id));

  // ---- 4. 任务清单 ----
  type Task = {
    match: typeof matches[number];
    model: typeof AI_MODELS[number];
  };
  const tasks: Task[] = [];
  for (const match of matches) {
    if (!match.home_team || !match.away_team) continue;
    for (const model of activeModels) {
      if (existingSet.has(`${match.id}:${model.id}`)) continue;
      tasks.push({ match, model });
    }
  }

  if (tasks.length === 0) {
    return {
      scope: { date: scopeDate, match_ids: matches.map(m => m.id) },
      tasks_total: 0, succeeded: 0, failed: 0,
      duration_ms: Date.now() - start,
      results: [],
      reason: `${matches.length} 场 × 8 家全部已预测,无新任务`,
    };
  }

  // ---- 5. 并发跑 ----
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const results = await withConcurrency(tasks, concurrency, async (task) => {
    const home = task.match.home_team!;
    const away = task.match.away_team!;
    const userPrompt = buildUserPrompt(task.match, home, away);
    const callResult = await callWithRetry({
      apiKey: opts.apiKey,
      model: task.model,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      homeAliases: [home.name_zh, home.name],
      awayAliases: [away.name_zh, away.name],
    });

    await logAttempts({
      modelId: task.model.id,
      layer: 'l1',
      matchId: task.match.id,
    }, callResult.attempts);

    if (!callResult.ok || !callResult.normalized) {
      return { ok: false, summary: `[${task.match.id}] ${summarizeCall(callResult)}` };
    }

    const n = callResult.normalized;
    if (n.outcome === 'unknown' || n.goals_over_under === 'unknown') {
      return {
        ok: false,
        summary: `[${task.match.id}] ✗ ${task.model.id} normalized invalid: outcome=${n.outcome}, ou=${n.goals_over_under}`,
      };
    }

    try {
      await prisma.predictions_l1.create({
        data: {
          match_id: task.match.id,
          model_id: task.model.id,
          outcome: n.outcome,
          score_home: n.score_home,
          score_away: n.score_away,
          goals_over_under: n.goals_over_under,
          btts: n.btts,
          confidence: n.confidence,
          reason: n.reason,
          wildcard: n.wildcard || null,
          raw_response: callResult.rawResponse as Prisma.InputJsonValue,
          prompt_version: PROMPT_VERSION,
        },
      });
      return { ok: true, summary: `[${task.match.id}] ${summarizeCall(callResult)}` };
    } catch (e) {
      const dup = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
      return {
        ok: dup,
        summary: dup
          ? `[${task.match.id}] ⚠ ${task.model.id} 重复`
          : `[${task.match.id}] ✗ ${task.model.id} insert failed: ${(e as Error).message}`,
      };
    }
  });

  const okCount = results.filter(r => r.ok).length;
  return {
    scope: { date: scopeDate, match_ids: matches.map(m => m.id) },
    tasks_total: tasks.length,
    succeeded: okCount,
    failed: tasks.length - okCount,
    duration_ms: Date.now() - start,
    results: results.map(r => r.summary),
  };
}

function emptyResult(start: number, scopeDate: string | undefined, reason: string): PredictL1Result {
  return {
    scope: { date: scopeDate, match_ids: [] },
    tasks_total: 0, succeeded: 0, failed: 0,
    duration_ms: Date.now() - start,
    results: [],
    reason,
  };
}

function etDateString(d: Date): string {
  // 'sv-SE' locale → ISO 'YYYY-MM-DD' 格式
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/New_York' });
}

function etDayBoundsUtc(etDate: string): [Date, Date] {
  // 世界杯 6-7 月全在 EDT (UTC-4)。
  // 如果以后扩展到夏令时之外,改用 Intl.DateTimeFormat 推真实 offset。
  const start = new Date(`${etDate}T00:00:00-04:00`);
  const end = new Date(`${etDate}T23:59:59.999-04:00`);
  return [start, end];
}
