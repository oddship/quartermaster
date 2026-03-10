---
title: How it works
---

# How it works

Quartermaster is a framework for scheduled repository maintenance. It's built around "missions" - pluggable tasks defined as directories of plain files. Each mission shares the same architecture: an AI agent that reads, and a deterministic executor that writes.

## Missions

A mission is a directory containing:

```
missions/deps/
  mission.json          # {"name": "deps", "description": "..."}
  system-prompt.md      # Agent personality and instructions
  prompt.md             # Template with {repo_dir}, {existing_mrs}, etc.
  allowlist.json        # Commands the executor may run
  skills/               # Optional Pi SDK skills for the agent
    go-deps/SKILL.md
    node-deps/SKILL.md
```

Missions are discovered at runtime from the `missions/` directory. No TypeScript or recompilation needed to add one. Use `--mission <name>` to select which mission to run (default: `deps`). Use `--missions-dir <dir>` to point at a custom directory.

### Built-in missions

**deps** - Scans for outdated dependencies, batches patch/minor updates into PRs with fallback strategies, and flags major version bumps as issues. Uses ecosystem-specific skills for Go, Node.js, Python, Ruby, and Rust.

**docs-drift** - Detects documentation that has drifted from source code changes. Compares recent git history against docs to find missing, outdated, or incorrect documentation. Creates issues (not PRs) since doc fixes need human judgment.

## Architecture

```
┌─────────────┐     ┌──────────┐     ┌──────────┐
│  AI Agent   │────>│   Plan   │────>│ Executor │
│ (read-only) │     │  (JSON)  │     │ (writes) │
└─────────────┘     └──────────┘     └──────────┘
```

**Agent** (scan phase):
- Loads the mission's system prompt and skills
- Explores the repo structure
- Runs read-only commands to gather information
- Checks existing PRs/issues to avoid duplicates
- Produces a typed JSON action plan via the `submit_plan` tool
- If the plan fails validation, the agent gets the errors and fixes them (up to 3 attempts)

**Executor** (execute phase):
- Validates the plan against the mission's command allowlist
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
| `create_issue` | Open an issue (for major bumps, drift findings, etc.) |
| `comment_mr` | Add a comment to an existing PR |
| `comment_issue` | Add a comment to an existing issue |
| `close_mr` | Close a stale quartermaster PR |
| `skip` | Skip an item (with reason) |

Not every mission uses every action type. For example, `docs-drift` only produces `create_issue` and `skip` actions.

## Safety

- **Command allowlist**: Each mission defines its own allowlist. The executor only runs commands that match. Anything else is rejected.
- **Test command allowlist**: Test commands are restricted to known test runners (go, npm, bun, make, cargo, pytest, etc.).
- **Branch pattern**: All branches must match `quartermaster/*`.
- **Path safety**: `working_dir` cannot contain `..` or absolute paths.
- **Confidence threshold**: Actions below the threshold are skipped.
- **Dry-run default**: The executor does nothing unless you pass `--execute`.
- **Validation feedback**: If the agent produces an invalid plan, it gets the errors back and can fix them (up to 3 attempts).

## Grouping strategy (deps mission)

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

## Adding a mission

1. Create a directory under `missions/` (or a custom path)
2. Add `mission.json`, `system-prompt.md`, `prompt.md`, and `allowlist.json`
3. Optionally add `skills/` with Pi SDK skill files
4. Run with `--mission <name>` or `--missions-dir <dir>`

See `examples/mission-skeleton/` for a starter template, and `missions/deps/` or `missions/docs-drift/` for working examples.
