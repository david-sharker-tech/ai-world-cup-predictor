// Prisma 接管了大部分 DB 行类型(通过 @prisma/client)。
// 此处只保留:
//   1. 应用层语义枚举(outcome / over_under),让代码用窄类型而不是 string
//   2. AI 归一化输出形状(normalizeData 的目标)— 与 DB 表无直接关系

export type Outcome = 'home_win' | 'draw' | 'away_win';
export type OverUnder = 'over' | 'under';

export interface NormalizedPrediction {
  outcome: Outcome | 'unknown';
  score_home: number;
  score_away: number;
  goals_over_under: OverUnder | 'unknown';
  btts: boolean;
  confidence: number;
  reason: string;
  wildcard: string;
}
