// Dependency updates mission - the first quartermaster mission.
// Scans repos for outdated dependencies, creates PRs for minor/patch,
// issues for major bumps.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "../utils/exec.js";
import { logger } from "../utils/logger.js";
import { DEPS_SYSTEM_PROMPT } from "./system-prompt.js";
import { DEP_UPDATE_ALLOWLIST } from "./allowlist.js";
import type { Mission, MissionContext, AllowlistEntry } from "../mission.js";
import type { Platform } from "../types.js";

export interface DepsMissionContext extends MissionContext {
  existingMrs: string;
  existingIssues: string;
}

function getTemplatesDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, "..", "..", "templates");
}

function getSkillsDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, "..", "..", "skills");
}

export const depsMission: Mission = {
  name: "deps",
  description: "Scan for outdated dependencies and create update PRs/issues",
  systemPrompt: DEPS_SYSTEM_PROMPT,
  skillsDir: getSkillsDir(),
  allowlist: DEP_UPDATE_ALLOWLIST as AllowlistEntry[],

  buildPrompt(ctx: MissionContext): string {
    const depsCtx = ctx as DepsMissionContext;
    const templateFile = resolve(getTemplatesDir(), "deps-scan.md");
    let template: string;
    try {
      template = readFileSync(templateFile, "utf-8");
    } catch (err) {
      throw new Error(`Failed to load prompt template from ${templateFile}: ${err}`);
    }

    const today = new Date().toISOString().split("T")[0];

    const prompt = template
      .replace(/\{repo_dir\}/g, depsCtx.repoDir)
      .replace(/\{project_url\}/g, depsCtx.projectUrl ?? "unknown")
      .replace(/\{default_branch\}/g, depsCtx.defaultBranch)
      .replace(/\{platform\}/g, depsCtx.platform)
      .replace(/\{today\}/g, today)
      .replace(/\{existing_mrs\}/g, depsCtx.existingMrs || "None found.")
      .replace(/\{existing_issues\}/g, depsCtx.existingIssues || "None found.");

    logger.info(`Built dep scan prompt (${prompt.length} chars)`);
    return prompt;
  },

  async gatherContext(opts): Promise<DepsMissionContext> {
    const existingMrs = await gatherExistingMrs(opts.repoDir, opts.platform, opts.projectUrl);
    const existingIssues = await gatherExistingIssues(opts.repoDir, opts.platform, opts.projectUrl);

    return {
      repoDir: opts.repoDir,
      projectUrl: opts.projectUrl,
      defaultBranch: opts.defaultBranch,
      platform: opts.platform,
      existingMrs,
      existingIssues,
    };
  },
};

async function gatherExistingMrs(repoDir: string, platform: Platform, projectUrl: string): Promise<string> {
  try {
    if (platform === "gitlab" && projectUrl) {
      const { stdout } = await exec("glab", [
        "mr", "list", "--label", "quartermaster", "-F", "json",
      ], { cwd: repoDir });
      return stdout.trim() || "None found.";
    }
    if (platform === "github") {
      const { stdout } = await exec("gh", [
        "pr", "list", "--label", "quartermaster", "--state", "open", "--json", "number,title,headRefName,url",
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
        "issue", "list", "--label", "quartermaster", "-O", "json",
      ], { cwd: repoDir });
      return stdout.trim() || "None found.";
    }
    if (platform === "github") {
      const { stdout } = await exec("gh", [
        "issue", "list", "--label", "quartermaster", "--state", "open", "--json", "number,title,url",
      ], { cwd: repoDir });
      return stdout.trim() || "None found.";
    }
  } catch (err) {
    logger.warn(`Failed to gather existing issues: ${err}`);
  }
  return "Could not query existing issues (auth may not be configured).";
}
