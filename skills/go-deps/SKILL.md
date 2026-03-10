---
name: go-deps
description: Go dependency scanning recipes for quartermaster. Load when the repo has go.mod files. Covers single-module repos, go.work monorepos, private modules, and version parsing.
---

# Go Dependency Scanning

## When to Use

Load this skill when you find `go.mod` in the repository.

## Single Module Repos

For repos with one `go.mod` (no `go.work`), run:

```bash
go list -m -u -json all 2>/dev/null | python3 -c "
import json, sys
data = sys.stdin.read()
decoder = json.JSONDecoder()
pos = 0
while pos < len(data):
    data_stripped = data[pos:].lstrip()
    if not data_stripped: break
    pos = len(data) - len(data_stripped)
    obj, end = decoder.raw_decode(data, pos)
    pos += end - pos + (len(data[pos:]) - len(data[pos:].lstrip()))
    if obj.get('Main') or not obj.get('Update'): continue
    if obj.get('Indirect'): continue
    cur = obj['Version']
    upd = obj['Update']['Version']
    print(f'{obj[\"Path\"]}: {cur} -> {upd}')
"
```

Focus on DIRECT dependencies only (Indirect=false). Transitive deps are not worth updating unless they have security issues.

## Go Workspace Monorepos

If `go.work` exists, the workspace-level `go list -m -u -json all` does NOT show updates for workspace members. You MUST check each module individually with `GOWORK=off`:

```bash
for dir in . maps parsers/* providers/*; do
  if [ -f "$dir/go.mod" ]; then
    echo "=== $dir ==="
    cd "$dir" && GOWORK=off go list -m -u -json all 2>/dev/null | python3 -c "
import json, sys
data = sys.stdin.read()
decoder = json.JSONDecoder()
pos = 0
while pos < len(data):
    data_stripped = data[pos:].lstrip()
    if not data_stripped: break
    pos = len(data) - len(data_stripped)
    obj, end = decoder.raw_decode(data, pos)
    pos += end - pos + (len(data[pos:]) - len(data[pos:].lstrip()))
    if obj.get('Main') or not obj.get('Update'): continue
    if obj.get('Indirect'): continue
    cur = obj['Version']
    upd = obj['Update']['Version']
    print(f'  DIRECT: {obj[\"Path\"]}: {cur} -> {upd}')
" && cd - > /dev/null
  fi
done
```

The key trick is `GOWORK=off` - without it, Go treats workspace modules as local replacements and skips upstream version checks.

## Private Modules

For repos with private modules (e.g. `go.zerodha.tech`, internal registries), `go list -m -u` will fail on DNS/checksum lookups. Workarounds:

**Option 1**: Skip private module checksums:
```bash
GONOSUMCHECK=go.zerodha.tech GONOSUMDB=go.zerodha.tech GOFLAGS=-mod=mod go list -m -u -json all 2>/dev/null | ...
```

**Option 2**: Parse error messages - they often reveal available versions:
```bash
go list -m -u -json all 2>&1 | grep -oP 'verifying go.mod: \K[^@]*@[^/]*' | sort -u
```

**Option 3**: Check individual public packages manually:
```bash
go list -m -versions github.com/some/package
```

## Version Classification

- **Patch**: v1.2.3 -> v1.2.5 (safe, batch together)
- **Minor**: v1.2.3 -> v1.3.0 (usually safe, batch by ecosystem)
- **Major**: v1.x -> v2.x or v0.x -> v1.x (create issue, never batch)
- **Pre-1.0**: v0.8 -> v0.11 (treat as potentially breaking, flag in description)
- **Large jumps**: v1.9 -> v1.69 (technically minor but flag for review)

## Commands (Allowlisted)

Only these Go commands are allowed in the plan:
- `go get <pkg>@<version>`
- `go mod tidy`
- `go mod download`

For monorepo subdirectories, use the `working_dir` field on the action instead of `cd`.
Do NOT chain commands with `&&` or use `cd` in commands.
