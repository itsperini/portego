import { commandExpiry, messageEnvelope } from "@portego/gateway-protocol";
import { describe, expect, it } from "vitest";
import { handleCloudMessage } from "../src/runtime.js";

describe("gateway runtime", () => {
  it("executes a state command and acknowledges reported state", async () => {
    const messages = await handleCloudMessage(
      {
        ...messageEnvelope("gateway_sim_1"),
        type: "cloud.device.set_state",
        endpointId: "endpoint_sim_light_1",
        state: { on: true, brightness: 40 },
        expiresAt: commandExpiry(),
      },
      "gateway_sim_1",
      {
        discover: async () => [],
        execute: async (_endpointId, state) => state,
      },
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      type: "gateway.command.result",
      ok: true,
      state: { on: true, brightness: 40 },
    });
  });
});
