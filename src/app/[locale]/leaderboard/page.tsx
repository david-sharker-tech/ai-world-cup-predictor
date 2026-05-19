// AI 积分榜。直接渲染 v_leaderboard 视图。

import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'leaderboard' });
  return { title: t('title') };
}

export default async function LeaderboardPage({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations();

  const rows = await prisma.v_leaderboard.findMany();
  const sorted = rows.map(r => ({
    ...r,
    total_predictions: Number(r.total_predictions),
    total_points: Number(r.total_points),
    outcome_wins: Number(r.outcome_wins),
    exact_scores: Number(r.exact_scores),
    upset_hits: Number(r.upset_hits),
    perfect_predictions: Number(r.perfect_predictions),
    total_misses: Number(r.total_misses),
    accuracy: Number(r.accuracy_pct),
  }));

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 lg:py-14">
      <header className="mb-6 lg:mb-8">
        <Link href="/" className="text-xs text-muted-foreground underline underline-offset-4">← {t('nav.home')}</Link>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold mt-2 mb-1">{t('leaderboard.title')}</h1>
        <p className="text-sm lg:text-base text-muted-foreground max-w-2xl">
          {t('leaderboard.rules')}
        </p>
      </header>

      <ol className="space-y-2">
        {sorted.map((m, i) => (
          <li
            key={m.model_id}
            className="bg-white border border-border rounded-xl px-3 sm:px-4 lg:px-5 py-3 lg:py-4 flex items-center gap-3 sm:gap-4"
          >
            <span className="text-lg sm:text-xl lg:text-2xl font-semibold w-5 sm:w-6 lg:w-8 text-muted-foreground tabular-nums">
              {i + 1}
            </span>
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: m.color_hex }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm sm:text-base font-medium truncate">{m.model_name}</div>
            </div>
            <div className="text-right">
              <div className="text-lg sm:text-xl lg:text-2xl font-semibold tabular-nums">{m.total_points}</div>
              <div className="text-[11px] text-muted-foreground">{t('leaderboard.points_short')}</div>
            </div>
            <div className="w-px h-8 lg:h-10 bg-border mx-1 hidden sm:block" />
            <div className="text-right hidden sm:block">
              <div className="text-sm lg:text-base tabular-nums">{m.accuracy.toFixed(1)}%</div>
              <div className="text-[11px] text-muted-foreground whitespace-nowrap">{t('leaderboard.accuracy')}</div>
            </div>
            <div className="w-px h-8 lg:h-10 bg-border mx-1 hidden md:block" />
            <div className="text-right hidden md:block">
              <div className="text-sm lg:text-base tabular-nums">{m.total_predictions}</div>
              <div className="text-[11px] text-muted-foreground">{t('leaderboard.predicted')}</div>
            </div>
          </li>
        ))}
      </ol>

      {sorted.every(m => m.total_predictions === 0) && (
        <p className="text-center text-sm text-muted-foreground mt-8">
          {t('leaderboard.empty')}
        </p>
      )}

      <Highlights rows={sorted} t={t} />
    </main>
  );
}

interface HighlightsProps {
  rows: { model_name: string; upset_hits: number; perfect_predictions: number; total_misses: number }[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}

function Highlights({ rows, t }: HighlightsProps) {
  const upset = [...rows].sort((a, b) => b.upset_hits - a.upset_hits).slice(0, 3).filter(r => r.upset_hits > 0);
  const perfect = [...rows].sort((a, b) => b.perfect_predictions - a.perfect_predictions).slice(0, 3).filter(r => r.perfect_predictions > 0);
  const miss = [...rows].sort((a, b) => b.total_misses - a.total_misses).slice(0, 3).filter(r => r.total_misses > 0);

  if (!upset.length && !perfect.length && !miss.length) return null;

  return (
    <section className="mt-8 lg:mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
      {upset.length > 0 && (
        <HighlightCard title={t('leaderboard.upset_king')} rows={upset.map(r => [r.model_name, r.upset_hits])} />
      )}
      {perfect.length > 0 && (
        <HighlightCard title={t('leaderboard.perfect')} rows={perfect.map(r => [r.model_name, r.perfect_predictions])} />
      )}
      {miss.length > 0 && (
        <HighlightCard title={t('leaderboard.total_miss')} rows={miss.map(r => [r.model_name, r.total_misses])} />
      )}
    </section>
  );
}

function HighlightCard({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div className="bg-white border border-border rounded-xl px-4 py-3">
      <div className="text-xs text-muted-foreground mb-2">{title}</div>
      <ul className="space-y-1">
        {rows.map(([name, n]) => (
          <li key={name} className="flex justify-between text-sm">
            <span>{name}</span>
            <span className="tabular-nums text-muted-foreground">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
