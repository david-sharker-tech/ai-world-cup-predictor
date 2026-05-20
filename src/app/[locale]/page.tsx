// 首页:即将开赛 + 积分榜前 3。
//
// 即将开赛 = v_upcoming_matches 视图(kickoff_at > now),取最近 6 场,后接「查看全部」入口
// 积分榜 = v_leaderboard 前 3 行

import { getTranslations, setRequestLocale, getFormatter } from 'next-intl/server';
import { Trophy } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { prisma } from '@/lib/prisma';
import { MODELS_BY_ID, type AiModelId } from '@/lib/ai-models';
import { LocalDateTime } from '@/components/LocalDateTime';

export const dynamic = 'force-dynamic';

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations();
  const formatter = await getFormatter();

  const [upcoming, top3] = await Promise.all([
    prisma.v_upcoming_matches.findMany({ orderBy: { kickoff_at: 'asc' }, take: 6 }),
    prisma.v_leaderboard.findMany({ take: 3 }),
  ]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 lg:py-14 space-y-8 lg:space-y-12">
      <header>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold mb-1 lg:mb-2 flex items-center gap-2 lg:gap-3">
          <Trophy className="w-6 h-6 lg:w-8 lg:h-8 text-amber-500" strokeWidth={2} />
          {t('site.title')}
        </h1>
        <p className="text-sm lg:text-base text-muted-foreground max-w-2xl">{t('site.tagline')}</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 lg:gap-8 gap-8">
        <section className="lg:col-span-2">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('home.upcoming_matches')}
            </h2>
            <Link href="/bracket" className="text-xs underline text-muted-foreground">{t('home.view_more')}</Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="bg-muted border border-dashed border-border rounded-xl px-5 py-8 text-center text-sm text-muted-foreground">
              {t('home.no_upcoming_prefix')}
              <Link href="/bracket" className="underline">{t('home.view_schedule')}</Link>
            </div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                {upcoming.map(m => (
                  <li key={m.match_id}>
                    <Link
                      href={`/match/${m.match_id}`}
                      className="block bg-white border border-border rounded-xl px-4 py-3 hover:border-foreground/30 transition h-full"
                    >
                      <div className="flex items-stretch gap-3">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="text-[11px] text-muted-foreground">
                            <LocalDateTime
                              iso={m.kickoff_at.toISOString()}
                              locale={locale}
                              fallback={formatter.dateTime(m.kickoff_at, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
                            />
                          </div>
                          <div className="text-sm sm:text-base font-medium flex items-center gap-1.5 min-w-0">
                            <span className="shrink-0">{m.home_flag}</span>
                            <span className="truncate">{(locale === 'en' ? m.home_name_en : m.home_name) ?? '?'}</span>
                          </div>
                          <div className="text-sm sm:text-base font-medium flex items-center gap-1.5 min-w-0">
                            <span className="shrink-0">{m.away_flag}</span>
                            <span className="truncate">{(locale === 'en' ? m.away_name_en : m.away_name) ?? '?'}</span>
                          </div>
                        </div>
                        <div className="text-right text-[11px] text-muted-foreground shrink-0 flex flex-col gap-0.5 items-end justify-end">
                          {m.venue && <span className="truncate max-w-[140px]">{m.venue}</span>}
                          <span>{t('home.pred_count', { n: Number(m.prediction_count) })}</span>
                          {m.avg_confidence != null && <span>{t('home.avg_confidence', { pct: Number(m.avg_confidence).toFixed(0) })}</span>}
                          {m.is_disputed && <span className="text-rose-600">{t('home.disputed')}</span>}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('home.top3')}
            </h2>
            <Link href="/leaderboard" className="text-xs underline text-muted-foreground">{t('home.full_leaderboard')}</Link>
          </div>
          <ol className="space-y-2">
            {top3.map((m, i) => (
              <li key={m.model_id} className="bg-white border border-border rounded-xl px-4 py-2.5 flex items-center gap-3">
                <span className="text-sm font-semibold w-4 text-muted-foreground tabular-nums">{i + 1}</span>
                {MODELS_BY_ID[m.model_id as AiModelId]?.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={MODELS_BY_ID[m.model_id as AiModelId].logo}
                    alt={m.model_name}
                    className="w-5 h-5 shrink-0"
                  />
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.color_hex }} />
                )}
                <span className="flex-1 text-sm truncate">{m.model_name}</span>
                <span className="tabular-nums text-sm font-medium">
                  {Number(m.total_points)}{t('leaderboard.points_short')}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
