---
title: CI setup
---

# CI setup

Run quartermaster on a schedule to keep repositories maintained automatically.

## GitHub Actions

Copy `ci/quartermaster.yml` to `.github/workflows/quartermaster.yml` in your repo:

```yaml
name: Quartermaster

on:
  schedule:
    - cron: '0 2 * * 0'  # Weekly, Sunday 2am UTC
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Dry run (no PRs/issues created)'
        type: boolean
        default: false

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  dependency-scan:
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/oddship/quartermaster:latest
    steps:
      - uses: actions/checkout@v4
      - run: git config --global --add safe.directory $GITHUB_WORKSPACE
      - run: gh auth setup-git
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - run: |
          bun run /app/dist/cli.js run \
            --repo-dir "$GITHUB_WORKSPACE" \
            --execute
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Set `ANTHROPIC_API_KEY` (or `GEMINI_API_KEY` / `OPENAI_API_KEY`) in your repo's **Settings > Secrets**.

The default `GITHUB_TOKEN` is used for creating PRs and issues.

### Running a different mission

Change the `run` command to specify a mission:

```bash
bun run /app/dist/cli.js run \
  --mission docs-drift \
  --repo-dir "$GITHUB_WORKSPACE" \
  --execute
```

### Using a custom missions directory

Mount or copy your missions into the container:

```yaml
    container:
      image: ghcr.io/oddship/quartermaster:latest
      volumes:
        - ./my-missions:/app/custom-missions
    steps:
      # ...
      - run: |
          bun run /app/dist/cli.js run \
            --missions-dir /app/custom-missions \
            --mission my-custom-mission \
            --repo-dir "$GITHUB_WORKSPACE" \
            --execute
```

## GitLab CI

Add to your `.gitlab-ci.yml`:

```yaml
include:
  - project: 'commons/gitlab-templates'
    ref: master
    file: '/quartermaster/.gitlab-ci-template.yml'

quartermaster-deps:
  extends: .quartermaster-deps
  variables:
    QUARTERMASTER_DRY_RUN: "false"
```

Then create a **pipeline schedule** at Settings > CI/CD > Schedules (e.g. weekly, Sunday 2am UTC).

### Required CI/CD variables

| Variable | Description |
|----------|-------------|
| `QUARTERMASTER_GITLAB_TOKEN` | GitLab access token with `api` scope + developer role |
| `ANTHROPIC_API_KEY` | LLM API key (or `GEMINI_API_KEY`, `OPENAI_API_KEY`) |

### Optional variables

| Variable | Default | Description |
|----------|---------|-------------|
| `QUARTERMASTER_MODEL` | `anthropic/claude-sonnet-4-20250514` | LLM model |
| `QUARTERMASTER_MISSION` | `deps` | Mission to run |
| `QUARTERMASTER_CONFIDENCE` | `0.5` | Minimum confidence threshold |
| `QUARTERMASTER_DRY_RUN` | `true` | Set to `false` to create MRs |
| `QUARTERMASTER_VERSION` | `latest` | Docker image version |

## Bedrock (AWS)

For runners with IAM roles, use a Bedrock model:

```yaml
QUARTERMASTER_MODEL: "bedrock/converse/anthropic.claude-sonnet-4-20250514"
```

No API key needed - credentials are fetched from instance metadata (IMDS).

## Docker image

The base image (`ghcr.io/oddship/quartermaster`) ships the framework and built-in missions but no language toolchains. In CI, language tools typically come from the runner environment.

To add tools, extend the base image:

```dockerfile
FROM ghcr.io/oddship/quartermaster:latest
USER root
RUN apt-get update && apt-get install -y golang-go
USER bun
```

See `examples/Dockerfile.deps-go` and `examples/Dockerfile.deps-node` for complete examples.
