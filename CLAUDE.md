# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **权威文档**:`/Users/david/Downloads/project_brief_v1.2.md`(AI 世界杯预测擂台 v1.2)。本文件仅摘录写代码时立即需要用到的部分(架构铁律、踩过的坑、模型 ID)。本文件与 brief 冲突时,**以 brief 为准**。
>
> **用户文档**:`README.md` — 启动 / 使用流程在那里,本文件不重复。

---

## 项目本质

AI 世界杯 2026 预测**娱乐媒体站**,让 8 家顶级 AI 同台预测球赛,围观谁押中、谁翻车。

- **不是严肃预测工具** — 准不准不重要,翻车越好玩越有流量
- **无用户注册/互动/押注** — 纯内容展示
- **移动端优先**(70%+ 流量)
- **失败也是产品叙事**(见下方「失败即内容」)

---

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 / 后端 | Next.js **16.2.6** (App Router · Turbopack · standalone build) + React 19.2.4 + Tailwind 4 |
| 多语言 | `next-intl`(zh / en,路径前缀 `/zh/...` `/en/...`) |
| 数据库 | PostgreSQL 16(docker compose 自包含;生产任意托管 PG) |
| ORM | **Prisma 7** + `@prisma/adapter-pg`(无 binary engine) |
| 模型接入 | OpenRouter(一个 API key 接入 8 家,OpenAI 兼容格式) |
| Cron | docker compose 内自包含 sidecar(alpine + curl),不依赖 Vercel Cron |
| 比分数据源 | `openfootball/worldcup.json`(GitHub raw fetch,公有领域) |
| 部署 | `docker compose up -d` 即可,任意 Docker 主机 |

---

## 仓库布局速查

```
ai-fifa/
├── docker-compose.yml          # 4 服务:db / web / cron / tools
├── Dockerfile                  # 4 阶段:deps → build → runtime → tools
├── schema_v1.sql               # **DB 真理源**:9 表 + 3 视图 + INSERT 8 家
├── wc2026_schedule.json        # 104 场赛程 + groups 字段(权威英文名)
├── poc_experiment_v5.html      # 概念验证(prompt 模板 / normalizeData 来源)
├── prisma/schema.prisma        # Prisma 模型(snake_case 匹配 DB)
├── messages/{zh,en}.json       # i18n 翻译字典
├── src/
│   ├── middleware.ts           # next-intl locale 检测(★ 必须在 src/ 不能在根)
│   ├── i18n/                   # routing / request / navigation
│   ├── components/LocaleSwitcher.tsx
│   ├── lib/                    # prisma / openrouter / prompts / scoring / ko-fill / ...
│   └── app/
│       ├── [locale]/           # 所有用户页面(layout / page / bracket / leaderboard / match)
│       └── api/cron/           # predict-l1 + fetch-results(不在 [locale] 下)
└── scripts/                    # CLI 运维(import / verify / predict_day / fetch_results)
```

---

## 常用命令

### Docker compose(交付物路径)
| 命令 | 作用 |
|---|---|
| `docker compose up -d` | 启 db + web + cron |
| `docker compose up -d db` | 只启 db(host 跑 `npm run dev`) |
| `docker compose build` | 重建镜像 |
| `docker compose down` | 停容器,数据卷保留 |
| `docker compose down -v` | 全清,下次重建表 |
| `docker compose logs -f web\|cron\|db` | 跟踪日志 |
| `docker compose --profile setup up tools` | 一次性:导入赛程(默认 command) |
| `docker compose --profile setup run --rm tools npx tsx scripts/XXX.ts` | 任意脚本 |
| `docker compose exec db psql -U postgres -d ai_fifa` | DB shell |

### Host scripts(开发模式)
| 命令 | 作用 |
|---|---|
| `npm run dev` | Next dev server(HMR) |
| `npm run build` | 生产构建(`output: 'standalone'`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:studio` | Prisma Studio(localhost:5555) |
| `npm run db:pull` | 从 DB 反向同步 `prisma/schema.prisma` |
| `npm run import:schedule` | 导入 48 队 + 104 场 |
| `npm run verify:db` | 数据库就绪性 7 项检查 |
| `npm run predict:day -- 2026-06-11` | 触发 ET 日期当天 L1 预测(烧 OpenRouter) |
| `npm run fetch:results` | 拉 openfootball 2026;`-- 2022` 跑历史年份 |

### 本地触发 cron(host 模式)
```bash
SECRET=$(grep ^CRON_SECRET .env.local | cut -d= -f2)
curl -H "Authorization: Bearer $SECRET" http://localhost:3000/api/cron/predict-l1
curl -H "Authorization: Bearer $SECRET" http://localhost:3000/api/cron/fetch-results
```

Dev only 查询参数(`NODE_ENV !== 'production'` 才生效):
- `?date=2026-06-11` 覆盖默认窗口判断
- `?match_ids=M001,M002` 显式比赛列表

---

## 关键设计 / 铁律

### Docker compose 交付物结构
- 4 个服务:**db**(postgres:16,首次自动跑 `schema_v1.sql`)/ **web**(Next standalone,~285MB)/ **cron**(alpine + curl 自实现 scheduler,每 15min 调两个端点)/ **tools**(profile-gated,~560MB,含完整 source + tsx)
- `tools` 不常驻 — 必须 `--profile setup` 才启
- web 容器内 `DATABASE_URL=postgres://...@db:5432/...`,host 上 `.env.local` 是 `localhost:5432` — **不要混用**
- 修源码后 `docker compose build web tools && docker compose up -d`

### Prisma 用法约定
- **`schema_v1.sql` 是真理源**(CHECK 约束 / 视图 / 部分索引 / seed 数据 全在那)
- **禁止 `prisma migrate dev`** — 会丢掉 SQL 里的非 Prisma 特性
- 改 schema 流程:① 改 `schema_v1.sql` ② `docker compose down -v && up -d`(重建)③ `npm run db:pull`(反向同步 Prisma)④ 手动核对结果
- 视图 (`v_leaderboard` / `v_today_matches` / `v_model_reliability`) 在 Prisma 里是只读类型,用 `@unique` 不能用 `@id`
- 字段名保持 **snake_case** 匹配 DB,不用 Prisma 默认的 camelCase 转换
- `prisma.config.ts` 的 `datasource.url` 默认 `''` 避免 `npm ci` 时阻断 generate
- `src/lib/prisma.ts` 用 **Proxy lazy 实例化** — 否则 ES import 提升导致 env 加载前求值

### i18n 约定
- 默认 locale `zh`,所有 URL 必带前缀(`localePrefix: 'always'`)
- `src/middleware.ts` 必须在 `src/` 下(不能在项目根,Next 16 用 src/ 结构时只认 src/middleware.ts)
- 所有页面在 `src/app/[locale]/...`,API 路由(`/api/...`)不在 [locale] 下
- 翻译字典:`messages/zh.json` `messages/en.json` — 加新 locale 时同步 `src/i18n/routing.ts`
- **AI 生成的 `reason` / `wildcard` 不翻译** — 永远跟 prompt 走(中文 prompt → 中文输出)
- 用 `src/i18n/navigation.ts` 导出的 `Link` / `useRouter`(自动带 locale 前缀),**不要**用 `next/link`
- 球队名取值用 `src/lib/team-name.ts` 的 `teamName(team, locale)`

### 评分逻辑(`src/lib/scoring.ts`)
- `outcome +3 / score_exact +5 / goals +1 / btts +1`,四项全对 `is_perfect` +3 = 13 总分
- `outcome_correct && 同场其他 ≥3 家 outcome 不同 → is_upset_hit`,得分 ×1.5(四舍五入)
- 四项全错 `is_total_miss`(打脸内容素材)
- 触发时机:`results-sync.ts` 写完一场 `match_results` 后调 `scoreMatch(matchId)`,upsert 全部 8 条

### KO 自动填表(`src/lib/ko-fill.ts`)
- 仅处理「Winner X」「Runner-up X」类型,**不处理含 Best 3rd 的 8 场**(FIFA 用固定 permutation lookup table,留 TODO)
- 触发时机:`results-sync.ts` 发现 group 比赛完赛后调 `autoFillR32()`
- 校验 12 组全部完赛才动手,避免半路填错
- 排名规则简化版:积分 → GD → GF → 字母序(未实现 head-to-head)

### Cron 端点
- `/api/cron/predict-l1`(每 15min):自动模式 — 取下一场比赛,若 ≤6h 后开赛,跑那一天(ET)的所有场次 × 8 家活跃模型
- `/api/cron/fetch-results`(每 15min):从 openfootball 拉 2026,完赛 upsert `match_results` → 触发 scoring + KO fill
- 幂等:predict-l1 靠 `UNIQUE (match_id, model_id)`(Prisma `P2002` 当作正常重复);fetch-results 用 upsert
- `maxDuration = 300`(predict-l1)/ `60`(fetch-results)

### `predictions_l1` 写入即冻结
`UNIQUE (match_id, model_id)` 物理保证「永不修改」。任何「修正预测」的需求都要先质疑。

### L2/L3 用 `version` 字段叠加
**禁止 UPDATE**,新结果新版本号:
- `predictions_l2.version` 范围 1-4(赛前 + 每场后 3 次)
- `predictions_l3.version` 范围 1-3(赛前 / 小组后 / 半决赛后)

### `raw_response`(jsonb) 永远保留
排错 / 复盘 / 内容稿件全靠它。**不要**为了节省空间删除。

### `wildcard` 字段是赛后传播金矿
即便看起来「没用」也不要省 — 翻车海报靠它。

---

## 三层预测时间线

| 层级 | 触发时机 | 写入规则 | 状态 |
|---|---|---|---|
| **L1 单场** | 开赛前 6h,**按 ET 日期**批量调用当天全部场次 | UNIQUE 物理保证永不修改 | ✅ |
| **L2 小组出线** | 每场小组赛结束后触发 | 新增 version,不覆盖 | TODO |
| **L3 赛事级**(冠军/前4) | 小组赛结束 + 半决赛结束各更新一次 | 同 L2 | TODO |

---

## 8 家模型 OpenRouter ID

定义在 `src/lib/ai-models.ts`,与 `schema_v1.sql` 的 `ai_models` INSERT 一致。

| 模型 | OpenRouter ID | 品牌色 |
|---|---|---|
| GPT-5 | `openai/gpt-5` | #10a37f |
| Claude Sonnet 4.6 | `anthropic/claude-sonnet-4.6` | #7F77DD |
| Gemini 2.5 Pro | `google/gemini-2.5-pro` | #378ADD |
| Grok 4.3 | `x-ai/grok-4.3` | #888780 |
| DeepSeek V4 Pro | `deepseek/deepseek-v4-pro` | #E24B4A |
| Qwen 3.6 Plus | `qwen/qwen3.6-plus` | #EF9F27 |
| Kimi K2.6 | `moonshotai/kimi-k2.6` | #D4537E |
| Llama 4 Maverick | `meta-llama/llama-4-maverick` | #639922 |

全赛季 API 成本预算 ~$80-100。**实测发现** Kimi 在我们这类长 prompt 上稳定性差(成功率 25%),按 brief 设计在 UI 上展示成「😴 罢工」叙事。

---

## 实施陷阱(POC 实测 + 实战踩坑,必读)

**这些坑不读 brief / POC 看不出来,踩了会浪费几小时。**

### JSON 输出
- ❌ **不要**使用 `response_format: { type: 'json_object' }` — Kimi 等模型会直接报错
- ✅ **靠 prompt 强制** JSON:明写「严格按 JSON 格式输出,不要输出其他任何内容」
- ✅ **解析必须容错**(实现在 `src/lib/openrouter.ts` 的 `parseJsonContent`):
  - 自动剥离 ` ```json ... ``` ` markdown 包装
  - 提取**第一个 `{` 到最后一个 `}`** 之间的内容
- ✅ **字段名映射**(`normalizeData`):`result ↔ outcome`、`home_score ↔ score_home`、`both_teams_to_score ↔ btts`、`reasoning/explanation ↔ reason`、`risk/wild_card ↔ wildcard`,比分字符串 `"2-1"` 自动 split
- ✅ outcome 文本里含队名(中英)、`平` / `draw` / `tie` 也能识别

### HTTP Header 必须 ASCII
- 实战踩坑:`OPENROUTER_SITE_TITLE=AI 世界杯预测擂台` 让 fetch 抛 `Cannot convert argument to a ByteString`,16 次调用全失败
- 修法:`asciiOnly()` 过滤非 ASCII,`.env` 默认值用英文 `AI FIFA Predictor`

### API 4 层重试(`src/lib/openrouter.ts` 的 `callWithRetry`)
| 层级 | 行为 | 触发 |
|---|---|---|
| 第 1 次 | 主调用,60s 超时 | 默认 |
| 第 2 次 | 等 2s 重试 | timeout / parse_error / 429 / 临时网络错误 |
| 第 3 次 | 等 5s 重试 | 第 2 次仍失败 |
| 标记缺席 | 不写 predictions_l1 + 日志 status='unavailable' | 3 次全失败 |

区分错误类型:
- `invalid model ID` / `deprecated` → **立刻失败**(isFatal=true)
- `429 rate limit` → 指数退避 ×2
- `timeout` / `parse error` → 标准 2s 退避

每次 attempt 写 `api_call_logs`(`src/lib/api-logs.ts`),`v_model_reliability` 监控 7 天成功率,<90% 邮件告警(model ID 可能又变了)。

### 失败即内容
某家 AI 3 次都失败时,前端**不要静默隐藏**:

> 😴 Claude 今日罢工
> 🛠 GPT-5 维护中

用户会笑会截图。这是产品叙事的一部分(在 `src/app/[locale]/match/[id]/page.tsx` 的 `PredictionCard` 已实现:`prediction=null` 时显示「尚未预测」虚线卡)。

### 时区
- `schedule.json` 的 `time_et` 是美东(ET)
- DB `kickoff_at` 是 `timestamptz`(UTC)
- 导入时硬编码 EDT (UTC-4),只覆盖 6-7 月窗口
- 「按天」预测的「天」定义为 ET 日历日(用 `'sv-SE'` locale 生成 ISO 日期字符串)
- 前端展示用 Asia/Shanghai(主流量在中国)

### Next.js 16 注意点
- App Router,dynamic params **是 Promise**,必须 `await params`(breaking change,详见 `AGENTS.md`)
- `src/middleware.ts` — 必须在 `src/` 下不能放项目根
- 警告 `The "middleware" file convention is deprecated. Please use "proxy" instead.` — 非致命,将来改成 `src/proxy.ts`(brief 没要求,留 TODO)
- standalone build 在 `.next/standalone/server.js`,需手动复制 `.next/static` 和 `public/` 进镜像

---

## Prompt 公平性原则

- **8 家用完全相同的 prompt** — 公平性是产品根基,不要为某家调优(`src/lib/prompts.ts`)
- 关键字段:`outcome` / `score_home` / `score_away` / `goals_over_under` / `btts` / `confidence` / `reason` / `wildcard`
- `reason` 强制要求「**说一个别人不会说的理由**」— 实测能逼出差异化推理
- `wildcard` = 「一个可能让预测翻车的意外因素」— 传播内容金矿
- prompt 里加一句「**不要因为强队应该赢就盲目押热门**」— 给冷门倾向留空间(实测让 Kimi 押中沙特 2-1 阿根廷)
- 改 prompt 要同步升级 `PROMPT_VERSION` 字符串(便于追踪 raw_response)

---

## 视觉规范

- 各家 AI 使用**官方 Logo**(描述性引用,非商业背书)— 当前未实装
- 已结束:实线边框白底,显示真实比分
- 预测中:虚线边框灰底,显示 % 置信度
- 分歧场次:红色高亮 + ⚡
- 押中冷门 AI:绿色「✓ 押中」徽标
- 押错 AI:玫红色「✗ 翻车」徽标
- 8 家品牌色定义在 `src/app/globals.css` 的 `@theme inline` 里,可用 `bg-ai-gpt` 等 utility

---

## 仓库资产(只读)

`schema_v1.sql` / `wc2026_schedule.json` / `poc_experiment_v5.html` 是从外部带进来的参考资产。

### `wc2026_schedule.json` 结构注意
- `matches.group_stage`(M001-M072)字段完整:`match_id` / `date` / `time_et` / `group` / `home` / `away` / `venue` / `city` / `country`
- `matches.round_of_32`(M073-M088)用 `label` 字段(如 `"Runner-up A vs Runner-up B"`),**没有** `home`/`away`,小组赛结束后才填入
- `matches.round_of_16` / `quarterfinals` / `semifinals` / `third_place` / `final`(M089-M104)连 `label` 都没有
- `groups` 字段独立列出 12 组 × 4 队(48 支球队权威英文名)
- `time_et: "00:00"` / `"23:00"` 这类是次日凌晨场,`date` 字段已经处理过
- 顶层 `ai_prediction_schedule` 给出 L1=312、L2=288、L3=16 次调用预算

### `poc_experiment_v5.html` — 参考实现
**生产代码的事实参考**。`src/lib/openrouter.ts` 的 `normalizeData()` 和 `callOnce()` 直接移植自此(行号:
`MODELS` 126-159 / `normalizeData` 198-232 / `callModel` 287-333)。改 OpenRouter 调用方式前先读这里。

### `schema_v1.sql` 关键约束 / 字段
- `predictions_l1` 的 `UNIQUE (match_id, model_id)`:「永不修改」的物理保证
- `matches.pending_label`:承载淘汰赛未定对阵描述
- `ai_models.is_active` + `joined_at`:支持赛季中途加入新模型(从加入日开始计分)
- `match_results.winner`:已含点球结果(`home` / `draw` / `away`)
- `match_results.source` 默认 `'openfootball'`(已修)
- `teams.name_zh` 必填(中文名映射在 `src/lib/team-mapping.ts`)

---

## 厂商绑定边界

| 组件 | 状态 |
|---|---|
| **Postgres** | 零绑定,换 `DATABASE_URL` 即可切到任何托管服务 |
| **`pg` 驱动** | 标准 Postgres 协议 |
| **Prisma** | 库依赖,非云服务。查询 API 可重写成原生 SQL 切回 `pg`/`postgres` |
| **Cron** | 自包含 sidecar,**也支持** Vercel Cron(`vercel.json` 已配置)/ GitHub Actions / 任意 HTTP scheduler |
| **OpenRouter** | 故意绑定(brief 决策:一个 key 接入 8 家) |
| **Next.js / Docker** | 可部署在任意 Docker 主机 |

---

## 工作方式

- 已确定的决策**直接推进**,不重新讨论
- 写代码时给**完整可运行版本**,注明文件路径
- 用通俗语言包装预测维度,**避开「赔率」「投注」等博彩字眼**
- 球队名永远用 `name_zh` / `name`(`teams` 表),不要硬编码

---

## 已知未做(诚实清单)

- **L2 / L3 预测管线** — 框架已通,缺业务逻辑(分别按组 / 全局生成不同 prompt)
- **R16 - 决赛自动填表** — `pending_label` 只在 R32 有,后续阶段需要硬编码 FIFA bracket map
- **R32 含 Best 3rd 的 8 场自动填表** — FIFA 用固定 permutation lookup 决定 8 个晋级 3rd 配给 8 个 R32 slot
- **打脸海报模板** — 视觉方向待定
- **单测框架** — 未引入
- **L2 的 `triggered_by_match` / L3 的版本触发逻辑** — 表结构有,业务未接
- **域名 / 生产部署** — 未敲定
- **球队页 `/team/[name]`** — brief 设计的 SEO 长尾,未实装
- **历史预测 `/historic/[year]`** — 预热期内容,未实装
- **next-intl `localeDetection` 行为** — 默认按 Accept-Language 跳,如果想强制 zh,routing 里设 `localeDetection: false`
