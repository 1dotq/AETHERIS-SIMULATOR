import { describe, expect, it } from "vitest";
import { MatchCoordinator, MatchError } from "./MatchCoordinator.js";

function coordinator(): MatchCoordinator {
  return new MatchCoordinator({ codeFactory: () => "X8K29", seedFactory: () => 481921 });
}

describe("authoritative match coordinator", () => {
  it("requires both occupied and ready players before resolution", () => {
    const service = coordinator();
    const match = service.createMatch("RED");
    service.joinMatch(match.code, "BLUE");
    service.submitPlan(match.code, "RED", 1, []);
    service.submitPlan(match.code, "BLUE", 1, []);
    const redReady = service.setReady(match.code, "RED", 1);
    expect(redReady.resolved).toBe(false);
    expect(match.turn).toBe(1);

    const blueReady = service.setReady(match.code, "BLUE", 1);
    expect(blueReady.resolved).toBe(true);
    expect(match.turn).toBe(2);
  });

  it("rejects plan modifications after READY", () => {
    const service = coordinator();
    const match = service.createMatch("RED");
    service.joinMatch(match.code, "BLUE");
    service.submitPlan(match.code, "RED", 1, []);
    service.setReady(match.code, "RED", 1);
    expect(() => service.submitPlan(match.code, "RED", 1, []))
      .toThrowError(new MatchError("PLAN_LOCKED", "The plan cannot be changed after READY."));
  });

  it("does not expose one side's plan in the other side's projection", () => {
    const service = coordinator();
    const match = service.createMatch("RED");
    service.joinMatch(match.code, "BLUE");
    service.submitPlan(match.code, "RED", 1, [{
      id: "SECRET-RED-PLAN", type: "RECON_NODE", targetNodeId: "EDGE-FW01", order: 0,
    }]);
    expect(JSON.stringify(service.viewFor(match, "BLUE"))).not.toContain("SECRET-RED-PLAN");
  });
});
