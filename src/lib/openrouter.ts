// OpenRouter client + 4 层重试 + JSON 容错解析 + 字段归一化。
// 移植自 poc_experiment_v5.html(callModel / normalizeData)。
// 关键约束(实测):
//   - 不传 response_format(部分模型会报错,POC 时 Kimi 即如此)
//   - 靠 prompt 强制 JSON
//   - 解析时剥离 markdown 包装,提取 { ... }
//   - 字段名容错映射

import type { AiModel } from './ai-models';
import type { NormalizedPrediction, Outcome, OverUnder } from './types';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 60_000;

// HTTP headers 必须是 Latin-1 (<=255 码点)。把环境变量里可能的中文字符过滤掉,
// 避免 fetch 报 "Cannot convert argument to a ByteString".
function asciiOnly(s: string, fallback: string): string {
  const cleaned = s.replace(/[^\x20-\x7E]/g, '').trim();
  return cleaned.length > 0 ? cleaned : fallback;
}
const SITE_URL = asciiOnly(process.env.OPENROUTER_SITE_URL ?? '', 'https://ai-fifa.local');
const SITE_TITLE = asciiOnly(process.env.OPENROUTER_SITE_TITLE ?? '', 'AI FIFA Predictor');

export type CallStatus =
  | 'success'
  | 'timeout'
  | 'parse_error'
  | 'rate_limit'
  | 'invalid_model'
  | 'http_error'
  | 'empty_response'
  | 'network_error';

export interface CallAttempt {
  attempt: number;
  status: CallStatus;
  httpStatus?: number;
  errorMessage?: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
}

export interface CallResult {
  ok: boolean;
  model: AiModel;
  attempts: CallAttempt[];      // 每次 attempt 一条,失败时也保留
  rawResponse?: unknown;        // 最终成功时的解析后 JSON
  normalized?: NormalizedPrediction;
}

interface CallOnceResult {
  status: CallStatus;
  httpStatus?: number;
  errorMessage?: string;
  rawJson?: unknown;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  isFatal: boolean;             // true → 不重试(如 invalid_model)
}

export interface CallOptions {
  apiKey: string;
  model: AiModel;
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
  /** 已知的归一化目标(主队/客队中文/英文名),用于增强 outcome 识别 */
  homeAliases?: string[];
  awayAliases?: string[];
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function callWithRetry(opts: CallOptions): Promise<CallResult> {
  const attempts: CallAttempt[] = [];
  // 延迟表:第 1 次直接调,第 2 次前等 2s,第 3 次前等 5s。429 命中加倍。
  const baseDelays = [0, 2_000, 5_000];

  for (let i = 0; i < 3; i++) {
    const lastWasRateLimit = attempts.at(-1)?.status === 'rate_limit';
    const delay = baseDelays[i] * (lastWasRateLimit ? 2 : 1);
    if (delay > 0) await sleep(delay);

    const start = Date.now();
    const once = await callOnce(opts);
    const latencyMs = Date.now() - start;

    attempts.push({
      attempt: i + 1,
      status: once.status,
      httpStatus: once.httpStatus,
      errorMessage: once.errorMessage,
      latencyMs,
      promptTokens: once.promptTokens,
      completionTokens: once.completionTokens,
      costUsd: once.costUsd,
    });

    if (once.status === 'success' && once.rawJson) {
      return {
        ok: true,
        model: opts.model,
        attempts,
        rawResponse: once.rawJson,
        normalized: normalizeData(once.rawJson, opts.homeAliases, opts.awayAliases),
      };
    }

    if (once.isFatal) break;
  }

  return { ok: false, model: opts.model, attempts };
}

async function callOnce(opts: CallOptions): Promise<CallOnceResult> {
  const { apiKey, model, systemPrompt, userPrompt } = opts;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': SITE_URL,
        'X-Title': SITE_TITLE,
      },
      body: JSON.stringify({
        model: model.openrouter,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      const errMsg = extractErrorMessage(text);
      return {
        status: classifyHttpError(resp.status, errMsg),
        httpStatus: resp.status,
        errorMessage: `HTTP ${resp.status}: ${errMsg.slice(0, 200)}`,
        isFatal: classifyHttpError(resp.status, errMsg) === 'invalid_model',
      };
    }

    const data = await resp.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) {
      return { status: 'empty_response', errorMessage: '返回内容为空', isFatal: false };
    }

    const parsed = parseJsonContent(content);
    if (parsed === null) {
      return {
        status: 'parse_error',
        errorMessage: `无法解析 JSON: ${content.slice(0, 200)}`,
        isFatal: false,
      };
    }

    return {
      status: 'success',
      rawJson: parsed,
      promptTokens: data?.usage?.prompt_tokens,
      completionTokens: data?.usage?.completion_tokens,
      costUsd: data?.usage?.cost,           // OpenRouter 有时直接给 cost
      isFatal: false,
    };
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    if (e?.name === 'AbortError') {
      return { status: 'timeout', errorMessage: `超时 ${timeoutMs}ms`, isFatal: false };
    }
    return {
      status: 'network_error',
      errorMessage: e?.message ?? String(err),
      isFatal: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

function classifyHttpError(status: number, errText: string): CallStatus {
  if (status === 429) return 'rate_limit';
  const lower = errText.toLowerCase();
  if (lower.includes('invalid model') || lower.includes('not a valid model') || lower.includes('deprecated')) {
    return 'invalid_model';
  }
  return 'http_error';
}

function extractErrorMessage(text: string): string {
  try {
    const parsed = JSON.parse(text);
    return parsed?.error?.message ?? text;
  } catch {
    return text;
  }
}

/**
 * 剥离 markdown 包装,提取第一个 { 到最后一个 } 之间的内容并 JSON.parse。
 * 失败返回 null。
 */
export function parseJsonContent(content: string): unknown | null {
  let s = content.trim();
  // 剥离 ```json ... ``` 包装
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  s = s.slice(first, last + 1);
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ---- 字段归一化(移植自 POC normalizeData) ----

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function normalizeData(
  raw: unknown,
  homeAliases: string[] = [],
  awayAliases: string[] = [],
): NormalizedPrediction {
  const r = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};

  // outcome
  let outcome: Outcome | 'unknown' = 'unknown';
  const oRaw = pickString(r, 'outcome', 'result', 'prediction', 'winner');
  if (oRaw) {
    const lower = oRaw.toLowerCase();
    const isHome =
      lower.includes('home') ||
      homeAliases.some(a => lower.includes(a.toLowerCase()));
    const isAway =
      lower.includes('away') ||
      awayAliases.some(a => lower.includes(a.toLowerCase()));
    if (isHome) outcome = 'home_win';
    else if (isAway) outcome = 'away_win';
    else if (lower.includes('draw') || lower.includes('tie') || lower.includes('平')) outcome = 'draw';
  }

  // 比分:优先单独字段;字符串 "2-1" 也支持
  let scoreHome = pickNumber(r, 'score_home', 'home_score', 'scoreHome');
  let scoreAway = pickNumber(r, 'score_away', 'away_score', 'scoreAway');

  const scoreStr = pickString(r, 'score', 'final_score');
  if ((scoreHome === null || scoreAway === null) && scoreStr && scoreStr.includes('-')) {
    const [a, b] = scoreStr.split('-').map(s => parseInt(s.trim(), 10));
    if (scoreHome === null && Number.isFinite(a)) scoreHome = a;
    if (scoreAway === null && Number.isFinite(b)) scoreAway = b;
  }

  // 大小球
  let gou: OverUnder | 'unknown' = 'unknown';
  const gouRaw = pickString(r, 'goals_over_under', 'over_under', 'goalsOverUnder', 'total_goals');
  if (gouRaw) {
    const l = gouRaw.toLowerCase();
    if (l.includes('over') || l.includes('大')) gou = 'over';
    else if (l.includes('under') || l.includes('小')) gou = 'under';
  }

  // BTTS
  const bttsRaw = r['btts'] ?? r['both_teams_to_score'];
  const btts = typeof bttsRaw === 'boolean' ? bttsRaw
    : typeof bttsRaw === 'string' ? /^(true|yes|是|1)$/i.test(bttsRaw.trim())
    : false;

  // confidence
  let confidence = pickNumber(r, 'confidence') ?? 50;
  confidence = Math.max(0, Math.min(100, confidence));

  // 双语:prompt v1.1 起返回 reason_zh / reason_en / wildcard_zh / wildcard_en
  // 兼容旧返回 reason / wildcard(当作 zh)
  const reasonZh = pickString(r, 'reason_zh', 'reason', 'reasoning', 'explanation') ?? '(无)';
  const reasonEn = pickString(r, 'reason_en', 'reasonEn');
  const wildcardZh = pickString(r, 'wildcard_zh', 'wildcard', 'risk', 'wild_card') ?? '';
  const wildcardEn = pickString(r, 'wildcard_en', 'wildcardEn');

  return {
    outcome,
    score_home: scoreHome ?? 0,
    score_away: scoreAway ?? 0,
    goals_over_under: gou,
    btts,
    confidence,
    reason: reasonZh,
    reason_en: reasonEn,
    wildcard: wildcardZh,
    wildcard_en: wildcardEn,
  };
}
