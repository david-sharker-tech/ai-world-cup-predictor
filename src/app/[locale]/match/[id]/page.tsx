import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale, getFormatter } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { prisma } from '@/lib/prisma';
import { AI_MODELS } from '@/lib/ai-models';
import { teamName } from '@/lib/team-name';
import type { Outcome } from '@/lib/types';
import type { matches, teams, predictions_l1, match_results } from '@prisma/client';

interface PageProps {
  params: Promise<{ id: string; locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, locale } = await params;
  const t = await getTranslations({ locale, namespace: 'match' });
  const data = await loadMatch(id);
  if (!data) return { title: t('not_found_title') };

  const { match, home, away, result } = data;
  const matchup = home && away
    ? `${teamName(home, locale)} vs ${teamName(away, locale)}`
    : (match.pending_label ?? t('match_label', { id: match.id }));
  const status = result
    ? t('result_status', { h: result.score_home, a: result.score_away })
    : t('default_status');

  return {
    title: t('metadata_title', { matchup, status }),
    description: t('metadata_desc', { matchup }),
  };
}

interface MatchData {
  match: matches;
  home: teams | null;
  away: teams | null;
  predictions: predictions_l1[];
  result: match_results | null;
}

async function loadMatch(id: string): Promise<MatchData | null> {
  const match = await prisma.matches.findUnique({
    where: { id },
    include: {
      home_team: true,
      away_team: true,
      predictions_l1: true,
      match_result: true,
    },
  });
  if (!match) return null;

  const { home_team, away_team, predictions_l1, match_result, ...matchOnly } = match;
  return {
    match: matchOnly as matches,
    home: home_team,
    away: away_team,
    predictions: predictions_l1,
    result: match_result,
  };
}

export default async function MatchPage({ params }: PageProps) {
  const { id, locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations();
  const formatter = await getFormatter();

  const data = await loadMatch(id);
  if (!data) notFound();

  const { match, home, away, predictions, result } = data;
  const finished = match.status === 'finished' && result;
  const matchupLabel = home && away
    ? <><TeamLabel team={home} locale={locale as Locale} /> <span className="text-muted-foreground mx-2">{t('match.vs')}</span> <TeamLabel team={away} locale={locale as Locale} /></>
    : <span className="text-muted-foreground">{match.pending_label ?? t('match.pending_opponent')}</span>;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 lg:py-14">
      <nav className="mb-4 flex gap-4 text-xs text-muted-foreground">
        <Link href="/bracket" className="underline underline-offset-4 hover:text-foreground">{t('nav.back_to_schedule')}</Link>
        <Link href="/" className="underline underline-offset-4 hover:text-foreground">{t('nav.home')}</Link>
      </nav>
      <header className="mb-6 lg:mb-8">
        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
          {t(`stage.${match.stage}` as 'stage.group')} · {match.id}
        </div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold leading-tight">{matchupLabel}</h1>
        <div className="text-sm lg:text-base text-muted-foreground mt-2">
          {formatter.dateTime(match.kickoff_at, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
          {' · '}{match.venue ?? t('match.venue_pending')}
          {match.city ? ` · ${match.city}` : ''}
        </div>
      </header>

      {finished && result && (
        <ResultBanner result={result} home={home} away={away} locale={locale as Locale} t={t} />
      )}

      <section className="mb-6">
        <h2 className="text-xs lg:text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 lg:mb-4">
          {predictions.length > 0
            ? t('match.predictions_title_full', { n: predictions.length })
            : t('match.predictions_title')}
        </h2>

        {predictions.length === 0 ? (
          <div className="bg-muted border border-dashed border-border rounded-xl px-5 py-8 text-center text-sm text-muted-foreground">
            {t('match.empty_predictions')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
            {AI_MODELS.map(m => {
              const p = predictions.find(x => x.model_id === m.id);
              return <PredictionCard key={m.id} model={m} prediction={p ?? null} result={result} t={t} />;
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function TeamLabel({ team, locale }: { team: teams; locale: Locale }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span>{team.flag_emoji}</span>
      <span>{teamName(team, locale)}</span>
    </span>
  );
}

function ResultBanner({
  result, home, away, locale, t,
}: {
  result: match_results;
  home: teams | null;
  away: teams | null;
  locale: Locale;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const winnerLabel =
    result.winner === 'home' ? t('match.winner_home', { name: home ? teamName(home, locale) : t('match.default_home_name') })
    : result.winner === 'away' ? t('match.winner_away', { name: away ? teamName(away, locale) : t('match.default_away_name') })
    : t('match.winner_draw');
  return (
    <div className="bg-white border border-border rounded-xl px-5 py-4 mb-6">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t('match.real_score')}</div>
      <div className="text-3xl font-semibold tabular-nums">
        {result.score_home} <span className="text-muted-foreground text-xl">-</span> {result.score_away}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{winnerLabel}</div>
    </div>
  );
}

interface PredictionCardProps {
  model: typeof AI_MODELS[number];
  prediction: predictions_l1 | null;
  result: match_results | null;
  t: Awaited<ReturnType<typeof getTranslations>>;
}

function PredictionCard({ model, prediction, result, t }: PredictionCardProps) {
  const finished = !!result;
  const correct = finished && prediction
    ? isOutcomeCorrect(prediction.outcome as Outcome, result.winner as 'home' | 'draw' | 'away')
    : null;

  return (
    <article
      className={`bg-white border rounded-xl overflow-hidden ${
        prediction ? 'border-border' : 'border-dashed border-border opacity-60'
      }`}
    >
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: model.colorHex }} />
        <span className="text-sm font-medium flex-1">{model.name}</span>
      </header>

      {!prediction ? (
        <div className="px-4 py-4 text-xs text-muted-foreground">{t('match.no_prediction')}</div>
      ) : (
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-baseline gap-2">
            <span className={`text-sm font-medium ${outcomeColorClass(prediction.outcome as Outcome)}`}>
              {t(`outcome.${prediction.outcome}` as 'outcome.home_win')} · {prediction.score_home}-{prediction.score_away}
            </span>
            {finished && correct !== null && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                correct ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {correct ? t('match.correct') : t('match.wrong')}
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t('match.confidence_short', { pct: prediction.confidence })} ·
            {' '}{prediction.goals_over_under === 'over' ? t('match.over_25') : t('match.under_25')} ·
            {' '}{prediction.btts ? t('match.btts_yes') : t('match.btts_no')}
          </div>
          <div className="text-[12px] text-foreground/80 leading-relaxed pt-1.5 border-t border-dashed border-border">
            {prediction.reason}
          </div>
          {prediction.wildcard && (
            <div className="text-[11px] bg-amber-50 text-amber-900 rounded px-2 py-1.5 leading-relaxed">
              <strong className="block font-semibold">{t('match.wildcard_label')}</strong>
              {prediction.wildcard}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function isOutcomeCorrect(predicted: Outcome, actual: 'home' | 'draw' | 'away'): boolean {
  return (predicted === 'home_win' && actual === 'home')
    || (predicted === 'away_win' && actual === 'away')
    || (predicted === 'draw' && actual === 'draw');
}

function outcomeColorClass(o: Outcome): string {
  return {
    home_win: 'text-[color:var(--color-outcome-home)]',
    draw: 'text-[color:var(--color-outcome-draw)]',
    away_win: 'text-[color:var(--color-outcome-away)]',
  }[o];
}
