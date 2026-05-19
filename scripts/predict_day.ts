// 手动触发某一 ET 日期的 L1 预测。
//
// 用法:
//   npm run predict:day -- 2026-06-11           # 跑 ET 日期当天全部
//   npm run predict:day -- --match M001 M002    # 跑指定比赛
//
// 直接走应用层,不需要 dev server / cron secret。

import { prisma } from '../src/lib/prisma';
import { runPredictL1 } from '../src/lib/predict-l1';

function parseArgs(argv: string[]): { date?: string; matchIds?: string[] } {
  const args = argv.slice(2);
  if (args[0] === '--match') {
    return { matchIds: args.slice(1).filter(Boolean) };
  }
  if (args[0]) return { date: args[0] };
  return {};
}

async function main() {
  const { date, matchIds } = parseArgs(process.argv);
  if (!date && !matchIds?.length) {
    console.error('用法:');
    console.error('  npm run predict:day -- 2026-06-11');
    console.error('  npm run predict:day -- --match M001 M002');
    process.exit(1);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('Missing OPENROUTER_API_KEY in .env.local');
    process.exit(1);
  }

  if (date) console.log(`📅 触发 L1 预测,ET 日期: ${date}`);
  if (matchIds) console.log(`🎯 触发 L1 预测,比赛: ${matchIds.join(', ')}`);
  console.log('');

  const result = await runPredictL1({ apiKey, date, matchIds });

  console.log(`scope: ${result.scope.match_ids.length} 场 (${result.scope.match_ids.join(', ') || '空'})`);
  console.log(`tasks: ${result.tasks_total} (✓${result.succeeded} / ✗${result.failed})`);
  console.log(`耗时: ${(result.duration_ms / 1000).toFixed(1)}s`);
  if (result.reason) console.log(`原因: ${result.reason}`);

  if (result.results.length) {
    console.log('\n详情:');
    for (const r of result.results) console.log(`  ${r}`);
  }

  await prisma.$disconnect();
  if (result.failed > 0) process.exit(2);
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
