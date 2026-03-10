---
name: node-deps
description: Node.js dependency scanning recipes for quartermaster. Load when the repo has package.json files. Covers npm, yarn, pnpm, and bun.
---

# Node.js Dependency Scanning

## When to Use

Load this skill when you find `package.json` in the repository.

## Finding Outdated Dependencies

### npm
```bash
npm outdated --json 2>/dev/null
```
Output: JSON with `current`, `wanted`, `latest` for each outdated package.

### yarn
```bash
yarn outdated --json 2>/dev/null
```

### pnpm
```bash
pnpm outdated --format json 2>/dev/null
```

Focus on `dependencies` and `devDependencies` (direct deps). Ignore transitive.

## Monorepo Workspaces

For yarn/npm/pnpm workspaces, check each workspace package:
```bash
# npm workspaces
npm outdated --json --workspaces 2>/dev/null

# Or check each workspace individually
for pkg in packages/*/; do
  if [ -f "$pkg/package.json" ]; then
    echo "=== $pkg ==="
    cd "$pkg" && npm outdated --json 2>/dev/null && cd - > /dev/null
  fi
done
```

Use `working_dir` on the action to target specific workspace packages.

## Version Classification

- **Patch**: 1.2.3 -> 1.2.5 (safe, batch together)
- **Minor**: 1.2.3 -> 1.3.0 (usually safe, review changelog)
- **Major**: 1.x -> 2.x (create issue, never batch)
- **Pre-1.0**: 0.8 -> 0.11 (treat as potentially breaking)

## Commands (Allowlisted)

Only these Node commands are allowed in the plan:
- `npm update <pkg>`, `npm install <pkg>@<version>`, `npm audit fix`
- `yarn upgrade <pkg>@<version>`, `yarn add <pkg>@<version>`
- `pnpm update <pkg>`, `pnpm add <pkg>@<version>`
- `bun update <pkg>`, `bun add <pkg>@<version>`

For monorepo subdirectories, use the `working_dir` field instead of `cd`.
