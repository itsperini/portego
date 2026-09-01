import { describe, expect, it } from "vitest";
import { PortegoService } from "../src/service.js";

describe("PortegoService", () => {
  it("completes the room to simulated light walking skeleton", async () => {
    const service = new PortegoService();
    service.createRoom({ label: "Kitchen" });
    service.createDevice({
      roomLabel: "Kitchen",
      label: "Kitchen ceiling",
      type: "light",
    });

    const result = await service.setDeviceState({
      deviceLabel: "Kitchen ceiling",
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
    const device = result.home.devices[0];
    expect(room).toBeDefined();
    expect(device).toBeDefined();
    if (!room || !device) {
      return;
    }

    service.updateRoom({ roomId: room.id, x: 240, y: 160, width: 420, height: 300 });
    const moved = service.moveDevice({ deviceId: device.id, x: 360, y: 260 });
    expect(moved.rooms[0]).toMatchObject({ x: 240, y: 160, width: 420, height: 300 });
    expect(moved.devices[0]?.position).toEqual({ x: 360, y: 260 });
  });

  it("treats batch edits as one undoable service transaction", () => {
    const service = new PortegoService();
    service.applyChanges({
      changes: [
        { op: "add_room", input: { label: "Kitchen" } },
        { op: "add_room", input: { label: "Hall" } },
        {
          op: "add_opening",
          input: {
            roomLabel: "Kitchen",
            connectsToRoomLabel: "Hall",
            label: "Kitchen door",
            type: "door",
            wall: "right",
          },
        },
      ],
    });
    expect(service.snapshot().rooms).toHaveLength(2);
    expect(service.snapshot().openings).toHaveLength(1);
    expect(service.historyStatus()).toEqual({ canUndo: true, canRedo: false });

    service.undo();
    expect(service.snapshot().rooms).toHaveLength(0);
    expect(service.historyStatus()).toEqual({ canUndo: false, canRedo: true });
    service.redo();
    expect(service.snapshot().rooms).toHaveLength(2);
  });
});
