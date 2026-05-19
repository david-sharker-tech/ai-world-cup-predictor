'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';

const LABELS: Record<Locale, string> = {
  zh: '中',
  en: 'EN',
};

export function LocaleSwitcher() {
  const current = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center text-xs">
      {routing.locales.map((loc, i) => (
        <span key={loc} className="inline-flex items-center">
          {i > 0 && <span className="mx-1 text-muted-foreground/50">|</span>}
          <button
            type="button"
            disabled={pending || loc === current}
            onClick={() => {
              startTransition(() => {
                router.replace(pathname, { locale: loc });
              });
            }}
            className={
              loc === current
                ? 'font-semibold text-foreground cursor-default'
                : 'text-muted-foreground hover:text-foreground underline underline-offset-4'
            }
          >
            {LABELS[loc]}
          </button>
        </span>
      ))}
    </span>
  );
}
