'use client';

// 语言切换 — 原生 <select> dropdown,易扩展到任意多 locale。
// 加新语言只需在 LABELS 与 routing.locales 同步追加一行。

import { useTransition, type ChangeEvent } from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';

// 短标(按钮可见)+ 长名(下拉项可见)。加新 locale 必须同步 routing.locales。
const LABELS: Record<Locale, { short: string; full: string }> = {
  zh: { short: '中', full: '中文' },
  en: { short: 'EN', full: 'English' },
};

export function LocaleSwitcher() {
  const current = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as Locale;
    if (next === current) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  };

  return (
    <label className="relative inline-flex items-center text-xs cursor-pointer select-none">
      <span aria-hidden="true" className="font-semibold pr-4">
        {LABELS[current].short}
      </span>
      <span
        aria-hidden="true"
        className="absolute right-0 text-muted-foreground pointer-events-none text-[10px]"
      >
        ▾
      </span>
      <select
        value={current}
        onChange={handleChange}
        disabled={pending}
        aria-label="Language"
        className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-wait"
      >
        {routing.locales.map(loc => (
          <option key={loc} value={loc}>
            {LABELS[loc].full}
          </option>
        ))}
      </select>
    </label>
  );
}
