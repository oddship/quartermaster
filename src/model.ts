// Model resolution - same pattern as hodor.
// Supports anthropic/model-name, bedrock ARNs, auto-detection.

export interface ParsedModel {
  provider: string;
  modelId: string;
}

export function parseModelString(model: string): ParsedModel {
  const trimmed = model.trim();
  if (!trimmed) throw new Error("Model name must be provided");

  const parts = trimmed.split("/");

  if (parts.length >= 2) {
    const first = parts[0].toLowerCase();
    if (first === "bedrock") {
      let modelId = parts.slice(1).join("/");
      if (modelId.startsWith("converse/")) {
        modelId = modelId.slice("converse/".length);
      }
      return { provider: "amazon-bedrock", modelId };
    }
    if (["anthropic", "openai"].includes(first)) {
      return { provider: first, modelId: parts.slice(1).join("/") };
    }
  }

  const lower = trimmed.toLowerCase();
  if (lower.includes("claude") || lower.includes("anthropic")) {
    return { provider: "anthropic", modelId: trimmed };
  }
  if (lower.startsWith("gpt") || lower.startsWith("o1") || lower.startsWith("o3") || lower.startsWith("o4")) {
    return { provider: "openai", modelId: trimmed };
  }

  return { provider: "anthropic", modelId: trimmed };
}

export function mapReasoningEffort(
  effort: string | undefined,
): "low" | "medium" | "high" | undefined {
  if (!effort) return undefined;
  switch (effort.toLowerCase()) {
    case "low": return "low";
    case "medium": return "medium";
    case "high":
    case "xhigh": return "high";
    default: return undefined;
  }
}

export function getApiKey(model?: string): string | null {
  const llmKey = process.env.LLM_API_KEY;
  if (llmKey) return llmKey;

  if (model) {
    const { provider } = parseModelString(model);
    if (provider === "amazon-bedrock") return null;
    if (provider === "anthropic") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (key) return key;
    }
    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (key) return key;
    }
  }

  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;

  // Don't throw - Pi SDK OAuth may handle auth transparently
  return null;
}
