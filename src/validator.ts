// Plan validator - the safety gate between the agent and the executor.
// Phase 1: static checks only (no network).
// Phase 4: adds live checks (MR/issue existence via glab/gh).

import type {
  Plan,
  Action,
  CreateMrAction,
  UpdateMrAction,
  ValidationResult,
  ValidationError,
} from "./types.js";
import { findDisallowedCommands } from "./deps/allowlist.js";

const BRANCH_PATTERN = /^quartermaster\/[\w.-]+$/;
const MAX_ACTIONS = 20;

export function validatePlan(plan: Plan): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // Top-level checks
  if (!plan.repo_context) {
    errors.push({ action_index: -1, field: "repo_context", message: "Missing repo_context" });
    return { valid: false, errors, warnings };
  }
  if (!plan.actions || !Array.isArray(plan.actions)) {
    errors.push({ action_index: -1, field: "actions", message: "Missing or invalid actions array" });
    return { valid: false, errors, warnings };
  }

  // Action count limit
  if (plan.actions.length > MAX_ACTIONS) {
    errors.push({
      action_index: -1,
      field: "actions",
      message: `Too many actions: ${plan.actions.length} (max ${MAX_ACTIONS})`,
    });
  }

  // Track packages to detect duplicates
  const seenPackages = new Map<string, number>();

  for (let i = 0; i < plan.actions.length; i++) {
    const action = plan.actions[i];
    validateAction(action, i, errors, warnings, seenPackages);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateAction(
  action: Action,
  index: number,
  errors: ValidationError[],
  warnings: string[],
  seenPackages: Map<string, number>,
): void {
  // Confidence check
  if (typeof action.confidence !== "number" || action.confidence < 0 || action.confidence > 1) {
    errors.push({
      action_index: index,
      field: "confidence",
      message: `Invalid confidence: ${action.confidence} (must be 0-1)`,
    });
  }

  switch (action.type) {
    case "create_mr":
      validateCreateMr(action, index, errors, warnings, seenPackages);
      break;
    case "update_mr":
      validateUpdateMr(action, index, errors, warnings, seenPackages);
      break;
    case "create_issue":
      // No special validation beyond schema
      break;
    case "comment_issue":
    case "comment_mr":
      // IDs validated in Phase 4 (live checks)
      break;
    case "close_mr":
      // IDs validated in Phase 4 (live checks)
      break;
    case "skip":
      trackPackage(action.package, index, seenPackages, warnings);
      break;
    default:
      errors.push({
        action_index: index,
        field: "type",
        message: `Unknown action type: ${(action as Action).type}`,
      });
  }
}

function validateCreateMr(
  action: CreateMrAction,
  index: number,
  errors: ValidationError[],
  warnings: string[],
  seenPackages: Map<string, number>,
): void {
  // Branch pattern
  if (!BRANCH_PATTERN.test(action.branch)) {
    errors.push({
      action_index: index,
      field: "branch",
      message: `Branch "${action.branch}" does not match pattern quartermaster/*`,
    });
  }

  // Command allowlist
  const disallowed = findDisallowedCommands(action.commands);
  for (const cmd of disallowed) {
    errors.push({
      action_index: index,
      field: "commands",
      message: `Disallowed command: "${cmd}"`,
    });
  }

  // Track packages for duplicate detection
  for (const update of action.updates) {
    trackPackage(update.package, index, seenPackages, warnings);
  }
}

function validateUpdateMr(
  action: UpdateMrAction,
  index: number,
  errors: ValidationError[],
  warnings: string[],
  seenPackages: Map<string, number>,
): void {
  // Branch pattern
  if (!BRANCH_PATTERN.test(action.branch)) {
    errors.push({
      action_index: index,
      field: "branch",
      message: `Branch "${action.branch}" does not match pattern quartermaster/*`,
    });
  }

  // Command allowlist
  const disallowed = findDisallowedCommands(action.commands);
  for (const cmd of disallowed) {
    errors.push({
      action_index: index,
      field: "commands",
      message: `Disallowed command: "${cmd}"`,
    });
  }

  // Track packages
  for (const update of action.updates) {
    trackPackage(update.package, index, seenPackages, warnings);
  }
}

function trackPackage(
  pkg: string,
  index: number,
  seenPackages: Map<string, number>,
  warnings: string[],
): void {
  const prev = seenPackages.get(pkg);
  if (prev !== undefined) {
    warnings.push(
      `Package "${pkg}" appears in both action ${prev} and action ${index} - possible duplicate`,
    );
  } else {
    seenPackages.set(pkg, index);
  }
}
