import type {
  AuthoritativeEvent,
  AuthoritativeEventType,
  PlannedAction,
  ResolveTurnInput,
  ResolveTurnResult,
  ScoreState,
  Team,
  WorldState,
} from "@breachverse/domain";
import { ACTIONS } from "./actions.js";
import { adjacentNodeIds, isAdjacentToFoothold, isInitialAccessTarget } from "./graph.js";
import { deriveTurnSeed, SeededRng } from "./rng.js";
import { TURN_LIMIT } from "./validation.js";

interface OrderedAction {
  team: Team;
  action: PlannedAction;
}

interface EventInput {
  type: AuthoritativeEventType;
  actor: Team | "SYSTEM";
  actionId?: string | undefined;
  sourceNodeId?: string | undefined;
  targetNodeId?: string | undefined;
  identityId?: string | undefined;
  success?: boolean | undefined;
  detected?: boolean | undefined;
  detailCode: string;
}

function cloneWorld(world: WorldState): WorldState {
  return JSON.parse(JSON.stringify(world)) as WorldState;
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
  values.sort();
}

function removeValue(values: string[], value: string): void {
  const index = values.indexOf(value);
  if (index >= 0) values.splice(index, 1);
}

function matchingHeldCredential(world: WorldState, nodeId: string): boolean {
  return world.red.credentialIds.some((credentialId) => {
    const credential = world.credentials[credentialId];
    return credential?.active === true && credential.nodeIds.includes(nodeId);
  });
}

function detectionChance(world: WorldState, action: PlannedAction): number {
  const target = world.nodes[action.targetNodeId];
  if (!target) return 0;
  const definition = ACTIONS[action.type];
  return Math.min(0.94,
    0.02
    + definition.noise / 180
    + target.edrCoverage / 650
    + target.detectionSensitivity / 700
    + target.monitoring / 300,
  );
}

export function resolveTurn(input: ResolveTurnInput): ResolveTurnResult {
  const world = cloneWorld(input.world);
  const rng = new SeededRng(deriveTurnSeed(input.seed, input.turn));
  const events: AuthoritativeEvent[] = [];
  const scoreDelta: ScoreState = { RED: 0, BLUE: 0 };
  let nextSequence = input.startingSequence;

  const emit = (event: EventInput): AuthoritativeEvent => {
    const created: AuthoritativeEvent = {
      id: `EVT-${String(nextSequence).padStart(6, "0")}`,
      matchId: input.matchId,
      sequence: nextSequence,
      turn: input.turn,
      type: event.type,
      actor: event.actor,
      actionId: event.actionId ?? null,
      sourceNodeId: event.sourceNodeId ?? null,
      targetNodeId: event.targetNodeId ?? null,
      identityId: event.identityId ?? null,
      success: event.success ?? null,
      detected: event.detected ?? null,
      detailCode: event.detailCode,
    };
    nextSequence += 1;
    events.push(created);
    return created;
  };

  const emitRedResult = (event: Omit<EventInput, "actor" | "detected">, action: PlannedAction): void => {
    const detected = rng.chance(detectionChance(world, action));
    emit({ ...event, actor: "RED", actionId: action.id, detected });
    if (detected) {
      emit({
        type: "TELEMETRY_GENERATED",
        actor: "SYSTEM",
        actionId: action.id,
        sourceNodeId: event.sourceNodeId,
        targetNodeId: event.targetNodeId,
        success: true,
        detected: true,
        detailCode: action.type === "CREDENTIAL_ATTACK" ? "AUTHENTICATION_ANOMALY" : "SUSPICIOUS_NETWORK_ACTIVITY",
      });
      scoreDelta.BLUE += 5;
    }
  };

  const ordered: OrderedAction[] = (["RED", "BLUE"] as const)
    .flatMap((team) => input.plans[team].map((action) => ({ team, action })))
    .sort((left, right) => {
      const speedDifference = ACTIONS[right.action.type].speed - ACTIONS[left.action.type].speed;
      if (speedDifference !== 0) return speedDifference;
      if (left.action.order !== right.action.order) return left.action.order - right.action.order;
      return left.team.localeCompare(right.team);
    });

  for (const { team, action } of ordered) {
    const target = world.nodes[action.targetNodeId];
    if (!target) continue;

    if (team === "RED") {
      switch (action.type) {
        case "RECON_NODE": {
          const revealed = adjacentNodeIds(world, target.id).filter((id) => !world.red.discoveredNodeIds.includes(id));
          for (const nodeId of revealed) addUnique(world.red.discoveredNodeIds, nodeId);
          scoreDelta.RED += revealed.length * 5;
          emitRedResult({
            type: "RECON_COMPLETED", targetNodeId: target.id, success: revealed.length > 0,
            detailCode: revealed.length > 0 ? `DISCOVERED_${revealed.length}` : "NO_NEW_ASSETS",
          }, action);
          break;
        }
        case "SCAN_SERVICE": {
          const valid = world.red.discoveredNodeIds.includes(target.id) && !target.isolated;
          if (valid) addUnique(world.red.scannedNodeIds, target.id);
          scoreDelta.RED += valid ? 5 : 0;
          emitRedResult({
            type: "SERVICE_SCAN_COMPLETED", targetNodeId: target.id, success: valid,
            detailCode: valid ? `SERVICES_${target.services.length}` : "TARGET_UNREACHABLE",
          }, action);
          break;
        }
        case "CREDENTIAL_ATTACK": {
          const candidate = Object.values(world.credentials)
            .filter((credential) => credential.active && credential.nodeIds.includes(target.id) && !world.red.credentialIds.includes(credential.id))
            .sort((a, b) => a.id.localeCompare(b.id))[0];
          const probability = 0.38 + target.vulnerability * 0.32
            + (world.red.scannedNodeIds.includes(target.id) ? 0.12 : 0)
            + (world.red.footholdNodeIds.includes(target.id) ? 0.18 : 0)
            - target.monitoring / 350;
          const success = Boolean(candidate) && !target.isolated && rng.chance(probability);
          if (success && candidate) {
            addUnique(world.red.credentialIds, candidate.id);
            scoreDelta.RED += 15;
          }
          emitRedResult({
            type: "CREDENTIAL_ATTACKED", targetNodeId: target.id,
            identityId: success && candidate ? candidate.identityId : undefined,
            success, detailCode: success ? "CREDENTIAL_OBTAINED" : "CREDENTIAL_ATTACK_FAILED",
          }, action);
          break;
        }
        case "GAIN_FOOTHOLD": {
          const accessible = isInitialAccessTarget(world, target.id);
          const probability = 0.42 + target.vulnerability * 0.42
            - target.edrCoverage / 700 - target.monitoring / 350;
          const success = accessible && rng.chance(probability);
          if (success) {
            addUnique(world.red.footholdNodeIds, target.id);
            target.compromised = true;
            target.accessLevel = matchingHeldCredential(world, target.id) ? "ADMIN" : "USER";
            scoreDelta.RED += 25;
          }
          emitRedResult({
            type: "FOOTHOLD_ATTEMPTED", targetNodeId: target.id, success,
            detailCode: success ? "FOOTHOLD_ESTABLISHED" : accessible ? "ACCESS_ATTEMPT_FAILED" : "ROUTE_BLOCKED",
          }, action);
          break;
        }
        case "LATERAL_MOVEMENT": {
          const sourceNodeId = world.red.footholdNodeIds
            .filter((id) => !world.nodes[id]?.isolated && adjacentNodeIds(world, id).includes(target.id))
            .sort()[0];
          const accessible = Boolean(sourceNodeId) && isAdjacentToFoothold(world, target.id);
          const probability = 0.43 + target.vulnerability * 0.36
            + (matchingHeldCredential(world, target.id) ? 0.2 : 0)
            - target.edrCoverage / 650 - target.monitoring / 300;
          const success = accessible && rng.chance(probability);
          if (success) {
            addUnique(world.red.footholdNodeIds, target.id);
            target.compromised = true;
            target.accessLevel = matchingHeldCredential(world, target.id) ? "ADMIN" : "USER";
            scoreDelta.RED += target.containsProtectedData ? 45 : 20;
          }
          emitRedResult({
            type: "LATERAL_MOVEMENT", sourceNodeId, targetNodeId: target.id, success,
            detailCode: success ? "LATERAL_ACCESS_ESTABLISHED" : accessible ? "LATERAL_ATTEMPT_FAILED" : "ROUTE_BLOCKED",
          }, action);
          break;
        }
        case "EXFILTRATE_DATA": {
          const accessible = target.containsProtectedData
            && world.red.footholdNodeIds.includes(target.id)
            && !target.isolated;
          const probability = 0.82 - target.monitoring / 280 - target.detectionSensitivity / 650;
          const success = accessible && rng.chance(probability);
          if (success) {
            world.red.exfiltrated = true;
            scoreDelta.RED += 100;
          }
          emitRedResult({
            type: "DATA_EXFILTRATION", sourceNodeId: target.id, targetNodeId: "INTERNET", success,
            detailCode: success ? "PROTECTED_DATA_EXFILTRATED" : accessible ? "EXFILTRATION_INTERRUPTED" : "NO_DATA_ACCESS",
          }, action);
          break;
        }
        default:
          break;
      }
      continue;
    }

    switch (action.type) {
      case "INCREASE_MONITORING": {
        target.monitoring = Math.min(100, target.monitoring + 25);
        scoreDelta.BLUE += 4;
        emit({
          type: "MONITORING_INCREASED", actor: "BLUE", actionId: action.id, targetNodeId: target.id,
          success: true, detailCode: "SENSOR_COVERAGE_INCREASED",
        });
        break;
      }
      case "ISOLATE_NODE": {
        const contained = world.red.footholdNodeIds.includes(target.id);
        target.isolated = true;
        if (contained) {
          removeValue(world.red.footholdNodeIds, target.id);
          target.compromised = false;
          target.accessLevel = "NONE";
          addUnique(world.blue.identifiedFootholdNodeIds, target.id);
          world.blue.intrusionIdentified = true;
          world.blue.containmentOccurred = true;
          scoreDelta.BLUE += 35;
        }
        emit({
          type: "NODE_ISOLATED", actor: "BLUE", actionId: action.id, targetNodeId: target.id,
          success: true, detailCode: contained ? "ACTIVE_INTRUSION_CONTAINED" : "PRECAUTIONARY_ISOLATION",
        });
        break;
      }
      case "DISABLE_ACCOUNT": {
        const identity = Object.values(world.identities)
          .filter((candidate) => candidate.enabled && candidate.nodeIds.includes(target.id))
          .sort((a, b) => a.id.localeCompare(b.id))[0];
        let heldCredentialRevoked = false;
        if (identity) {
          identity.enabled = false;
          for (const credential of Object.values(world.credentials)) {
            if (credential.identityId !== identity.id) continue;
            credential.active = false;
            if (world.red.credentialIds.includes(credential.id)) heldCredentialRevoked = true;
            removeValue(world.red.credentialIds, credential.id);
          }
          scoreDelta.BLUE += heldCredentialRevoked ? 18 : 5;
        }
        emit({
          type: "ACCOUNT_DISABLED", actor: "BLUE", actionId: action.id, targetNodeId: target.id,
          identityId: identity?.id, success: Boolean(identity),
          detailCode: heldCredentialRevoked ? "HELD_CREDENTIAL_REVOKED" : identity ? "ACCOUNT_DISABLED" : "NO_ACTIVE_ACCOUNT",
        });
        break;
      }
      case "INVESTIGATE_NODE": {
        addUnique(world.blue.investigatedNodeIds, target.id);
        const malicious = world.red.footholdNodeIds.includes(target.id);
        const found = malicious && rng.chance(0.68 + target.monitoring / 250);
        if (found) {
          addUnique(world.blue.identifiedFootholdNodeIds, target.id);
          world.blue.intrusionIdentified = true;
          scoreDelta.BLUE += 18;
        } else {
          scoreDelta.BLUE += 2;
        }
        emit({
          type: "NODE_INVESTIGATED", actor: "BLUE", actionId: action.id, targetNodeId: target.id,
          success: found, detailCode: found ? "MALICIOUS_ACCESS_CONFIRMED" : "NO_CONCLUSIVE_EVIDENCE",
        });
        break;
      }
      case "THREAT_HUNT": {
        const malicious = world.red.footholdNodeIds.includes(target.id);
        const found = malicious && rng.chance(0.52 + target.monitoring / 220 + target.edrCoverage / 500);
        if (found) {
          addUnique(world.blue.identifiedFootholdNodeIds, target.id);
          world.blue.intrusionIdentified = true;
          scoreDelta.BLUE += 22;
        }
        emit({
          type: "THREAT_HUNTED", actor: "BLUE", actionId: action.id, targetNodeId: target.id,
          success: found, detailCode: found ? "HIDDEN_ACTIVITY_FOUND" : "HUNT_NO_FINDINGS",
        });
        break;
      }
      default:
        break;
    }
  }

  let winner: Team | null = null;
  let endReason: string | null = null;
  if (world.red.exfiltrated) {
    winner = "RED";
    endReason = "PROTECTED_DATA_EXFILTRATED";
  } else if (world.red.footholdNodeIds.length === 0 && world.blue.intrusionIdentified && world.blue.containmentOccurred) {
    winner = "BLUE";
    endReason = "INTRUSION_IDENTIFIED_AND_CONTAINED";
  } else if (input.turn >= TURN_LIMIT) {
    winner = "BLUE";
    endReason = "DEFENSIVE_SURVIVAL";
    scoreDelta.BLUE += 50;
  }

  emit({ type: "TURN_RESOLVED", actor: "SYSTEM", success: true, detailCode: `TURN_${input.turn}_COMPLETE` });
  if (winner) {
    emit({ type: "MATCH_ENDED", actor: "SYSTEM", success: true, detailCode: endReason ?? "MATCH_COMPLETE" });
  }

  return { world, events, scoreDelta, winner, endReason };
}
