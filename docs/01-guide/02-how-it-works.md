---
title: How it works
---

# How it works

Quartermaster splits the work into two phases: an AI agent that reads, and a deterministic executor that writes.

## Architecture

```
┌─────────────┐     ┌──────────┐     ┌──────────┐
│  AI Agent   │────>│   Plan   │────>│ Executor │
│ (read-only) │     │  (JSON)  │     │ (writes) │
└─────────────┘     └──────────┘     └──────────┘
```

**Agent** (scan phase):
- Explores the repo structure, identifies languages and build systems
- Loads ecosystem-specific skills (Go, Node.js, etc.)
- Runs read-only commands to find outdated dependencies
- Checks existing PRs/issues to avoid duplicates
- Produces a typed JSON action plan via the `submit_plan` tool
- If the plan fails validation, the agent gets the errors and fixes them

**Executor** (execute phase):
- Validates the plan against safety rules
- Creates branches, runs whitelisted commands, tests, commits, pushes
- Creates PRs/issues via `gh` or `glab` CLI
- Falls back to individual PRs if a batch fails tests

## The plan contract

The plan is a JSON file with two parts:

```json
{
  "repo_context": {
    "platform": "github",
    "ecosystems": ["go"],
    "test_command": "go test ./...",
    "default_branch": "main",
    "lock_files": ["go.sum"]
  },
  "actions": [...]
}
```

Each action is one of:

| Action | What it does |
|--------|-------------|
| `create_mr` | Create a branch, run commands, test, push, open PR |
| `update_mr` | Update an existing quartermaster PR |
| `create_issue` | Open an issue (for major version bumps) |
| `comment_mr` | Add a comment to an existing PR |
| `comment_issue` | Add a comment to an existing issue |
| `close_mr` | Close a stale quartermaster PR |
| `skip` | Skip a package (with reason) |

## Safety

- **Command allowlist**: The executor only runs commands from a strict allowlist (e.g. `go get`, `go mod tidy`, `npm update`). Anything else is rejected.
- **Branch pattern**: All branches must match `quartermaster/*`.
- **Path safety**: `working_dir` cannot contain `..` or absolute paths.
- **Confidence threshold**: Actions below the threshold are skipped.
- **Dry-run default**: The executor does nothing unless you pass `--execute`.
- **Validation feedback**: If the agent produces an invalid plan, it gets the errors back and can fix them (up to 3 attempts).

## Grouping strategy

The agent decides how to group updates based on repo size:

- **Small repos**: Single PR with all patch/minor updates
- **Monorepos**: One PR per submodule with `working_dir` set
- **Major bumps**: Always an issue, never batched
- **Security updates**: Separate PR with high confidence

## Fallback

When a batch PR has `fallback_strategy: "individual_on_failure"`, the executor:

1. Tries the batch first (all updates in one branch)
2. If tests fail, deletes the branch
3. Creates individual PRs for each dependency
4. Each one is tested independently
