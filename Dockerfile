# syntax=docker/dockerfile:1.7
# 三阶段构建:deps → build → runtime
# 产物镜像 ~200MB (alpine + Next standalone + Prisma adapter-pg 无 binary engine)

# ============================================================
# 1. deps:安装所有依赖,触发 prisma generate(postinstall)
# ============================================================
FROM node:24-alpine AS deps
WORKDIR /app

# Prisma generate 需要 schema 文件
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma

RUN npm ci

# ============================================================
# 2. build:跑 next build,产出 .next/standalone/
# ============================================================
FROM node:24-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ============================================================
# 3. runtime:仅 standalone 产物 + 静态资源 + Prisma client
# ============================================================
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 非 root 用户
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# standalone 自包含的 server.js + tracing 出的最小依赖
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
# 静态资源(standalone 不自动复制)
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# standalone 模式入口
CMD ["node", "server.js"]

# ============================================================
# 4. tools:source + tsx + Prisma client,运维脚本用
# ============================================================
# 用法(compose):
#   docker compose --profile setup up tools          # 默认跑 import_schedule
#   docker compose --profile setup run --rm tools \
#     npx tsx scripts/predict_day.ts 2026-06-11      # 跑任意脚本
FROM node:24-alpine AS tools
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts
COPY wc2026_schedule.json ./

# 默认入口:导入赛程(首次部署用)
# `docker compose run --rm tools <override>` 可换其他脚本
CMD ["npx", "tsx", "scripts/import_schedule.ts"]
