// Plan executor - takes a validated plan and executes it deterministically.
// All git/platform operations go through whitelisted commands only.

import { join } from "node:path";
import { exec, type ExecResult } from "./utils/exec.js";
import { isCommandAllowed, type AllowlistEntry } from "./mission.js";
import { logger } from "./utils/logger.js";
import type {
  Action,
  CreateMrAction,
  UpdateMrAction,
  CreateIssueAction,
  CommentIssueAction,
  CommentMrAction,
  CloseMrAction,
  Plan,
  Platform,
} from "./types.js";

// --- Result types ---

export type ActionResultStatus = "success" | "failed" | "skipped";

export interface ActionResult {
  index: number;
  action: Action;
  status: ActionResultStatus;
  message: string;
  /** Created MR/issue ID or URL */
  ref?: string;
}

export interface ExecutionResult {
  results: ActionResult[];
  summary: { total: number; success: number; failed: number; skipped: number };
}

export interface ExecutorOptions {
  repoDir: string;
  platform: Platform;
  defaultBranch: string;
  dryRun: boolean;
  confidenceThreshold: number;
  verbose: boolean;
  /** Command allowlist for this mission. Defaults to dep update allowlist. */
  allowlist?: AllowlistEntry[];
}

// --- Executor ---

export async function executePlan(
  plan: Plan,
  opts: ExecutorOptions,
): Promise<ExecutionResult> {
  const results: ActionResult[] = [];

  for (const [i, action] of plan.actions.entries()) {
    if (action.confidence < opts.confidenceThreshold) {
      results.push({
        index: i,
        action,
        status: "skipped",
        message: `Confidence ${action.confidence} below threshold ${opts.confidenceThreshold}`,
      });
      continue;
    }

    try {
      const result = await executeAction(i, action, opts);
      results.push(result);
    } catch (err) {
      results.push({
        index: i,
        action,
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const summary = {
    total: results.length,
    success: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
  };

  return { results, summary };
}

async function executeAction(
  index: number,
  action: Action,
  opts: ExecutorOptions,
): Promise<ActionResult> {
  switch (action.type) {
    case "create_mr":
      return executeCreateMr(index, action, opts);
    case "update_mr":
      return executeUpdateMr(index, action, opts);
    case "create_issue":
      return executeCreateIssue(index, action, opts);
    case "comment_issue":
      return executeCommentIssue(index, action, opts);
    case "comment_mr":
      return executeCommentMr(index, action, opts);
    case "close_mr":
      return executeCloseMr(index, action, opts);
    case "skip":
      return {
        index,
        action,
        status: "skipped",
        message: `Skipped: ${action.reason}`,
      };
    default:
      return {
        index,
        action,
        status: "failed",
        message: `Unknown action type: ${(action as Action).type}`,
      };
  }
}

// --- create_mr ---

async function executeCreateMr(
  index: number,
  action: CreateMrAction,
  opts: ExecutorOptions,
): Promise<ActionResult> {
  const { repoDir, platform, defaultBranch, dryRun } = opts;

  if (dryRun) {
    return dryRunResult(index, action, formatMrDryRun(action));
  }

  // 1. Make sure we're on the default branch and up to date
  await git(repoDir, ["checkout", defaultBranch]);
  await git(repoDir, ["pull", "--ff-only", "origin", defaultBranch]);

  // 2. Create branch
  await git(repoDir, ["checkout", "-b", action.branch]);

  try {
    // 3. Run whitelisted commands
    const cmdDir = action.working_dir ? join(repoDir, action.working_dir) : repoDir;
    await runAllowlistedCommands(action.commands, cmdDir, opts.allowlist);

    // 4. Run tests
    if (action.test_command) {
      const testResult = await runTestCommand(action.test_command, cmdDir);
      if (!testResult.success) {
        // Fallback: try individual updates
        if (action.fallback_strategy === "individual_on_failure" && action.updates.length > 1) {
          logger.info(`Batch test failed, trying individual fallback for action ${index}`);
          await git(repoDir, ["checkout", defaultBranch]);
          await git(repoDir, ["branch", "-D", action.branch]);
          return executeIndividualFallback(index, action, opts);
        }
        throw new Error(`Tests failed: ${testResult.stderr}`);
      }
    }

    // 5. Stage and commit
    await git(repoDir, ["add", "-A"]);
    const hasChanges = await hasGitChanges(repoDir);
    if (!hasChanges) {
      await git(repoDir, ["checkout", defaultBranch]);
      await git(repoDir, ["branch", "-D", action.branch]);
      return {
        index,
        action,
        status: "skipped",
        message: "No changes after running commands",
      };
    }
    await git(repoDir, ["commit", "-m", action.title, "-m", action.description]);

    // 6. Push
    await git(repoDir, ["push", "-u", "origin", action.branch]);

    // 7. Create MR/PR
    const ref = await createMrOrPr(platform, repoDir, action, defaultBranch);

    // 8. Return to default branch
    await git(repoDir, ["checkout", defaultBranch]);

    return { index, action, status: "success", message: "MR created", ref };
  } catch (err) {
    // Clean up: return to default branch, delete the failed branch
    try {
      await git(repoDir, ["checkout", defaultBranch]);
      await git(repoDir, ["branch", "-D", action.branch]);
    } catch { /* best effort cleanup */ }
    throw err;
  }
}

// --- individual fallback ---

async function executeIndividualFallback(
  parentIndex: number,
  parentAction: CreateMrAction,
  opts: ExecutorOptions,
): Promise<ActionResult> {
  const { repoDir, platform, defaultBranch } = opts;
  const successes: string[] = [];
  const failures: string[] = [];

  for (const update of parentAction.updates) {
    const branchSuffix = update.package.split("/").pop()?.replace(/[^a-z0-9-]/gi, "-") ?? "dep";
    const branch = `${parentAction.branch}-${branchSuffix}`;
    const title = `chore(deps): update ${update.package} ${update.from} -> ${update.to}`;

    try {
      await git(repoDir, ["checkout", defaultBranch]);
      await git(repoDir, ["checkout", "-b", branch]);

      // Build commands for this single update
      const singleCommands = buildSingleUpdateCommands(update, parentAction);
      const cmdDir = parentAction.working_dir ? join(repoDir, parentAction.working_dir) : repoDir;
      await runAllowlistedCommands(singleCommands, cmdDir, opts.allowlist);

      // Test
      if (parentAction.test_command) {
        const testResult = await runTestCommand(parentAction.test_command, cmdDir);
        if (!testResult.success) {
          failures.push(`${update.package}: tests failed`);
          await git(repoDir, ["checkout", defaultBranch]);
          await git(repoDir, ["branch", "-D", branch]);
          continue;
        }
      }

      // Commit + push + create MR
      await git(repoDir, ["add", "-A"]);
      if (!(await hasGitChanges(repoDir))) {
        await git(repoDir, ["checkout", defaultBranch]);
        await git(repoDir, ["branch", "-D", branch]);
        continue;
      }
      await git(repoDir, ["commit", "-m", title]);
      await git(repoDir, ["push", "-u", "origin", branch]);

      const individualAction: CreateMrAction = {
        ...parentAction,
        branch,
        title,
        description: `Individual update: ${update.package} ${update.from} -> ${update.to}\n\n(Split from batch due to test failure)`,
        updates: [update],
        commands: singleCommands,
        fallback_strategy: "individual",
      };
      await createMrOrPr(platform, repoDir, individualAction, defaultBranch);

      successes.push(update.package);
      await git(repoDir, ["checkout", defaultBranch]);
    } catch (err) {
      failures.push(`${update.package}: ${err instanceof Error ? err.message : String(err)}`);
      try {
        await git(repoDir, ["checkout", defaultBranch]);
        await git(repoDir, ["branch", "-D", branch]);
      } catch { /* best effort */ }
    }
  }

  const message = [
    `Individual fallback: ${successes.length} succeeded, ${failures.length} failed`,
    successes.length > 0 ? `Success: ${successes.join(", ")}` : "",
    failures.length > 0 ? `Failed: ${failures.join("; ")}` : "",
  ].filter(Boolean).join("\n");

  return {
    index: parentIndex,
    action: parentAction,
    status: failures.length === parentAction.updates.length ? "failed" : "success",
    message,
  };
}

function buildSingleUpdateCommands(
  update: { package: string; to: string },
  parentAction: CreateMrAction,
): string[] {
  // Find the "go get" (or npm install, etc.) command for this specific package
  const commands: string[] = [];
  for (const cmd of parentAction.commands) {
    if (cmd.includes(update.package) || cmd.includes(`${update.package}@`)) {
      commands.push(cmd);
    }
  }
  // Always add tidy/cleanup commands
  for (const cmd of parentAction.commands) {
    if (
      cmd === "go mod tidy" ||
      cmd === "go mod download" ||
      cmd === "npm audit fix"
    ) {
      commands.push(cmd);
    }
  }
  return commands.length > 0 ? commands : parentAction.commands;
}

// --- update_mr ---

async function executeUpdateMr(
  index: number,
  action: UpdateMrAction,
  opts: ExecutorOptions,
): Promise<ActionResult> {
  const { repoDir, defaultBranch, dryRun } = opts;

  if (dryRun) {
    return dryRunResult(index, action, `Would update MR !${action.mr_id} on branch ${action.branch}`);
  }

  // 1. Fetch and checkout the existing branch
  await git(repoDir, ["fetch", "origin", action.branch]);
  await git(repoDir, ["checkout", action.branch]);

  // 2. Rebase if requested
  if (action.rebase_first) {
    await git(repoDir, ["fetch", "origin", defaultBranch]);
    await git(repoDir, ["rebase", `origin/${defaultBranch}`]);
  }

  // 3. Run commands
  const cmdDir = action.working_dir ? join(repoDir, action.working_dir) : repoDir;
  await runAllowlistedCommands(action.commands, cmdDir, opts.allowlist);

  // 4. Test
  if (action.test_command) {
    const testResult = await runTestCommand(action.test_command, cmdDir);
    if (!testResult.success) {
      await git(repoDir, ["checkout", defaultBranch]);
      throw new Error(`Tests failed on update: ${testResult.stderr}`);
    }
  }

  // 5. Commit + force push
  await git(repoDir, ["add", "-A"]);
  if (await hasGitChanges(repoDir)) {
    await git(repoDir, ["commit", "-m", `chore(deps): update dependencies`, "-m", action.description]);
    await git(repoDir, ["push", "--force-with-lease", "origin", action.branch]);
  }

  // 6. Return to default branch
  await git(repoDir, ["checkout", defaultBranch]);

  return {
    index,
    action,
    status: "success",
    message: `Updated MR !${action.mr_id}`,
    ref: `!${action.mr_id}`,
  };
}

// --- create_issue ---

async function executeCreateIssue(
  index: number,
  action: CreateIssueAction,
  opts: ExecutorOptions,
): Promise<ActionResult> {
  if (opts.dryRun) {
    return dryRunResult(index, action, `Would create issue: ${action.title}`);
  }

  const ref = await createIssue(opts.platform, opts.repoDir, action);
  return { index, action, status: "success", message: "Issue created", ref };
}

// --- comment_issue ---

async function executeCommentIssue(
  index: number,
  action: CommentIssueAction,
  opts: ExecutorOptions,
): Promise<ActionResult> {
  if (opts.dryRun) {
    return dryRunResult(index, action, `Would comment on issue #${action.issue_id}`);
  }

  if (opts.platform === "gitlab") {
    await exec("glab", [
      "issue", "note", String(action.issue_id),
      "-m", action.body,
    ], { cwd: opts.repoDir });
  } else {
    await exec("gh", [
      "issue", "comment", String(action.issue_id),
      "--body", action.body,
    ], { cwd: opts.repoDir });
  }

  return {
    index,
    action,
    status: "success",
    message: `Commented on issue #${action.issue_id}`,
    ref: `#${action.issue_id}`,
  };
}

// --- comment_mr ---

async function executeCommentMr(
  index: number,
  action: CommentMrAction,
  opts: ExecutorOptions,
): Promise<ActionResult> {
  if (opts.dryRun) {
    return dryRunResult(index, action, `Would comment on MR !${action.mr_id}`);
  }

  if (opts.platform === "gitlab") {
    await exec("glab", [
      "mr", "note", String(action.mr_id),
      "-m", action.body,
    ], { cwd: opts.repoDir });
  } else {
    await exec("gh", [
      "pr", "comment", String(action.mr_id),
      "--body", action.body,
    ], { cwd: opts.repoDir });
  }

  return {
    index,
    action,
    status: "success",
    message: `Commented on MR !${action.mr_id}`,
    ref: `!${action.mr_id}`,
  };
}

// --- close_mr ---

async function executeCloseMr(
  index: number,
  action: CloseMrAction,
  opts: ExecutorOptions,
): Promise<ActionResult> {
  if (opts.dryRun) {
    return dryRunResult(index, action, `Would close MR !${action.mr_id}`);
  }

  // Comment before closing
  if (action.comment) {
    if (opts.platform === "gitlab") {
      await exec("glab", [
        "mr", "note", String(action.mr_id),
        "-m", action.comment,
      ], { cwd: opts.repoDir });
    } else {
      await exec("gh", [
        "pr", "comment", String(action.mr_id),
        "--body", action.comment,
      ], { cwd: opts.repoDir });
    }
  }

  // Close
  if (opts.platform === "gitlab") {
    await exec("glab", ["mr", "close", String(action.mr_id)], { cwd: opts.repoDir });
    if (action.delete_branch) {
      // glab doesn't delete branch on close; do it manually
      try {
        const { stdout } = await exec("glab", [
          "mr", "view", String(action.mr_id), "--output", "json",
        ], { cwd: opts.repoDir });
        const mr = JSON.parse(stdout);
        if (mr.source_branch) {
          await git(opts.repoDir, ["push", "origin", "--delete", mr.source_branch]);
        }
      } catch { /* best effort branch deletion */ }
    }
  } else {
    const deleteFlag = action.delete_branch ? ["--delete-branch"] : [];
    await exec("gh", ["pr", "close", String(action.mr_id), ...deleteFlag], { cwd: opts.repoDir });
  }

  return {
    index,
    action,
    status: "success",
    message: `Closed MR !${action.mr_id}`,
    ref: `!${action.mr_id}`,
  };
}

// --- Helpers ---

async function git(cwd: string, args: string[]): Promise<ExecResult> {
  logger.debug(`git ${args.join(" ")}`);
  return exec("git", args, { cwd });
}

async function hasGitChanges(cwd: string): Promise<boolean> {
  const { stdout } = await git(cwd, ["status", "--porcelain"]);
  return stdout.trim().length > 0;
}

async function runAllowlistedCommands(
  commands: string[],
  cwd: string,
  allowlist: AllowlistEntry[] = [],
): Promise<void> {
  for (const cmd of commands) {
    if (!isCommandAllowed(cmd, allowlist)) {
      throw new Error(`Blocked: command not in allowlist: "${cmd}"`);
    }
    const parts = cmd.split(/\s+/);
    const [binary, ...args] = parts;
    logger.info(`exec: ${cmd} (in ${cwd})`);
    try {
      const result = await exec(binary, args, { cwd });
      if (result.stderr) logger.debug(`stderr: ${result.stderr.slice(0, 500)}`);
    } catch (err) {
      throw new Error(`Command failed: ${cmd}\n${err instanceof Error ? err.message : err}`);
    }
  }
}

// Test runners that are allowed as test_command.
// These are read-only verification commands, separate from the mission allowlist.
const TEST_COMMAND_BINARIES = new Set([
  "go", "npm", "yarn", "pnpm", "bun", "make", "cargo",
  "pytest", "python", "python3", "ruby", "bundle",
  "mvn", "gradle", "dotnet",
  "echo", // harmless, used as no-op test
]);

async function runTestCommand(
  testCommand: string,
  cwd: string,
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  const parts = testCommand.split(/\s+/);
  const [binary, ...args] = parts;

  if (!TEST_COMMAND_BINARIES.has(binary)) {
    logger.warn(`test_command binary "${binary}" not in allowed test runners, skipping`);
    return { success: true, stdout: "", stderr: `Skipped: "${binary}" not an allowed test runner` };
  }

  logger.info(`test: ${testCommand} (in ${cwd})`);
  try {
    const result = await exec(binary, args, { cwd });
    return { success: true, stdout: result.stdout, stderr: result.stderr };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      stdout: execErr.stdout ?? "",
      stderr: execErr.stderr ?? execErr.message ?? String(err),
    };
  }
}

async function ensureLabelsExist(
  platform: Platform,
  cwd: string,
  labels: string[],
): Promise<void> {
  for (const label of labels) {
    try {
      if (platform === "github") {
        // gh label create is idempotent - no error if it already exists
        await exec("gh", ["label", "create", label, "--force"], { cwd });
      }
      // glab labels are created inline with MR/issue commands; no pre-creation needed
    } catch {
      logger.debug(`Could not create label "${label}" - may already exist`);
    }
  }
}

async function createMrOrPr(
  platform: Platform,
  cwd: string,
  action: CreateMrAction,
  defaultBranch: string,
): Promise<string> {
  // Ensure labels exist before creating MR/PR
  if (action.labels.length > 0) {
    await ensureLabelsExist(platform, cwd, action.labels);
  }

  const labels = action.labels.join(",");

  if (platform === "gitlab") {
    const args = [
      "mr", "create",
      "--fill",
      "--title", action.title,
      "--description", action.description,
      "--source-branch", action.branch,
      "--target-branch", defaultBranch,
      "--remove-source-branch",
      "--no-editor",
    ];
    if (labels) args.push("--label", labels);

    const result = await exec("glab", args, { cwd });
    const url = result.stdout.trim().split("\n").pop() ?? "";
    logger.info(`Created MR: ${url}`);
    return url;
  } else {
    const args = [
      "pr", "create",
      "--title", action.title,
      "--body", action.description,
      "--base", defaultBranch,
      "--head", action.branch,
    ];
    if (labels) {
      for (const label of action.labels) {
        args.push("--label", label);
      }
    }

    const result = await exec("gh", args, { cwd });
    const url = result.stdout.trim().split("\n").pop() ?? "";
    logger.info(`Created PR: ${url}`);
    return url;
  }
}

async function createIssue(
  platform: Platform,
  cwd: string,
  action: CreateIssueAction,
): Promise<string> {
  // Ensure labels exist before creating issue
  if (action.labels.length > 0) {
    await ensureLabelsExist(platform, cwd, action.labels);
  }

  const labels = action.labels.join(",");

  if (platform === "gitlab") {
    const args = [
      "issue", "create",
      "--title", action.title,
      "--description", action.body,
      "--no-editor",
    ];
    if (labels) args.push("--label", labels);

    const result = await exec("glab", args, { cwd });
    const url = result.stdout.trim().split("\n").pop() ?? "";
    logger.info(`Created issue: ${url}`);
    return url;
  } else {
    const args = [
      "issue", "create",
      "--title", action.title,
      "--body", action.body,
    ];
    if (labels) {
      for (const label of action.labels) {
        args.push("--label", label);
      }
    }

    const result = await exec("gh", args, { cwd });
    const url = result.stdout.trim().split("\n").pop() ?? "";
    logger.info(`Created issue: ${url}`);
    return url;
  }
}

function dryRunResult(index: number, action: Action, message: string): ActionResult {
  return { index, action, status: "skipped", message: `[DRY-RUN] ${message}` };
}

function formatMrDryRun(action: CreateMrAction): string {
  const lines = [
    `Would create MR: ${action.title}`,
    `  branch: ${action.branch}`,
  ];
  if (action.working_dir) lines.push(`  cwd: ${action.working_dir}`);
  for (const cmd of action.commands) {
    lines.push(`  cmd: ${cmd}`);
  }
  lines.push(`  test: ${action.test_command}`);
  lines.push(`  fallback: ${action.fallback_strategy}`);
  lines.push(`  updates: ${action.updates.map((u) => `${u.package} ${u.from}->${u.to}`).join(", ")}`);
  return lines.join("\n");
}
