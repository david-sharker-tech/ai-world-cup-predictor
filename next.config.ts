import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // standalone:产出 .next/standalone/server.js + 最小 node_modules,
  // Docker 镜像可以做到 ~200MB。本地 `next dev` 不受影响。
  output: 'standalone',
};

export default withNextIntl(nextConfig);
