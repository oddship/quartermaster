---
title: Quickstart
---

# Quickstart

## Install

Quartermaster runs as a Docker container or directly with Bun.

### Docker (recommended)

```bash
docker pull ghcr.io/oddship/quartermaster:latest
```

### From source

```bash
git clone https://github.com/oddship/quartermaster.git
cd quartermaster
bun install
```

## Set your API key

Quartermaster needs an LLM API key. Set one of:

```bash
export ANTHROPIC_API_KEY=sk-ant-...    # Claude (recommended)
export GEMINI_API_KEY=AIza...          # Gemini
export OPENAI_API_KEY=sk-...           # GPT
```

## Scan a repo

```bash
# From source
bun run src/cli.ts scan --repo-dir /path/to/your/repo --model anthropic/claude-sonnet-4-6

# Docker
docker run --rm \
  -e ANTHROPIC_API_KEY \
  -v /path/to/your/repo:/workspace \
  ghcr.io/oddship/quartermaster:latest \
  scan --repo-dir /workspace --model anthropic/claude-sonnet-4-6
```

This produces a `plan.json` with the agent's recommendations.

## Review the plan

```bash
# Validate the plan
bun run src/cli.ts validate plan.json

# Dry-run the executor (see what would happen)
bun run src/cli.ts execute plan.json --repo-dir /path/to/your/repo
```

## Execute the plan

When you're ready to create PRs and issues:

```bash
bun run src/cli.ts execute plan.json --repo-dir /path/to/your/repo --execute
```

This creates branches, runs the whitelisted commands, tests, commits, pushes, and opens PRs/issues via `gh` or `glab`.

## Full pipeline

Run scan + execute in one command:

```bash
bun run src/cli.ts run --repo-dir /path/to/your/repo --model anthropic/claude-sonnet-4-6 --execute
```

Omit `--execute` for a dry run (default).
