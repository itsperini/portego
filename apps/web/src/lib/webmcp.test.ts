import {
  addFixture,
  addRoom,
  applyReportedState,
  createDemoHome,
  setDesiredFixtureState,
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
      addFixture: async (input) => {
        home = addFixture(home, input);
        return home;
      },
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
      .get("device.set_state")
      ?.execute(
        { fixtureLabel: "Kitchen ceiling", on: true, brightness: 40 },
        { signal: new AbortController().signal },
      );

    expect(home.rooms).toHaveLength(1);
    expect(home.fixtures).toHaveLength(1);
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
        addFixture: async () => createDemoHome(),
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
