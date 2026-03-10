// Core types for the quartermaster plan contract.
// The agent produces a Plan via the submit_plan tool.
// The CLI executor reads it, validates it, and executes it.

export type Platform = "gitlab" | "github";

export type ActionType =
  | "create_mr"
  | "update_mr"
  | "create_issue"
  | "comment_issue"
  | "comment_mr"
  | "close_mr"
  | "skip";

export type UpdateType = "patch" | "minor" | "major" | "security";

export type FallbackStrategy = "batch" | "individual_on_failure" | "individual";

export type SkipReasonType =
  | "human_hold"
  | "recently_updated"
  | "no_update_available"
  | "pinned";

export interface DependencyUpdate {
  package: string;
  from: string;
  to: string;
  update_type: UpdateType;
  changelog_url?: string;
  breaking_changes?: string;
}

export interface RepoContext {
  platform: Platform;
  ecosystems: string[];
  test_command: string;
  default_branch: string;
  lock_files: string[];
}

// --- Action types ---

interface BaseAction {
  type: ActionType;
  confidence: number; // 0-1
}

export interface CreateMrAction extends BaseAction {
  type: "create_mr";
  branch: string;
  title: string;
  description: string;
  updates: DependencyUpdate[];
  commands: string[];
  test_command: string;
  labels: string[];
  fallback_strategy: FallbackStrategy;
}

export interface UpdateMrAction extends BaseAction {
  type: "update_mr";
  mr_id: number;
  branch: string;
  rebase_first: boolean;
  updates: DependencyUpdate[];
  commands: string[];
  test_command: string;
  description: string;
  labels: string[];
}

export interface CreateIssueAction extends BaseAction {
  type: "create_issue";
  title: string;
  body: string;
  labels: string[];
}

export interface CommentIssueAction extends BaseAction {
  type: "comment_issue";
  issue_id: number;
  body: string;
}

export interface CommentMrAction extends BaseAction {
  type: "comment_mr";
  mr_id: number;
  body: string;
}

export interface CloseMrAction extends BaseAction {
  type: "close_mr";
  mr_id: number;
  comment: string;
  delete_branch: boolean;
}

export interface SkipAction extends BaseAction {
  type: "skip";
  package: string;
  reason: string;
  reason_type: SkipReasonType;
}

export type Action =
  | CreateMrAction
  | UpdateMrAction
  | CreateIssueAction
  | CommentIssueAction
  | CommentMrAction
  | CloseMrAction
  | SkipAction;

export interface Plan {
  repo_context: RepoContext;
  actions: Action[];
}

// --- Validation ---

export interface ValidationError {
  action_index: number;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

// --- Platform config ---

export interface PlatformConfig {
  platform: Platform;
  projectUrl: string;
  defaultBranch: string;
  token?: string;
}

// --- CLI options ---

export interface ScanOptions {
  repoDir: string;
  output?: string;
  model: string;
  reasoningEffort?: string;
  verbose: boolean;
  platform?: Platform;
  projectUrl?: string;
  defaultBranch?: string;
}

export interface ValidateOptions {
  planFile: string;
  verbose: boolean;
}

export interface ExecuteOptions {
  planFile: string;
  dryRun: boolean;
  verbose: boolean;
  confidenceThreshold: number;
}

export interface RunOptions extends ScanOptions {
  dryRun: boolean;
  execute: boolean;
  confidenceThreshold: number;
}
