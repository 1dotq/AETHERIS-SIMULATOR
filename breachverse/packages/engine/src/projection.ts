import type {
  AuthoritativeEvent,
  AvailableAction,
  MatchRecord,
  NodeState,
  PlannedAction,
  PlayerView,
  Team,
  ViewEvent,
  VisibleNode,
} from "@breachverse/domain";
import { actionDefinitionsFor } from "./actions.js";
import { isReachableForRed } from "./graph.js";
import { AP_BUDGET, TURN_LIMIT, validatePlan } from "./validation.js";

function actionResultMessage(event: AuthoritativeEvent, team: Team): string {
  const target = event.targetNodeId ?? "target";
  if (team === "RED") {
    switch (event.type) {
      case "RECON_COMPLETED": return event.success ? `Recon from ${target} revealed connected infrastructure.` : `Recon from ${target} found no new assets.`;
      case "SERVICE_SCAN_COMPLETED": return event.success ? `Service profile completed for ${target}.` : `Service scan on ${target} could not complete.`;
      case "CREDENTIAL_ATTACKED": return event.success ? `Credential material associated with ${target} was obtained.` : `Credential access against ${target} failed.`;
      case "FOOTHOLD_ATTEMPTED": return event.success ? `A foothold was established on ${target}.` : `Initial access to ${target} failed.`;
      case "LATERAL_MOVEMENT": return event.success ? `Lateral movement to ${target} succeeded.` : `Lateral movement to ${target} failed.`;
      case "DATA_EXFILTRATION": return event.success ? "Protected finance data was exfiltrated." : "The exfiltration channel failed.";
      default: return "Action resolved.";
    }
  }

  switch (event.type) {
    case "MONITORING_INCREASED": return `Telemetry coverage increased on ${target}.`;
    case "NODE_ISOLATED": return event.detailCode === "ACTIVE_INTRUSION_CONTAINED"
      ? `Isolation of ${target} contained confirmed malicious access.`
      : `${target} was isolated as a precaution.`;
    case "ACCOUNT_DISABLED": return event.success ? `An account associated with ${target} was disabled.` : `No active account was available on ${target}.`;
    case "NODE_INVESTIGATED": return event.success ? `Investigation confirmed malicious access on ${target}.` : `Investigation of ${target} found no conclusive evidence.`;
    case "THREAT_HUNTED": return event.success ? `Threat hunt found hidden activity on ${target}.` : `Threat hunt on ${target} returned no findings.`;
    default: return "Defensive action resolved.";
  }
}

export function projectEvent(
  event: AuthoritativeEvent,
  team: Team,
  visibleNodeIds?: ReadonlySet<string>,
): ViewEvent | null {
  if (event.type === "TURN_RESOLVED") {
    return { id: event.id, sequence: event.sequence, turn: event.turn, tone: "INFO", category: "SYSTEM", message: `Turn ${event.turn} resolution complete.`, nodeId: null };
  }
  if (event.type === "MATCH_ENDED") {
    return { id: event.id, sequence: event.sequence, turn: event.turn, tone: "WARNING", category: "SYSTEM", message: `Match ended: ${event.detailCode.replaceAll("_", " ").toLowerCase()}.`, nodeId: null };
  }

  if (team === "RED") {
    if (event.actor === "RED" && event.type !== "TELEMETRY_GENERATED") {
      return {
        id: event.id,
        sequence: event.sequence,
        turn: event.turn,
        tone: event.success ? "SUCCESS" : "WARNING",
        category: event.type === "RECON_COMPLETED" || event.type === "SERVICE_SCAN_COMPLETED" ? "INTEL" : "ACTION",
        message: actionResultMessage(event, team),
        nodeId: event.targetNodeId,
      };
    }
    if (event.type === "NODE_ISOLATED") {
      if (event.targetNodeId && visibleNodeIds && !visibleNodeIds.has(event.targetNodeId)) return null;
      return {
        id: event.id, sequence: event.sequence, turn: event.turn, tone: "WARNING", category: "ALERT",
        message: `Connectivity to ${event.targetNodeId ?? "an asset"} changed.`, nodeId: event.targetNodeId,
      };
    }
    if (event.type === "ACCOUNT_DISABLED" && event.detailCode === "HELD_CREDENTIAL_REVOKED") {
      if (event.targetNodeId && visibleNodeIds && !visibleNodeIds.has(event.targetNodeId)) return null;
      return {
        id: event.id, sequence: event.sequence, turn: event.turn, tone: "WARNING", category: "ALERT",
        message: "A previously acquired credential is no longer accepted.", nodeId: event.targetNodeId,
      };
    }
    return null;
  }

  if (event.actor === "BLUE") {
    return {
      id: event.id,
      sequence: event.sequence,
      turn: event.turn,
      tone: event.success ? "SUCCESS" : "INFO",
      category: "ACTION",
      message: actionResultMessage(event, team),
      nodeId: event.targetNodeId,
    };
  }
  if (event.type === "TELEMETRY_GENERATED") {
    const message = event.detailCode === "AUTHENTICATION_ANOMALY"
      ? `Suspicious authentication activity observed on ${event.targetNodeId ?? "a managed asset"}.`
      : `Anomalous network behavior observed near ${event.targetNodeId ?? "a managed asset"}.`;
    return {
      id: event.id, sequence: event.sequence, turn: event.turn, tone: "DANGER", category: "ALERT",
      message, nodeId: event.targetNodeId,
    };
  }
  return null;
}

function redNode(match: MatchRecord, node: NodeState): VisibleNode {
  const scanned = match.world.red.scannedNodeIds.includes(node.id);
  const foothold = match.world.red.footholdNodeIds.includes(node.id);
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    position: node.position,
    knowledge: scanned ? "SCANNED" : "DISCOVERED",
    status: node.isolated ? "ISOLATED" : foothold ? "ACCESS" : "UNKNOWN",
    reachable: isReachableForRed(match.world, node.id),
    platform: scanned ? node.platform : null,
    services: scanned ? node.services.map(({ name, port }) => ({ name, port })) : [],
    edrEnabled: null,
    patchLevel: null,
    monitoring: null,
  };
}

function blueNode(match: MatchRecord, node: NodeState): VisibleNode {
  const identified = match.world.blue.identifiedFootholdNodeIds.includes(node.id);
  const suspicious = match.events.some((event) => event.type === "TELEMETRY_GENERATED" && event.targetNodeId === node.id);
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    position: node.position,
    knowledge: "MANAGED",
    status: node.isolated ? "ISOLATED" : identified ? "CONFIRMED" : suspicious ? "SUSPICIOUS" : "HEALTHY",
    reachable: !node.isolated,
    platform: node.platform,
    services: node.services.map(({ name, port }) => ({ name, port })),
    edrEnabled: node.edrCoverage > 0,
    patchLevel: node.patchLevel,
    monitoring: node.monitoring,
  };
}

function eligibleActions(match: MatchRecord, team: Team): AvailableAction[] {
  const visibleIds = team === "RED"
    ? match.world.red.discoveredNodeIds
    : Object.keys(match.world.nodes);
  return actionDefinitionsFor(team).map((definition) => {
    const eligibleTargetIds = visibleIds.filter((targetNodeId) => {
      const candidate: PlannedAction = { id: "eligibility-check", type: definition.id, targetNodeId, order: 0 };
      return validatePlan(match.world, team, [candidate]).ok;
    });
    return { ...definition, eligibleTargetIds };
  });
}

export function projectWorld(match: MatchRecord, team: Team): PlayerView {
  const visibleIds = new Set(team === "RED" ? match.world.red.discoveredNodeIds : Object.keys(match.world.nodes));
  const nodes = Object.values(match.world.nodes)
    .filter((node) => visibleIds.has(node.id))
    .map((node) => team === "RED" ? redNode(match, node) : blueNode(match, node));
  const edges = match.world.edges
    .filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
    .map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      state: match.world.nodes[edge.from]?.isolated || match.world.nodes[edge.to]?.isolated ? "BLOCKED" as const : "UP" as const,
    }));
  const identities = team === "BLUE"
    ? Object.values(match.world.identities).map(({ id, name, department, privilege, enabled }) => ({ id, name, department, privilege, enabled }))
    : match.world.red.credentialIds.flatMap((credentialId) => {
      const credential = match.world.credentials[credentialId];
      const identity = credential ? match.world.identities[credential.identityId] : undefined;
      return identity ? [{ id: identity.id, name: identity.name, department: "Discovered identity", privilege: "UNKNOWN", enabled: identity.enabled }] : [];
    });
  const ownPlan = match.plans[team];
  const usedAp = ownPlan.reduce((total, action) => {
    const definition = actionDefinitionsFor(team).find((candidate) => candidate.id === action.type);
    return total + (definition?.cost ?? 0);
  }, 0);

  return {
    matchId: match.id,
    matchCode: match.code,
    seed: match.seed,
    role: team,
    turn: match.turn,
    turnLimit: TURN_LIMIT,
    phase: match.phase,
    apBudget: AP_BUDGET,
    apRemaining: AP_BUDGET - usedAp,
    ownReady: match.ready[team],
    opponentReady: match.ready[team === "RED" ? "BLUE" : "RED"],
    opponentConnected: match.occupied[team === "RED" ? "BLUE" : "RED"],
    ownPlan,
    nodes,
    edges,
    identities,
    availableActions: match.phase === "PLANNING" ? eligibleActions(match, team) : [],
    events: match.events.map((event) => projectEvent(event, team, visibleIds)).filter((event): event is ViewEvent => event !== null).slice(-80),
    score: match.score,
    objective: team === "RED"
      ? "Discover, compromise, and exfiltrate the protected finance data store."
      : "Identify and contain all attacker footholds before exfiltration.",
    winner: match.winner,
    endReason: match.endReason,
  };
}
