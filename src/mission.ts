// Mission interface - the contract between the core framework and mission-specific logic.
// Each mission provides its own prompts, skills, allowlist, and context builder.

import type { Platform } from "./types.js";

/** Context passed to the prompt builder. Core gathers these for every mission. */
export interface MissionContext {
  repoDir: string;
  projectUrl?: string;
  defaultBranch: string;
  platform: string;
  /** Existing quartermaster MRs/PRs as JSON string */
  existingMrs: string;
  /** Existing quartermaster issues as JSON string */
  existingIssues: string;
}

/** A mission is a pluggable maintenance task that runs on a schedule. */
export interface Mission {
  /** Unique identifier (e.g. "deps", "security", "licenses") */
  name: string;

  /** Human-readable description */
  description: string;

  /** System prompt for the AI agent */
  systemPrompt: string;

  /** Directory containing mission-specific Pi SDK skills (absolute path) */
  skillsDir: string;

  /** Commands the executor is allowed to run for this mission */
  allowlist: AllowlistEntry[];

  /** Build the user prompt from context. Called after gathering existing MRs/issues. */
  buildPrompt(ctx: MissionContext): string;

  /** Gather mission-specific context before prompting the agent. */
  gatherContext(opts: {
    repoDir: string;
    platform: Platform;
    projectUrl: string;
    defaultBranch: string;
  }): Promise<MissionContext>;
}

export interface AllowlistEntry {
  /** The binary that must be at the start of the command */
  binary: string;
  /** Allowed subcommand prefixes after the binary */
  prefixes: string[];
}

/**
 * Check if a command is allowed by an allowlist.
 */
export function isCommandAllowed(
  command: string,
  allowlist: AllowlistEntry[],
): boolean {
  const trimmed = command.trim();
  for (const entry of allowlist) {
    if (!trimmed.startsWith(entry.binary + " ")) continue;
    const rest = trimmed.slice(entry.binary.length + 1);
    for (const prefix of entry.prefixes) {
      if (rest.startsWith(prefix) || rest === prefix.trimEnd()) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns disallowed commands from a list.
 */
export function findDisallowedCommands(
  commands: string[],
  allowlist: AllowlistEntry[],
): string[] {
  return commands.filter((cmd) => !isCommandAllowed(cmd, allowlist));
}
