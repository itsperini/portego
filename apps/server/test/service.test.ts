import { describe, expect, it } from "vitest";
import { PortegoService } from "../src/service.js";

describe("PortegoService", () => {
  it("completes the room to simulated light walking skeleton", async () => {
    const service = new PortegoService();
    service.createRoom({ label: "Kitchen" });
    service.createFixture({
      roomLabel: "Kitchen",
      label: "Kitchen ceiling",
      type: "light",
    });

    const result = await service.setFixtureState({
      fixtureLabel: "Kitchen ceiling",
      on: true,
      brightness: 40,
    });

    expect(result.state).toMatchObject({ on: true, brightness: 40 });
    expect(result.home.rooms).toHaveLength(1);
    expect(result.home.bindings).toHaveLength(1);
    expect(result.home.endpoints[0]?.reportedState).toMatchObject({
      on: true,
      brightness: 40,
    });
  });
});
