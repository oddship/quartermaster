// Mission registry - all available missions.

import type { Mission } from "./mission.js";
import { depsMission } from "./deps/mission.js";

const missions: Map<string, Mission> = new Map([
  ["deps", depsMission],
]);

export function getMission(name: string): Mission {
  const mission = missions.get(name);
  if (!mission) {
    const available = [...missions.keys()].join(", ");
    throw new Error(`Unknown mission: "${name}". Available: ${available}`);
  }
  return mission;
}

export function listMissions(): Mission[] {
  return [...missions.values()];
}
