# Dependency Scan

**Date**: {today}
**Repository**: {repo_dir}
**Project URL**: {project_url}
**Platform**: {platform}
**Default branch**: {default_branch}

## Task

Analyze this repository for outdated dependencies and produce an update plan.

### Step 1: Understand the repo

1. Read the repo's dependency manifests (go.mod, package.json, pyproject.toml, requirements.txt, etc.)
2. Understand the build system (Makefile, CI config, Dockerfile)
3. Find the test command (look at Makefile targets, CI test jobs, package.json scripts)
4. Note the repo structure (single module vs monorepo, language mix)

### Step 2: Find outdated dependencies

Run the appropriate read-only commands:
- Go: `go list -m -u -json all`
- Node: `npm outdated --json`
- Python: `pip list --outdated --format=json`

### Step 3: Review existing state

Check existing quartermaster MRs and issues. Read their comments to understand context.

**Existing MRs with "quartermaster" label:**
{existing_mrs}

**Existing issues with "quartermaster" label:**
{existing_issues}

### Step 4: Produce the plan

Based on your analysis, call `submit_plan` with:
- `repo_context`: platform, ecosystems, test_command, default_branch, lock_files
- `actions`: your proposed updates, issues, comments, or skips

Remember:
- Group patch/minor updates together when it makes sense
- Create issues (not MRs) for major version bumps
- Use `skip` for packages that are already current, pinned, or where a human said "hold off"
- Set appropriate confidence scores
- Use `update_mr` if a quartermaster MR already exists for the same packages
- Include `fallback_strategy: "individual_on_failure"` for batch MRs
- Branch names must start with `quartermaster/`
- Only suggest commands from the allowlist in the system prompt
