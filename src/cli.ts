#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import chalk from "chalk";

import { validatePlan } from "./validator.js";
import { detectPlatform } from "./platform.js";
import { scanRepo } from "./agent.js";
import type { AgentProgressEvent } from "./agent.js";
import { executePlan } from "./executor.js";
import { getMission, setMissionsDir } from "./missions.js";
import { setLogLevel } from "./utils/logger.js";
import type { Plan, Platform } from "./types.js";

const program = new Command();

program
  .name("quartermaster")
  .description(
    "Scheduled agent framework for repository maintenance.\n\n" +
      "Quartermaster uses an AI agent to analyze repositories and produce\n" +
      "a typed action plan (JSON). The CLI executor then validates and\n" +
      "executes the plan deterministically.",
  )
  .version("0.1.0")
  .option("--missions-dir <dir>", "Directory containing mission definitions")
  .hook("preAction", () => {
    const opts = program.opts();
    if (opts.missionsDir) {
      setMissionsDir(opts.missionsDir);
    }
  });

// --- scan ---
program
  .command("scan")
  .description("Run the agent to scan a repo and produce a plan")
  .option("--mission <name>", "Mission to run", "deps")
  .option("--repo-dir <dir>", "Repository directory to scan", ".")
  .option("-o, --output <file>", "Output plan JSON file", "plan.json")
  .option("--model <model>", "LLM model to use", "anthropic/claude-sonnet-4-20250514")
  .option("--reasoning-effort <level>", "Reasoning effort: low, medium, high")
  .option("--platform <platform>", "Platform: gitlab or github")
  .option("--project-url <url>", "Project URL (auto-detected from git remote)")
  .option("--default-branch <branch>", "Default branch (auto-detected)")
  .option("-v, --verbose", "Verbose logging", false)
  .action(async (opts) => {
    if (opts.verbose) setLogLevel("debug");

    const repoDir = resolve(opts.repoDir);
    const platformConfig = await detectPlatform({
      platform: opts.platform as Platform | undefined,
      projectUrl: opts.projectUrl,
      defaultBranch: opts.defaultBranch,
      repoDir,
    });

    const mission = getMission(opts.mission);

    console.log(chalk.bold.cyan(`Quartermaster - ${mission.description}`));
    console.log(chalk.dim(`Mission: ${mission.name}`));
    console.log(chalk.dim(`Repo: ${repoDir}`));
    console.log(chalk.dim(`Platform: ${platformConfig.platform}`));
    console.log(chalk.dim(`Project: ${platformConfig.projectUrl}`));
    console.log(chalk.dim(`Branch: ${platformConfig.defaultBranch}`));
    console.log(chalk.dim(`Model: ${opts.model}`));
    console.log();

    const toolIcons: Record<string, string> = {
      bash: "$", read: "cat", grep: "grep", find: "find", ls: "ls",
    };

    function handleEvent(event: AgentProgressEvent): void {
      switch (event.type) {
        case "agent_start":
          console.log(chalk.dim("Agent started"));
          break;
        case "turn_start":
          console.log(chalk.dim(`\n-- Turn ${event.turnIndex ?? "?"} --`));
          break;
        case "tool_start": {
          const icon = toolIcons[event.toolName ?? ""] ?? event.toolName;
          const preview = event.toolArgs ? ` ${event.toolArgs}` : "";
          const truncated = preview.length > 160 ? preview.slice(0, 160) + "..." : preview;
          console.log(chalk.green(`  ${icon}${truncated}`));
          break;
        }
        case "tool_end": {
          if (event.isError) console.log(chalk.red("  x error"));
          if (event.result && opts.verbose) {
            const lines = event.result.split("\n").slice(0, 6);
            for (const line of lines) console.log(chalk.dim(`    ${line}`));
          }
          break;
        }
        case "text_delta":
          if (opts.verbose && event.delta) process.stderr.write(event.delta);
          break;
        case "thinking_delta":
          if (opts.verbose && event.delta) process.stderr.write(chalk.dim(event.delta));
          break;
        case "agent_end":
          console.log(chalk.dim("\nExtracting plan..."));
          break;
      }
    }

    try {
      const { plan, metrics } = await scanRepo({
        mission,
        repoDir,
        platform: platformConfig.platform,
        projectUrl: platformConfig.projectUrl,
        defaultBranch: platformConfig.defaultBranch,
        model: opts.model,
        reasoningEffort: opts.reasoningEffort,
        onEvent: handleEvent,
      });

      // Plan was already validated inside submit_plan tool.
      // Agent got feedback and fixed errors before acceptance.

      // Write plan
      const outputPath = resolve(opts.output);
      writeFileSync(outputPath, JSON.stringify(plan, null, 2));
      console.log(chalk.green(`\nPlan written to ${outputPath}`));
      console.log(chalk.dim(`Actions: ${plan.actions.length}`));
      console.log(chalk.dim(`Turns: ${metrics.turns}, Tool calls: ${metrics.toolCalls}`));
      console.log(chalk.dim(`Tokens: ${metrics.totalTokens} (in: ${metrics.inputTokens}, out: ${metrics.outputTokens})`));
      console.log(chalk.dim(`Cost: $${metrics.cost.toFixed(4)}`));
      console.log(chalk.dim(`Duration: ${metrics.durationSeconds}s`));
    } catch (err) {
      console.error(chalk.red(`Scan failed: ${err instanceof Error ? err.message : err}`));
      if (opts.verbose && err instanceof Error && err.stack) {
        console.error(chalk.dim(err.stack));
      }
      process.exit(1);
    }
  });

// --- validate ---
program
  .command("validate")
  .description("Validate a plan JSON file")
  .argument("<plan-file>", "Path to plan JSON file")
  .option("--mission <name>", "Mission (for allowlist selection)", "deps")
  .option("-v, --verbose", "Verbose logging", false)
  .action((planFile: string, opts) => {
    if (opts.verbose) setLogLevel("debug");

    const planPath = resolve(planFile);
    let raw: string;
    try {
      raw = readFileSync(planPath, "utf-8");
    } catch (err) {
      console.error(chalk.red(`Cannot read plan file: ${planPath}`));
      process.exit(1);
    }

    let plan: Plan;
    try {
      plan = JSON.parse(raw) as Plan;
    } catch (err) {
      console.error(chalk.red(`Invalid JSON in plan file: ${planPath}`));
      process.exit(1);
    }

    console.log(chalk.bold.cyan("Quartermaster - Plan Validation"));
    console.log(chalk.dim(`File: ${planPath}`));
    console.log(chalk.dim(`Actions: ${plan.actions?.length ?? 0}`));
    console.log();

    const mission = getMission(opts.mission);
    const result = validatePlan(plan, mission.allowlist);

    if (result.warnings.length > 0) {
      console.log(chalk.yellow("Warnings:"));
      for (const w of result.warnings) {
        console.log(chalk.yellow(`  - ${w}`));
      }
      console.log();
    }

    if (result.valid) {
      console.log(chalk.green("Plan is valid."));
      process.exit(0);
    } else {
      console.log(chalk.red("Plan validation failed:"));
      for (const e of result.errors) {
        const loc = e.action_index >= 0 ? `action[${e.action_index}].${e.field}` : e.field;
        console.log(chalk.red(`  - ${loc}: ${e.message}`));
      }
      process.exit(1);
    }
  });

// --- execute ---
program
  .command("execute")
  .description("Execute a validated plan")
  .argument("<plan-file>", "Path to plan JSON file")
  .option("--dry-run", "Log actions without executing", true)
  .option("--execute", "Actually execute the plan (opt-in)", false)
  .option("--confidence-threshold <n>", "Skip actions below this confidence (0-1)", "0.5")
  .option("-v, --verbose", "Verbose logging", false)
  .option("--mission <name>", "Mission (for allowlist selection)", "deps")
  .option("--repo-dir <dir>", "Repository directory", ".")
  .option("--platform <platform>", "Platform: gitlab or github")
  .option("--project-url <url>", "Project URL (auto-detected)")
  .option("--default-branch <branch>", "Default branch (auto-detected)")
  .action(async (planFile: string, opts) => {
    if (opts.verbose) setLogLevel("debug");

    const planPath = resolve(planFile);
    let plan: Plan;
    try {
      plan = JSON.parse(readFileSync(planPath, "utf-8")) as Plan;
    } catch {
      console.error(chalk.red(`Cannot read/parse plan file: ${planPath}`));
      process.exit(1);
    }

    const mission = getMission(opts.mission);

    // Validate first
    const validation = validatePlan(plan, mission.allowlist);
    if (!validation.valid) {
      console.error(chalk.red("Plan validation failed. Run 'quartermaster validate' for details."));
      process.exit(1);
    }

    const dryRun = !opts.execute;
    const threshold = parseFloat(opts.confidenceThreshold);
    const repoDir = resolve(opts.repoDir);

    // Detect platform
    const platformConfig = await detectPlatform({
      platform: opts.platform as Platform | undefined,
      projectUrl: opts.projectUrl,
      defaultBranch: opts.defaultBranch,
      repoDir,
    });

    console.log(chalk.bold.cyan("Quartermaster - Plan Execution"));
    console.log(chalk.dim(`File: ${planPath}`));
    console.log(chalk.dim(`Repo: ${repoDir}`));
    console.log(chalk.dim(`Platform: ${platformConfig.platform}`));
    console.log(chalk.dim(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`));
    console.log(chalk.dim(`Confidence threshold: ${threshold}`));
    console.log();

    try {
      const result = await executePlan(plan, {
        repoDir,
        platform: platformConfig.platform,
        projectUrl: platformConfig.projectUrl,
        defaultBranch: platformConfig.defaultBranch,
        dryRun,
        confidenceThreshold: threshold,
        verbose: opts.verbose,
        allowlist: mission.allowlist,
      });

      // Print results
      for (const r of result.results) {
        const icon = r.status === "success" ? chalk.green("OK")
          : r.status === "skipped" ? chalk.blue("--")
          : chalk.red("XX");
        console.log(`  ${icon} [${r.index}] ${r.action.type}: ${r.message}`);
        if (r.ref) console.log(chalk.dim(`       ref: ${r.ref}`));
      }

      console.log();
      console.log(chalk.dim(
        `Total: ${result.summary.total} | ` +
        `${chalk.green(`Success: ${result.summary.success}`)} | ` +
        `${chalk.red(`Failed: ${result.summary.failed}`)} | ` +
        `Skipped: ${result.summary.skipped}`,
      ));

      if (dryRun) {
        console.log(chalk.green("\nDry run complete. Use --execute to run for real."));
      }

      if (result.summary.failed > 0) process.exit(1);
    } catch (err) {
      console.error(chalk.red(`Execution failed: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  });

// --- run ---
program
  .command("run")
  .description("Full pipeline: scan + validate + execute")
  .option("--mission <name>", "Mission to run", "deps")
  .option("--repo-dir <dir>", "Repository directory to scan", ".")
  .option("--model <model>", "LLM model to use", "anthropic/claude-sonnet-4-20250514")
  .option("--reasoning-effort <level>", "Reasoning effort: low, medium, high")
  .option("--platform <platform>", "Platform: gitlab or github")
  .option("--project-url <url>", "Project URL")
  .option("--default-branch <branch>", "Default branch")
  .option("--dry-run", "Log actions without executing (default)", true)
  .option("--execute", "Actually execute the plan (opt-in)", false)
  .option("--confidence-threshold <n>", "Skip actions below this confidence (0-1)", "0.5")
  .option("-o, --output <file>", "Save plan JSON to file")
  .option("-v, --verbose", "Verbose logging", false)
  .action(async (opts) => {
    if (opts.verbose) setLogLevel("debug");

    const mission = getMission(opts.mission);
    const repoDir = resolve(opts.repoDir);
    const platformConfig = await detectPlatform({
      platform: opts.platform as Platform | undefined,
      projectUrl: opts.projectUrl,
      defaultBranch: opts.defaultBranch,
      repoDir,
    });

    const dryRun = !opts.execute;
    const threshold = parseFloat(opts.confidenceThreshold);

    console.log(chalk.bold.cyan("Quartermaster - Full Pipeline"));
    console.log(chalk.dim(`Mission: ${mission.name}`));
    console.log(chalk.dim(`Repo: ${repoDir}`));
    console.log(chalk.dim(`Platform: ${platformConfig.platform}`));
    console.log(chalk.dim(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`));
    console.log(chalk.dim(`Model: ${opts.model}`));
    console.log();

    // 1. Scan
    console.log(chalk.bold("Phase 1: Scanning..."));
    const toolIcons: Record<string, string> = {
      bash: "$", read: "cat", grep: "grep", find: "find", ls: "ls",
    };

    const { plan, metrics } = await scanRepo({
      mission,
      repoDir,
      platform: platformConfig.platform,
      projectUrl: platformConfig.projectUrl,
      defaultBranch: platformConfig.defaultBranch,
      model: opts.model,
      reasoningEffort: opts.reasoningEffort,
      onEvent: (event) => {
        if (event.type === "turn_start") console.log(chalk.dim(`  Turn ${event.turnIndex ?? "?"}`));
        if (event.type === "tool_start") {
          const icon = toolIcons[event.toolName ?? ""] ?? event.toolName;
          console.log(chalk.dim(`  ${icon} ${(event.toolArgs ?? "").slice(0, 80)}`));
        }
      },
    });

    console.log(chalk.dim(`Scan: ${plan.actions.length} actions, ${metrics.turns} turns, $${metrics.cost.toFixed(4)}`));

    // Save plan if requested
    if (opts.output) {
      const outputPath = resolve(opts.output);
      writeFileSync(outputPath, JSON.stringify(plan, null, 2));
      console.log(chalk.dim(`Plan saved to ${outputPath}`));
    }

    if (plan.actions.length === 0) {
      console.log(chalk.green("\nNo updates needed. Repository is up to date."));
      return;
    }

    // 2. Execute
    console.log(chalk.bold("\nPhase 2: Executing..."));
    const result = await executePlan(plan, {
      repoDir,
      platform: platformConfig.platform,
      projectUrl: platformConfig.projectUrl,
      defaultBranch: platformConfig.defaultBranch,
      dryRun,
      confidenceThreshold: threshold,
      verbose: opts.verbose,
      allowlist: mission.allowlist,
    });

    for (const r of result.results) {
      const icon = r.status === "success" ? chalk.green("OK")
        : r.status === "skipped" ? chalk.blue("--")
        : chalk.red("XX");
      console.log(`  ${icon} [${r.index}] ${r.action.type}: ${r.message}`);
      if (r.ref) console.log(chalk.dim(`       ref: ${r.ref}`));
    }

    console.log();
    console.log(chalk.dim(
      `Total: ${result.summary.total} | ` +
      `Success: ${result.summary.success} | ` +
      `Failed: ${result.summary.failed} | ` +
      `Skipped: ${result.summary.skipped}`,
    ));

    if (dryRun) {
      console.log(chalk.green("\nDry run complete. Use --execute to run for real."));
    }

    if (result.summary.failed > 0) process.exit(1);
  });

program.parse();
