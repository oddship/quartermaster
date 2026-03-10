# Quartermaster

A scheduled AI agent framework for repository maintenance. Runs on a schedule, inspects your repos, and takes action - creating pull requests, issues, and follow-ups.

**[Documentation](https://oddship.github.io/quartermaster/)**

## How it works

1. An AI agent scans your repo (read-only) and produces a JSON action plan
2. A deterministic executor validates the plan and carries it out
3. Only whitelisted commands are allowed. Dry-run by default.

## Missions

Quartermaster is built around "missions" - pluggable maintenance tasks defined as directories of markdown and JSON files. No code changes needed to add a mission.

### Built-in missions

| Mission | Description |
|---------|-------------|
| `deps` | Scan for outdated dependencies, batch patch/minor into PRs, flag major bumps as issues |
| `docs-drift` | Detect documentation that has drifted from source code changes |

The `deps` mission supports Go, Node.js (npm/yarn/pnpm/bun), Python (pip/poetry), Ruby (bundler), and Rust (cargo). Monorepo-aware.

### Custom missions

A mission is just a directory:

```
missions/my-mission/
  mission.json          # name and description
  system-prompt.md      # agent instructions
  prompt.md             # template with {repo_dir}, {existing_mrs}, etc.
  allowlist.json        # commands the executor may run
  skills/               # optional Pi SDK skills
```

See `examples/mission-skeleton/` for a starter template.

## Quick start

```bash
export ANTHROPIC_API_KEY=sk-ant-...

# Scan for outdated dependencies (default mission)
quartermaster scan --repo-dir ./my-repo

# Scan for documentation drift
quartermaster scan --mission docs-drift --repo-dir ./my-repo

# Review what it found
quartermaster validate plan.json

# Create PRs and issues
quartermaster execute plan.json --repo-dir ./my-repo --execute
```

Or run the full pipeline:

```bash
quartermaster run --repo-dir ./my-repo --execute
```

## Docker

The base image ships the framework and built-in missions. Language toolchains come from your CI runner or a derived image.

```bash
# Run directly
docker run --rm \
  -e ANTHROPIC_API_KEY \
  -v /path/to/repo:/workspace \
  ghcr.io/oddship/quartermaster:latest \
  scan --repo-dir /workspace

# Extend with Go toolchain
FROM ghcr.io/oddship/quartermaster:latest
RUN apt-get update && apt-get install -y golang-go
```

See `examples/Dockerfile.deps-go` and `examples/Dockerfile.deps-node` for complete examples.

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
      - run: bun run /app/dist/cli.js run --repo-dir $GITHUB_WORKSPACE --execute
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

## Supported models

Works with any LLM via the Pi SDK. Default: `anthropic/claude-sonnet-4-20250514`.

```
anthropic/claude-sonnet-4-20250514   # ANTHROPIC_API_KEY
google/gemini-2.5-flash              # GEMINI_API_KEY
openai/gpt-4o                        # OPENAI_API_KEY
bedrock/converse/arn:aws:...         # AWS IAM
```

## License

MIT
