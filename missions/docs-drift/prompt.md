# Documentation Drift Scan

**Date**: {today}
**Repository**: {repo_dir}
**Project URL**: {project_url}
**Platform**: {platform}
**Default branch**: {default_branch}

## Task

Find documentation that has drifted from the source code. Focus on the last 30 days of changes.

### What counts as drift

- Public API changed but docs show old signatures or behavior
- CLI flags added, removed, or renamed without doc updates
- Configuration format changed but docs show old format
- Features removed but still documented
- New features/missions added without documentation
- Example code or commands that no longer work
- Version numbers, links, or file paths that are stale

### What to ignore

- Internal implementation details
- Formatting or style differences
- Test files and test documentation

## Existing State

**Existing MRs with "quartermaster" label:**
{existing_mrs}

**Existing issues with "quartermaster" label:**
{existing_issues}

## Output

Create issues for drift findings. Do NOT create MRs - you are a detector, not a fixer.
Group related drift into single issues (e.g., all CLI flag issues in one issue).
Call `submit_plan` when done.
