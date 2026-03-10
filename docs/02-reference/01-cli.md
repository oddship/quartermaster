---
title: CLI reference
---

# CLI reference

## Global options

| Flag | Description |
|------|-------------|
| `--missions-dir <dir>` | Directory containing mission definitions (default: built-in) |
| `-V, --version` | Print version |
| `-h, --help` | Show help |

## Commands

### `scan`

Run the AI agent to scan a repo and produce a plan.

```bash
quartermaster scan [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--mission <name>` | `deps` | Mission to run |
| `--repo-dir <dir>` | `.` | Repository directory |
| `-o, --output <file>` | `plan.json` | Output plan file |
| `--model <model>` | `anthropic/claude-sonnet-4-20250514` | LLM model |
| `--reasoning-effort <level>` | | `low`, `medium`, or `high` |
| `--platform <platform>` | auto | `gitlab` or `github` |
| `--project-url <url>` | auto | Project URL |
| `--default-branch <branch>` | auto | Default branch |
| `-v, --verbose` | | Verbose logging |

### `validate`

Validate a plan JSON file against the mission's rules.

```bash
quartermaster validate [options] <plan-file>
```

| Flag | Default | Description |
|------|---------|-------------|
| `--mission <name>` | `deps` | Mission (determines which allowlist to check against) |
| `-v, --verbose` | | Verbose logging |

Checks: branch patterns, command allowlist, confidence range, working_dir safety, duplicate detection.

### `execute`

Execute a validated plan.

```bash
quartermaster execute [options] <plan-file>
```

| Flag | Default | Description |
|------|---------|-------------|
| `--mission <name>` | `deps` | Mission (determines which allowlist to use) |
| `--repo-dir <dir>` | `.` | Repository directory |
| `--execute` | | Actually run (without this flag, dry-run) |
| `--confidence-threshold <n>` | `0.5` | Skip actions below this confidence |
| `--platform <platform>` | auto | `gitlab` or `github` |
| `--project-url <url>` | auto | Project URL |
| `--default-branch <branch>` | auto | Default branch |
| `-v, --verbose` | | Verbose logging |

### `run`

Full pipeline: scan + validate + execute.

```bash
quartermaster run [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--mission <name>` | `deps` | Mission to run |
| `--repo-dir <dir>` | `.` | Repository directory |
| `--model <model>` | `anthropic/claude-sonnet-4-20250514` | LLM model |
| `--reasoning-effort <level>` | | `low`, `medium`, or `high` |
| `--execute` | | Actually run (without this flag, dry-run) |
| `--confidence-threshold <n>` | `0.5` | Skip actions below this confidence |
| `--platform <platform>` | auto | `gitlab` or `github` |
| `--project-url <url>` | auto | Project URL |
| `--default-branch <branch>` | auto | Default branch |
| `-v, --verbose` | | Verbose logging |

## Missions

Built-in missions:

| Name | Description |
|------|-------------|
| `deps` | Scan for outdated dependencies and create update PRs/issues |
| `docs-drift` | Detect documentation that has drifted from source code changes |

Select a mission with `--mission <name>`. Default is `deps`.

To use custom missions, point `--missions-dir` at a directory containing mission subdirectories.

## Models

Use `--model provider/model-id` or just the model name (provider auto-detected):

```bash
--model anthropic/claude-sonnet-4-20250514   # Anthropic
--model google/gemini-2.5-flash              # Google
--model openai/gpt-4o                        # OpenAI
--model bedrock/converse/arn:aws:...         # AWS Bedrock
--model gemini-2.5-flash                     # auto-detects google
--model claude-sonnet-4-20250514             # auto-detects anthropic
```

## Environment variables

| Variable | Provider |
|----------|----------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) |
| `GEMINI_API_KEY` | Google (Gemini) |
| `OPENAI_API_KEY` | OpenAI (GPT) |
| `LLM_API_KEY` | Any (fallback) |
| `QUARTERMASTER_GITLAB_TOKEN` | GitLab API |
| `QUARTERMASTER_GITHUB_TOKEN` | GitHub API |

## Platform detection

Priority: CLI flags > CI environment variables > git remote > defaults.

Detected automatically from:
- `GITLAB_CI` / `CI_PROJECT_URL` (GitLab CI)
- `GITHUB_ACTIONS` / `GITHUB_REPOSITORY` (GitHub Actions)
- `git remote get-url origin` (local)
