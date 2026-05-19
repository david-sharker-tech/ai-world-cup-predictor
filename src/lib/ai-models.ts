// 与 schema_v1.sql 的 ai_models INSERT 对齐,与 poc_experiment_v5.html 的 MODELS 一致。
// 加新模型时同步更新 schema + 这里。

export type AiModelId =
  | 'gpt' | 'claude' | 'gemini' | 'grok'
  | 'deepseek' | 'qwen' | 'llama' | 'kimi';

export interface AiModel {
  id: AiModelId;
  name: string;
  openrouter: string;
  colorHex: string;
  country: 'USA' | 'China' | 'Open';
  founder: string;
}

export const AI_MODELS: AiModel[] = [
  { id: 'gpt',      name: 'GPT-5',             openrouter: 'openai/gpt-5',                colorHex: '#10a37f', country: 'USA',   founder: 'Sam Altman'     },
  { id: 'claude',   name: 'Claude Sonnet 4.6', openrouter: 'anthropic/claude-sonnet-4.6', colorHex: '#7F77DD', country: 'USA',   founder: 'Dario Amodei'   },
  { id: 'gemini',   name: 'Gemini 2.5 Pro',    openrouter: 'google/gemini-2.5-pro',       colorHex: '#378ADD', country: 'USA',   founder: 'Sundar Pichai'  },
  { id: 'grok',     name: 'Grok 4.3',          openrouter: 'x-ai/grok-4.3',               colorHex: '#888780', country: 'USA',   founder: 'Elon Musk'      },
  { id: 'deepseek', name: 'DeepSeek V4 Pro',   openrouter: 'deepseek/deepseek-v4-pro',    colorHex: '#E24B4A', country: 'China', founder: '梁文锋'         },
  { id: 'qwen',     name: 'Qwen 3.6 Plus',     openrouter: 'qwen/qwen3.6-plus',           colorHex: '#EF9F27', country: 'China', founder: 'Alibaba'        },
  { id: 'llama',    name: 'Llama 4 Maverick',  openrouter: 'meta-llama/llama-4-maverick', colorHex: '#639922', country: 'Open',  founder: 'Mark Zuckerberg'},
  { id: 'kimi',     name: 'Kimi K2.6',         openrouter: 'moonshotai/kimi-k2.6',        colorHex: '#D4537E', country: 'China', founder: '杨植麟'         },
];

export const MODELS_BY_ID = Object.fromEntries(AI_MODELS.map(m => [m.id, m])) as Record<AiModelId, AiModel>;
