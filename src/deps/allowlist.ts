// Command allowlist for the dependency update mission.
// Uses the AllowlistEntry type from the core mission interface.

import type { AllowlistEntry } from "../mission.js";

/** Commands the executor is allowed to run for dependency updates. */
export const DEP_UPDATE_ALLOWLIST: AllowlistEntry[] = [
  // Go
  { binary: "go", prefixes: ["get ", "mod tidy", "mod download"] },
  // Node.js
  { binary: "npm", prefixes: ["update ", "install ", "audit fix"] },
  { binary: "yarn", prefixes: ["upgrade ", "add "] },
  { binary: "pnpm", prefixes: ["update ", "add "] },
  { binary: "bun", prefixes: ["update ", "add "] },
  // Python
  { binary: "pip", prefixes: ["install --upgrade ", "install -U "] },
  { binary: "poetry", prefixes: ["update ", "add "] },
  // Ruby
  { binary: "bundle", prefixes: ["update "] },
  // Rust
  { binary: "cargo", prefixes: ["update -p "] },
];
