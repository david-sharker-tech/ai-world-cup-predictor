// 小组赛全部结束后,把 R32(M073-M088)中「Winner X」/「Runner-up X」类型的
// 对阵填入实际球队 ID。
//
// 范围:
//   ✅ 处理「Winner X vs Runner-up Y」和「Runner-up X vs Runner-up Y」类型
//   ❌ 不处理含「Best 3rd (...)」的 8 场 — FIFA 用固定 permutation 表决定
//      8 个晋级 3rd 如何配给 8 个 R32 slot,brief 没明确,暂保持 pending
//
// 触发时机:fetch-results 写完一场 group 比赛后,检查相关组是否已完赛 →
//   只在全部 12 组都完赛时才执行(避免半路填错)。
//
// 排名规则:积分(3/1/0)→ 净胜球(GD)→ 进球数(GF)→ 字母序(确定性)。
//   FIFA 实际还有 head-to-head 等,本实现是简化版。

import { prisma } from './prisma';

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L'] as const;
type GroupLetter = typeof GROUPS[number];

interface Standing {
  team_id: string;
  played: number;
  points: number;
  gd: number;
  gf: number;
}

/** 计算单组排名(1st / 2nd / 3rd / 4th) */
async function computeGroupStandings(letter: GroupLetter): Promise<Standing[] | null> {
  const matches = await prisma.matches.findMany({
    where: { group_letter: letter, status: 'finished' },
    include: { match_result: true },
  });
  // 必须 6 场全完赛(每组 4 队两两对决 = 6 场)
  if (matches.length < 6) return null;
  const withResults = matches.filter(m => m.match_result);
  if (withResults.length < 6) return null;

  const teams = await prisma.teams.findMany({ where: { group_letter: letter } });
  const standings = new Map<string, Standing>(
    teams.map(t => [t.id, { team_id: t.id, played: 0, points: 0, gd: 0, gf: 0 }])
  );

  for (const m of withResults) {
    const r = m.match_result!;
    const home = standings.get(m.home_team_id!);
    const away = standings.get(m.away_team_id!);
    if (!home || !away) continue;

    home.played += 1; away.played += 1;
    home.gf += r.score_home; away.gf += r.score_away;
    home.gd += r.score_home - r.score_away;
    away.gd += r.score_away - r.score_home;

    // 90 分钟胜负(小组赛不打加时);用 ft 比分判定
    if (r.score_home > r.score_away)      { home.points += 3; }
    else if (r.score_home < r.score_away) { away.points += 3; }
    else                                  { home.points += 1; away.points += 1; }
  }

  return Array.from(standings.values()).sort((a, b) =>
    b.points - a.points
    || b.gd - a.gd
    || b.gf - a.gf
    || a.team_id.localeCompare(b.team_id)
  );
}

interface LabelSide {
  kind: 'winner' | 'runner_up' | 'best_3rd';
  group?: GroupLetter;
  /** for best_3rd: which 5 groups the 3rd is drawn from */
  groups?: GroupLetter[];
}

function parseSide(s: string): LabelSide | null {
  const winner = /^Winner ([A-L])$/.exec(s);
  if (winner) return { kind: 'winner', group: winner[1] as GroupLetter };
  const runner = /^Runner-up ([A-L])$/.exec(s);
  if (runner) return { kind: 'runner_up', group: runner[1] as GroupLetter };
  const third = /^Best 3rd \(([A-L/]+)\)$/.exec(s);
  if (third) return {
    kind: 'best_3rd',
    groups: third[1].split('/').filter(x => x.length === 1) as GroupLetter[],
  };
  return null;
}

function parseLabel(label: string): [LabelSide, LabelSide] | null {
  const parts = label.split(' vs ');
  if (parts.length !== 2) return null;
  const a = parseSide(parts[0]);
  const b = parseSide(parts[1]);
  if (!a || !b) return null;
  return [a, b];
}

export interface KoFillSummary {
  groups_complete: number;     // 多少组完赛(0-12)
  matches_filled: number;      // 实际填入对阵的 R32 场次
  matches_skipped_best3rd: number;  // 含 Best 3rd 跳过的
  matches_parse_failed: number;
}

export async function autoFillR32(): Promise<KoFillSummary> {
  const summary: KoFillSummary = {
    groups_complete: 0,
    matches_filled: 0,
    matches_skipped_best3rd: 0,
    matches_parse_failed: 0,
  };

  // 计算 12 组排名
  const standingsByGroup = new Map<GroupLetter, Standing[]>();
  for (const g of GROUPS) {
    const s = await computeGroupStandings(g);
    if (s) {
      standingsByGroup.set(g, s);
      summary.groups_complete += 1;
    }
  }

  // 必须 12 组全部完赛才填(否则 best-3rd 推理依据不足,虽然我们暂不填)
  if (summary.groups_complete < 12) return summary;

  // 取出所有 pending 的 R32 比赛
  const pending = await prisma.matches.findMany({
    where: {
      stage: 'round_of_32',
      home_team_id: null,
      away_team_id: null,
      pending_label: { not: null },
    },
  });

  for (const m of pending) {
    const parsed = parseLabel(m.pending_label!);
    if (!parsed) { summary.matches_parse_failed += 1; continue; }

    const [aSide, bSide] = parsed;
    // 任一边是 best_3rd → 暂不处理
    if (aSide.kind === 'best_3rd' || bSide.kind === 'best_3rd') {
      summary.matches_skipped_best3rd += 1;
      continue;
    }

    const homeId = resolveSide(aSide, standingsByGroup);
    const awayId = resolveSide(bSide, standingsByGroup);
    if (!homeId || !awayId) { summary.matches_parse_failed += 1; continue; }

    await prisma.matches.update({
      where: { id: m.id },
      data: {
        home_team_id: homeId,
        away_team_id: awayId,
        pending_label: null,
      },
    });
    summary.matches_filled += 1;
  }

  return summary;
}

function resolveSide(side: LabelSide, standings: Map<GroupLetter, Standing[]>): string | null {
  if (side.kind === 'winner' && side.group) {
    return standings.get(side.group)?.[0]?.team_id ?? null;
  }
  if (side.kind === 'runner_up' && side.group) {
    return standings.get(side.group)?.[1]?.team_id ?? null;
  }
  // best_3rd 已被上层拦截
  return null;
}
