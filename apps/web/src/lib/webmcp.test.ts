import {
  addFixture,
  addOpening,
  addRoom,
  applyHomeChanges,
  applyReportedState,
  bindFixtureToEndpoint,
  createDemoHome,
  moveFixture,
  removeFixture,
  removeOpening,
  removeRoom,
  setDesiredFixtureState,
  unbindFixture,
  updateFixture,
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
      addFixture: async (input) => {
        home = addFixture(home, input);
        return home;
      },
      moveFixture: async (input) => {
        home = moveFixture(home, input);
        return home;
      },
      updateFixture: async (input) => {
        home = updateFixture(home, input);
        return home;
      },
      removeFixture: async (input) => {
        home = removeFixture(home, input);
        return home;
      },
      bindFixture: async (input) => {
        home = bindFixtureToEndpoint(home, input);
        return home;
      },
      unbindFixture: async (input) => {
        home = unbindFixture(home, input);
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
      setFixtureState: async (input) => {
        const desired = setDesiredFixtureState(home, input);
        home = applyReportedState(desired.home, desired.endpoint.id, desired.requestedState);
        return home;
      },
      reset: async () => {
        home = createDemoHome();
        return home;
      },
    });

    expect(registration.status).toBe("ready");
    expect(tools.size).toBe(17);
    await tools
      .get("home.add_room")
      ?.execute({ label: "Kitchen" }, { signal: new AbortController().signal });
    await tools
      .get("home.add_fixture")
      ?.execute(
        { roomLabel: "Kitchen", label: "Kitchen ceiling", type: "light" },
        { signal: new AbortController().signal },
      );
    await tools
      .get("home.update_room")
      ?.execute(
        { roomLabel: "Kitchen", x: 200, y: 140, width: 460, height: 320 },
        { signal: new AbortController().signal },
      );
    await tools
      .get("home.move_fixture")
      ?.execute(
        { fixtureLabel: "Kitchen ceiling", x: 320, y: 240 },
        { signal: new AbortController().signal },
      );
    await tools
      .get("device.set_state")
      ?.execute(
        { fixtureLabel: "Kitchen ceiling", on: true, brightness: 40 },
        { signal: new AbortController().signal },
      );

    expect(home.rooms).toHaveLength(1);
    expect(home.fixtures).toHaveLength(1);
    expect(home.rooms[0]).toMatchObject({ x: 200, y: 140, width: 460, height: 320 });
    expect(home.fixtures[0]?.position).toEqual({ x: 320, y: 240 });
    expect(home.endpoints[0]?.reportedState).toMatchObject({ on: true, brightness: 40 });
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
        addRoom: async () => createDemoHome(),
        updateRoom: async () => createDemoHome(),
        removeRoom: async () => createDemoHome(),
        addFixture: async () => createDemoHome(),
        moveFixture: async () => createDemoHome(),
        updateFixture: async () => createDemoHome(),
        removeFixture: async () => createDemoHome(),
        bindFixture: async () => createDemoHome(),
        unbindFixture: async () => createDemoHome(),
        addOpening: async () => createDemoHome(),
        removeOpening: async () => createDemoHome(),
        applyChanges: async () => createDemoHome(),
        undo: async () => createDemoHome(),
        redo: async () => createDemoHome(),
        setFixtureState: async () => createDemoHome(),
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
