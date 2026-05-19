// 一次性从 openfootball 拉 2026 真实比分。
// 用法:npm run fetch:results
//   或:npx tsx --env-file=.env.local scripts/fetch_results.ts 2022   # 拉历史年份测试

import { prisma } from '../src/lib/prisma';
import { syncResults } from '../src/lib/results-sync';

async function main() {
  const yearArg = process.argv[2];
  const year = yearArg ? parseInt(yearArg, 10) : 2026;
  console.log(`📥 拉 openfootball/worldcup ${year} ...\n`);

  const summary = await syncResults(year);

  console.log(`抓取场次:    ${summary.fetched}`);
  console.log(`其中已完赛:  ${summary.completed}`);
  console.log(`匹配到本库:  ${summary.matched}`);
  console.log(`写入/更新:    ${summary.written}`);
  console.log(`状态变 finished: ${summary.status_updated}`);

  if (summary.unknown_teams.length) {
    console.log(`\n⚠️  未知队名(需在 src/lib/openfootball.ts 的 NAME_ALIASES 加映射):`);
    summary.unknown_teams.forEach(n => console.log(`   - ${n}`));
  }

  if (summary.unmatched.length) {
    console.log(`\n⚠️  匹配不上的(可能是淘汰赛对阵未填,或日期/队名歧义):`);
    summary.unmatched.slice(0, 10).forEach(m => {
      console.log(`   - ${m.date} ${m.team1} vs ${m.team2}`);
    });
    if (summary.unmatched.length > 10) {
      console.log(`   ... 还有 ${summary.unmatched.length - 10} 条`);
    }
  }

  console.log('\n✅ 同步完成');
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
