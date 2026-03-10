// Agent session - creates a Pi SDK agent that scans a repo and produces a plan.
// Same pattern as hodor's agent.ts but with submit_plan instead of submit_review.

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { logger } from "./utils/logger.js";
import { exec } from "./utils/exec.js";
import { parseModelString, mapReasoningEffort, getApiKey } from "./model.js";
import { SUBMIT_PLAN_SCHEMA } from "./plan.js";
import { validatePlan } from "./validator.js";
import { DEPS_SYSTEM_PROMPT } from "./deps/system-prompt.js";
import { buildDepScanPrompt } from "./deps/prompt.js";
import type { Plan, Platform } from "./types.js";
import type { DepScanContext } from "./deps/types.js";

export interface AgentProgressEvent {
  type: "tool_start" | "tool_end" | "thinking" | "turn_start" | "turn_end" | "agent_start" | "agent_end" | "text_delta" | "thinking_delta";
  toolName?: string;
  toolArgs?: string;
  isError?: boolean;
  turnIndex?: number;
  delta?: string;
  result?: string;
}

export interface ScanResult {
  plan: Plan;
  metrics: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
    turns: number;
    toolCalls: number;
    durationSeconds: number;
  };
}

export async function scanRepo(opts: {
  repoDir: string;
  platform: Platform;
  projectUrl: string;
  defaultBranch: string;
  model?: string;
  reasoningEffort?: string;
  onEvent?: (event: AgentProgressEvent) => void;
}): Promise<ScanResult> {
  const {
    repoDir,
    platform,
    projectUrl,
    defaultBranch,
    model = "anthropic/claude-sonnet-4-20250514",
    reasoningEffort,
    onEvent,
  } = opts;

  logger.info(`Starting dep scan for: ${repoDir}`);

  // Preflight: validate model
  const parsed = parseModelString(model);
  const thinkingLevel = mapReasoningEffort(reasoningEffort);
  const apiKey = getApiKey(model);

  // Snapshot env vars
  const envSnapshot: Record<string, string | undefined> = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    AWS_REGION: process.env.AWS_REGION,
  };

  if (apiKey) {
    if (parsed.provider === "anthropic") process.env.ANTHROPIC_API_KEY = apiKey;
    else if (parsed.provider === "openai") process.env.OPENAI_API_KEY = apiKey;
  }

  // Import Pi SDK
  const {
    createAgentSession,
    DefaultResourceLoader,
    SessionManager,
    SettingsManager,
    createReadTool,
    createBashTool,
    createGrepTool,
    createFindTool,
    createLsTool,
  } = await import("@mariozechner/pi-coding-agent");
  const { getModel } = await import("@mariozechner/pi-ai");

  // Resolve model
  let piModel: ReturnType<typeof getModel>;
  if (parsed.modelId.startsWith("arn:")) {
    const arnParts = parsed.modelId.split(":");
    const region = arnParts.length >= 4 ? arnParts[3] : "us-east-1";
    if (!process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION) {
      process.env.AWS_REGION = region;
    }
    piModel = {
      id: parsed.modelId,
      name: parsed.modelId,
      api: "bedrock-converse-stream",
      provider: "amazon-bedrock",
      baseUrl: `https://bedrock-runtime.${region}.amazonaws.com`,
      reasoning: false,
      input: ["text"] as ("text" | "image")[],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 16384,
    } as ReturnType<typeof getModel>;
  } else {
    piModel = getModel(parsed.provider as "anthropic", parsed.modelId as never);
  }
  logger.info(`Model resolved: ${piModel.name}`);

  // Gather existing state for the prompt
  const existingMrs = await gatherExistingMrs(repoDir, platform, projectUrl);
  const existingIssues = await gatherExistingIssues(repoDir, platform, projectUrl);

  const scanContext: DepScanContext = {
    repoDir,
    projectUrl,
    defaultBranch,
    platform,
    existingMrs,
    existingIssues,
  };

  const prompt = buildDepScanPrompt(scanContext);

  // Create agent session
  const startTime = Date.now();
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd: repoDir,
    settingsManager,
    systemPrompt: DEPS_SYSTEM_PROMPT,
    appendSystemPrompt: "",
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    agentsFilesOverride: () => ({ agentsFiles: [] }),
  });
  await resourceLoader.reload();

  let submittedPlan: Plan | null = null;
  let submitPlanCalls = 0;
  const MAX_SUBMIT_ATTEMPTS = 3;

  const submitPlanTool: ToolDefinition = {
    name: "submit_plan",
    label: "Submit Plan",
    description: "Submit the final dependency update plan after analysis is complete. The plan will be validated immediately. If validation fails, you will receive the errors and must fix and resubmit.",
    parameters: SUBMIT_PLAN_SCHEMA,
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      submitPlanCalls++;

      if (submittedPlan) {
        logger.warn("Agent called submit_plan after a valid plan was already accepted; ignoring");
        return {
          content: [{ type: "text", text: "A valid plan was already accepted. Do not call submit_plan again." }],
          details: { ignoredDuplicate: true },
        };
      }

      if (submitPlanCalls > MAX_SUBMIT_ATTEMPTS) {
        logger.error(`Agent exceeded max submit attempts (${MAX_SUBMIT_ATTEMPTS})`);
        return {
          content: [{ type: "text", text: `Too many submission attempts (${submitPlanCalls}/${MAX_SUBMIT_ATTEMPTS}). Stop trying and explain the issues.` }],
          details: { tooManyAttempts: true },
        };
      }

      const candidate = params as Plan;
      const result = validatePlan(candidate);

      if (!result.valid) {
        const errorLines = result.errors.map((e) => {
          const loc = e.action_index >= 0 ? `action[${e.action_index}].${e.field}` : e.field;
          return `- ${loc}: ${e.message}`;
        });
        const warningLines = result.warnings.map((w) => `- WARNING: ${w}`);
        const feedback = [
          `Plan validation FAILED (attempt ${submitPlanCalls}/${MAX_SUBMIT_ATTEMPTS}). Fix the following errors and call submit_plan again:`,
          "",
          ...errorLines,
          ...(warningLines.length > 0 ? ["", ...warningLines] : []),
        ].join("\n");

        logger.warn(`submit_plan attempt ${submitPlanCalls} failed validation: ${result.errors.length} error(s)`);
        return {
          content: [{ type: "text", text: feedback }],
          details: { validationErrors: result.errors, validationWarnings: result.warnings },
        };
      }

      // Validation passed
      if (result.warnings.length > 0) {
        logger.info(`Plan accepted with ${result.warnings.length} warning(s)`);
      }
      submittedPlan = candidate;
      logger.info(`Received valid plan via submit_plan (${submittedPlan.actions.length} action(s))`);
      return {
        content: [{ type: "text", text: "Plan validated and accepted. Do not output the plan as normal text." }],
        details: { warnings: result.warnings },
      };
    },
  };

  const { session } = await createAgentSession({
    cwd: repoDir,
    model: piModel,
    thinkingLevel,
    tools: [
      createReadTool(repoDir),
      createBashTool(repoDir),
      createGrepTool(repoDir),
      createFindTool(repoDir),
      createLsTool(repoDir),
    ],
    customTools: [submitPlanTool],
    sessionManager: SessionManager.inMemory(),
    settingsManager,
    resourceLoader,
  });

  // Subscribe to events
  let turnCount = 0;
  let toolCallCount = 0;

  session.subscribe((event) => {
    switch (event.type) {
      case "agent_start":
        onEvent?.({ type: "agent_start" });
        break;
      case "agent_end":
        onEvent?.({ type: "agent_end" });
        break;
      case "turn_start":
        turnCount++;
        onEvent?.({ type: "turn_start", turnIndex: turnCount });
        break;
      case "turn_end":
        onEvent?.({ type: "turn_end", turnIndex: turnCount });
        break;
      case "tool_execution_start":
        toolCallCount++;
        onEvent?.({
          type: "tool_start",
          toolName: event.toolName,
          toolArgs: formatToolArgs(event.toolName, event.args, repoDir),
        });
        break;
      case "tool_execution_end":
        onEvent?.({
          type: "tool_end",
          toolName: event.toolName,
          isError: event.isError,
          result: formatToolResult(event.result),
        });
        break;
      case "message_update": {
        const msgEvent = (event as Record<string, unknown>).assistantMessageEvent as
          { type: string; delta?: string } | undefined;
        if (!msgEvent?.delta) break;
        if (msgEvent.type === "text_delta") {
          onEvent?.({ type: "text_delta", delta: msgEvent.delta });
        } else if (msgEvent.type === "thinking_delta") {
          onEvent?.({ type: "thinking_delta", delta: msgEvent.delta });
        }
        break;
      }
    }
  });

  logger.info("Sending prompt to agent...");
  await session.prompt(prompt);

  // Check for errors
  const agentError = (session as unknown as { state: { error?: string } }).state?.error;
  if (agentError) {
    throw new Error(`LLM request failed: ${agentError}`);
  }

  if (!submittedPlan) {
    if (submitPlanCalls > 0) {
      throw new Error("Agent called submit_plan but did not provide a valid plan payload");
    }
    throw new Error("Agent did not call submit_plan");
  }

  const durationSeconds = (Date.now() - startTime) / 1000;

  // Aggregate usage
  interface MsgUsage { input: number; output: number; totalTokens: number; cost: { total: number } }
  interface AssistantMsg { role: string; usage?: MsgUsage }
  const allMessages = (session as unknown as { state: { messages: AssistantMsg[] } }).state?.messages ?? [];

  let inputTokens = 0, outputTokens = 0, totalTokens = 0, cost = 0;
  for (const msg of allMessages) {
    if (msg.role === "assistant" && msg.usage) {
      inputTokens += msg.usage.input ?? 0;
      outputTokens += msg.usage.output ?? 0;
      totalTokens += msg.usage.totalTokens ?? 0;
      cost += msg.usage.cost?.total ?? 0;
    }
  }

  // Restore env
  for (const [key, val] of Object.entries(envSnapshot)) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }

  return {
    plan: submittedPlan,
    metrics: { inputTokens, outputTokens, totalTokens, cost, turns: turnCount, toolCalls: toolCallCount, durationSeconds: Math.round(durationSeconds) },
  };
}

// --- Helpers ---

async function gatherExistingMrs(repoDir: string, platform: Platform, projectUrl: string): Promise<string> {
  try {
    if (platform === "gitlab" && projectUrl) {
      const { stdout } = await exec("glab", [
        "mr", "list", "--label=quartermaster", "--state=opened", "--output=json",
      ], { cwd: repoDir });
      return stdout.trim() || "None found.";
    }
    if (platform === "github") {
      const { stdout } = await exec("gh", [
        "pr", "list", "--label=quartermaster", "--state=open", "--json=number,title,headRefName,url",
      ], { cwd: repoDir });
      return stdout.trim() || "None found.";
    }
  } catch (err) {
    logger.warn(`Failed to gather existing MRs: ${err}`);
  }
  return "Could not query existing MRs (auth may not be configured).";
}

async function gatherExistingIssues(repoDir: string, platform: Platform, projectUrl: string): Promise<string> {
  try {
    if (platform === "gitlab" && projectUrl) {
      const { stdout } = await exec("glab", [
        "issue", "list", "--label=quartermaster", "--state=opened", "--output=json",
      ], { cwd: repoDir });
      return stdout.trim() || "None found.";
    }
    if (platform === "github") {
      const { stdout } = await exec("gh", [
        "issue", "list", "--label=quartermaster", "--state=open", "--json=number,title,url",
      ], { cwd: repoDir });
      return stdout.trim() || "None found.";
    }
  } catch (err) {
    logger.warn(`Failed to gather existing issues: ${err}`);
  }
  return "Could not query existing issues (auth may not be configured).";
}

function formatToolArgs(_toolName: string, args: unknown, repoDir: string): string {
  if (typeof args === "string") return args.slice(0, 200);
  const obj = args as Record<string, unknown> | undefined;
  if (!obj) return "";
  if (obj.command) {
    return String(obj.command)
      .replace(new RegExp(`cd ${repoDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} && `), "")
      .slice(0, 200);
  }
  if (obj.pattern) {
    const path = obj.path ? ` in ${obj.path}` : "";
    return `${obj.pattern}${path}`;
  }
  if (obj.path || obj.file_path) return String(obj.path ?? obj.file_path);
  return JSON.stringify(obj).slice(0, 200);
}

function formatToolResult(result: unknown): string {
  if (typeof result === "string") return result;
  const obj = result as Record<string, unknown> | undefined;
  if (!obj) return "";
  const content = obj.content as Array<{ type?: string; text?: string }> | undefined;
  if (Array.isArray(content)) {
    return content.filter((c) => c.type === "text" && c.text).map((c) => c.text).join("\n");
  }
  return JSON.stringify(result)?.slice(0, 500) ?? "";
}
