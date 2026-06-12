import type { ModelInfo } from "../../types/provider.js";

export const ANTHROPIC_MODELS: ModelInfo[] = [
  { id: "claude-sonnet-4-20250514", displayName: "Claude Sonnet 4", contextWindow: 200000, supportsTools: true },
  { id: "claude-3-5-sonnet-latest", displayName: "Claude 3.5 Sonnet", contextWindow: 200000, supportsTools: true, supportsVision: true },
  { id: "claude-3-opus-latest", displayName: "Claude 3 Opus", contextWindow: 200000, supportsTools: true, supportsVision: true },
  { id: "claude-3-5-haiku-latest", displayName: "Claude 3.5 Haiku", contextWindow: 200000, supportsTools: true },
];
