// Agent session - creates a Pi SDK agent that scans a repo and produces a plan.
// Mission-agnostic: the mission provides the system prompt, skills, and context.

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { logger } from "./utils/logger.js";
import { parseModelString, mapReasoningEffort } from "./model.js";
import { SUBMIT_PLAN_SCHEMA } from "./plan.js";
import { validatePlan } from "./validator.js";
import type { Mission } from "./mission.js";
import type { Plan, Platform } from "./types.js";

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
  mission: Mission;
  repoDir: string;
  platform: Platform;
  projectUrl: string;
  defaultBranch: string;
  model?: string;
  reasoningEffort?: string;
  onEvent?: (event: AgentProgressEvent) => void;
}): Promise<ScanResult> {
  const {
    mission,
    repoDir,
    platform,
    projectUrl,
    defaultBranch,
    model = "anthropic/claude-sonnet-4-20250514",
    reasoningEffort,
    onEvent,
  } = opts;

  logger.info(`Starting ${mission.name} scan for: ${repoDir}`);

  // Preflight: validate model
  const parsed = parseModelString(model);
  const thinkingLevel = mapReasoningEffort(reasoningEffort);

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

  // Gather mission-specific context and build prompt
  const missionContext = await mission.gatherContext({ repoDir, platform, projectUrl, defaultBranch });
  const prompt = mission.buildPrompt(missionContext);

  // Create agent session
  const startTime = Date.now();
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
  });

  const resourceLoader = new DefaultResourceLoader({
    cwd: repoDir,
    settingsManager,
    systemPrompt: mission.systemPrompt,
    appendSystemPrompt: "",
    noExtensions: true,
    noSkills: false,
    noPromptTemplates: true,
    noThemes: true,
    additionalSkillPaths: [mission.skillsDir],
    agentsFilesOverride: () => ({ agentsFiles: [] }),
  });
  await resourceLoader.reload();

  const { skills } = resourceLoader.getSkills();
  if (skills.length > 0) {
    logger.info(`Loaded ${skills.length} skill(s): ${skills.map((s) => s.name).join(", ")}`);
  }

  let submittedPlan: Plan | null = null;
  let submitPlanCalls = 0;
  const MAX_SUBMIT_ATTEMPTS = 3;

  // Pass mission allowlist to validator
  const validateWithAllowlist = (plan: Plan) => validatePlan(plan, mission.allowlist);

  const submitPlanTool: ToolDefinition = {
    name: "submit_plan",
    label: "Submit Plan",
    description: "Submit the final action plan after analysis is complete. The plan will be validated immediately. If validation fails, you will receive the errors and must fix and resubmit.",
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
      const result = validateWithAllowlist(candidate);

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

  // Retry on transient LLM errors (e.g. JSON parse failures in tool calls).
  // The session keeps its state, so a retry continues the conversation.
  // We tell the agent exactly what went wrong so it can fix the JSON.
  const MAX_PROMPT_RETRIES = 2;
  let lastError = "";
  for (let attempt = 0; attempt <= MAX_PROMPT_RETRIES; attempt++) {
    let nextPrompt: string;
    if (attempt === 0) {
      nextPrompt = prompt;
    } else {
      nextPrompt = [
        `Your previous submit_plan tool call failed with this error: ${lastError}`,
        "",
        "This is a JSON formatting issue, not a content issue. Your plan content was fine.",
        "Please call submit_plan again with valid JSON. Common causes:",
        "- Unescaped newlines inside string values (use \\n instead)",
        "- Trailing commas after the last item in arrays or objects",
        "- Unescaped quotes inside string values",
        "",
        "Keep the plan exactly the same, just ensure the JSON is well-formed.",
      ].join("\n");
    }

    await session.prompt(nextPrompt);

    const agentError = (session as unknown as { state: { error?: string } }).state?.error;
    if (agentError) {
      if (attempt < MAX_PROMPT_RETRIES && /parse|json|malformed/i.test(agentError)) {
        lastError = agentError;
        logger.warn(`LLM error (attempt ${attempt + 1}/${MAX_PROMPT_RETRIES + 1}), retrying: ${agentError}`);
        // Clear the error so the session can continue
        (session as unknown as { state: { error?: string } }).state.error = undefined;
        continue;
      }
      throw new Error(`LLM request failed: ${agentError}`);
    }

    // If we got a plan, break out
    if (submittedPlan) break;
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

  return {
    plan: submittedPlan,
    metrics: { inputTokens, outputTokens, totalTokens, cost, turns: turnCount, toolCalls: toolCallCount, durationSeconds: Math.round(durationSeconds) },
  };
}

// --- Helpers ---

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
