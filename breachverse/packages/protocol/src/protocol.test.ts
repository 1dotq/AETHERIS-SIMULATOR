import { describe, expect, it } from "vitest";
import { safeParseClientMessage } from "./index.js";

describe("client protocol", () => {
  it("accepts a valid version-one message", () => {
    expect(safeParseClientMessage({
      protocolVersion: 1,
      requestId: "REQ-1",
      type: "create_match",
      role: "RED",
    }).success).toBe(true);
  });

  it("rejects unknown versions and extra fields", () => {
    expect(safeParseClientMessage({
      protocolVersion: 2,
      requestId: "REQ-2",
      type: "create_match",
      role: "RED",
      authoritativeWorld: {},
    }).success).toBe(false);
  });
});

