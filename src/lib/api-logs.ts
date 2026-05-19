// 把 OpenRouter callWithRetry 的 attempts 落到 api_call_logs 表。
// 每次重试一条记录(attempt=1/2/3)— v_model_reliability 视图依赖这一粒度。

import { prisma } from './prisma';
import type { AiModelId } from './ai-models';
import type { CallAttempt, CallResult } from './openrouter';
import { PROMPT_VERSION } from './prompts';

export interface LogContext {
  modelId: AiModelId;
  layer: 'l1' | 'l2' | 'l3';
  matchId?: string;
  groupLetter?: string;
}

export async function logAttempts(ctx: LogContext, attempts: CallAttempt[]): Promise<void> {
  if (attempts.length === 0) return;
  try {
    await prisma.api_call_logs.createMany({
      data: attempts.map(a => ({
        model_id: ctx.modelId,
        layer: ctx.layer,
        match_id: ctx.matchId ?? null,
        group_letter: ctx.groupLetter ?? null,
        prompt_version: PROMPT_VERSION,
        attempt: a.attempt,
        status: a.status,
        http_status: a.httpStatus ?? null,
        error_message: a.errorMessage ?? null,
        latency_ms: a.latencyMs,
        prompt_tokens: a.promptTokens ?? null,
        completion_tokens: a.completionTokens ?? null,
        cost_usd: a.costUsd ?? null,
      })),
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error(`[api_call_logs] insert failed for ${ctx.modelId}/${ctx.matchId}: ${msg}`);
  }
}

export function summarizeCall(result: CallResult): string {
  const final = result.attempts.at(-1);
  if (result.ok) {
    return `✓ ${result.model.id} (${result.attempts.length} attempt${result.attempts.length > 1 ? 's' : ''}, ${final?.latencyMs}ms)`;
  }
  return `✗ ${result.model.id} (${result.attempts.length} attempts, last: ${final?.status} - ${final?.errorMessage?.slice(0, 60)})`;
}
