// Mission registry - loads missions from directory at runtime.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Mission } from "./mission.js";
import { loadMissions } from "./loader.js";

const currentDir = dirname(fileURLToPath(import.meta.url));

// Default missions directory: ../missions relative to src/ (or dist/)
const DEFAULT_MISSIONS_DIR = resolve(currentDir, "..", "missions");

let missions: Map<string, Mission> | null = null;
let missionsDir = DEFAULT_MISSIONS_DIR;

/**
 * Set a custom missions directory. Call before getMission/listMissions.
 */
export function setMissionsDir(dir: string): void {
  missionsDir = resolve(dir);
  missions = null; // force reload
}

function ensureLoaded(): Map<string, Mission> {
  if (!missions) {
    missions = loadMissions(missionsDir);
  }
  return missions;
}

export function getMission(name: string): Mission {
  const loaded = ensureLoaded();
  const mission = loaded.get(name);
  if (!mission) {
    const available = [...loaded.keys()].join(", ") || "(none)";
    throw new Error(`Unknown mission: "${name}". Available: ${available}`);
  }
  return mission;
}

export function listMissions(): Mission[] {
  return [...ensureLoaded().values()];
}
