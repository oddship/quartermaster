// Command allowlist for dependency update operations.
// The executor ONLY runs commands that match these patterns.
// This is the trust boundary between the agent and the system.

export interface AllowlistEntry {
  /** The binary that must be at the start of the command */
  binary: string;
  /** Allowed subcommand prefixes after the binary */
  prefixes: string[];
}

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

/**
 * Check if a command is allowed by the allowlist.
 * Returns true if the command matches any entry.
 */
export function isCommandAllowed(
  command: string,
  allowlist: AllowlistEntry[] = DEP_UPDATE_ALLOWLIST,
): boolean {
  const trimmed = command.trim();
  for (const entry of allowlist) {
    if (!trimmed.startsWith(entry.binary + " ")) continue;
    const rest = trimmed.slice(entry.binary.length + 1);
    for (const prefix of entry.prefixes) {
      if (rest.startsWith(prefix) || rest === prefix.trimEnd()) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns the list of disallowed commands from a command list.
 * Empty array means all commands are allowed.
 */
export function findDisallowedCommands(
  commands: string[],
  allowlist: AllowlistEntry[] = DEP_UPDATE_ALLOWLIST,
): string[] {
  return commands.filter((cmd) => !isCommandAllowed(cmd, allowlist));
}
