// 把 openfootball 的完赛数据同步到 match_results。
// 同时被 scripts/fetch_results.ts(手动) 和 api/cron/fetch-results(定时) 复用。
//
// 匹配规则:
//   1. 取 openfootball 一场完赛比赛(必有 score.ft)
//   2. 把 team1/team2 归一化为我们的 nameEn,再通过 teams 表反查 FIFA 三字母代码
//   3. 在 matches 表里找 (kickoff_at::date, {home,away} == {t1,t2}) 的那一场
//   4. UPSERT match_results,顺手把 matches.status 改成 'finished'
//
// 小组赛(M001-M072)home/away_team_id 都已写入,直接匹配。
// 淘汰赛(M073-M104)home/away_team_id 起初为 NULL,本同步器会跳过(标记 unmatched)
// — KO 对阵的自动填写不在本模块职责内(后续 L2 出线计算或单独 bracket 推断器处理)。

import { prisma } from './prisma';
import {
  fetchWorldCupYear,
  normalizeTeamName,
  computeResult,
  type OpenfootballMatch,
} from './openfootball';
import { scoreMatch } from './scoring';
import { autoFillR32, type KoFillSummary } from './ko-fill';

export interface SyncSummary {
  fetched: number;          // openfootball 返回的总场次
  completed: number;        // 其中 score.ft 已有的场次
  matched: number;          // 在我们 DB 里找到对应 match 的
  written: number;          // 实际 upsert 成功(matched 减去 outcome 异常等)
  status_updated: number;   // matches.status 改为 finished 的数量
  scores_computed: number;  // 触发 scoring 累计计分的预测条数
  ko_fill?: KoFillSummary;  // 如果有 group 完赛,尝试一次 R32 自动填表
  unknown_teams: string[];  // 归一化失败的队名(开发期重要)
  unmatched: { date: string; team1: string; team2: string }[]; // 找不到 DB 对应的
}

export async function syncResults(year: number): Promise<SyncSummary> {
  const root = await fetchWorldCupYear(year);
  const completed = root.matches.filter(m => m.score?.ft);

  // ---- 准备查询表 ----
  const teams = await prisma.teams.findMany({
    select: { id: true, name: true },
  });
  const nameToId = new Map(teams.map(t => [t.name, t.id]));
  const knownNames = new Set(teams.map(t => t.name));

  // 只需匹配「对阵已定」的我们方比赛(home/away_team_id 非空)
  const ourMatches = await prisma.matches.findMany({
    where: {
      home_team_id: { not: null },
      away_team_id: { not: null },
    },
    select: {
      id: true,
      stage: true,
      kickoff_at: true,
      home_team_id: true,
      away_team_id: true,
      status: true,
    },
  });

  // index: 'YYYY-MM-DD|{minId,maxId}' → match.id
  // 用 sorted 对子键,确保 home/away 顺序无关
  const byKey = new Map<string, typeof ourMatches[number]>();
  for (const m of ourMatches) {
    const day = m.kickoff_at.toISOString().slice(0, 10);
    const [a, b] = [m.home_team_id!, m.away_team_id!].sort();
    byKey.set(`${day}|${a}|${b}`, m);
  }

  const summary: SyncSummary = {
    fetched: root.matches.length,
    completed: completed.length,
    matched: 0,
    written: 0,
    status_updated: 0,
    scores_computed: 0,
    unknown_teams: [],
    unmatched: [],
  };

  let anyGroupFinished = false;

  for (const ofMatch of completed) {
    const r = mapAndCompute(ofMatch, nameToId, knownNames, summary);
    if (!r) continue;

    const { ourMatchId, computed } = r;
    const target = byKey.get(ourMatchId);
    if (!target) {
      summary.unmatched.push({
        date: ofMatch.date,
        team1: ofMatch.team1,
        team2: ofMatch.team2,
      });
      continue;
    }
    summary.matched += 1;

    await prisma.match_results.upsert({
      where: { match_id: target.id },
      create: {
        match_id: target.id,
        ...computed,
        source: 'openfootball',
      },
      update: {
        ...computed,
        source: 'openfootball',
        recorded_at: new Date(),
      },
    });
    summary.written += 1;

    if (target.status !== 'finished') {
      await prisma.matches.update({
        where: { id: target.id },
        data: { status: 'finished' },
      });
      summary.status_updated += 1;
    }

    // 评分:这一场所有 8 家 predictions_l1 算 prediction_scores
    const scoreResult = await scoreMatch(target.id);
    summary.scores_computed += scoreResult.scored;

    if (target.stage === 'group') anyGroupFinished = true;
  }

  // 任何 group 比赛刚被写入完赛 → 试一次 R32 自动填表
  // (autoFillR32 内部会校验 12 组全完赛才动手)
  if (anyGroupFinished) {
    summary.ko_fill = await autoFillR32();
  }

  // 去重 unknown_teams
  summary.unknown_teams = Array.from(new Set(summary.unknown_teams));
  return summary;
}

function mapAndCompute(
  ofMatch: OpenfootballMatch,
  nameToId: Map<string, string>,
  knownNames: Set<string>,
  summary: SyncSummary,
): { ourMatchId: string; computed: ReturnType<typeof computeResult> } | null {
  const t1 = normalizeTeamName(ofMatch.team1, knownNames);
  const t2 = normalizeTeamName(ofMatch.team2, knownNames);
  if (!t1) { summary.unknown_teams.push(ofMatch.team1); return null; }
  if (!t2) { summary.unknown_teams.push(ofMatch.team2); return null; }

  const id1 = nameToId.get(t1);
  const id2 = nameToId.get(t2);
  if (!id1 || !id2) return null;     // 应当不可能发生,knownNames 来自 teams 表

  const [a, b] = [id1, id2].sort();
  const ourMatchId = `${ofMatch.date}|${a}|${b}`;
  return {
    ourMatchId,
    computed: computeResult(ofMatch.score!),
  };
}
