import type { PlannedAction, Team, WorldState } from "@breachverse/domain";
import { ACTIONS } from "./actions.js";
import { adjacentNodeIds, isAdjacentToFoothold, isInitialAccessTarget } from "./graph.js";

export const AP_BUDGET = 6;
export const TURN_LIMIT = 12;

export interface ValidationResult {
  ok: boolean;
  error: string | null;
  apUsed: number;
}

function hasActiveAccount(world: WorldState, targetNodeId: string): boolean {
  return Object.values(world.identities).some((identity) => identity.enabled && identity.nodeIds.includes(targetNodeId));
}

function validateTarget(world: WorldState, team: Team, action: PlannedAction): string | null {
  const target = world.nodes[action.targetNodeId];
  if (!target) return "INVALID_TARGET";
  if (team === "RED" && !world.red.discoveredNodeIds.includes(target.id)) return "TARGET_NOT_VISIBLE";

  switch (action.type) {
    case "RECON_NODE":
      return adjacentNodeIds(world, target.id).some((id) => !world.red.discoveredNodeIds.includes(id))
        ? null : "NO_UNDISCOVERED_NEIGHBORS";
    case "SCAN_SERVICE":
      return target.kind === "INTERNET" ? "INVALID_TARGET" : null;
    case "CREDENTIAL_ATTACK":
      return hasActiveAccount(world, target.id) ? null : "NO_ACTIVE_ACCOUNT";
    case "GAIN_FOOTHOLD":
      if (target.kind === "INTERNET") return "INVALID_TARGET";
      if (world.red.footholdNodeIds.includes(target.id)) return "ALREADY_COMPROMISED";
      return isInitialAccessTarget(world, target.id) ? null : "TARGET_INACCESSIBLE";
    case "LATERAL_MOVEMENT":
      if (world.red.footholdNodeIds.includes(target.id)) return "ALREADY_COMPROMISED";
      return isAdjacentToFoothold(world, target.id) ? null : "TARGET_INACCESSIBLE";
    case "EXFILTRATE_DATA":
      return target.containsProtectedData && world.red.footholdNodeIds.includes(target.id) && !target.isolated
        ? null : "EXFILTRATION_PREREQUISITE_MISSING";
    case "ISOLATE_NODE":
      return target.kind === "INTERNET" ? "INVALID_TARGET" : null;
    case "DISABLE_ACCOUNT":
      return hasActiveAccount(world, target.id) ? null : "NO_ACTIVE_ACCOUNT";
    case "INVESTIGATE_NODE":
    case "INCREASE_MONITORING":
    case "THREAT_HUNT":
      return target.kind === "INTERNET" ? "INVALID_TARGET" : null;
  }
}

export function validatePlan(world: WorldState, team: Team, plan: PlannedAction[]): ValidationResult {
  const ids = new Set<string>();
  let apUsed = 0;

  for (const action of plan) {
    if (ids.has(action.id)) return { ok: false, error: "DUPLICATE_ACTION_ID", apUsed };
    ids.add(action.id);
    const definition = ACTIONS[action.type];
    if (!definition || definition.team !== team) return { ok: false, error: "INVALID_ACTION_FOR_ROLE", apUsed };
    apUsed += definition.cost;
    if (apUsed > AP_BUDGET) return { ok: false, error: "AP_BUDGET_EXCEEDED", apUsed };
    const targetError = validateTarget(world, team, action);
    if (targetError) return { ok: false, error: targetError, apUsed };
  }

  return { ok: true, error: null, apUsed };
}

