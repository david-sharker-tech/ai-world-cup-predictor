// Prisma 7+ client 单例。
// 运行时通过 PrismaPg adapter 连 DATABASE_URL。
//
// 重要:用 Proxy 做 lazy 实例化,避开「ES import 提升导致 prisma.ts 比
//   dotenv/config 先求值」的问题(脚本里 import 'dotenv/config' 写在第一行
//   也救不了 — 所有 import 都被提升到模块开头)。第一次访问 prisma 上任何
//   字段时才真正创建 client,那时 dotenv 已加载完毕。
//
// dev hot-reload 下用 globalThis 缓存避免连接池泄漏。

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

declare global {
  var __prisma: PrismaClient | undefined;
}

function makeClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

function getClient(): PrismaClient {
  return globalThis.__prisma ?? (globalThis.__prisma = makeClient());
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
