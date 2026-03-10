# Quartermaster

An AI agent that keeps your dependencies up to date. Runs on a schedule, scans for outdated packages, and creates pull requests and issues.

**[Documentation](https://oddship.github.io/quartermaster/)**

## How it works

1. An AI agent scans your repo (read-only) and produces a JSON action plan
2. A deterministic executor validates the plan and creates PRs/issues
3. Only whitelisted commands are allowed. Dry-run by default.

The agent batches patch/minor updates into PRs with fallback strategies, and flags major version bumps as issues for human review.

## Quick start

```bash
export ANTHROPIC_API_KEY=sk-ant-...

# Scan a repo
quartermaster scan --repo-dir ./my-repo --model anthropic/claude-sonnet-4-6

# Review what it found
quartermaster validate plan.json

# Create PRs and issues
quartermaster execute plan.json --repo-dir ./my-repo --execute
```

Or run the full pipeline:

```bash
quartermaster run --repo-dir ./my-repo --model anthropic/claude-sonnet-4-6 --execute
```

## CI

### GitHub Actions

```yaml
# .github/workflows/quartermaster.yml
on:
  schedule:
    - cron: '0 2 * * 0'  # Weekly
jobs:
  deps:
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/oddship/quartermaster:latest
    steps:
      - uses: actions/checkout@v4
      - run: git config --global --add safe.directory $GITHUB_WORKSPACE
      - run: gh auth setup-git
        env: { GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}" }
      - run: bun run /app/dist/cli.js run --repo-dir $GITHUB_WORKSPACE --model anthropic/claude-sonnet-4-6 --execute
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### GitLab CI

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

## Supported ecosystems

Go, Node.js (npm/yarn/pnpm/bun), Python (pip/poetry), Ruby (bundler), Rust (cargo).

## Supported models

Works with any LLM via the Pi SDK:

```
anthropic/claude-sonnet-4-6    # ANTHROPIC_API_KEY
google/gemini-2.5-flash        # GEMINI_API_KEY
openai/gpt-4o                  # OPENAI_API_KEY
bedrock/converse/arn:aws:...   # AWS IAM
```

## License

MIT
