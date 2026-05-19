// Prisma 7+ 配置。
// CLI 操作(generate / db pull / studio / migrate)用这里的 datasource。
// 运行时不读它 — 运行时通过 `src/lib/prisma.ts` 里的 PrismaPg adapter 连接。

import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // 为空时 prisma generate 仍能跑(只读 schema.prisma);只有 migrate/pull 才真连库。
    url: process.env.DATABASE_URL ?? '',
  },
});
