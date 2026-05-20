// 与 schema_v1.sql 的 ai_models INSERT 对齐,与 poc_experiment_v5.html 的 MODELS 一致。
// 加新模型时同步更新 schema + 这里。

export type AiModelId =
  | 'gpt' | 'claude' | 'gemini' | 'grok'
  | 'deepseek' | 'qwen' | 'llama' | 'glm';

export interface AiModel {
  id: AiModelId;
  name: string;
  openrouter: string;
  colorHex: string;
  // 官方 logo,放在 public/ai-logos/{id}.svg,用 <img> 渲染
  logo: string;
  country: 'USA' | 'China' | 'Open';
  founder: string;
}

export const AI_MODELS: AiModel[] = [
  { id: 'gpt',      name: 'GPT-5.5',           openrouter: 'openai/gpt-5.5',              colorHex: '#10a37f', logo: '/ai-logos/gpt.svg',      country: 'USA',   founder: 'Sam Altman'     },
  { id: 'claude',   name: 'Claude Sonnet 4.6', openrouter: 'anthropic/claude-sonnet-4.6', colorHex: '#7F77DD', logo: '/ai-logos/claude.svg',   country: 'USA',   founder: 'Dario Amodei'   },
  { id: 'gemini',   name: 'Gemini 3.5 Flash',  openrouter: 'google/gemini-3.5-flash',     colorHex: '#378ADD', logo: '/ai-logos/gemini.svg',   country: 'USA',   founder: 'Sundar Pichai'  },
  { id: 'grok',     name: 'Grok 4.3',          openrouter: 'x-ai/grok-4.3',               colorHex: '#888780', logo: '/ai-logos/grok.svg',     country: 'USA',   founder: 'Elon Musk'      },
  { id: 'deepseek', name: 'DeepSeek V4 Pro',   openrouter: 'deepseek/deepseek-v4-pro',    colorHex: '#E24B4A', logo: '/ai-logos/deepseek.svg', country: 'China', founder: '梁文锋'         },
  { id: 'qwen',     name: 'Qwen 3.6 Plus',     openrouter: 'qwen/qwen3.6-plus',           colorHex: '#EF9F27', logo: '/ai-logos/qwen.svg',     country: 'China', founder: 'Alibaba'        },
  { id: 'llama',    name: 'Llama 4 Maverick',  openrouter: 'meta-llama/llama-4-maverick', colorHex: '#639922', logo: '/ai-logos/llama.svg',    country: 'Open',  founder: 'Mark Zuckerberg'},
  { id: 'glm',      name: 'GLM-5.1',           openrouter: 'z-ai/glm-5.1',                colorHex: '#504AF4', logo: '/ai-logos/glm.svg',      country: 'China', founder: '张鹏'           },
];

export const MODELS_BY_ID = Object.fromEntries(AI_MODELS.map(m => [m.id, m])) as Record<AiModelId, AiModel>;
