'use client';

// 浏览器本地时区显示日期时间。
// 服务端用 next-intl formatter 预渲染一份字符串作 fallback,客户端 mount 后用
// browser timezone 重新格式化覆盖。suppressHydrationWarning 抑制短暂错位告警。

import { useEffect, useState } from 'react';

interface Props {
  iso: string;                                     // 比赛 kickoff_at 的 ISO 字符串(UTC)
  locale: string;                                  // zh / en
  fallback: string;                                // 服务端预渲染的字符串,SSR 用
  options?: Intl.DateTimeFormatOptions;            // 默认 month/day/hour/minute 2-digit
}

const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

export function LocalDateTime({ iso, locale, fallback, options }: Props) {
  const [text, setText] = useState(fallback);

  useEffect(() => {
    const localeStr = locale === 'zh' ? 'zh-CN' : 'en-US';
    setText(new Date(iso).toLocaleString(localeStr, options ?? DEFAULT_OPTIONS));
  }, [iso, locale, options]);

  return <span suppressHydrationWarning>{text}</span>;
}
