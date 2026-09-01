import type {
  AddFixtureInput,
  AddOpeningInput,
  AddRoomInput,
  ApplyHomeChangesInput,
  BindFixtureInput,
  HomeDocument,
  MoveFixtureInput,
  RemoveFixtureInput,
  RemoveOpeningInput,
  RemoveRoomInput,
  SetFixtureStateInput,
  UnbindFixtureInput,
  UpdateFixtureInput,
  UpdateRoomInput,
} from "@portego/home-model";

export type WebMcpActions = {
  getHome: () => HomeDocument;
  addRoom: (input: AddRoomInput) => Promise<HomeDocument>;
  updateRoom: (input: UpdateRoomInput) => Promise<HomeDocument>;
  removeRoom: (input: RemoveRoomInput) => Promise<HomeDocument>;
  addFixture: (input: AddFixtureInput) => Promise<HomeDocument>;
  moveFixture: (input: MoveFixtureInput) => Promise<HomeDocument>;
  updateFixture: (input: UpdateFixtureInput) => Promise<HomeDocument>;
  removeFixture: (input: RemoveFixtureInput) => Promise<HomeDocument>;
  bindFixture: (input: BindFixtureInput) => Promise<HomeDocument>;
  unbindFixture: (input: UnbindFixtureInput) => Promise<HomeDocument>;
  addOpening: (input: AddOpeningInput) => Promise<HomeDocument>;
  removeOpening: (input: RemoveOpeningInput) => Promise<HomeDocument>;
  applyChanges: (input: ApplyHomeChangesInput) => Promise<HomeDocument>;
  undo: () => Promise<HomeDocument>;
  redo: () => Promise<HomeDocument>;
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
              openings: home.openings.length,
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
          "Add one rectangular room to a floor of the Portego home. The change is applied immediately.",
        inputSchema: {
          type: "object",
          properties: {
            label: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              description: "The human-facing room name, such as Kitchen.",
            },
            floor: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              description: "Floor name, such as Ground floor or Attic. Defaults to Ground floor.",
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
        title: "Rename, move, or resize a room",
        description:
          "Rename, move, or resize one named room on the visible Portego canvas. Coordinates use the 1000 by 650 floor-plan space.",
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
              description: "A new human-facing room name.",
            },
            x: { type: "number", minimum: 0, maximum: 900 },
            y: { type: "number", minimum: 0, maximum: 620 },
            width: { type: "number", minimum: 120, maximum: 900 },
            height: { type: "number", minimum: 100, maximum: 620 },
          },
          required: ["roomLabel"],
          anyOf: [
            { required: ["label"] },
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
            (item) =>
              item.label.toLowerCase() === String(input.label ?? input.roomLabel).toLowerCase(),
          );
          onActivity?.(`Codex updated ${room?.label ?? "a room"}`);
          return {
            changed: true,
            room,
            revision: home.revision,
            verification: "The updated room is now visible on the canvas.",
          };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "home.remove_room",
        title: "Remove a room",
        description:
          "Remove one named room, its designed fixtures, their bindings, and any doors or windows connected to it.",
        inputSchema: {
          type: "object",
          properties: {
            roomLabel: { type: "string", minLength: 1, maxLength: 80 },
          },
          required: ["roomLabel"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.removeRoom(input as RemoveRoomInput);
          onActivity?.(`Codex removed ${String(input.roomLabel)}`);
          return {
            changed: true,
            revision: home.revision,
            verification: "The room and its dependent objects are no longer on the canvas.",
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
            position: {
              type: "object",
              properties: {
                x: { type: "number", minimum: 0, maximum: 1000 },
                y: { type: "number", minimum: 0, maximum: 720 },
              },
              required: ["x", "y"],
              additionalProperties: false,
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
            roomLabel: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              description: "Optional destination room name.",
            },
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
        name: "home.update_fixture",
        title: "Rename or reassign a fixture",
        description:
          "Rename a fixture, move it to another room, or set its exact position. Omitted coordinates place a reassigned fixture in the center of its new room.",
        inputSchema: {
          type: "object",
          properties: {
            fixtureLabel: { type: "string", minLength: 1, maxLength: 80 },
            label: { type: "string", minLength: 1, maxLength: 80 },
            roomLabel: { type: "string", minLength: 1, maxLength: 80 },
            x: { type: "number", minimum: 0, maximum: 1000 },
            y: { type: "number", minimum: 0, maximum: 720 },
          },
          required: ["fixtureLabel"],
          anyOf: [
            { required: ["label"] },
            { required: ["roomLabel"] },
            { required: ["x"] },
            { required: ["y"] },
          ],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.updateFixture(input as UpdateFixtureInput);
          const fixture = home.fixtures.find(
            (candidate) =>
              candidate.label.toLowerCase() ===
              String(input.label ?? input.fixtureLabel).toLowerCase(),
          );
          onActivity?.(`Codex updated ${fixture?.label ?? "a fixture"}`);
          return { changed: true, fixture, revision: home.revision };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "home.remove_fixture",
        title: "Remove a fixture",
        description: "Remove one named fixture and its physical-device binding.",
        inputSchema: {
          type: "object",
          properties: {
            fixtureLabel: { type: "string", minLength: 1, maxLength: 80 },
          },
          required: ["fixtureLabel"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.removeFixture(input as RemoveFixtureInput);
          onActivity?.(`Codex removed ${String(input.fixtureLabel)}`);
          return { changed: true, revision: home.revision };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "device.bind",
        title: "Bind a fixture to a device",
        description:
          "Bind or rebind one designed fixture to one compatible known device endpoint. A device and fixture can each have only one active binding.",
        inputSchema: {
          type: "object",
          properties: {
            fixtureLabel: { type: "string", minLength: 1, maxLength: 80 },
            endpointLabel: { type: "string", minLength: 1, maxLength: 120 },
          },
          required: ["fixtureLabel", "endpointLabel"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.bindFixture(input as BindFixtureInput);
          const fixture = home.fixtures.find(
            (candidate) =>
              candidate.label.toLowerCase() === String(input.fixtureLabel).toLowerCase(),
          );
          const binding = home.bindings.find((candidate) => candidate.fixtureId === fixture?.id);
          onActivity?.(`Codex bound ${String(input.fixtureLabel)}`);
          return { changed: true, binding, revision: home.revision };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "device.unbind",
        title: "Unbind a fixture",
        description: "Remove the physical-device binding from one designed fixture.",
        inputSchema: {
          type: "object",
          properties: {
            fixtureLabel: { type: "string", minLength: 1, maxLength: 80 },
          },
          required: ["fixtureLabel"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.unbindFixture(input as UnbindFixtureInput);
          onActivity?.(`Codex unbound ${String(input.fixtureLabel)}`);
          return { changed: true, revision: home.revision };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "home.add_opening",
        title: "Add a door or window",
        description:
          "Add a door or window to a named room wall. A door can optionally connect the room to another named room, making the relationship explicit.",
        inputSchema: {
          type: "object",
          properties: {
            roomLabel: { type: "string", minLength: 1, maxLength: 80 },
            connectsToRoomLabel: { type: "string", minLength: 1, maxLength: 80 },
            label: { type: "string", minLength: 1, maxLength: 80 },
            type: { type: "string", enum: ["door", "window"] },
            wall: { type: "string", enum: ["top", "right", "bottom", "left"] },
            offset: { type: "number", minimum: 0.1, maximum: 0.9 },
          },
          required: ["roomLabel", "type", "wall"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.addOpening(input as AddOpeningInput);
          const opening = home.openings.at(-1);
          onActivity?.(`Codex added ${opening?.type ?? "an opening"}`);
          return { changed: true, opening, revision: home.revision };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "home.remove_opening",
        title: "Remove a door or window",
        description: "Remove one labeled door or window from the home model.",
        inputSchema: {
          type: "object",
          properties: { label: { type: "string", minLength: 1, maxLength: 80 } },
          required: ["label"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.removeOpening(input as RemoveOpeningInput);
          onActivity?.(`Codex removed ${String(input.label)}`);
          return { changed: true, revision: home.revision };
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

    await modelContext.registerTool(
      {
        name: "home.apply_changes",
        title: "Apply several home changes",
        description:
          "Apply up to 50 room, fixture, binding, or opening changes as one atomic edit. If any change fails, none are saved and one undo reverses the entire set.",
        inputSchema: {
          type: "object",
          properties: {
            changes: {
              type: "array",
              minItems: 1,
              maxItems: 50,
              items: {
                type: "object",
                properties: {
                  op: {
                    type: "string",
                    enum: [
                      "add_room",
                      "update_room",
                      "remove_room",
                      "add_fixture",
                      "update_fixture",
                      "remove_fixture",
                      "bind_device",
                      "unbind_device",
                      "add_opening",
                      "remove_opening",
                    ],
                  },
                  input: { type: "object" },
                },
                required: ["op", "input"],
                additionalProperties: false,
              },
            },
          },
          required: ["changes"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.applyChanges(input as ApplyHomeChangesInput);
          onActivity?.(`Codex applied ${(input.changes as unknown[]).length} changes together`);
          return {
            changed: true,
            revision: home.revision,
            verification: "Every requested change was applied as one undoable transaction.",
          };
        },
      },
      options,
    );

    for (const historyAction of ["undo", "redo"] as const) {
      await modelContext.registerTool(
        {
          name: `home.${historyAction}`,
          title: historyAction === "undo" ? "Undo the last edit" : "Redo the last edit",
          description:
            historyAction === "undo"
              ? "Undo the most recent user or chatbot edit to the pre-login home."
              : "Redo the most recently undone edit to the pre-login home.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          execute: async () => {
            const home = await actions[historyAction]();
            onActivity?.(`Codex ${historyAction === "undo" ? "undid" : "redid"} the last edit`);
            return { changed: true, revision: home.revision };
          },
        },
        options,
      );
    }

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
