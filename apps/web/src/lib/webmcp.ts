import type {
  AddFixtureInput,
  AddRoomInput,
  HomeDocument,
  MoveFixtureInput,
  SetFixtureStateInput,
  UpdateRoomInput,
} from "@portego/home-model";

export type WebMcpActions = {
  getHome: () => HomeDocument;
  addRoom: (input: AddRoomInput) => Promise<HomeDocument>;
  updateRoom: (input: UpdateRoomInput) => Promise<HomeDocument>;
  addFixture: (input: AddFixtureInput) => Promise<HomeDocument>;
  moveFixture: (input: MoveFixtureInput) => Promise<HomeDocument>;
  setFixtureState: (input: SetFixtureStateInput) => Promise<HomeDocument>;
  reset: () => Promise<HomeDocument>;
};

export type WebMcpStatus = "registering" | "ready" | "unavailable" | "error";

export async function registerPortegoTools(
  modelContext: ModelContext | undefined,
  actions: WebMcpActions,
  onActivity?: (message: string) => void,
  lifecycleSignal?: AbortSignal,
): Promise<{ status: WebMcpStatus; unregister: () => void }> {
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    return { status: "unavailable", unregister: () => undefined };
  }

  const controller = lifecycleSignal ? undefined : new AbortController();
  const signal = lifecycleSignal ?? controller?.signal;
  const options = { signal };
  const unregister = () => controller?.abort();

  try {
    await modelContext.registerTool(
      {
        name: "home.get_document",
        title: "Read the Portego home",
        description:
          "Read the current visible Portego home document, including rooms, fixtures, bindings, gateway status, and reported device state. This does not change anything.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: async () => {
          const home = actions.getHome();
          onActivity?.("Codex read the current home");
          return {
            home,
            summary: {
              rooms: home.rooms.length,
              fixtures: home.fixtures.length,
              gateway: home.gateway.status,
              revision: home.revision,
            },
          };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "home.add_room",
        title: "Add a room",
        description:
          "Add one rectangular room to the visible Portego canvas. The change is applied immediately and can be reset from the page.",
        inputSchema: {
          type: "object",
          properties: {
            label: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              description: "The human-facing room name, such as Kitchen.",
            },
            x: { type: "number", minimum: 0, maximum: 900 },
            y: { type: "number", minimum: 0, maximum: 620 },
            width: { type: "number", minimum: 120, maximum: 900 },
            height: { type: "number", minimum: 100, maximum: 620 },
          },
          required: ["label"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.addRoom(input as AddRoomInput);
          const room = home.rooms.at(-1);
          onActivity?.(`Codex added ${room?.label ?? "a room"}`);
          return {
            changed: true,
            room,
            revision: home.revision,
            verification: "The new room is now visible on the canvas.",
          };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "home.update_room",
        title: "Move or resize a room",
        description:
          "Move or resize one named room on the visible Portego canvas. Coordinates use the 1000 by 650 floor-plan space and changes snap to the editor grid when initiated by a person.",
        inputSchema: {
          type: "object",
          properties: {
            roomLabel: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              description: "Exact visible room name.",
            },
            x: { type: "number", minimum: 0, maximum: 900 },
            y: { type: "number", minimum: 0, maximum: 620 },
            width: { type: "number", minimum: 120, maximum: 900 },
            height: { type: "number", minimum: 100, maximum: 620 },
          },
          required: ["roomLabel"],
          anyOf: [
            { required: ["x"] },
            { required: ["y"] },
            { required: ["width"] },
            { required: ["height"] },
          ],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.updateRoom(input as UpdateRoomInput);
          const room = home.rooms.find(
            (item) => item.label.toLowerCase() === String(input.roomLabel).toLowerCase(),
          );
          onActivity?.(`Codex updated ${room?.label ?? "a room"}`);
          return {
            changed: true,
            room,
            revision: home.revision,
            verification: "The room geometry is now visible on the canvas.",
          };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "home.add_fixture",
        title: "Add a fixture",
        description:
          "Add one light, switch, plug, or sensor to an existing room on the visible canvas. If exactly one compatible simulated endpoint is free, Portego binds it automatically.",
        inputSchema: {
          type: "object",
          properties: {
            roomLabel: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              description: "Exact visible room name.",
            },
            label: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              description: "Human-facing fixture name.",
            },
            type: {
              type: "string",
              enum: ["light", "switch", "plug", "sensor"],
            },
            autoBind: {
              type: "boolean",
              description: "Bind the first compatible unbound endpoint when available.",
            },
          },
          required: ["roomLabel", "label", "type"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.addFixture(input as AddFixtureInput);
          const fixture = home.fixtures.at(-1);
          const binding = home.bindings.find((item) => item.fixtureId === fixture?.id);
          onActivity?.(`Codex added ${fixture?.label ?? "a fixture"}`);
          return {
            changed: true,
            fixture,
            binding,
            revision: home.revision,
            verification: binding
              ? "The fixture is visible and bound to a simulated endpoint."
              : "The fixture is visible but is not yet bound.",
          };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "home.move_fixture",
        title: "Move a fixture",
        description:
          "Move one named fixture within its room on the visible Portego canvas. Coordinates use the 1000 by 650 floor-plan space.",
        inputSchema: {
          type: "object",
          properties: {
            fixtureLabel: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              description: "Exact visible fixture name.",
            },
            x: { type: "number", minimum: 0, maximum: 1000 },
            y: { type: "number", minimum: 0, maximum: 650 },
          },
          required: ["fixtureLabel", "x", "y"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.moveFixture(input as MoveFixtureInput);
          const fixture = home.fixtures.find(
            (item) => item.label.toLowerCase() === String(input.fixtureLabel).toLowerCase(),
          );
          onActivity?.(`Codex moved ${fixture?.label ?? "a fixture"}`);
          return {
            changed: true,
            fixture,
            revision: home.revision,
            verification: "The fixture position is now visible on the canvas.",
          };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "device.set_state",
        title: "Control a fixture",
        description:
          "Set power or brightness for one named fixture that is bound to a reachable device. This has an immediate simulated physical side effect in the walking skeleton.",
        inputSchema: {
          type: "object",
          properties: {
            fixtureLabel: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              description: "Exact visible fixture name.",
            },
            on: { type: "boolean" },
            brightness: { type: "number", minimum: 0, maximum: 100 },
          },
          required: ["fixtureLabel"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.setFixtureState(input as SetFixtureStateInput);
          const fixture = home.fixtures.find(
            (item) => item.label.toLowerCase() === String(input.fixtureLabel).toLowerCase(),
          );
          const binding = home.bindings.find((item) => item.fixtureId === fixture?.id);
          const endpoint = home.endpoints.find((item) => item.id === binding?.endpointId);
          onActivity?.(
            "Codex turned " +
              (fixture?.label ?? "the fixture") +
              " " +
              (endpoint?.reportedState.on ? "on" : "off"),
          );
          return {
            changed: true,
            fixture,
            reportedState: endpoint?.reportedState,
            revision: home.revision,
            verification: "The canvas now reflects the confirmed reported state.",
          };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "home.reset_demo",
        title: "Reset the demo home",
        description:
          "Remove all rooms, fixtures, and bindings from this Portego demo. This is destructive but affects only the temporary walking-skeleton home.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        execute: async () => {
          const home = await actions.reset();
          onActivity?.("Codex reset the demo home");
          return {
            changed: true,
            revision: home.revision,
            verification: "The canvas is empty.",
          };
        },
      },
      options,
    );

    return {
      status: "ready",
      unregister,
    };
  } catch (error) {
    unregister();
    if (signal?.aborted) {
      return { status: "unavailable", unregister: () => undefined };
    }
    const registrationError = error as { name?: unknown; message?: unknown; stack?: unknown };
    console.error(
      "portego.webmcp.registration_failed " +
        JSON.stringify({
          name: registrationError?.name,
          message: registrationError?.message,
          stack: registrationError?.stack,
        }),
    );
    return { status: "error", unregister: () => undefined };
  }
}
