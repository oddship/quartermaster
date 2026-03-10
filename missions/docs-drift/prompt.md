# Documentation Drift Scan

**Date**: {today}
**Repository**: {repo_dir}
**Project URL**: {project_url}
**Platform**: {platform}
**Default branch**: {default_branch}

## Task

Analyze this repository for documentation that has drifted from the source code.
Compare recent source changes against existing documentation to find mismatches,
missing docs, stale examples, and incorrect information.

### What counts as drift

- Public API changed but docs show old signatures or behavior
- CLI flags/options added, removed, or renamed without doc updates
- Configuration format changed but docs show old format
- Features removed but still documented
- New features added without any documentation
- Example code that no longer works with current source
- Version numbers, compatibility claims, or links that are stale

### What to ignore

- Internal implementation details (unless they have doc comments)
- Formatting or style differences
- TODOs or planned features mentioned as future work
- Test files and test documentation

## Existing State

**Existing MRs with "quartermaster" label:**
{existing_mrs}

**Existing issues with "quartermaster" label:**
{existing_issues}

## Instructions

1. Use `git log` to find recent source changes (last 30 days)
2. Identify all documentation surfaces (README, docs/, docstrings, examples)
3. Cross-reference changes against docs
4. Create issues for complex drift, MRs for mechanical fixes
5. Call `submit_plan` with your findings
