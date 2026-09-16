import { describe, expect, it } from "vitest";
import type { AuthoritativeEvent, MatchRecord, PlannedAction, ResolveTurnInput } from "@breachverse/domain";
import { createInitialWorld } from "@breachverse/scenarios";
import { projectEvent, projectWorld } from "./projection.js";
import { resolveTurn } from "./resolve.js";
import { SeededRng } from "./rng.js";
import { validatePlan } from "./validation.js";

function action(type: PlannedAction["type"], targetNodeId: string, order = 0): PlannedAction {
  return { id: `${type}-${targetNodeId}-${order}`, type, targetNodeId, order };
}

function matchFixture(): MatchRecord {
  return {
    id: "MATCH-TEST1",
    code: "TEST1",
    seed: 481921,
    turn: 1,
    phase: "PLANNING",
    world: createInitialWorld(),
    plans: { RED: [], BLUE: [] },
    ready: { RED: false, BLUE: false },
    occupied: { RED: true, BLUE: true },
    events: [],
    score: { RED: 0, BLUE: 0 },
    winner: null,
    endReason: null,
    nextSequence: 1,
  };
}

describe("deterministic engine", () => {
  it("produces the same RNG sequence for the same seed", () => {
    const first = new SeededRng(9001);
    const second = new SeededRng(9001);
    expect(Array.from({ length: 10 }, () => first.nextUint32()))
      .toEqual(Array.from({ length: 10 }, () => second.nextUint32()));
  });

  it("rejects plans over the six AP budget", () => {
    const world = createInitialWorld();
    const plan = [
      action("ISOLATE_NODE", "DC01", 0),
      action("ISOLATE_NODE", "FILE01", 1),
      action("ISOLATE_NODE", "WS01", 2),
      action("INCREASE_MONITORING", "WS02", 3),
    ];
    expect(validatePlan(world, "BLUE", plan)).toMatchObject({ ok: false, error: "AP_BUDGET_EXCEEDED" });
  });

  it("rejects an action belonging to the other role", () => {
    const result = validatePlan(createInitialWorld(), "RED", [action("ISOLATE_NODE", "EDGE-FW01")]);
    expect(result).toMatchObject({ ok: false, error: "INVALID_ACTION_FOR_ROLE" });
  });

  it("rejects an inaccessible lateral-movement target", () => {
    const world = createInitialWorld();
    world.red.discoveredNodeIds.push("FILE01");
    expect(validatePlan(world, "RED", [action("LATERAL_MOVEMENT", "FILE01")]))
      .toMatchObject({ ok: false, error: "TARGET_INACCESSIBLE" });
  });

  it("resolves identical inputs to identical world state and events", () => {
    const input: ResolveTurnInput = {
      matchId: "MATCH-DET",
      seed: 481921,
      turn: 1,
      world: createInitialWorld(),
      plans: {
        RED: [action("RECON_NODE", "EDGE-FW01")],
        BLUE: [action("INCREASE_MONITORING", "EDGE-FW01")],
      },
      startingSequence: 1,
    };
    expect(resolveTurn(input)).toEqual(resolveTurn(input));
  });
});

describe("fog-of-war projections", () => {
  it("omits Blue-only security truth from the Red projection", () => {
    const view = projectWorld(matchFixture(), "RED");
    const serialized = JSON.stringify(view);
    expect(view.nodes.map((node) => node.id)).toEqual(["INTERNET", "EDGE-FW01"]);
    expect(serialized).not.toContain("vulnerability");
    expect(serialized).not.toContain("edrCoverage");
    expect(serialized).not.toContain("detectionSensitivity");
    expect(serialized).not.toContain("containsProtectedData");
    expect(serialized).not.toContain("Fortified Network OS");
    expect(serialized).not.toContain("FILE01");
  });

  it("does not reveal hidden targets through opponent events", () => {
    const match = matchFixture();
    match.events.push({
      id: "EVT-HIDDEN", matchId: match.id, sequence: 1, turn: 1,
      type: "NODE_ISOLATED", actor: "BLUE", actionId: "BLUE-SECRET",
      sourceNodeId: null, targetNodeId: "FILE01", identityId: null,
      success: true, detected: false, detailCode: "PRECAUTIONARY_ISOLATION",
    });
    expect(JSON.stringify(projectWorld(match, "RED"))).not.toContain("FILE01");
  });

  it("omits Red foothold and compromise truth from the Blue projection", () => {
    const match = matchFixture();
    match.world.red.footholdNodeIds.push("WS01");
    match.world.nodes.WS01!.compromised = true;
    match.world.nodes.WS01!.accessLevel = "ADMIN";
    const serialized = JSON.stringify(projectWorld(match, "BLUE"));
    expect(serialized).not.toContain("footholdNodeIds");
    expect(serialized).not.toContain("compromised");
    expect(serialized).not.toContain("accessLevel");
    expect(projectWorld(match, "BLUE").nodes.find((node) => node.id === "WS01")?.status).toBe("HEALTHY");
  });

  it("projects telemetry without authoritative outcome fields", () => {
    const event: AuthoritativeEvent = {
      id: "EVT-1", matchId: "MATCH-X", sequence: 1, turn: 1,
      type: "TELEMETRY_GENERATED", actor: "SYSTEM", actionId: "SECRET-ACTION",
      sourceNodeId: "WS01", targetNodeId: "FILE01", identityId: "CAROL",
      success: true, detected: true, detailCode: "AUTHENTICATION_ANOMALY",
    };
    const projected = projectEvent(event, "BLUE");
    const serialized = JSON.stringify(projected);
    expect(projected?.message).toContain("Suspicious authentication activity");
    expect(serialized).not.toContain("SECRET-ACTION");
    expect(serialized).not.toContain("success");
    expect(serialized).not.toContain("detected");
    expect(serialized).not.toContain("CAROL");
  });
});

describe("victory and replay", () => {
  it("awards Red victory after successful protected-data exfiltration", () => {
    const world = createInitialWorld();
    world.red.discoveredNodeIds.push("FILE01");
    world.red.footholdNodeIds.push("FILE01");
    world.nodes.FILE01!.compromised = true;
    world.nodes.FILE01!.monitoring = 0;
    world.nodes.FILE01!.detectionSensitivity = 0;
    const result = resolveTurn({
      matchId: "MATCH-RED", seed: 7, turn: 4, world,
      plans: { RED: [action("EXFILTRATE_DATA", "FILE01")], BLUE: [] }, startingSequence: 20,
    });
    expect(result.winner).toBe("RED");
    expect(result.endReason).toBe("PROTECTED_DATA_EXFILTRATED");
  });

  it("awards Blue victory after identifying and containing the last foothold", () => {
    const world = createInitialWorld();
    world.red.footholdNodeIds.push("WS01");
    world.nodes.WS01!.compromised = true;
    const result = resolveTurn({
      matchId: "MATCH-BLUE", seed: 7, turn: 4, world,
      plans: { RED: [], BLUE: [action("ISOLATE_NODE", "WS01")] }, startingSequence: 40,
    });
    expect(result.winner).toBe("BLUE");
    expect(result.endReason).toBe("INTRUSION_IDENTIFIED_AND_CONTAINED");
  });

  it("keeps canonical replay events strictly ordered", () => {
    const result = resolveTurn({
      matchId: "MATCH-ORDER", seed: 9, turn: 2, world: createInitialWorld(),
      plans: {
        RED: [action("RECON_NODE", "EDGE-FW01")],
        BLUE: [action("INCREASE_MONITORING", "WS01")],
      },
      startingSequence: 75,
    });
    expect(result.events.map((event) => event.sequence)).toEqual(
      result.events.map((_, index) => 75 + index),
    );
    expect(result.events.at(-1)?.type).toBe("TURN_RESOLVED");
  });
});
