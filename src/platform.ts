// Platform detection and configuration.
// Detects GitLab CI, GitHub Actions, or local environment.
// Priority: explicit flags > CI env vars > git remote detection > defaults.

import type { Platform, PlatformConfig } from "./types.js";
import { exec } from "./utils/exec.js";
import { logger } from "./utils/logger.js";

export interface DetectOptions {
  /** Explicit platform override */
  platform?: Platform;
  /** Explicit project URL override */
  projectUrl?: string;
  /** Explicit default branch override */
  defaultBranch?: string;
  /** Repo directory to inspect git remote */
  repoDir?: string;
}

/**
 * Detect platform and configuration from environment or explicit options.
 * Priority: explicit flags > CI env vars > git remote detection > defaults.
 */
export async function detectPlatform(opts: DetectOptions = {}): Promise<PlatformConfig> {
  // 1. Explicit flags
  if (opts.platform && opts.projectUrl) {
    return {
      platform: opts.platform,
      projectUrl: opts.projectUrl,
      defaultBranch: opts.defaultBranch ?? "main",
      token: getToken(opts.platform),
    };
  }

  // 2. GitLab CI environment
  if (process.env.GITLAB_CI) {
    logger.info("Detected GitLab CI environment");
    return {
      platform: "gitlab",
      projectUrl: opts.projectUrl ?? process.env.CI_PROJECT_URL ?? "",
      defaultBranch: opts.defaultBranch ?? process.env.CI_DEFAULT_BRANCH ?? "main",
      token: getToken("gitlab"),
    };
  }

  // 3. GitHub Actions environment
  if (process.env.GITHUB_ACTIONS) {
    logger.info("Detected GitHub Actions environment");
    const repo = process.env.GITHUB_REPOSITORY ?? "";
    return {
      platform: "github",
      projectUrl: opts.projectUrl ?? `https://github.com/${repo}`,
      defaultBranch: opts.defaultBranch ?? process.env.GITHUB_REF_NAME ?? "main",
      token: getToken("github"),
    };
  }

  // 4. Git remote detection
  const repoDir = opts.repoDir ?? process.cwd();
  try {
    const { stdout } = await exec("git", ["remote", "get-url", "origin"], { cwd: repoDir });
    const remoteUrl = stdout.trim();
    const platform = detectPlatformFromRemote(remoteUrl);
    const projectUrl = opts.projectUrl ?? normalizeRemoteUrl(remoteUrl);

    // Try to detect default branch
    let defaultBranch = opts.defaultBranch;
    if (!defaultBranch) {
      try {
        const { stdout: branchOut } = await exec(
          "git", ["symbolic-ref", "refs/remotes/origin/HEAD"],
          { cwd: repoDir },
        );
        defaultBranch = branchOut.trim().replace("refs/remotes/origin/", "");
      } catch {
        defaultBranch = "main";
      }
    }

    return {
      platform: opts.platform ?? platform,
      projectUrl,
      defaultBranch,
      token: getToken(opts.platform ?? platform),
    };
  } catch {
    logger.warn("Could not detect git remote; using defaults");
    return {
      platform: opts.platform ?? "gitlab",
      projectUrl: opts.projectUrl ?? "",
      defaultBranch: opts.defaultBranch ?? "main",
    };
  }
}

function detectPlatformFromRemote(remoteUrl: string): Platform {
  if (remoteUrl.includes("github.com")) return "github";
  // Default to gitlab for anything else (self-hosted gitlab instances)
  return "gitlab";
}

function normalizeRemoteUrl(remoteUrl: string): string {
  // Convert SSH URL to HTTPS
  // git@gitlab.example.com:group/repo.git -> https://gitlab.example.com/group/repo
  if (remoteUrl.startsWith("git@")) {
    return remoteUrl
      .replace("git@", "https://")
      .replace(":", "/")
      .replace(/\.git$/, "");
  }
  return remoteUrl.replace(/\.git$/, "");
}

function getToken(platform: Platform): string | undefined {
  if (platform === "gitlab") {
    return (
      process.env.QUARTERMASTER_GITLAB_TOKEN ??
      process.env.GITLAB_TOKEN ??
      process.env.GITLAB_PRIVATE_TOKEN ??
      process.env.CI_JOB_TOKEN
    );
  }
  return (
    process.env.QUARTERMASTER_GITHUB_TOKEN ??
    process.env.GITHUB_TOKEN
  );
}
