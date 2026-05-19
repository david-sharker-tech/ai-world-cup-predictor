// 全赛季总览。
//   - 小组赛:按 A-L 12 组分块,每组 6 场
//   - 淘汰赛:按 R32 → 决赛 阶段顺序

import type { Metadata } from 'next';
import { getTranslations, setRequestLocale, getFormatter } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { prisma } from '@/lib/prisma';
import { teamName } from '@/lib/team-name';
import { LocalDateTime } from '@/components/LocalDateTime';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'bracket' });
  return { title: t('title'), description: t('tagline') };
}

const KO_STAGES = ['round_of_32','round_of_16','quarterfinals','semifinals','third_place','final'] as const;
const GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L'] as const;

export default async function BracketPage({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations();
  const formatter = await getFormatter();

  const matches = await prisma.matches.findMany({
    include: {
      home_team: true,
      away_team: true,
      predictions_l1: { select: { confidence: true } },
      match_result: true,
    },
    orderBy: { kickoff_at: 'asc' },
  });

  const groupMatches = new Map<string, typeof matches>();
  const koMatches = new Map<string, typeof matches>();
  for (const m of matches) {
    if (m.stage === 'group' && m.group_letter) {
      if (!groupMatches.has(m.group_letter)) groupMatches.set(m.group_letter, []);
      groupMatches.get(m.group_letter)!.push(m);
    } else {
      if (!koMatches.has(m.stage)) koMatches.set(m.stage, []);
      koMatches.get(m.stage)!.push(m);
    }
  }

  const groupTotal = Array.from(groupMatches.values()).reduce((s, l) => s + l.length, 0);
  const koTotal = Array.from(koMatches.values()).reduce((s, l) => s + l.length, 0);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 lg:py-14">
      <header className="mb-6 lg:mb-10">
        <Link href="/" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">← {t('nav.home')}</Link>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold mt-2 mb-1">{t('bracket.title')}</h1>
        <p className="text-sm lg:text-base text-muted-foreground max-w-2xl">{t('bracket.tagline')}</p>
      </header>

      {/* 小组赛 */}
      <section className="mb-10 lg:mb-16">
        <h2 className="text-base lg:text-xl font-semibold mb-4 lg:mb-6">
          {t('bracket.group_stage_heading', { n: groupTotal })}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {GROUP_LETTERS.map(letter => {
            const list = groupMatches.get(letter) ?? [];
            return (
              <section key={letter}>
                <h3 className="text-xs lg:text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 lg:mb-3">
                  {t('bracket.group_section', { letter, n: list.length })}
                </h3>
                <div className="space-y-2">
                  {list.map(m => (
                    <MatchCard key={m.id} match={m} compact locale={locale as Locale} t={t} formatter={formatter} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {/* 淘汰赛 */}
      <section>
        <h2 className="text-base lg:text-xl font-semibold mb-4 lg:mb-6">
          {t('bracket.knockout_heading', { n: koTotal })}
        </h2>
        <p className="text-xs text-muted-foreground mb-4 -mt-2">{t('bracket.knockout_note')}</p>
        <div className="space-y-8 lg:space-y-12">
          {KO_STAGES.map(stage => {
            const list = koMatches.get(stage) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={stage}>
                <h3 className="text-xs lg:text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 lg:mb-4">
                  {t('bracket.stage_section', { label: t(`stage.${stage}`), n: list.length })}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
                  {list.map(m => (
                    <MatchCard key={m.id} match={m} locale={locale as Locale} t={t} formatter={formatter} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </main>
  );
}

interface MatchCardProps {
  match: {
    id: string;
    pending_label: string | null;
    kickoff_at: Date;
    venue: string | null;
    home_team: { name: string; name_zh: string; flag_emoji: string | null } | null;
    away_team: { name: string; name_zh: string; flag_emoji: string | null } | null;
    predictions_l1: { confidence: number }[];
    match_result: { score_home: number; score_away: number } | null;
  };
  compact?: boolean;
  locale: Locale;
  t: Awaited<ReturnType<typeof getTranslations>>;
  formatter: Awaited<ReturnType<typeof getFormatter>>;
}

function MatchCard({ match, compact, locale, t, formatter }: MatchCardProps) {
  const hasTeams = !!(match.home_team && match.away_team);
  const avgConf = match.predictions_l1.length
    ? Math.round(match.predictions_l1.reduce((s, p) => s + p.confidence, 0) / match.predictions_l1.length)
    : null;
  const hasPredictions = match.predictions_l1.length > 0;

  const dateFallback = formatter.dateTime(match.kickoff_at, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <Link
      href={`/match/${match.id}`}
      className={`block bg-white border rounded-xl ${compact ? 'px-3 py-2' : 'px-4 py-3'} hover:border-foreground/30 transition ${
        hasTeams ? 'border-border' : 'border-dashed border-border'
      }`}
    >
      <div className="flex items-stretch gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-[10px] text-muted-foreground">
            <LocalDateTime iso={match.kickoff_at.toISOString()} locale={locale} fallback={dateFallback} />
          </div>
          {hasTeams ? (
            <>
              <div className="text-sm font-medium flex items-center gap-1.5 min-w-0">
                <span className="shrink-0">{match.home_team!.flag_emoji}</span>
                <span className="truncate">{teamName(match.home_team!, locale)}</span>
                {match.match_result && (
                  <span className="ml-auto tabular-nums font-semibold pl-2">{match.match_result.score_home}</span>
                )}
              </div>
              <div className="text-sm font-medium flex items-center gap-1.5 min-w-0">
                <span className="shrink-0">{match.away_team!.flag_emoji}</span>
                <span className="truncate">{teamName(match.away_team!, locale)}</span>
                {match.match_result && (
                  <span className="ml-auto tabular-nums font-semibold pl-2">{match.match_result.score_away}</span>
                )}
              </div>
            </>
          ) : (
            <div className="text-sm font-medium text-muted-foreground leading-snug">
              {match.pending_label ?? t('bracket.pending_opponent')}
            </div>
          )}
        </div>
        <div className="text-right text-[10px] text-muted-foreground shrink-0 flex flex-col gap-0.5 items-end justify-end">
          <span className="uppercase tracking-wider">{match.id}</span>
          {hasPredictions && <span className="text-emerald-700">{match.predictions_l1.length}/8</span>}
          {avgConf != null && <span>{t('bracket.avg_confidence', { pct: avgConf })}</span>}
        </div>
      </div>
    </Link>
  );
}
