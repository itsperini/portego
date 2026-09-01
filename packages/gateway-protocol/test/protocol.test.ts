import { describe, expect, it } from "vitest";
import {
  cloudDeviceCommandSchema,
  commandExpiry,
  isExpired,
  messageEnvelope,
} from "../src/index.js";

describe("gateway protocol", () => {
  it("validates a time-bounded state command", () => {
    const message = cloudDeviceCommandSchema.parse({
      ...messageEnvelope("gateway_sim_1"),
      type: "cloud.device.set_state",
      endpointId: "endpoint_sim_light_1",
      state: { on: true, brightness: 40 },
      expiresAt: commandExpiry(),
    });

    expect(message.type).toBe("cloud.device.set_state");
    expect(isExpired(message.expiresAt)).toBe(false);
  });

  it("rejects an expired command", () => {
    expect(isExpired(new Date(Date.now() - 1).toISOString())).toBe(true);
  });
});
