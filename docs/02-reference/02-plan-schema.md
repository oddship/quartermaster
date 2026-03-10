---
title: Plan schema
---

# Plan schema

The plan is a JSON file produced by the agent and consumed by the executor.

## Structure

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

## Action types

### `create_mr`

Create a branch, run commands, test, commit, push, and open a PR/MR.

```json
{
  "type": "create_mr",
  "branch": "quartermaster/go-patch-updates-2026-03-10",
  "title": "chore(deps): update Go patch dependencies",
  "description": "Updates 3 Go dependencies...",
  "updates": [
    { "package": "github.com/gorilla/mux", "from": "v1.8.0", "to": "v1.8.1", "update_type": "patch" }
  ],
  "commands": ["go get github.com/gorilla/mux@v1.8.1", "go mod tidy"],
  "test_command": "go test ./...",
  "labels": ["quartermaster", "dependencies"],
  "fallback_strategy": "individual_on_failure",
  "confidence": 0.85,
  "working_dir": "providers/s3"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `branch` | yes | Must match `quartermaster/*` |
| `title` | yes | PR/MR title |
| `description` | yes | PR/MR body (markdown) |
| `updates` | yes | List of dependency updates |
| `commands` | yes | Allowlisted commands to run |
| `test_command` | yes | Command to verify the update |
| `labels` | yes | Labels to apply |
| `fallback_strategy` | yes | `batch`, `individual_on_failure`, or `individual` |
| `confidence` | yes | 0-1 confidence score |
| `working_dir` | no | Subdirectory for monorepos |

### `update_mr`

Update an existing quartermaster PR (rebase, re-apply commands, force push).

```json
{
  "type": "update_mr",
  "mr_id": 42,
  "branch": "quartermaster/go-patch-updates-2026-03-03",
  "rebase_first": true,
  "updates": [...],
  "commands": [...],
  "test_command": "go test ./...",
  "description": "Updated versions...",
  "labels": ["quartermaster"],
  "confidence": 0.8
}
```

### `create_issue`

Open an issue (typically for major version bumps).

```json
{
  "type": "create_issue",
  "title": "chore(deps): major update for pgx v5 -> v6",
  "body": "Migration guide: ...",
  "labels": ["quartermaster", "major-update"],
  "confidence": 0.9
}
```

### `comment_mr` / `comment_issue`

Add a follow-up comment.

```json
{ "type": "comment_mr", "mr_id": 42, "body": "New version available...", "confidence": 0.8 }
{ "type": "comment_issue", "issue_id": 15, "body": "Still outdated...", "confidence": 0.8 }
```

### `close_mr`

Close a stale quartermaster PR.

```json
{
  "type": "close_mr",
  "mr_id": 42,
  "comment": "Superseded by newer updates",
  "delete_branch": true,
  "confidence": 0.9
}
```

### `skip`

Skip a package with a reason.

```json
{
  "type": "skip",
  "package": "golang.org/x/crypto",
  "reason": "Human requested hold",
  "reason_type": "human_hold",
  "confidence": 1.0
}
```

Reason types: `human_hold`, `recently_updated`, `no_update_available`, `pinned`.

## Command allowlist

Only these commands are allowed in `commands`:

| Ecosystem | Allowed commands |
|-----------|-----------------|
| Go | `go get <pkg>@<ver>`, `go mod tidy`, `go mod download` |
| npm | `npm update <pkg>`, `npm install <pkg>@<ver>`, `npm audit fix` |
| yarn | `yarn upgrade <pkg>@<ver>`, `yarn add <pkg>@<ver>` |
| pnpm | `pnpm update <pkg>`, `pnpm add <pkg>@<ver>` |
| bun | `bun update <pkg>`, `bun add <pkg>@<ver>` |
| pip | `pip install --upgrade <pkg>`, `pip install -U <pkg>` |
| poetry | `poetry update <pkg>`, `poetry add <pkg>@<ver>` |
| bundle | `bundle update <pkg>` |
| cargo | `cargo update -p <pkg>` |

## Validation rules

- Branch must match `quartermaster/*`
- All commands must be in the allowlist
- Confidence must be 0-1
- Maximum 20 actions per plan
- `working_dir` must be relative (no `..` or absolute paths)
- Duplicate packages in the same `working_dir` trigger warnings
