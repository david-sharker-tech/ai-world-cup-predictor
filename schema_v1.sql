-- ============================================================
-- AI 世界杯预测擂台 v1.1 - 数据库 Schema
-- 数据库: Supabase (PostgreSQL 15+)
-- 创建日期: 2026-05-15
-- ============================================================

-- 启用 UUID 扩展(Supabase 默认已启用)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- 1. ai_models - 8 家参赛 AI 模型
-- ============================================================
-- 静态数据,项目初始化时一次性写入,基本不变
-- 加入新模型(如 GLM-5.1)时新增一行即可
-- ============================================================

CREATE TABLE ai_models (
  id              text PRIMARY KEY,                          -- 'gpt' / 'claude' / 'gemini' 等短标识
  name            text NOT NULL,                             -- 显示名称: 'GPT-5.5'
  openrouter_id   text NOT NULL,                             -- OpenRouter 调用 ID: 'openai/gpt-5.5'
  persona_label   text NOT NULL,                             -- 人设标签: '全能学长 · 永远押热门'
  persona_quote   text,                                      -- 口头禅: '历史数据显示...'
  color_hex       text NOT NULL,                             -- 品牌色: '#10a37f'
  country         text,                                      -- 国家: 'USA' / 'China' / 'Open'
  founder         text,                                      -- 创始人: 'Sam Altman'
  joined_at       date NOT NULL DEFAULT CURRENT_DATE,        -- 加入擂台日期(后期加入模型时用)
  is_active       boolean NOT NULL DEFAULT true,             -- 是否当前参赛
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_models IS '8 家参赛 AI 模型基础信息';
COMMENT ON COLUMN ai_models.joined_at IS '后期加入的模型从加入日开始计分,不补跑历史';


-- ============================================================
-- 2. teams - 48 支参赛球队
-- ============================================================
-- 静态数据,小组赛开始前确认 48 队后写入
-- ============================================================

CREATE TABLE teams (
  id              text PRIMARY KEY,                          -- 'ARG' / 'BRA' / 'CHN' 等 FIFA 三字母代码
  name            text NOT NULL,                             -- 英文名: 'Argentina'
  name_zh         text NOT NULL,                             -- 中文名: '阿根廷'
  group_letter    char(1) NOT NULL,                          -- 小组: 'A' - 'L' (12 个小组)
  flag_emoji      text,                                      -- 旗帜 emoji: '🇦🇷'
  fifa_ranking    integer,                                   -- FIFA 排名(快照,不更新)
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valid_group CHECK (group_letter IN ('A','B','C','D','E','F','G','H','I','J','K','L'))
);

CREATE INDEX idx_teams_group ON teams(group_letter);

COMMENT ON TABLE teams IS '48 支参赛球队,12 个小组每组 4 队';


-- ============================================================
-- 3. matches - 全部 104 场比赛
-- ============================================================
-- 静态数据,从 wc2026_schedule.json 一次性导入
-- status 字段会随赛事进行更新
-- ============================================================

CREATE TABLE matches (
  id              text PRIMARY KEY,                          -- 'M001' - 'M104' (与 schedule.json 对齐)
  stage           text NOT NULL,                             -- 'group' / 'round_of_32' / 'round_of_16' /
                                                             -- 'quarterfinals' / 'semifinals' /
                                                             -- 'third_place' / 'final'
  group_letter    char(1),                                   -- 小组赛才有,淘汰赛为 NULL
  kickoff_at      timestamptz NOT NULL,                      -- 开赛时间(UTC)
  home_team_id    text REFERENCES teams(id),                 -- 主队(淘汰赛初期可能为 NULL)
  away_team_id    text REFERENCES teams(id),                 -- 客队(淘汰赛初期可能为 NULL)
  pending_label   text,                                      -- 淘汰赛对阵未定时的描述:
                                                             -- '小组 A 第一 vs 小组 B 第二'
  venue           text,                                      -- 场馆: 'MetLife Stadium'
  city            text,                                      -- 城市: 'East Rutherford'
  country         text,                                      -- 国家: 'USA'
  status          text NOT NULL DEFAULT 'scheduled',         -- 'scheduled' / 'live' / 'finished'
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valid_stage CHECK (stage IN (
    'group','round_of_32','round_of_16','quarterfinals',
    'semifinals','third_place','final'
  )),
  CONSTRAINT valid_status CHECK (status IN ('scheduled','live','finished'))
);

CREATE INDEX idx_matches_kickoff ON matches(kickoff_at);
CREATE INDEX idx_matches_stage ON matches(stage);
CREATE INDEX idx_matches_group ON matches(group_letter) WHERE group_letter IS NOT NULL;
CREATE INDEX idx_matches_status ON matches(status);

COMMENT ON TABLE matches IS '全部 104 场比赛,从 wc2026_schedule.json 导入';
COMMENT ON COLUMN matches.pending_label IS '淘汰赛对阵未定时的描述,小组赛结束后填入实际 team_id';


-- ============================================================
-- 4. predictions_l1 - 单场比赛预测(8 家 × 104 场)
-- ============================================================
-- L1 是核心数据,赛前锁定,永不修改
-- 每场比赛 8 家 AI 各写一行,共 832 行
-- ============================================================

CREATE TABLE predictions_l1 (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id          text NOT NULL REFERENCES matches(id),
  model_id          text NOT NULL REFERENCES ai_models(id),

  -- 核心预测字段(对应 prompt 输出)
  outcome           text NOT NULL,                           -- 'home_win' / 'draw' / 'away_win'
  score_home        smallint NOT NULL,                       -- 预测主队进球数
  score_away        smallint NOT NULL,                       -- 预测客队进球数
  goals_over_under  text NOT NULL,                           -- 'over' / 'under' (基于 2.5)
  btts              boolean NOT NULL,                        -- 两队都进球
  confidence        smallint NOT NULL,                       -- 0-100 置信度

  -- 内容生成字段(双语:zh 必填,en 自 v1.1 prompt 起由 AI 同时输出,旧数据为 null)
  reason            text NOT NULL,                           -- 中文:"一句别人不会说的理由"
  reason_en         text,                                    -- 英文版,prompt v1.1+ 才有
  wildcard          text,                                    -- 中文:"让预测翻车的意外因素"
  wildcard_en       text,                                    -- 英文版,prompt v1.1+ 才有

  -- 调度元数据
  raw_response      jsonb,                                   -- 完整原始响应(便于排错)
  locked_at         timestamptz NOT NULL DEFAULT now(),      -- 预测锁定时间(开赛前)
  prompt_version    text NOT NULL DEFAULT 'v1.0',            -- prompt 版本号(便于追踪变更)

  CONSTRAINT valid_outcome CHECK (outcome IN ('home_win','draw','away_win')),
  CONSTRAINT valid_over_under CHECK (goals_over_under IN ('over','under')),
  CONSTRAINT valid_confidence CHECK (confidence BETWEEN 0 AND 100),
  CONSTRAINT valid_scores CHECK (score_home >= 0 AND score_away >= 0),

  -- 每场比赛每家 AI 只能有一条预测
  UNIQUE (match_id, model_id)
);

CREATE INDEX idx_l1_match ON predictions_l1(match_id);
CREATE INDEX idx_l1_model ON predictions_l1(model_id);
CREATE INDEX idx_l1_locked_at ON predictions_l1(locked_at);

COMMENT ON TABLE predictions_l1 IS 'L1 单场预测,赛前一次性锁定,永不修改';
COMMENT ON COLUMN predictions_l1.raw_response IS '保留原始 AI 响应,排错和复盘用';
COMMENT ON COLUMN predictions_l1.wildcard IS '赛后内容金矿: 如果意外真的发生,这就是预警过的;没发生就是自打脸';


-- ============================================================
-- 5. predictions_l2 - 小组出线预测
-- ============================================================
-- L2 是动态数据,每场小组赛结束后该组触发更新
-- 通过 version 字段记录历史版本,不覆盖
-- ============================================================

CREATE TABLE predictions_l2 (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_letter        char(1) NOT NULL,
  model_id            text NOT NULL REFERENCES ai_models(id),
  version             smallint NOT NULL,                     -- 1=赛前, 2=第1场后, 3=第2场后, 4=第3场后

  -- 预测出线两队
  first_place_team    text REFERENCES teams(id),
  second_place_team   text REFERENCES teams(id),
  third_place_team    text REFERENCES teams(id),             -- 第三名也存,可能晋级 32 强
  fourth_place_team   text REFERENCES teams(id),

  reason              text,                                  -- AI 解释

  -- 调度元数据
  triggered_by_match  text REFERENCES matches(id),           -- 哪场比赛结束触发的更新
  raw_response        jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valid_group_l2 CHECK (group_letter IN ('A','B','C','D','E','F','G','H','I','J','K','L')),
  CONSTRAINT valid_version CHECK (version BETWEEN 1 AND 4),

  -- 同一小组、同一模型、同一版本只能有一条
  UNIQUE (group_letter, model_id, version)
);

CREATE INDEX idx_l2_group_version ON predictions_l2(group_letter, version);
CREATE INDEX idx_l2_model ON predictions_l2(model_id);

COMMENT ON TABLE predictions_l2 IS 'L2 小组出线预测,每场小组赛结束后更新,保留历史版本';
COMMENT ON COLUMN predictions_l2.version IS '版本号 1-4: 赛前初版 + 每场后更新共 3 次';


-- ============================================================
-- 6. predictions_l3 - 赛事级别预测(冠军/前4)
-- ============================================================
-- L3 在两个关键节点更新:
-- version 1: 赛前
-- version 2: 小组赛结束
-- version 3: 半决赛结束
-- ============================================================

CREATE TABLE predictions_l3 (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id        text NOT NULL REFERENCES ai_models(id),
  version         smallint NOT NULL,                         -- 1=赛前, 2=小组后, 3=半决赛后

  -- 冠军和前 4
  champion_team   text REFERENCES teams(id),                 -- 冠军预测
  runner_up_team  text REFERENCES teams(id),                 -- 亚军
  third_team      text REFERENCES teams(id),                 -- 季军
  fourth_team     text REFERENCES teams(id),                 -- 殿军

  reason          text,
  raw_response    jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valid_l3_version CHECK (version BETWEEN 1 AND 3),
  UNIQUE (model_id, version)
);

CREATE INDEX idx_l3_model_version ON predictions_l3(model_id, version);

COMMENT ON TABLE predictions_l3 IS 'L3 赛事级预测,2-3 个关键节点更新';


-- ============================================================
-- 7. match_results - 比赛真实结果
-- ============================================================
-- 一场比赛一条记录,赛后从 Football-Data.org 获取
-- ============================================================

CREATE TABLE match_results (
  match_id            text PRIMARY KEY REFERENCES matches(id),

  -- 90 分钟比分
  score_home          smallint NOT NULL,
  score_away          smallint NOT NULL,

  -- 加时和点球(淘汰赛可能用到)
  went_to_extra_time  boolean NOT NULL DEFAULT false,
  extra_time_home     smallint,                              -- 加时进球数
  extra_time_away     smallint,
  went_to_penalties   boolean NOT NULL DEFAULT false,
  penalty_home        smallint,                              -- 点球大战进球
  penalty_away        smallint,

  -- 派生字段(便于查询,不必计算)
  winner              text NOT NULL,                         -- 'home' / 'draw' / 'away'
                                                             -- 包含点球结果

  -- 来源追踪
  source              text NOT NULL DEFAULT 'openfootball',  -- 数据来源
  recorded_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valid_winner CHECK (winner IN ('home','draw','away')),
  CONSTRAINT valid_result_scores CHECK (score_home >= 0 AND score_away >= 0)
);

COMMENT ON TABLE match_results IS '比赛真实结果,赛后写入,winner 字段已包含点球结果';


-- ============================================================
-- 8. prediction_scores - 每条预测的得分
-- ============================================================
-- 衍生数据,赛后自动计算
-- 每条 L1 预测对应一行打分
-- ============================================================

CREATE TABLE prediction_scores (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  prediction_id     uuid NOT NULL REFERENCES predictions_l1(id),

  -- 各维度对错
  outcome_correct   boolean NOT NULL,                        -- 胜负是否对
  score_exact       boolean NOT NULL,                        -- 比分是否完全命中
  goals_correct     boolean NOT NULL,                        -- 大小球是否对
  btts_correct      boolean NOT NULL,                        -- 两队都进球是否对

  -- 综合得分(参考下方评分规则)
  points            smallint NOT NULL,

  -- 标记冷门和完美预测(用于生成内容)
  is_upset_hit      boolean NOT NULL DEFAULT false,          -- 押中冷门
  is_perfect        boolean NOT NULL DEFAULT false,          -- 四项全对
  is_total_miss     boolean NOT NULL DEFAULT false,          -- 四项全错(打脸素材)

  calculated_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (prediction_id)
);

CREATE INDEX idx_scores_prediction ON prediction_scores(prediction_id);
CREATE INDEX idx_scores_upset ON prediction_scores(is_upset_hit) WHERE is_upset_hit = true;
CREATE INDEX idx_scores_perfect ON prediction_scores(is_perfect) WHERE is_perfect = true;
CREATE INDEX idx_scores_miss ON prediction_scores(is_total_miss) WHERE is_total_miss = true;

COMMENT ON TABLE prediction_scores IS '每条 L1 预测的得分,赛后自动计算';


-- ============================================================
-- 评分规则参考(在应用层实现,这里只是说明)
-- ============================================================
-- outcome_correct  → +3 分
-- score_exact      → +5 分 (额外,叠加)
-- goals_correct    → +1 分
-- btts_correct     → +1 分
-- 4 项全对         → is_perfect = true,额外 +3 分 = 总分 13 分
-- 押中冷门(>3 家押对方,你押对)→ is_upset_hit = true,得分 × 1.5
-- 4 项全错         → is_total_miss = true,标记为打脸内容素材


-- ============================================================
-- 便利视图: AI 积分榜
-- ============================================================
-- 实时计算各家 AI 当前累计积分,前端直接查询
-- ============================================================

CREATE OR REPLACE VIEW v_leaderboard AS
SELECT
  m.id                                                       AS model_id,
  m.name                                                     AS model_name,
  m.color_hex,
  m.persona_label,
  COUNT(s.id)                                                AS total_predictions,
  COALESCE(SUM(s.points), 0)                                 AS total_points,
  COUNT(s.id) FILTER (WHERE s.outcome_correct)              AS outcome_wins,
  COUNT(s.id) FILTER (WHERE s.score_exact)                  AS exact_scores,
  COUNT(s.id) FILTER (WHERE s.is_upset_hit)                 AS upset_hits,
  COUNT(s.id) FILTER (WHERE s.is_perfect)                   AS perfect_predictions,
  COUNT(s.id) FILTER (WHERE s.is_total_miss)                AS total_misses,
  CASE WHEN COUNT(s.id) > 0
    THEN ROUND(100.0 * COUNT(s.id) FILTER (WHERE s.outcome_correct) / COUNT(s.id), 1)
    ELSE 0
  END                                                        AS accuracy_pct
FROM ai_models m
LEFT JOIN predictions_l1 p ON p.model_id = m.id
LEFT JOIN prediction_scores s ON s.prediction_id = p.id
WHERE m.is_active = true
GROUP BY m.id, m.name, m.color_hex, m.persona_label
ORDER BY total_points DESC;

COMMENT ON VIEW v_leaderboard IS 'AI 积分榜实时视图,前端 /leaderboard 页面直接查这个';


-- ============================================================
-- 便利视图: 当日比赛 + 8 家预测
-- ============================================================
-- 首页和"今日打脸海报生成"用
-- ============================================================

CREATE OR REPLACE VIEW v_today_matches AS
SELECT
  m.id                AS match_id,
  m.kickoff_at,
  m.stage,
  m.group_letter,
  ht.name_zh          AS home_name,
  ht.flag_emoji       AS home_flag,
  at.name_zh          AS away_name,
  at.flag_emoji       AS away_flag,
  m.venue,
  m.status,
  COUNT(p.id)         AS prediction_count,
  -- 八家平均置信度
  ROUND(AVG(p.confidence)::numeric, 1) AS avg_confidence,
  -- 是否分歧场次(>=3 家押对方)
  CASE WHEN COUNT(p.id) FILTER (WHERE p.outcome = 'home_win') >= 3
        AND COUNT(p.id) FILTER (WHERE p.outcome IN ('draw','away_win')) >= 3
       THEN true ELSE false
  END                  AS is_disputed
FROM matches m
LEFT JOIN teams ht ON ht.id = m.home_team_id
LEFT JOIN teams at ON at.id = m.away_team_id
LEFT JOIN predictions_l1 p ON p.match_id = m.id
WHERE m.kickoff_at >= now() - interval '6 hours'
  AND m.kickoff_at <= now() + interval '24 hours'
GROUP BY m.id, m.kickoff_at, m.stage, m.group_letter,
         ht.name_zh, ht.flag_emoji, at.name_zh, at.flag_emoji,
         m.venue, m.status
ORDER BY m.kickoff_at;

COMMENT ON VIEW v_today_matches IS '今日比赛 + 8 家预测概览,赛季中后期热点窗口用';


-- ============================================================
-- 便利视图: 即将开赛的比赛(首页主查询)
-- ============================================================
-- 不限"今日窗口",取所有尚未开赛的比赛按时间排序。
-- 首页 take 前 N 条;LIMIT 留到查询层做。
-- ============================================================

CREATE OR REPLACE VIEW v_upcoming_matches AS
SELECT
  m.id                AS match_id,
  m.kickoff_at,
  m.stage,
  m.group_letter,
  ht.name_zh          AS home_name,
  ht.name             AS home_name_en,
  ht.flag_emoji       AS home_flag,
  at.name_zh          AS away_name,
  at.name             AS away_name_en,
  at.flag_emoji       AS away_flag,
  m.venue,
  m.status,
  COUNT(p.id)         AS prediction_count,
  ROUND(AVG(p.confidence)::numeric, 1) AS avg_confidence,
  CASE WHEN COUNT(p.id) FILTER (WHERE p.outcome = 'home_win') >= 3
        AND COUNT(p.id) FILTER (WHERE p.outcome IN ('draw','away_win')) >= 3
       THEN true ELSE false
  END                  AS is_disputed
FROM matches m
LEFT JOIN teams ht ON ht.id = m.home_team_id
LEFT JOIN teams at ON at.id = m.away_team_id
LEFT JOIN predictions_l1 p ON p.match_id = m.id
WHERE m.kickoff_at > now()
  AND m.status <> 'finished'
GROUP BY m.id, m.kickoff_at, m.stage, m.group_letter,
         ht.name_zh, ht.name, ht.flag_emoji, at.name_zh, at.name, at.flag_emoji,
         m.venue, m.status
ORDER BY m.kickoff_at;

COMMENT ON VIEW v_upcoming_matches IS '即将开赛(kickoff_at > now)的比赛 + 预测概览,首页主查询';


-- ============================================================
-- 初始数据: 8 家 AI 模型
-- ============================================================

INSERT INTO ai_models (id, name, openrouter_id, persona_label, persona_quote, color_hex, country, founder) VALUES
  ('gpt',      'GPT-5',             'openai/gpt-5',                '全能学长 · 永远押热门',         '历史数据显示主队近五场...',     '#10a37f', 'USA',   'Sam Altman'),
  ('claude',   'Claude Sonnet 4.6', 'anthropic/claude-sonnet-4.6', '善于计算的工程男 · 推理最长',   '综合进攻效率、防守体系...',     '#7F77DD', 'USA',   'Dario Amodei'),
  ('gemini',   'Gemini 2.5 Pro',    'google/gemini-2.5-pro',       '资源最多的全能选手 · 自信过头', '根据全面分析,毫无疑问...',      '#378ADD', 'USA',   'Sundar Pichai'),
  ('grok',     'Grok 4.3',          'x-ai/grok-4.3',               '嘴臭天才 · 押冷门专业户',       '其他家都在说废话,我直说...',     '#888780', 'USA',   'Elon Musk'),
  ('deepseek', 'DeepSeek V4 Pro',   'deepseek/deepseek-v4-pro',    '沉默的黑马刺客 · 1/10 成本',    '(直接给结论,不解释)',           '#E24B4A', 'China', '梁文锋'),
  ('qwen',     'Qwen 3.6 Plus',     'qwen/qwen3.6-plus',           '卷王 · 偏爱亚洲球队',           '亚洲球队这次一定行...',         '#EF9F27', 'China', 'Alibaba'),
  ('llama',    'Llama 4 Maverick',  'meta-llama/llama-4-maverick', '开源平民英雄 · 10M 上下文',     '作为开源模型,我把分析全给你看', '#639922', 'Open',  'Mark Zuckerberg'),
  ('kimi',     'Kimi K2.6',         'moonshotai/kimi-k2.6',        '编程天才少年 · 迷之自信',       '这场比赛会有惊喜,相信我!',     '#D4537E', 'China', '杨植麟');


-- ============================================================
-- 9. api_call_logs - 每次 OpenRouter 调用日志
-- ============================================================
-- 监控可用性 + 成本追踪 + 失败诊断 + 数据稿件素材
-- 每次重试都写一行(同一次预测可能有 3 行 attempt=1/2/3)
-- ============================================================

CREATE TABLE api_call_logs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id        text NOT NULL REFERENCES ai_models(id),

  -- 调度上下文(任意一个为 NULL,看是哪一层的调用)
  match_id        text REFERENCES matches(id),               -- L1 调用关联的比赛
  layer           text NOT NULL,                             -- 'l1' / 'l2' / 'l3'
  group_letter    char(1),                                   -- L2 调用关联的小组
  prompt_version  text NOT NULL DEFAULT 'v1.0',

  -- 调用结果
  attempt         smallint NOT NULL,                         -- 1 / 2 / 3
  status          text NOT NULL,                             -- 'success' / 'timeout' / 'parse_error'
                                                             --  / 'rate_limit' / 'invalid_model'
                                                             --  / 'http_error' / 'empty_response'
                                                             --  / 'network_error'
  http_status     smallint,                                  -- HTTP 状态码(若有)
  error_message   text,                                      -- 错误详情(失败时)

  -- 性能指标
  latency_ms      integer,                                   -- 调用耗时
  prompt_tokens   integer,                                   -- usage.prompt_tokens
  completion_tokens integer,                                 -- usage.completion_tokens
  cost_usd        numeric(10, 6),                            -- 本次调用费用(OpenRouter generation API)

  called_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valid_layer CHECK (layer IN ('l1','l2','l3')),
  CONSTRAINT valid_attempt CHECK (attempt BETWEEN 1 AND 3),
  CONSTRAINT valid_log_status CHECK (status IN (
    'success','timeout','parse_error','rate_limit','invalid_model',
    'http_error','empty_response','network_error'
  ))
);

CREATE INDEX idx_api_logs_model_time ON api_call_logs(model_id, called_at DESC);
CREATE INDEX idx_api_logs_status ON api_call_logs(status) WHERE status <> 'success';
CREATE INDEX idx_api_logs_match ON api_call_logs(match_id) WHERE match_id IS NOT NULL;

COMMENT ON TABLE api_call_logs IS '每次 OpenRouter 调用日志,含重试。失败次数 = 内容素材';


-- ============================================================
-- 便利视图: 7 天模型可用性监控
-- ============================================================
-- 成功率 < 90% 时邮件提醒(通常意味着 model ID 又变了)
-- 「成功」按 attempt 维度统计:同一次预测哪怕第 3 次才成功,仍算最终成功
-- ============================================================

CREATE OR REPLACE VIEW v_model_reliability AS
WITH attempts AS (
  SELECT
    model_id,
    -- 同一次预测的所有 attempt 共享 (model_id, match_id, layer, called_at::date) 维度
    -- 这里简化为统计每次调用的最终成败
    COUNT(*) AS total_attempts,
    COUNT(*) FILTER (WHERE status = 'success') AS successful_attempts,
    COUNT(*) FILTER (WHERE status = 'timeout') AS timeout_count,
    COUNT(*) FILTER (WHERE status = 'parse_error') AS parse_error_count,
    COUNT(*) FILTER (WHERE status = 'rate_limit') AS rate_limit_count,
    COUNT(*) FILTER (WHERE status = 'invalid_model') AS invalid_model_count,
    COUNT(*) FILTER (WHERE status = 'empty_response') AS empty_response_count,
    AVG(latency_ms) FILTER (WHERE status = 'success') AS avg_latency_ms,
    SUM(cost_usd) AS total_cost_usd
  FROM api_call_logs
  WHERE called_at >= now() - interval '7 days'
  GROUP BY model_id
)
SELECT
  m.id                                                       AS model_id,
  m.name                                                     AS model_name,
  m.openrouter_id,
  COALESCE(a.total_attempts, 0)                              AS attempts_7d,
  COALESCE(a.successful_attempts, 0)                         AS successes_7d,
  CASE WHEN a.total_attempts > 0
    THEN ROUND(100.0 * a.successful_attempts / a.total_attempts, 1)
    ELSE NULL
  END                                                        AS success_rate_pct,
  COALESCE(a.timeout_count, 0)        AS timeouts,
  COALESCE(a.parse_error_count, 0)    AS parse_errors,
  COALESCE(a.rate_limit_count, 0)     AS rate_limits,
  COALESCE(a.invalid_model_count, 0)  AS invalid_model_errors,
  COALESCE(a.empty_response_count, 0) AS empty_responses,
  ROUND(a.avg_latency_ms)             AS avg_latency_ms,
  COALESCE(a.total_cost_usd, 0)       AS cost_7d_usd
FROM ai_models m
LEFT JOIN attempts a ON a.model_id = m.id
WHERE m.is_active = true
ORDER BY success_rate_pct ASC NULLS LAST;

COMMENT ON VIEW v_model_reliability IS '7 天模型可用性监控,成功率 <90% 时邮件提醒';


-- ============================================================
-- 完成提示
-- ============================================================
-- 执行完毕后:
-- 1. 检查 8 家 AI 模型已写入: SELECT * FROM ai_models;
-- 2. 接下来需要导入 teams 和 matches(从 wc2026_schedule.json,见 scripts/import_schedule.ts)
-- 3. predictions_l1/l2/l3 在批量调用 AI 后填充
-- 4. match_results 由比分抓取脚本写入(source='openfootball')
-- 5. prediction_scores 由赛后计算任务自动生成
-- 6. api_call_logs 由 OpenRouter client 每次调用写入

-- 数据库 schema 设计完成 ✓ (9 表 + 3 视图)
