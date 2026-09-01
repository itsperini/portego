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

    const room = result.home.rooms[0];
    const fixture = result.home.fixtures[0];
    expect(room).toBeDefined();
    expect(fixture).toBeDefined();
    if (!room || !fixture) {
      return;
    }

    service.updateRoom({ roomId: room.id, x: 240, y: 160, width: 420, height: 300 });
    const moved = service.moveFixture({ fixtureId: fixture.id, x: 360, y: 260 });
    expect(moved.rooms[0]).toMatchObject({ x: 240, y: 160, width: 420, height: 300 });
    expect(moved.fixtures[0]?.position).toEqual({ x: 360, y: 260 });
  });
});
