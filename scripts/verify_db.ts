// 验证 Postgres 数据库当前状态(通过 Prisma)。
//
// 用法:npm run verify:db

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { AI_MODELS } from '../src/lib/ai-models';

interface Check { name: string; fn: () => Promise<string>; }
const fails: string[] = [];

const checks: Check[] = [
  {
    name: 'ai_models 表(应 8 行,model ID 对齐 ai-models.ts)',
    fn: async () => {
      const rows = await prisma.ai_models.findMany({
        select: { id: true, name: true, openrouter_id: true },
        orderBy: { id: 'asc' },
      });
      if (rows.length !== 8) throw new Error(`期望 8 行,实际 ${rows.length}`);
      const expectedIds: string[] = AI_MODELS.map(m => m.id).sort();
      const actualIds: string[] = rows.map(r => r.id).sort();
      const diff = expectedIds.filter(x => !actualIds.includes(x))
        .concat(actualIds.filter(x => !expectedIds.includes(x)));
      if (diff.length) throw new Error(`ID 不对齐:${diff.join(', ')}`);
      const drift = rows.filter(r => {
        const m = AI_MODELS.find(x => x.id === r.id);
        return m && m.openrouter !== r.openrouter_id;
      });
      if (drift.length) {
        throw new Error('openrouter_id 漂移:\n  ' + drift.map(r => {
          const exp = AI_MODELS.find(x => x.id === r.id)?.openrouter;
          return `${r.id}: DB=${r.openrouter_id} vs code=${exp}`;
        }).join('\n  '));
      }
      return `8 家 AI 已就位 (${rows.map(r => r.id).join(', ')})`;
    },
  },
  {
    name: 'teams 表(应 48 行)',
    fn: async () => {
      const count = await prisma.teams.count();
      if (count !== 48) throw new Error(`期望 48,实际 ${count}`);
      return '48 支球队已就位';
    },
  },
  {
    name: 'matches 表(应 104 行;group 72,KO 32)',
    fn: async () => {
      const count = await prisma.matches.count();
      if (count !== 104) throw new Error(`期望 104,实际 ${count}`);
      const groupCount = await prisma.matches.count({ where: { stage: 'group' } });
      if (groupCount !== 72) throw new Error(`group 期望 72,实际 ${groupCount}`);
      const pendingCount = await prisma.matches.count({ where: { pending_label: { not: null } } });
      return `104 场比赛已就位 (group=72, KO=32, pending_label 非空=${pendingCount})`;
    },
  },
  {
    name: '视图 v_leaderboard',
    fn: async () => {
      const rows = await prisma.v_leaderboard.findMany({ take: 8 });
      return `${rows.length} 行(无预测时也应该有 8 家占位行)`;
    },
  },
  {
    name: '视图 v_today_matches',
    fn: async () => {
      const rows = await prisma.v_today_matches.findMany({ take: 10 });
      return `${rows.length} 行(取决于当前时间窗口)`;
    },
  },
  {
    name: '视图 v_model_reliability',
    fn: async () => {
      const rows = await prisma.v_model_reliability.findMany({ take: 8 });
      return `${rows.length} 行(api_call_logs 空时应有 8 家 NULL 成功率)`;
    },
  },
  {
    name: 'api_call_logs 表写读测试',
    fn: async () => {
      const created = await prisma.api_call_logs.create({
        data: { model_id: 'gpt', layer: 'l1', attempt: 1, status: 'success', latency_ms: 1234 },
      });
      await prisma.api_call_logs.delete({ where: { id: created.id } });
      return `表可写可删 (id=${created.id})`;
    },
  },
];

async function main() {
  console.log('🔍 验证 Postgres 数据库状态(via Prisma)\n');
  for (const c of checks) {
    process.stdout.write(`  · ${c.name} ... `);
    try {
      const msg = await c.fn();
      console.log(`✓ ${msg}`);
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      console.log(`✗\n      ${msg}`);
      fails.push(c.name);
    }
  }
  console.log();
  if (fails.length) {
    console.log(`❌ ${fails.length} 项失败,先修这些再继续。`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('✅ 数据库就绪,可以开始写 cron 端点 / 调 OpenRouter 了。');
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
