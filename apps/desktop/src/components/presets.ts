export interface ProviderPreset {
  id: string;          // "minimax", "kimi", "zhipu", etc.
  label: string;       // "MiniMax", "Kimi / Moonshot"
  baseUrl: string;     // "https://api.minimax.io/v1"
  risk: "low" | "medium" | "high";
  modelExamples: string[]; // ["abab6.5s-chat"]
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: "custom", label: "Custom Endpoint", baseUrl: "", risk: "low", modelExamples: [] },
  { id: "minimax", label: "MiniMax", baseUrl: "https://api.minimax.io/v1", risk: "medium", modelExamples: ["abab6.5s-chat"] },
  { id: "kimi", label: "Kimi / Moonshot", baseUrl: "https://api.moonshot.cn/v1", risk: "low", modelExamples: ["moonshot-v1-8k"] },
  { id: "zhipu", label: "Zhipu BigModel", baseUrl: "https://open.bigmodel.cn/api/paas/v4", risk: "medium", modelExamples: ["glm-4-flash"] },
  { id: "zai", label: "Z.AI / GLM", baseUrl: "https://api.z.ai/api/paas/v4", risk: "medium", modelExamples: ["glm-4"] },
  { id: "siliconflow", label: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", risk: "low", modelExamples: ["deepseek-ai/DeepSeek-V3"] },
  { id: "qwen", label: "Qwen / DashScope", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", risk: "medium", modelExamples: ["qwen-turbo"] },
];
