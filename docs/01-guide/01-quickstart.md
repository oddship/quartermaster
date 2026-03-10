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

The base image includes the framework and built-in missions. Language toolchains (Go, Node, etc.) come from your CI runner or a [derived image](https://github.com/oddship/quartermaster/tree/main/examples).

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
# Dependency updates (default mission)
quartermaster scan --repo-dir /path/to/your/repo

# Documentation drift detection
quartermaster scan --mission docs-drift --repo-dir /path/to/your/repo

# Docker
docker run --rm \
  -e ANTHROPIC_API_KEY \
  -v /path/to/your/repo:/workspace \
  ghcr.io/oddship/quartermaster:latest \
  scan --repo-dir /workspace
```

This produces a `plan.json` with the agent's recommendations.

## Review the plan

```bash
# Validate the plan
quartermaster validate plan.json

# Dry-run the executor (see what would happen)
quartermaster execute plan.json --repo-dir /path/to/your/repo
```

## Execute the plan

When you're ready to create PRs and issues:

```bash
quartermaster execute plan.json --repo-dir /path/to/your/repo --execute
```

This creates branches, runs the whitelisted commands, tests, commits, pushes, and opens PRs/issues via `gh` or `glab`.

## Full pipeline

Run scan + execute in one command:

```bash
quartermaster run --repo-dir /path/to/your/repo --execute
```

Omit `--execute` for a dry run (default).
