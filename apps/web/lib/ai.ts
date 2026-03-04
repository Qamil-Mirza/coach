import type { AiProvider, ExtractActionsConfig } from "@coach/ai";

function parseAiProvider(value: string | undefined): AiProvider | undefined {
  if (value === "openai" || value === "ollama" || value === "heuristic") {
    return value;
  }
  return undefined;
}

export function getAiExtractionConfig(): ExtractActionsConfig {
  return {
    provider: parseAiProvider(process.env.AI_PROVIDER),
    openAiApiKey: process.env.OPENAI_API_KEY,
    openAiModel: process.env.OPENAI_MODEL,
    openAiBaseUrl: process.env.OPENAI_BASE_URL,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
    ollamaModel: process.env.OLLAMA_MODEL
  };
}
