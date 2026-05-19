// 首页:今日比赛 + 积分榜前 3。
//
// 今日比赛 = v_today_matches 视图(窗口 now-6h ~ now+24h)
// 积分榜 = v_leaderboard 前 3 行

import { getTranslations, setRequestLocale, getFormatter } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { prisma } from '@/lib/prisma';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';

export const dynamic = 'force-dynamic';

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations();
  const formatter = await getFormatter();

  const [todays, top3] = await Promise.all([
    prisma.v_today_matches.findMany({ orderBy: { kickoff_at: 'asc' } }),
    prisma.v_leaderboard.findMany({ take: 3 }),
  ]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 lg:py-14 space-y-8 lg:space-y-12">
      <header>
        <div className="flex items-baseline justify-between gap-3 mb-1 lg:mb-2">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold">🏆 {t('site.title')}</h1>
          <LocaleSwitcher />
        </div>
        <p className="text-sm lg:text-base text-muted-foreground max-w-2xl">{t('site.tagline')}</p>
        <nav className="mt-4 flex gap-4 text-sm lg:text-base">
          <Link href="/bracket" className="underline underline-offset-4">{t('nav.schedule')}</Link>
          <Link href="/leaderboard" className="underline underline-offset-4">{t('nav.leaderboard')}</Link>
        </nav>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 lg:gap-8 gap-8">
        <section className="lg:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {t('home.today_matches')}
          </h2>
          {todays.length === 0 ? (
            <div className="bg-muted border border-dashed border-border rounded-xl px-5 py-8 text-center text-sm text-muted-foreground">
              {t('home.no_today_matches_prefix')}
              <Link href="/bracket" className="underline">{t('home.view_schedule')}</Link>
            </div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
              {todays.map(m => (
                <li key={m.match_id}>
                  <Link
                    href={`/match/${m.match_id}`}
                    className="block bg-white border border-border rounded-xl px-4 py-3 hover:border-foreground/30 transition h-full"
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <div className="font-medium text-sm sm:text-base">
                        {m.home_flag} {m.home_name ?? '?'}
                        <span className="text-muted-foreground mx-2">{t('match.vs')}</span>
                        {m.away_flag} {m.away_name ?? '?'}
                      </div>
                      {m.is_disputed && <span className="text-rose-600 text-xs shrink-0">{t('home.disputed')}</span>}
                    </div>
                    <div className="flex items-center justify-between text-[11px] sm:text-xs text-muted-foreground">
                      <span>
                        {formatter.dateTime(m.kickoff_at, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
                        {' · '}{m.venue ?? t('match.venue_pending')}
                      </span>
                      <span className="shrink-0 ml-2">
                        {t('home.pred_count', { n: Number(m.prediction_count) })}
                        {m.avg_confidence != null && <span className="ml-2">{t('home.avg_confidence', { pct: Number(m.avg_confidence).toFixed(0) })}</span>}
                      </span>
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
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.color_hex }} />
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
