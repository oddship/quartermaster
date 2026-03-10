// Dependency-update mission specific types.
// These extend the core types with dep-specific context.

export interface GoModule {
  Path: string;
  Version: string;
  Update?: { Path: string; Version: string };
  Indirect: boolean;
  Main?: boolean;
}

export interface GoListOutput {
  modules: GoModule[];
  outdated: GoModule[];
}

export interface DepScanContext {
  /** Absolute path to the repo */
  repoDir: string;
  /** Platform project URL (e.g., https://gitlab.example.com/group/repo) */
  projectUrl?: string;
  /** Default branch name */
  defaultBranch: string;
  /** Detected platform */
  platform: string;
  /** Existing quartermaster MRs/PRs (from glab/gh) */
  existingMrs: string;
  /** Existing quartermaster issues (from glab/gh) */
  existingIssues: string;
}
