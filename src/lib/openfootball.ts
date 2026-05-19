// openfootball/worldcup.json fetcher + 归一化。
//
// 数据源:https://github.com/openfootball/worldcup.json(brief 指定主源)
// 公有领域,无 API key,无限速,社区维护(可能滞后几小时,可接受)。
//
// schema:
//   { name, matches: [{
//     round, date, time, team1, team2, group?, ground,
//     score?: { ft: [a,b], ht?, et?, p? }
//   }] }
//
// 关键点:
//   - 只有完赛比赛才有 `score` 字段(`score.ft` 必有)
//   - 顺序:ft → 平局看 et → 仍平看 p,最终胜负由最后一个非平局阶段决定
//   - 我们 DB 的 winner ∈ {home,draw,away},包含所有阶段(brief 设计)

const BASE = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master';

export interface OpenfootballScore {
  ft: [number, number];
  ht?: [number, number];
  et?: [number, number];
  p?: [number, number];
}

export interface OpenfootballMatch {
  round: string;
  date: string;            // 'YYYY-MM-DD'
  time?: string;
  team1: string;
  team2: string;
  group?: string;
  ground?: string;
  score?: OpenfootballScore;
}

export interface OpenfootballRoot {
  name: string;
  matches: OpenfootballMatch[];
}

export async function fetchWorldCupYear(year: number): Promise<OpenfootballRoot> {
  const url = `${BASE}/${year}/worldcup.json`;
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`openfootball ${year}: HTTP ${resp.status}`);
  return resp.json();
}

// ---- 队名归一化 ----
// openfootball 用的英文名与我们 team-mapping.ts 的 nameEn 存在差异。
// 这里维护一个显式 alias 表。**未命中的队名会被 mapTeamName 视为未知。**
// 新差异出现时:加一行,而不是让代码默默放过。

const NAME_ALIASES: Record<string, string> = {
  'Czech Republic': 'Czechia',
  'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
  'United States': 'USA',
  'Côte d\'Ivoire': 'Ivory Coast',
  'Cote d\'Ivoire': 'Ivory Coast',
  'Curaçao': 'Curacao',
  'Türkiye': 'Turkey',
  'Cabo Verde': 'Cape Verde',
  'Korea Republic': 'South Korea',
  'IR Iran': 'Iran',
  'Congo DR': 'DR Congo',
  'DR Congo (Congo-Kinshasa)': 'DR Congo',
};

/**
 * 把 openfootball 的队名映射到我们 team-mapping.ts 的 nameEn。
 * 已知:openfootball 直接给的就是我们用的名字时,原样返回。
 * 未知:返回 null(调用方应当报错,不要静默跳过)。
 */
export function normalizeTeamName(raw: string, knownNames: ReadonlySet<string>): string | null {
  if (knownNames.has(raw)) return raw;
  const alias = NAME_ALIASES[raw];
  if (alias && knownNames.has(alias)) return alias;
  return null;
}

// ---- 结果计算 ----

export interface ComputedResult {
  score_home: number;
  score_away: number;
  went_to_extra_time: boolean;
  extra_time_home: number | null;
  extra_time_away: number | null;
  went_to_penalties: boolean;
  penalty_home: number | null;
  penalty_away: number | null;
  winner: 'home' | 'draw' | 'away';
}

/**
 * 根据 openfootball score 各阶段比分,推导 DB 写入的 ComputedResult。
 * 注意:winner 取 **最终阶段** 的胜负 — ft 不平就用 ft,ft 平看 et,et 平看 p。
 * DB 的 score_home/score_away 永远存 ft(brief 设计:90 分钟比分)。
 */
export function computeResult(score: OpenfootballScore): ComputedResult {
  const [ftH, ftA] = score.ft;
  const hasEt = !!score.et;
  const hasPen = !!score.p;

  let winner: 'home' | 'draw' | 'away';
  if (hasPen) {
    const [pH, pA] = score.p!;
    winner = pH > pA ? 'home' : pA > pH ? 'away' : 'draw';
  } else if (hasEt) {
    const [eH, eA] = score.et!;
    winner = eH > eA ? 'home' : eA > eH ? 'away' : 'draw';
  } else {
    winner = ftH > ftA ? 'home' : ftA > ftH ? 'away' : 'draw';
  }

  // openfootball 的 et 字段含义:整场(90'+30')的累计比分,不是加时段单独得分
  // 我们存的是「加时段总进球数」— 不可知,暂存 et 累计值(brief 没明确,先这样)
  return {
    score_home: ftH,
    score_away: ftA,
    went_to_extra_time: hasEt,
    extra_time_home: hasEt ? score.et![0] : null,
    extra_time_away: hasEt ? score.et![1] : null,
    went_to_penalties: hasPen,
    penalty_home: hasPen ? score.p![0] : null,
    penalty_away: hasPen ? score.p![1] : null,
    winner,
  };
}
