---
title: CLI reference
---

# CLI reference

## Commands

### `scan`

Run the AI agent to scan a repo and produce a plan.

```bash
quartermaster scan [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--repo-dir <dir>` | `.` | Repository directory |
| `-o, --output <file>` | `plan.json` | Output plan file |
| `--model <model>` | `anthropic/claude-sonnet-4-20250514` | LLM model |
| `--reasoning-effort <level>` | | `low`, `medium`, or `high` |
| `--platform <platform>` | auto | `gitlab` or `github` |
| `--project-url <url>` | auto | Project URL |
| `--default-branch <branch>` | auto | Default branch |
| `-v, --verbose` | | Verbose logging |

### `validate`

Validate a plan JSON file.

```bash
quartermaster validate <plan-file>
```

Checks: branch patterns, command allowlist, confidence range, working_dir safety, duplicate detection.

### `execute`

Execute a validated plan.

```bash
quartermaster execute <plan-file> [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--repo-dir <dir>` | `.` | Repository directory |
| `--execute` | | Actually run (without this, dry-run) |
| `--confidence-threshold <n>` | `0.5` | Skip actions below this |
| `--platform <platform>` | auto | `gitlab` or `github` |
| `-v, --verbose` | | Verbose logging |

### `run`

Full pipeline: scan + validate + execute.

```bash
quartermaster run [options]
```

Combines all flags from `scan` and `execute`.

## Models

Use `--model provider/model-id` or just the model name:

```bash
--model anthropic/claude-sonnet-4-6     # Anthropic
--model google/gemini-2.5-flash         # Google
--model openai/gpt-4o                   # OpenAI
--model bedrock/converse/arn:aws:...    # AWS Bedrock
--model gemini-2.5-flash               # auto-detects google
--model claude-sonnet-4-6              # auto-detects anthropic
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
