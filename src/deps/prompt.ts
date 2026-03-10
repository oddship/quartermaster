import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../utils/logger.js";
import type { DepScanContext } from "./types.js";

function getTemplatesDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, "..", "..", "templates");
}

export function buildDepScanPrompt(ctx: DepScanContext): string {
  const templateFile = resolve(getTemplatesDir(), "deps-scan.md");
  let template: string;
  try {
    template = readFileSync(templateFile, "utf-8");
  } catch (err) {
    throw new Error(`Failed to load prompt template from ${templateFile}: ${err}`);
  }

  const today = new Date().toISOString().split("T")[0];

  const prompt = template
    .replace(/\{repo_dir\}/g, ctx.repoDir)
    .replace(/\{project_url\}/g, ctx.projectUrl ?? "unknown")
    .replace(/\{default_branch\}/g, ctx.defaultBranch)
    .replace(/\{platform\}/g, ctx.platform)
    .replace(/\{today\}/g, today)
    .replace(/\{existing_mrs\}/g, ctx.existingMrs || "None found.")
    .replace(/\{existing_issues\}/g, ctx.existingIssues || "None found.");

  logger.info(`Built dep scan prompt (${prompt.length} chars)`);
  return prompt;
}
