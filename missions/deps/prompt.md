# Dependency Scan

**Date**: {today}
**Repository**: {repo_dir}
**Project URL**: {project_url}
**Platform**: {platform}
**Default branch**: {default_branch}

## Task

Analyze this repository for outdated dependencies. Research what changed in each update. Produce an update plan with informed descriptions.

### Step 1: Understand the repo

1. Read the repo's dependency manifests (go.mod, package.json, pyproject.toml, requirements.txt, etc.)
2. Understand the build system (Makefile, CI config, Dockerfile)
3. Find the test command (look at Makefile targets, CI test jobs, package.json scripts)
4. Note the repo structure (single module vs monorepo, language mix)

### Step 2: Find outdated dependencies

Use the recipes from the loaded skill (go-deps, node-deps, etc.) to scan for all outdated dependencies.

### Step 3: Research changelogs

For each outdated dependency, look up what actually changed:
- Use `npm view <pkg> repository.url` to find the GitHub repo
- Use `gh release view <tag> --repo <owner/repo> --json body --jq '.body'` to fetch release notes
- For major bumps: always fetch the release notes for the breaking version (e.g. v14.0.0)
- For minor/patch: note any security fixes or notable new features
- Assess whether breaking changes actually affect this repo's usage by checking how the package is used

Skip changelog research for trivial packages (@types/*, etc.) - just note the version bump.

### Step 4: Review existing state

Check existing quartermaster MRs and issues. Read their comments to understand context.

**Existing MRs with "quartermaster" label:**
{existing_mrs}

**Existing issues with "quartermaster" label:**
{existing_issues}

### Step 5: Produce the plan

Call `submit_plan` with your actions. Include changelog summaries in descriptions.

For `create_mr` descriptions, list each package with a one-line summary of what changed.
For `create_issue` bodies, include the actual breaking changes and your assessment of impact on this repo.

Rules:
- Group patch/minor updates together when it makes sense
- Create issues (not MRs) for major version bumps
- Use `skip` for packages that are already current, pinned, or where a human said "hold off"
- Set appropriate confidence scores
- Use `update_mr` if a quartermaster MR already exists for the same packages
- Include `fallback_strategy: "individual_on_failure"` for batch MRs
- Branch names must start with `quartermaster/`
- Only suggest commands from the allowlist
