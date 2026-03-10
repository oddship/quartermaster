---
name: node-deps
description: Node.js dependency scanning recipes for quartermaster. Load when the repo has package.json files. Covers npm, yarn, pnpm, and bun.
---

# Node.js Dependency Scanning

## When to Use

Load this skill when you find `package.json` in the repository.

## Finding Outdated Dependencies

Use `npx npm-check-updates --jsonUpgraded` to find ALL available updates,
including minor/patch bumps within the current semver range. This is better
than `npm outdated` which only shows packages where `latest` exceeds the
range in package.json.

### npm / bun
```bash
npx npm-check-updates --jsonUpgraded 2>/dev/null
```
Output: JSON object mapping package names to their latest versions.
Example: `{"chalk": "^5.6.2", "commander": "^14.0.3"}`

To see current vs latest:
```bash
npx npm-check-updates 2>/dev/null
```

### yarn
```bash
yarn outdated --json 2>/dev/null
```

### pnpm
```bash
pnpm outdated --format json 2>/dev/null
```

### Determining current versions

Read `package.json` to get the current version ranges. Compare against the
output of npm-check-updates to classify updates.

Focus on `dependencies` and `devDependencies` (direct deps). Ignore transitive.

## Monorepo Workspaces

For yarn/npm/pnpm workspaces, check each workspace package:
```bash
# npm workspaces
npx npm-check-updates --jsonUpgraded --workspaces 2>/dev/null

# Or check each workspace individually
for pkg in packages/*/; do
  if [ -f "$pkg/package.json" ]; then
    echo "=== $pkg ==="
    cd "$pkg" && npx npm-check-updates --jsonUpgraded 2>/dev/null && cd - > /dev/null
  fi
done
```

Use `working_dir` on the action to target specific workspace packages.

## Version Classification

- **Patch**: 1.2.3 -> 1.2.5 (safe, batch together in a PR)
- **Minor**: 1.2.3 -> 1.3.0 (usually safe, batch with patch updates in a PR)
- **Major**: 1.x -> 2.x (create issue, never batch)
- **Pre-1.0**: 0.8 -> 0.11 (treat as potentially breaking, create issue)

Patch and minor updates should be batched into `create_mr` actions.
Major and pre-1.0 breaking updates should be `create_issue` actions.

## Commands (Allowlisted)

Only these Node commands are allowed in the plan:
- `npm update <pkg>`, `npm install <pkg>@<version>`, `npm audit fix`
- `yarn upgrade <pkg>@<version>`, `yarn add <pkg>@<version>`
- `pnpm update <pkg>`, `pnpm add <pkg>@<version>`
- `bun update <pkg>`, `bun add <pkg>@<version>`

For monorepo subdirectories, use the `working_dir` field instead of `cd`.
