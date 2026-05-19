// Locale-aware 球队名取值。
// zh → name_zh(「阿根廷」),其他 → name(英文,来自 schedule.json 权威源)

import type { Locale } from '@/i18n/routing';

interface NameableTeam {
  name: string;
  name_zh: string;
}

export function teamName(team: NameableTeam, locale: Locale | string): string {
  return locale === 'zh' ? team.name_zh : team.name;
}
