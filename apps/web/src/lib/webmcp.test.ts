import {
  addDevice,
  addOpening,
  addRoom,
  applyHomeChanges,
  applyReportedState,
  bindDeviceToEndpoint,
  createDemoHome,
  moveDevice,
  removeDevice,
  removeFloor,
  removeOpening,
  removeRoom,
  setDesiredDeviceState,
  unbindDevice,
  updateDevice,
  updateFloorDetails,
  updateHomeDetails,
  updateRoomGeometry,
} from "@portego/home-model";
import { describe, expect, it, vi } from "vitest";
import { registerPortegoTools } from "./webmcp";

describe("Portego WebMCP tools", () => {
  it("registers imperative tools and changes the visible home model", async () => {
    let home = createDemoHome();
    const tools = new Map<string, WebMcpTool>();
    const modelContext: ModelContext = {
      registerTool: vi.fn(async (tool) => {
        tools.set(tool.name, tool);
      }),
    };

    const registration = await registerPortegoTools(modelContext, {
      getHome: () => home,
      updateHomeDetails: async (input) => {
        home = updateHomeDetails(home, input);
        return home;
      },
      updateFloorDetails: async (input) => {
        home = updateFloorDetails(home, input);
        return home;
      },
      removeFloor: async (input) => {
        home = removeFloor(home, input);
        return home;
      },
      addRoom: async (input) => {
        home = addRoom(home, input);
        return home;
      },
      updateRoom: async (input) => {
        home = updateRoomGeometry(home, input);
        return home;
      },
      removeRoom: async (input) => {
        home = removeRoom(home, input);
        return home;
      },
      addDevice: async (input) => {
        home = addDevice(home, input);
        return home;
      },
      moveDevice: async (input) => {
        home = moveDevice(home, input);
        return home;
      },
      updateDevice: async (input) => {
        home = updateDevice(home, input);
        return home;
      },
      removeDevice: async (input) => {
        home = removeDevice(home, input);
        return home;
      },
      bindDevice: async (input) => {
        home = bindDeviceToEndpoint(home, input);
        return home;
      },
      unbindDevice: async (input) => {
        home = unbindDevice(home, input);
        return home;
      },
      addOpening: async (input) => {
        home = addOpening(home, input);
        return home;
      },
      removeOpening: async (input) => {
        home = removeOpening(home, input);
        return home;
      },
      applyChanges: async (input) => {
        home = applyHomeChanges(home, input);
        return home;
      },
      undo: async () => home,
      redo: async () => home,
      setDeviceState: async (input) => {
        const desired = setDesiredDeviceState(home, input);
        home = applyReportedState(desired.home, desired.endpoint.id, desired.requestedState);
        return home;
      },
      reset: async () => {
        home = createDemoHome();
        return home;
      },
    });

    expect(registration.status).toBe("ready");
    expect(tools.size).toBe(20);
    await tools
      .get("home.update_details")
      ?.execute(
        { name: "Casa Perini", description: "A family home", areaM2: 90 },
        { signal: new AbortController().signal },
      );
    await tools
      .get("home.update_floor_details")
      ?.execute(
        { floorName: "Ground floor", description: "Main living level", areaM2: 90 },
        { signal: new AbortController().signal },
      );
    await tools
      .get("home.add_room")
      ?.execute({ label: "Kitchen" }, { signal: new AbortController().signal });
    await tools.get("home.add_device")?.execute(
      {
        roomLabel: "Kitchen",
        label: "Kitchen ceiling",
        type: "light",
        config: { mounting: "ceiling", dimmable: true, colorTemperature: false },
      },
      { signal: new AbortController().signal },
    );
    await tools
      .get("home.update_room")
      ?.execute(
        { roomLabel: "Kitchen", x: 200, y: 140, width: 460, height: 320 },
        { signal: new AbortController().signal },
      );
    await tools
      .get("home.move_device")
      ?.execute(
        { deviceLabel: "Kitchen ceiling", x: 320, y: 240 },
        { signal: new AbortController().signal },
      );
    await tools
      .get("device.set_state")
      ?.execute(
        { deviceLabel: "Kitchen ceiling", on: true, brightness: 40 },
        { signal: new AbortController().signal },
      );

    expect(home.rooms).toHaveLength(1);
    expect(home).toMatchObject({ name: "Casa Perini", description: "A family home", areaM2: 90 });
    expect(home.floors[0]).toMatchObject({ description: "Main living level", areaM2: 90 });
    expect(home.devices).toHaveLength(1);
    expect(home.devices[0]).toMatchObject({
      type: "light",
      config: { mounting: "ceiling", dimmable: true },
    });
    expect(home.rooms[0]).toMatchObject({ x: 200, y: 140, width: 460, height: 320 });
    expect(home.devices[0]?.position).toEqual({ x: 320, y: 240 });
    expect(home.endpoints[0]?.reportedState).toMatchObject({ on: true, brightness: 40 });

    await tools.get("home.update_device")?.execute(
      {
        deviceLabel: "Kitchen ceiling",
        type: "sensor",
        config: { measures: ["temperature", "occupancy"] },
      },
      { signal: new AbortController().signal },
    );
    expect(home.devices[0]).toMatchObject({
      type: "sensor",
      capabilities: ["temperature", "occupancy"],
    });
    expect(home.bindings).toHaveLength(0);
  });

  it("cancels an in-flight registration during a React development remount", async () => {
    const tools = new Map<string, WebMcpTool>();
    const lifecycleController = new AbortController();
    const modelContext: ModelContext = {
      registerTool: vi.fn(
        (tool, options) =>
          new Promise<void>((resolve, reject) => {
            tools.set(tool.name, tool);
            options?.signal?.addEventListener(
              "abort",
              () => {
                tools.delete(tool.name);
                reject(options.signal?.reason);
              },
              { once: true },
            );
            queueMicrotask(resolve);
          }),
      ),
    };

    const registration = registerPortegoTools(
      modelContext,
      {
        getHome: () => createDemoHome(),
        updateHomeDetails: async () => createDemoHome(),
        updateFloorDetails: async () => createDemoHome(),
        removeFloor: async () => createDemoHome(),
        addRoom: async () => createDemoHome(),
        updateRoom: async () => createDemoHome(),
        removeRoom: async () => createDemoHome(),
        addDevice: async () => createDemoHome(),
        moveDevice: async () => createDemoHome(),
        updateDevice: async () => createDemoHome(),
        removeDevice: async () => createDemoHome(),
        bindDevice: async () => createDemoHome(),
        unbindDevice: async () => createDemoHome(),
        addOpening: async () => createDemoHome(),
        removeOpening: async () => createDemoHome(),
        applyChanges: async () => createDemoHome(),
        undo: async () => createDemoHome(),
        redo: async () => createDemoHome(),
        setDeviceState: async () => createDemoHome(),
        reset: async () => createDemoHome(),
      },
      undefined,
      lifecycleController.signal,
    );

    lifecycleController.abort();

    await expect(registration).resolves.toMatchObject({ status: "unavailable" });
    expect(tools.size).toBe(0);
  });
});
