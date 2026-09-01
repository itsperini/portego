import { describe, expect, it } from "vitest";
import { SimulatedAdapter } from "../src/index.js";

describe("simulated adapter", () => {
  it("discovers and controls a virtual light", async () => {
    const adapter = new SimulatedAdapter();
    const endpoints = await adapter.discover();
    const [light] = endpoints;

    expect(endpoints).toHaveLength(4);
    expect(light?.capabilities).toEqual(["power", "brightness"]);
    const state = await adapter.execute("endpoint_sim_light_1", {
      on: true,
      brightness: 40,
    });
    expect(state).toMatchObject({ on: true, brightness: 40 });
  });
});
