// Model resolution - thin wrapper around Pi SDK's getModel/getEnvApiKey.
// Parses "provider/model-id" strings and delegates to Pi SDK.

export interface ParsedModel {
  provider: string;
  modelId: string;
}

/**
 * Parse a model string like "anthropic/claude-sonnet-4-6" or "google/gemini-2.5-flash"
 * into provider + modelId. Falls back to auto-detection from the model name.
 */
export function parseModelString(model: string): ParsedModel {
  const trimmed = model.trim();
  if (!trimmed) throw new Error("Model name must be provided");

  const slashIndex = trimmed.indexOf("/");
  if (slashIndex > 0) {
    const first = trimmed.slice(0, slashIndex).toLowerCase();
    const rest = trimmed.slice(slashIndex + 1);

    // Handle bedrock ARN-style: bedrock/converse/arn:...
    if (first === "bedrock") {
      const modelId = rest.startsWith("converse/") ? rest.slice("converse/".length) : rest;
      return { provider: "amazon-bedrock", modelId };
    }

    // Known providers - pass through
    const knownProviders = [
      "anthropic", "openai", "google", "amazon-bedrock",
      "google-vertex", "groq", "mistral", "openrouter", "xai",
    ];
    if (knownProviders.includes(first)) {
      return { provider: first, modelId: rest };
    }
  }

  // Auto-detect from model name
  const lower = trimmed.toLowerCase();
  if (lower.includes("claude") || lower.includes("anthropic")) {
    return { provider: "anthropic", modelId: trimmed };
  }
  if (lower.startsWith("gemini")) {
    return { provider: "google", modelId: trimmed };
  }
  if (lower.startsWith("gpt") || lower.startsWith("o1") || lower.startsWith("o3") || lower.startsWith("o4")) {
    return { provider: "openai", modelId: trimmed };
  }

  // Default to anthropic
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
