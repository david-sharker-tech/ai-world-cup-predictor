import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['zh', 'en'],
  defaultLocale: 'zh',
  // localePrefix: 'always'  → /zh/... 和 /en/... 都带前缀(SEO 友好)
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
