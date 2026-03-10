// Mission loader - discovers missions from directories at runtime.
// Each mission is a directory with: mission.json, system-prompt.md, prompt.md, allowlist.json, skills/

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { logger } from "./utils/logger.js";
import { exec } from "./utils/exec.js";
import type { Mission, MissionContext, AllowlistEntry } from "./mission.js";
import type { Platform } from "./types.js";

interface MissionManifest {
  name: string;
  description: string;
}

/**
 * Load a single mission from a directory.
 */
export function loadMission(missionDir: string): Mission {
  const absDir = resolve(missionDir);

  // Read manifest
  const manifestPath = join(absDir, "mission.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing mission.json in ${absDir}`);
  }
  const manifest: MissionManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

  // Read system prompt
  const systemPromptPath = join(absDir, "system-prompt.md");
  if (!existsSync(systemPromptPath)) {
    throw new Error(`Missing system-prompt.md in ${absDir}`);
  }
  const systemPrompt = readFileSync(systemPromptPath, "utf-8").trim();

  // Read prompt template
  const promptPath = join(absDir, "prompt.md");
  if (!existsSync(promptPath)) {
    throw new Error(`Missing prompt.md in ${absDir}`);
  }
  const promptTemplate = readFileSync(promptPath, "utf-8");

  // Read allowlist
  const allowlistPath = join(absDir, "allowlist.json");
  let allowlist: AllowlistEntry[] = [];
  if (existsSync(allowlistPath)) {
    allowlist = JSON.parse(readFileSync(allowlistPath, "utf-8"));
  }

  // Skills directory
  const skillsDir = join(absDir, "skills");

  return {
    name: manifest.name,
    description: manifest.description,
    systemPrompt,
    skillsDir,
    allowlist,

    buildPrompt(ctx: MissionContext): string {
      const today = new Date().toISOString().split("T")[0];

      // Replace all {key} placeholders with context values
      const replacements: Record<string, string> = {
        repo_dir: ctx.repoDir,
        project_url: ctx.projectUrl ?? "unknown",
        default_branch: ctx.defaultBranch,
        platform: ctx.platform,
        today,
        // Standard context fields gathered by core
        existing_mrs: ctx.existingMrs || "None found.",
        existing_issues: ctx.existingIssues || "None found.",
      };

      let prompt = promptTemplate;
      for (const [key, value] of Object.entries(replacements)) {
        prompt = prompt.replace(new RegExp(`\\{${key}\\}`, "g"), value);
      }

      logger.info(`Built ${manifest.name} prompt (${prompt.length} chars)`);
      return prompt;
    },

    async gatherContext(opts): Promise<MissionContext> {
      // Generic context gathering - every mission gets existing MRs/issues
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
}

/**
 * Load all missions from a directory. Each subdirectory is a mission.
 */
export function loadMissions(missionsDir: string): Map<string, Mission> {
  const absDir = resolve(missionsDir);
  const missions = new Map<string, Mission>();

  if (!existsSync(absDir)) {
    logger.warn(`Missions directory not found: ${absDir}`);
    return missions;
  }

  for (const entry of readdirSync(absDir)) {
    const entryPath = join(absDir, entry);
    if (!statSync(entryPath).isDirectory()) continue;

    const manifestPath = join(entryPath, "mission.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const mission = loadMission(entryPath);
      missions.set(mission.name, mission);
      logger.debug(`Loaded mission: ${mission.name} (${mission.description})`);
    } catch (err) {
      logger.warn(`Failed to load mission from ${entryPath}: ${err}`);
    }
  }

  return missions;
}

// --- Generic context gathering ---

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
