import { describe, expect, it, vi } from "vitest";
import { commissionDeviceInputSchema, GatewaySetupTools } from "../src/index.js";

describe("AI gateway setup tools", () => {
  it("refuses commissioning without literal user confirmation", () => {
    expect(() =>
      commissionDeviceInputSchema.parse({ candidateId: "candidate_test", confirmed: false }),
    ).toThrow();
  });

  it("does not accept credentials as chatbot tool arguments", () => {
    expect(() =>
      commissionDeviceInputSchema.parse({
        candidateId: "candidate_test",
        confirmed: true,
        input: { password: "must-not-enter-the-model" },
      }),
    ).toThrow();
  });

  it("returns concise discovery guidance without raw identifiers", async () => {
    const runtime = {
      discover: vi.fn(async () => ({
        id: "discovery_test",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        providers: [],
        candidates: [
          {
            id: "candidate_test",
            displayName: "Test device",
            transports: ["ip"],
            addresses: [],
            serviceTypes: [],
            observations: [],
            matches: [{ driverId: "test", confidence: 1, reason: "test" }],
            warnings: [],
            device: {
              id: "device_test",
              driverId: "test",
              protocol: "test",
              manufacturer: "Test",
              model: "One",
              name: "Test device",
              reachable: true,
              commissioned: false,
              endpoints: [],
              metadata: { nativeId: "must-not-leak" },
              updatedAt: new Date().toISOString(),
            },
          },
        ],
      })),
    };
    const result = await new GatewaySetupTools(runtime as never).startDiscovery({});
    expect(result).toMatchObject({
      sessionId: "discovery_test",
      candidates: [{ candidateId: "candidate_test", name: "Test device" }],
    });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });
});
