// 通用 L1 prompt 模板,源自 poc_experiment_v5.html(126-159 行)。
// **8 家必须用完全相同的 prompt** — 公平性是产品根基。
// 改 prompt 要同步升级 `prompt_version` 字符串以便追踪。

import type { matches, teams } from '@prisma/client';

export const PROMPT_VERSION = 'v1.0';

export const SYSTEM_PROMPT = `你是一个足球分析师,正在参加 AI 预测擂台赛。
规则: 这是一场即将进行的比赛,你必须基于公开知识给出预测。
要求: 严格按照 JSON 格式输出,所有字段都必须填写,不能用 null 或 undefined。
特别提醒: 不要因为强队"应该赢"就盲目押热门 — 冷门也是足球的一部分。`;

export function buildUserPrompt(match: matches, home: teams, away: teams): string {
  const kickoff = match.kickoff_at.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    hour12: false,
  });
  const venueLine = [match.venue, match.city, match.country].filter(Boolean).join(' · ');
  const stageLine = match.group_letter
    ? `2026 世界杯 · ${match.group_letter} 组小组赛`
    : `2026 世界杯 · ${stageLabel(match.stage)}`;

  return `请预测这场比赛:

${home.name_zh} (${home.name}) vs ${away.name_zh} (${away.name})
${stageLine}
${venueLine}
开赛时间(北京时间): ${kickoff}

请严格按以下 JSON 格式输出,不要输出其他任何内容,所有字段必填:

{
  "outcome": "必须是 home_win 或 draw 或 away_win 三选一,home 代表 ${home.name_zh}",
  "score_home": 整数,代表 ${home.name_zh} 进球数,
  "score_away": 整数,代表 ${away.name_zh} 进球数,
  "goals_over_under": "必须是 over 或 under 二选一,基于 2.5 球",
  "btts": true 或 false,
  "confidence": 0-100 之间的整数,
  "reason": "一句话,说一个别人不会说的理由,50字以内,不能为空",
  "wildcard": "一个可能让预测翻车的意外因素,30字以内,不能为空"
}`;
}

function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    group: '小组赛',
    round_of_32: '32 强',
    round_of_16: '16 强',
    quarterfinals: '1/4 决赛',
    semifinals: '半决赛',
    third_place: '季军赛',
    final: '决赛',
  };
  return map[stage] ?? stage;
}
