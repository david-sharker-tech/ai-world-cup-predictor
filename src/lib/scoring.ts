// 赛后评分:把 match_results 和 8 家 predictions_l1 合起来,算出每条预测的得分。
//
// 规则(来自 schema_v1.sql 注释 + brief):
//   outcome_correct +3
//   score_exact     +5(叠加,不是替换)
//   goals_correct   +1(基于 2.5 球阈值)
//   btts_correct    +1
//   4 项全对        is_perfect = true,额外 +3 → 总分 13
//   押中冷门        outcome_correct 且 >=3 其他模型 outcome ≠ 你的 → is_upset_hit
//                  得分 × 1.5(四舍五入)
//   4 项全错        is_total_miss = true(打脸内容素材)

import { prisma } from './prisma';
import type { predictions_l1, match_results } from '@prisma/client';

interface ComputedScore {
  outcome_correct: boolean;
  score_exact: boolean;
  goals_correct: boolean;
  btts_correct: boolean;
  is_perfect: boolean;
  is_upset_hit: boolean;
  is_total_miss: boolean;
  points: number;
}

function predictedToWinner(p: predictions_l1): 'home' | 'draw' | 'away' {
  if (p.outcome === 'home_win') return 'home';
  if (p.outcome === 'away_win') return 'away';
  return 'draw';
}

export function scoreOne(
  prediction: predictions_l1,
  result: match_results,
  otherPredictions: predictions_l1[],     // 同场其他 7 条
): ComputedScore {
  const actualWinner = result.winner as 'home' | 'draw' | 'away';
  const totalGoals = result.score_home + result.score_away;
  const actualBtts = result.score_home > 0 && result.score_away > 0;
  const actualGoals: 'over' | 'under' = totalGoals > 2.5 ? 'over' : 'under';

  const outcome_correct = predictedToWinner(prediction) === actualWinner;
  const score_exact = prediction.score_home === result.score_home
                   && prediction.score_away === result.score_away;
  const goals_correct = prediction.goals_over_under === actualGoals;
  const btts_correct = prediction.btts === actualBtts;

  const is_perfect = outcome_correct && score_exact && goals_correct && btts_correct;
  const is_total_miss = !outcome_correct && !score_exact && !goals_correct && !btts_correct;

  // 押中冷门:你对 + 至少 3 个其他模型 outcome 与你不同
  const differentOutcomeCount = otherPredictions.filter(p => p.outcome !== prediction.outcome).length;
  const is_upset_hit = outcome_correct && differentOutcomeCount >= 3;

  let points = 0;
  if (outcome_correct) points += 3;
  if (score_exact)     points += 5;
  if (goals_correct)   points += 1;
  if (btts_correct)    points += 1;
  if (is_perfect)      points += 3;
  if (is_upset_hit)    points = Math.round(points * 1.5);

  return {
    outcome_correct, score_exact, goals_correct, btts_correct,
    is_perfect, is_upset_hit, is_total_miss, points,
  };
}

/**
 * 给一场比赛的所有 8 条预测计算/重算 prediction_scores。
 * 在 fetch-results 写入 match_results 之后调用。
 * 幂等:UNIQUE (prediction_id) 上做 upsert。
 */
export async function scoreMatch(matchId: string): Promise<{ scored: number }> {
  const result = await prisma.match_results.findUnique({ where: { match_id: matchId } });
  if (!result) return { scored: 0 };

  const predictions = await prisma.predictions_l1.findMany({ where: { match_id: matchId } });
  if (predictions.length === 0) return { scored: 0 };

  let scored = 0;
  for (const p of predictions) {
    const others = predictions.filter(x => x.id !== p.id);
    const s = scoreOne(p, result, others);
    await prisma.prediction_scores.upsert({
      where: { prediction_id: p.id },
      create: { prediction_id: p.id, ...s, calculated_at: new Date() },
      update: { ...s, calculated_at: new Date() },
    });
    scored += 1;
  }
  return { scored };
}
