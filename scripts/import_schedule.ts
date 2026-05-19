// 从 wc2026_schedule.json 导入 teams + matches。
//
// 用法:
//   1. 确保 .env.local 里有 DATABASE_URL
//   2. 已执行 schema_v1.sql 建表(docker-compose 首次启动自动跑过了)
//   3. npm run import:schedule
//
// 行为:
//   - upsert 48 支球队
//   - upsert 全部 104 场(M001-M072 完整 home/away;M073-M104 仅 pending_label)
//   - time_et (ET) → kickoff_at (UTC);ET = UTC-4 (EDT,6-7 月夏令时)

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '../src/lib/prisma';
import { TEAM_MAPPINGS, findByEnglishName } from '../src/lib/team-mapping';

interface ScheduleJson {
  groups: Record<string, string[]>;
  matches: {
    group_stage: GroupMatch[];
    round_of_32: KoMatch[];
    round_of_16: KoMatch[];
    quarterfinals: KoMatch[];
    semifinals: KoMatch[];
    third_place: KoMatch[];
    final: KoMatch[];
  };
}
interface GroupMatch { match_id: string; date: string; time_et: string; group: string; home: string; away: string; venue: string; city: string; country: string; }
interface KoMatch    { match_id: string; date: string; time_et: string; label?: string; venue: string; city: string; country: string; }

function etToUtcDate(date: string, timeEt: string): Date {
  const [hh, mm] = timeEt.split(':').map(Number);
  const padded = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  return new Date(`${date}T${padded}:00-04:00`);
}

async function main() {
  const schedulePath = resolve(process.cwd(), 'wc2026_schedule.json');
  const schedule: ScheduleJson = JSON.parse(readFileSync(schedulePath, 'utf-8'));

  // ---- teams ----
  const allNames = Object.values(schedule.groups).flat();
  const unmapped = allNames.filter(n => !findByEnglishName(n));
  if (unmapped.length) throw new Error(`未在 team-mapping 中找到映射: ${unmapped.join(', ')}`);

  const teamRows = TEAM_MAPPINGS.map(t => {
    const group = Object.entries(schedule.groups).find(([, names]) => names.includes(t.nameEn))?.[0];
    if (!group) throw new Error(`球队 ${t.nameEn} 不在 schedule.groups 中`);
    return {
      id: t.code,
      name: t.nameEn,
      name_zh: t.nameZh,
      group_letter: group,
      flag_emoji: t.flag,
      fifa_ranking: null,
    };
  });

  // Prisma 没有 bulk-upsert,用 transaction 把多条 upsert 打包,保持原子性
  await prisma.$transaction(
    teamRows.map(r => prisma.teams.upsert({
      where: { id: r.id },
      create: r,
      update: {
        name: r.name,
        name_zh: r.name_zh,
        group_letter: r.group_letter,
        flag_emoji: r.flag_emoji,
        fifa_ranking: r.fifa_ranking,
      },
    }))
  );
  console.log(`✓ teams: upsert ${teamRows.length} 行`);

  // ---- matches ----
  type MatchInput = Parameters<typeof prisma.matches.create>[0]['data'];
  const matchRows: MatchInput[] = [];

  for (const m of schedule.matches.group_stage) {
    const home = findByEnglishName(m.home);
    const away = findByEnglishName(m.away);
    if (!home || !away) throw new Error(`小组赛 ${m.match_id}: 球队名映射失败`);
    matchRows.push({
      id: m.match_id,
      stage: 'group',
      group_letter: m.group,
      kickoff_at: etToUtcDate(m.date, m.time_et),
      home_team_id: home.code,
      away_team_id: away.code,
      pending_label: null,
      venue: m.venue,
      city: m.city,
      country: m.country,
      status: 'scheduled',
    });
  }

  const koStages: [keyof ScheduleJson['matches'], string][] = [
    ['round_of_32', 'round_of_32'],
    ['round_of_16', 'round_of_16'],
    ['quarterfinals', 'quarterfinals'],
    ['semifinals', 'semifinals'],
    ['third_place', 'third_place'],
    ['final', 'final'],
  ];
  for (const [jsonKey, dbStage] of koStages) {
    for (const m of schedule.matches[jsonKey] as KoMatch[]) {
      matchRows.push({
        id: m.match_id,
        stage: dbStage,
        group_letter: null,
        kickoff_at: etToUtcDate(m.date, m.time_et),
        home_team_id: null,
        away_team_id: null,
        pending_label: m.label ?? null,
        venue: m.venue,
        city: m.city,
        country: m.country,
        status: 'scheduled',
      });
    }
  }

  await prisma.$transaction(
    matchRows.map(r => prisma.matches.upsert({
      where: { id: r.id as string },
      create: r,
      update: {
        stage: r.stage,
        group_letter: r.group_letter,
        kickoff_at: r.kickoff_at,
        home_team_id: r.home_team_id,
        away_team_id: r.away_team_id,
        pending_label: r.pending_label,
        venue: r.venue,
        city: r.city,
        country: r.country,
        // 注意:status 不覆盖,赛事进行中可能已被更新
      },
    }))
  );
  console.log(`✓ matches: upsert ${matchRows.length} 行`);

  const teamCount = await prisma.teams.count();
  const matchCount = await prisma.matches.count();
  console.log(`\n数据库当前:teams=${teamCount}, matches=${matchCount}`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
