import type { ActionDefinition, ActionType, Team } from "@breachverse/domain";

export const ACTIONS: Record<ActionType, ActionDefinition> = {
  RECON_NODE: {
    id: "RECON_NODE", team: "RED", name: "Recon node", cost: 1, speed: 95, noise: 12,
    description: "Map directly connected infrastructure from a known asset.",
  },
  SCAN_SERVICE: {
    id: "SCAN_SERVICE", team: "RED", name: "Scan services", cost: 1, speed: 85, noise: 35,
    description: "Profile services on a discovered node.",
  },
  CREDENTIAL_ATTACK: {
    id: "CREDENTIAL_ATTACK", team: "RED", name: "Credential attack", cost: 2, speed: 58, noise: 60,
    description: "Attempt to obtain an account usable from this asset.",
  },
  GAIN_FOOTHOLD: {
    id: "GAIN_FOOTHOLD", team: "RED", name: "Gain foothold", cost: 2, speed: 48, noise: 72,
    description: "Attempt initial access against a discovered perimeter asset.",
  },
  LATERAL_MOVEMENT: {
    id: "LATERAL_MOVEMENT", team: "RED", name: "Lateral movement", cost: 2, speed: 44, noise: 66,
    description: "Move from an active foothold to an adjacent discovered node.",
  },
  EXFILTRATE_DATA: {
    id: "EXFILTRATE_DATA", team: "RED", name: "Exfiltrate data", cost: 3, speed: 20, noise: 88,
    description: "Extract protected data from a compromised data store.",
  },
  INVESTIGATE_NODE: {
    id: "INVESTIGATE_NODE", team: "BLUE", name: "Investigate node", cost: 1, speed: 52, noise: 0,
    description: "Examine endpoint evidence and raise investigative confidence.",
  },
  INCREASE_MONITORING: {
    id: "INCREASE_MONITORING", team: "BLUE", name: "Increase monitoring", cost: 1, speed: 90, noise: 0,
    description: "Increase telemetry coverage and future detection probability.",
  },
  ISOLATE_NODE: {
    id: "ISOLATE_NODE", team: "BLUE", name: "Isolate node", cost: 2, speed: 100, noise: 0,
    description: "Block network reachability to and from an asset.",
  },
  DISABLE_ACCOUNT: {
    id: "DISABLE_ACCOUNT", team: "BLUE", name: "Disable account", cost: 2, speed: 82, noise: 0,
    description: "Disable one active account associated with the selected asset.",
  },
  THREAT_HUNT: {
    id: "THREAT_HUNT", team: "BLUE", name: "Threat hunt", cost: 2, speed: 40, noise: 0,
    description: "Search broadly for hidden attacker activity on an asset.",
  },
};

export function actionDefinitionsFor(team: Team): ActionDefinition[] {
  return Object.values(ACTIONS).filter((action) => action.team === team);
}

