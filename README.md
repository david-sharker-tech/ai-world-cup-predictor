# 🏆 AI 世界杯预测擂台

> 让 8 家顶级 AI 在 2026 年世界杯上**同台预测**球赛结果,看谁押中、谁翻车。
>
> 产品本质是**娱乐内容媒体站**(微博 / 小红书 / 知乎 / X 传播为主),核心目标是引流和传播 ——
> AI 翻车越好玩越有流量,赛后「打脸海报」是核心传播素材。

8 家 AI:**GPT-5** / **Claude Sonnet 4.6** / **Gemini 2.5 Pro** / **Grok 4.3** / **DeepSeek V4 Pro** /
**Qwen 3.6 Plus** / **Llama 4 Maverick** / **Kimi K2.6**,统一通过 [OpenRouter](https://openrouter.ai) 一个 API 接入。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 / 后端 | Next.js 16(App Router · Turbopack · standalone build) + React 19 + Tailwind 4 |
| 多语言 | `next-intl`(zh / en),路径前缀 `/zh/...` `/en/...` |
| 数据库 | PostgreSQL 16 |
| ORM | Prisma 7 + `@prisma/adapter-pg`(**无 binary engine**,跨架构无障碍) |
| AI 调用 | OpenRouter(OpenAI 兼容格式,一个 key 接入 8 家) |
| 比分数据源 | [`openfootball/worldcup.json`](https://github.com/openfootball/worldcup.json) (公有领域,无 API key) |
| 部署 | **`docker compose`** — 自包含,可部署任意 Docker 主机 |

---

## 快速启动(推荐:Docker Compose 全栈)

**前置**:Docker Desktop 已启动。

```bash
# 1. 拷贝并填写环境变量
cp .env.example .env.local
# 编辑 .env.local,至少要填:
#   OPENROUTER_API_KEY=sk-or-v1-...        ← https://openrouter.ai/keys 创建
#   CRON_SECRET=<任意串,生产用 openssl rand -hex 32>

# 2. 启 db + web + cron(常驻)
docker compose up -d

# 3. 首次:种子数据(导入 48 队 + 104 场)
docker compose --profile setup up tools

# 4. 浏览器访问
open http://localhost:3000

# 5. 检查全栈
docker compose ps
docker compose logs -f cron        # 看 cron sidecar 每 15min 调端点
```

启完即用 — 三个常驻服务:**db** (Postgres) + **web** (Next.js standalone) + **cron** (alpine + curl 自带 scheduler)。

### 容器服务总览

| 服务 | 镜像 | 角色 |
|---|---|---|
| `db` | `postgres:16` | Postgres 16,首次启动自动跑 `schema_v1.sql`(9 表 + 4 视图 + INSERT 8 家 AI) |
| `web` | `ai-wcp-web` (自建,~285MB) | Next.js standalone,端口 3000 |
| `cron` | `alpine:3` | 自建 scheduler,每 15min 调 `/api/cron/predict-l1` + `/api/cron/fetch-results` |
| `tools` | `ai-wcp-tools` (自建,~560MB) | **按需启用**(`--profile setup`),包含完整 source + `tsx`,跑运维脚本 |

### 常用命令

```bash
# === 启 / 停 ===
docker compose up -d                                 # 启 db + web + cron
docker compose down                                  # 停容器,数据卷保留
docker compose down -v                               # 全清(下次重建表)
docker compose ps                                    # 看状态
docker compose logs -f web                           # 跟踪 web 日志
docker compose logs -f cron                          # 跟踪 cron 日志(看 AI 调用情况)

# === 重新构建(改了源码 / Dockerfile)===
docker compose build web tools
docker compose up -d --build                         # 一步到位

# === 一次性运维任务 ===
docker compose --profile setup up tools              # 默认:导入赛程
docker compose --profile setup run --rm tools npx tsx scripts/verify_db.ts
docker compose --profile setup run --rm tools npx tsx scripts/predict_day.ts 2026-06-11
docker compose --profile setup run --rm tools npx tsx scripts/fetch_results.ts
docker compose --profile setup run --rm tools npx tsx scripts/fetch_results.ts 2022  # 跑历史年份

# === DB 直连(调试)===
docker compose exec db psql -U postgres -d ai_fifa
docker compose exec db psql -U postgres -d ai_fifa -c "SELECT * FROM v_leaderboard;"
```

---

## 开发模式(Host 跑 Next.js,容器只跑 db)

更快的 HMR / 调试体验。**前置**:Node 24+ 已安装。

```bash
# 1. 装依赖(触发 prisma generate)
npm install

# 2. 复制 .env.local(同上)
cp .env.example .env.local
# 编辑填值

# 3. 只启 db(端口 5432 暴露到 host)
docker compose up -d db

# 4. 首次种子(从 host 跑)
npm run import:schedule
npm run verify:db

# 5. 启 Next dev server(HMR)
npm run dev
# 访问 http://localhost:3000
```

**注意**:Docker 全栈模式和开发模式**不能同时**(都抢 3000)。

### Host 上可用的 npm 脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | Next dev server(端口 3000,HMR) |
| `npm run build` | 生产构建(`output: 'standalone'`) |
| `npm start` | 跑生产构建产物 |
| `npm run typecheck` | `tsc --noEmit` 纯类型检查 |
| `npm run lint` | ESLint |
| `npm run db:studio` | Prisma Studio(http://localhost:5555 可视化查表) |
| `npm run db:pull` | 从 DB 反向同步 `prisma/schema.prisma`(改了 `schema_v1.sql` 之后用) |
| `npm run import:schedule` | 导入 48 队 + 104 场比赛 |
| `npm run verify:db` | 数据库就绪性验证 |
| `npm run predict:day -- 2026-06-11` | 触发某 ET 日期当天全部场次的 L1 预测(真实烧 OpenRouter) |
| `npm run fetch:results` | 拉 openfootball 2026 完赛数据 |

---

## 项目结构

```
ai-fifa/
├── docker-compose.yml          # 4 个服务:db / web / cron / tools
├── Dockerfile                  # 4 阶段:deps → build → runtime → tools
├── .dockerignore
├── .env.example                # 复制为 .env.local 后填值
├── schema_v1.sql               # DB 真理源:9 表 + 4 视图 + 8 家 INSERT
├── wc2026_schedule.json        # 104 场赛程 + 12 组 × 4 队
├── poc_experiment_v5.html      # 概念验证(prompt 模板 / normalizeData 来源)
│
├── prisma/
│   └── schema.prisma           # Prisma 模型(snake_case 字段名匹配 DB)
├── prisma.config.ts            # Prisma 7+ 配置(CLI 用)
├── next.config.ts              # Next + next-intl + standalone
│
├── messages/                   # i18n 翻译字典
│   ├── zh.json
│   └── en.json
│
├── src/
│   ├── middleware.ts           # next-intl locale 检测
│   ├── i18n/
│   │   ├── routing.ts          # locales: ['zh', 'en'], defaultLocale: 'zh'
│   │   ├── request.ts
│   │   └── navigation.ts       # 类型安全的 Link / useRouter,自动带 locale 前缀
│   ├── components/
│   │   ├── LocaleSwitcher.tsx   # 原生 select dropdown(中文 / English,易扩展更多语言)
│   │   └── LocalDateTime.tsx    # SSR fallback + 浏览器本地时区 toLocaleString
│   ├── lib/
│   │   ├── prisma.ts           # PrismaClient 单例(lazy + PrismaPg adapter)
│   │   ├── ai-models.ts        # 8 家模型常量(id / openrouter ID / 品牌色)
│   │   ├── team-mapping.ts     # 48 队英文 → 中文 + FIFA 三字母代码 + 国旗 emoji
│   │   ├── team-name.ts        # locale-aware 球队名取值
│   │   ├── types.ts            # Outcome / OverUnder / NormalizedPrediction
│   │   ├── openrouter.ts       # callWithRetry + parseJsonContent + normalizeData(POC 移植)
│   │   ├── prompts.ts          # SYSTEM_PROMPT + buildUserPrompt(8 家完全相同)
│   │   ├── concurrency.ts      # withConcurrency promise pool
│   │   ├── predict-l1.ts       # L1 核心管线(cron 端点 + CLI 脚本共用)
│   │   ├── openfootball.ts     # fetch + 队名归一化 + score 推导
│   │   ├── results-sync.ts     # match_results upsert + 触发 scoring + KO fill
│   │   ├── scoring.ts          # 评分算法(+3/+5/+1/+1,perfect bonus,upset ×1.5)
│   │   ├── ko-fill.ts          # R32 自动填表(仅 Winner/Runner-up;Best 3rd 留 TODO)
│   │   └── api-logs.ts         # 写 api_call_logs
│   └── app/
│       ├── globals.css         # Tailwind 4 @theme + 8 家 AI 品牌色变量
│       ├── [locale]/           # 多语言路由
│       │   ├── layout.tsx      # html + NextIntlClientProvider + 全局 LocaleSwitcher
│       │   ├── page.tsx        # 首页:即将开赛 6 场 + AI 排行榜 Top 3
│       │   ├── bracket/        # 赛程总览(小组赛 12 组 + 淘汰赛 6 阶段)
│       │   ├── leaderboard/    # AI 排行榜
│       │   └── match/[id]/     # 比赛详情(8 家预测卡,双语 reason/wildcard)
│       └── api/cron/
│           ├── predict-l1/     # 每 ET 日 6h 前批量预测当天全部场次
│           └── fetch-results/  # 拉 openfootball,upsert match_results,触发 scoring + ko_fill
│
└── scripts/                    # CLI 运维任务(从 host 或 tools 容器跑)
    ├── import_schedule.ts      # JSON → teams + matches 表
    ├── verify_db.ts            # 7 项数据库就绪性检查
    ├── predict_day.ts          # 指定日期触发 L1 预测
    └── fetch_results.ts        # 一次性同步比分
```

---

## 三层预测时间线(brief 设计)

| 层级 | 触发时机 | 写入规则 | 实现状态 |
|---|---|---|---|
| **L1 单场** | 开赛前 6h,**按 ET 日期**批量调用当天全部场次 | `UNIQUE (match_id, model_id)` 物理保证永不修改 | ✅ |
| **L2 小组出线** | 每场小组赛结束后触发 | 用 `version` 字段保留历史快照,禁止 UPDATE | TODO |
| **L3 赛事级**(冠军/前4) | 小组赛全部结束 + 半决赛结束各更新一次 | 同 L2,version 滚动 | TODO |

---

## 数据库设计

9 表 + 3 视图。表名都 snake_case,主键见下。

**表**:`ai_models` · `teams` · `matches` · `predictions_l1` · `predictions_l2` · `predictions_l3` · `match_results` · `prediction_scores` · `api_call_logs`

**视图**:
- `v_leaderboard` — AI 排行榜实时(直接 SELECT 渲染 `/leaderboard`)
- `v_upcoming_matches` — **首页主查询**:所有 `kickoff_at > now() AND status <> 'finished'` 的比赛,带 `prediction_count` / `avg_confidence` / `is_disputed` / 双语队名
- `v_today_matches` — 「今日窗口」(`now-6h ~ now+24h`),赛季中后期热点用
- `v_model_reliability` — 7 天 API 成功率(<90% 触发告警阈值)

**ID 约定**(都是 `text` 主键,不是 UUID):
- `ai_models.id`:短标识 `'gpt'` / `'claude'` / `'gemini'` / `'grok'` / `'deepseek'` / `'qwen'` / `'llama'` / `'kimi'`
- `teams.id`:FIFA 三字母代码 `'ARG'` / `'BRA'` / `'CHN'`
- `matches.id`:`'M001'`-`'M104'`(与 schedule.json 对齐)
- 预测表 / `prediction_scores`:UUID

**评分规则**(在 `src/lib/scoring.ts` 实现):
- `outcome_correct` +3 / `score_exact` +5(叠加) / `goals_correct` +1 / `btts_correct` +1
- 四项全对 `is_perfect`,额外 +3 → 总分 13
- 押中冷门(>=3 家其他模型 outcome 不同) `is_upset_hit`,得分 **×1.5**
- 四项全错 `is_total_miss` — 打脸内容素材

---

## API 端点

| 端点 | 方法 | 鉴权 | 用途 |
|---|---|---|---|
| `/api/cron/predict-l1` | GET | `Authorization: Bearer $CRON_SECRET` | 触发 L1 预测(按 ET 日期分批) |
| `/api/cron/fetch-results` | GET | 同上 | 拉 openfootball 2026 完赛 + 触发评分 + 自动填 R32 |

**Dev 环境扩展**(`NODE_ENV !== 'production'`):
- `/api/cron/predict-l1?date=2026-06-11` — 覆盖默认「自动按下一场判断」
- `/api/cron/predict-l1?match_ids=M001,M002` — 显式指定比赛

---

## 厂商绑定边界

| 组件 | 绑定状态 | 替换方式 |
|---|---|---|
| **Postgres** | 零绑定 | 换 `DATABASE_URL` 即可切到 Neon / Supabase / RDS / DO / 自托管 |
| **`pg` 驱动** | 标准 Postgres 协议 | 改 adapter 即可换驱动 |
| **Prisma** | 库依赖,非云服务 | 查询 API 可重写成原生 SQL 切回纯 `pg`/`postgres` |
| **Next.js** | 可部署在任意 Node 主机 | Docker compose 已自包含 |
| **Cron** | 自包含 sidecar(alpine + curl) | 也可让 Vercel Cron / GitHub Actions / 自家 cron 调端点 |
| **OpenRouter** | 故意绑定(brief 决策:一个 key 接入 8 家) | — |

---

## 当前未做(诚实清单)

- **L2 / L3 预测** — 小组出线 + 冠军预测,需独立 prompt + cron(框架已通,缺业务逻辑)
- **R16 - 决赛自动填表** — `pending_label` 只在 R32 有,后续阶段 FIFA bracket 推导逻辑未写
- **R32 含 Best 3rd 的 8 场自动填表** — FIFA 用固定 permutation lookup table 决定 8 个晋级 3rd 配给 8 个 R32 slot,留 TODO
- **打脸海报模板** — 视觉方向待定(brief 优先级:中)
- **单测框架** — 未引入

### 已完成的最近迭代

- **双语 prompt(v1.1)** — AI 同一 prompt 同时输出 `reason_zh / reason_en / wildcard_zh / wildcard_en`,落库 4 列。前端按 locale 取值,v1.0 旧数据 fallback 到中文。**不绑死单一语言**且不破「8 家公平」基础。
- **浏览器本地时区** — `<LocalDateTime>` 客户端组件,所有页面日期都按用户浏览器 TZ 显示。
- **首页改即将开赛** — 不再依赖「今日 6h 窗口」,直接展示最近 6 场。
- **全局语言切换** — 原生 dropdown,易扩展到 ja / es / pt 等更多 locale。

---

## 文档对照

| 文档 | 角色 |
|---|---|
| `README.md`(本文件) | 给人看的:启动 / 使用 / 项目结构 / 当前能力 |
| `CLAUDE.md` | 给 Claude Code agent 看的:架构铁律 / 实施陷阱 / 跨文件不一致 |
| `AGENTS.md` | 给其他 AI agent 看的:Next 16 重要差异 |
| `/Users/david/Downloads/project_brief_v1.2.md` | **权威文档**:产品方向 / 商业策略 / 内容运营 |
