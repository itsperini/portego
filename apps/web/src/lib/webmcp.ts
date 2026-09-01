import type {
  AddDeviceInput,
  AddOpeningInput,
  AddRoomInput,
  ApplyHomeChangesInput,
  BindDeviceInput,
  HomeDocument,
  MoveDeviceInput,
  RemoveDeviceInput,
  RemoveFloorInput,
  RemoveOpeningInput,
  RemoveRoomInput,
  SetDeviceStateInput,
  UnbindDeviceInput,
  UpdateDeviceInput,
  UpdateFloorDetailsInput,
  UpdateHomeDetailsInput,
  UpdateRoomInput,
} from "@portego/home-model";

export type WebMcpActions = {
  getHome: () => HomeDocument;
  updateHomeDetails: (input: UpdateHomeDetailsInput) => Promise<HomeDocument>;
  updateFloorDetails: (input: UpdateFloorDetailsInput) => Promise<HomeDocument>;
  removeFloor: (input: RemoveFloorInput) => Promise<HomeDocument>;
  addRoom: (input: AddRoomInput) => Promise<HomeDocument>;
  updateRoom: (input: UpdateRoomInput) => Promise<HomeDocument>;
  removeRoom: (input: RemoveRoomInput) => Promise<HomeDocument>;
  addDevice: (input: AddDeviceInput) => Promise<HomeDocument>;
  moveDevice: (input: MoveDeviceInput) => Promise<HomeDocument>;
  updateDevice: (input: UpdateDeviceInput) => Promise<HomeDocument>;
  removeDevice: (input: RemoveDeviceInput) => Promise<HomeDocument>;
  bindDevice: (input: BindDeviceInput) => Promise<HomeDocument>;
  unbindDevice: (input: UnbindDeviceInput) => Promise<HomeDocument>;
  addOpening: (input: AddOpeningInput) => Promise<HomeDocument>;
  removeOpening: (input: RemoveOpeningInput) => Promise<HomeDocument>;
  applyChanges: (input: ApplyHomeChangesInput) => Promise<HomeDocument>;
  undo: () => Promise<HomeDocument>;
  redo: () => Promise<HomeDocument>;
  setDeviceState: (input: SetDeviceStateInput) => Promise<HomeDocument>;
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
          "Read the current visible Portego home document, including rooms, devices, bindings, gateway status, and reported device state. This does not change anything.",
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
              devices: home.devices.length,
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
        name: "home.update_details",
        title: "Update home details",
        description:
          "Rename the Portego home or update its description, type, total area, and notes.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100 },
            description: { type: "string", maxLength: 500 },
            homeType: { type: "string", maxLength: 80 },
            areaM2: { type: ["number", "null"], minimum: 0 },
            notes: { type: "string", maxLength: 1000 },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.updateHomeDetails(input as UpdateHomeDetailsInput);
          onActivity?.(`Codex updated ${home.name}`);
          return { changed: true, home, revision: home.revision };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "home.update_floor_details",
        title: "Update floor details",
        description:
          "Rename one floor or update its description, area, and notes. Renaming also moves its rooms to the new floor name.",
        inputSchema: {
          type: "object",
          properties: {
            floorName: { type: "string", minLength: 1, maxLength: 80 },
            name: { type: "string", minLength: 1, maxLength: 80 },
            description: { type: "string", maxLength: 500 },
            areaM2: { type: ["number", "null"], minimum: 0 },
            notes: { type: "string", maxLength: 1000 },
          },
          required: ["floorName"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.updateFloorDetails(input as UpdateFloorDetailsInput);
          const floor = home.floors.find(
            (candidate) =>
              candidate.name.toLowerCase() === String(input.name ?? input.floorName).toLowerCase(),
          );
          onActivity?.(`Codex updated ${floor?.name ?? input.floorName}`);
          return { changed: true, floor, revision: home.revision };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "home.remove_floor",
        title: "Remove a floor",
        description:
          "Remove one named floor and every room, device, binding, door, and window assigned to it.",
        inputSchema: {
          type: "object",
          properties: { floorName: { type: "string", minLength: 1, maxLength: 80 } },
          required: ["floorName"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.removeFloor(input as RemoveFloorInput);
          onActivity?.(`Codex removed ${input.floorName}`);
          return { changed: true, floors: home.floors, revision: home.revision };
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
          "Remove one named room, its designed devices, their bindings, and any doors or windows connected to it.",
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
        name: "home.add_device",
        title: "Add a device",
        description:
          "Add one configured light, switch, plug, or sensor to an existing room on the visible canvas. Honor any placement the user describes. When no placement is specified, omit position so Portego chooses a sensible free location away from other devices. Never stack device symbols on top of one another. When autoBind is enabled, Portego binds the first available hardware endpoint that provides every required capability.",
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
              description: "Human-facing device name.",
            },
            type: {
              type: "string",
              enum: ["light", "switch", "plug", "sensor"],
            },
            config: {
              type: "object",
              description:
                "Type-specific configuration: lights use mounting, dimmable, and colorTemperature; switches use mode and channels; plugs use energyMonitoring; sensors use measures.",
              properties: {
                mounting: { type: "string", enum: ["ceiling", "wall", "table", "floor"] },
                dimmable: { type: "boolean" },
                colorTemperature: { type: "boolean" },
                mode: { type: "string", enum: ["toggle", "momentary", "dimmer"] },
                channels: { type: "number", minimum: 1, maximum: 4 },
                energyMonitoring: { type: "boolean" },
                measures: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "string",
                    enum: ["temperature", "occupancy", "contact"],
                  },
                },
              },
              additionalProperties: false,
            },
            autoBind: {
              type: "boolean",
              description: "Bind the first compatible unbound endpoint when available.",
            },
            position: {
              type: "object",
              description:
                "Optional position in the 1000 by 650 floor-plan space. Use it when the user requests a location (for example, near the right wall). Inspect home.get_document first and keep device centers separated from existing devices; otherwise omit this field for automatic placement.",
              properties: {
                x: { type: "number", minimum: 0, maximum: 1000 },
                y: { type: "number", minimum: 0, maximum: 650 },
              },
              required: ["x", "y"],
              additionalProperties: false,
            },
          },
          required: ["roomLabel", "label", "type"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.addDevice(input as AddDeviceInput);
          const device = home.devices.at(-1);
          const binding = home.bindings.find((item) => item.deviceId === device?.id);
          onActivity?.(`Codex added ${device?.label ?? "a device"}`);
          return {
            changed: true,
            device,
            binding,
            revision: home.revision,
            verification: binding
              ? "The device is visible and bound to a simulated endpoint."
              : "The device is visible but is not yet bound.",
          };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "home.move_device",
        title: "Move a device",
        description:
          "Move one named device within its room on the visible Portego canvas. Coordinates use the 1000 by 650 floor-plan space. Honor the user's requested location. Otherwise inspect home.get_document, choose a sensible position inside the room, and keep the device center about 70 coordinate units from other device centers so symbols do not overlap.",
        inputSchema: {
          type: "object",
          properties: {
            deviceLabel: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              description: "Exact visible device name.",
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
          required: ["deviceLabel", "x", "y"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.moveDevice(input as MoveDeviceInput);
          const device = home.devices.find(
            (item) => item.label.toLowerCase() === String(input.deviceLabel).toLowerCase(),
          );
          onActivity?.(`Codex moved ${device?.label ?? "a device"}`);
          return {
            changed: true,
            device,
            revision: home.revision,
            verification: "The device position is now visible on the canvas.",
          };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "home.update_device",
        title: "Rename or reassign a device",
        description:
          "Rename, reconfigure, change the type of, or move a device. When changing its room or coordinates, honor the user's requested location and otherwise inspect home.get_document to avoid overlapping another device. An incompatible physical binding is removed automatically.",
        inputSchema: {
          type: "object",
          properties: {
            deviceLabel: { type: "string", minLength: 1, maxLength: 80 },
            label: { type: "string", minLength: 1, maxLength: 80 },
            type: {
              type: "string",
              enum: ["light", "switch", "plug", "sensor"],
            },
            config: {
              type: "object",
              properties: {
                mounting: { type: "string", enum: ["ceiling", "wall", "table", "floor"] },
                dimmable: { type: "boolean" },
                colorTemperature: { type: "boolean" },
                mode: { type: "string", enum: ["toggle", "momentary", "dimmer"] },
                channels: { type: "number", minimum: 1, maximum: 4 },
                energyMonitoring: { type: "boolean" },
                measures: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "string",
                    enum: ["temperature", "occupancy", "contact"],
                  },
                },
              },
              additionalProperties: false,
            },
            roomLabel: { type: "string", minLength: 1, maxLength: 80 },
            x: { type: "number", minimum: 0, maximum: 1000 },
            y: { type: "number", minimum: 0, maximum: 650 },
          },
          required: ["deviceLabel"],
          anyOf: [
            { required: ["label"] },
            { required: ["type"] },
            { required: ["config"] },
            { required: ["roomLabel"] },
            { required: ["x"] },
            { required: ["y"] },
          ],
          additionalProperties: false,
        },
        execute: async (input) => {
          const before = actions.getHome();
          const previousDevice = before.devices.find(
            (candidate) =>
              candidate.label.toLowerCase() === String(input.deviceLabel).toLowerCase(),
          );
          const hadBinding = before.bindings.some(
            (candidate) => candidate.deviceId === previousDevice?.id,
          );
          const home = await actions.updateDevice(input as UpdateDeviceInput);
          const device = home.devices.find(
            (candidate) =>
              candidate.label.toLowerCase() ===
              String(input.label ?? input.deviceLabel).toLowerCase(),
          );
          const hasBinding = home.bindings.some((candidate) => candidate.deviceId === device?.id);
          const bindingRemoved = hadBinding && !hasBinding;
          onActivity?.(`Codex updated ${device?.label ?? "a device"}`);
          return {
            changed: true,
            device,
            bindingRemoved,
            revision: home.revision,
            verification: bindingRemoved
              ? "The device was updated and its incompatible hardware binding was removed."
              : "The device was updated and its binding remains compatible.",
          };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "home.remove_device",
        title: "Remove a device",
        description: "Remove one named device and its physical-device binding.",
        inputSchema: {
          type: "object",
          properties: {
            deviceLabel: { type: "string", minLength: 1, maxLength: 80 },
          },
          required: ["deviceLabel"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.removeDevice(input as RemoveDeviceInput);
          onActivity?.(`Codex removed ${String(input.deviceLabel)}`);
          return { changed: true, revision: home.revision };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "device.bind",
        title: "Bind a device to physical hardware",
        description:
          "Bind or rebind one designed device to a compatible discovered hardware endpoint. Both sides can have only one active binding.",
        inputSchema: {
          type: "object",
          properties: {
            deviceLabel: { type: "string", minLength: 1, maxLength: 80 },
            endpointLabel: { type: "string", minLength: 1, maxLength: 120 },
          },
          required: ["deviceLabel", "endpointLabel"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.bindDevice(input as BindDeviceInput);
          const device = home.devices.find(
            (candidate) =>
              candidate.label.toLowerCase() === String(input.deviceLabel).toLowerCase(),
          );
          const binding = home.bindings.find((candidate) => candidate.deviceId === device?.id);
          onActivity?.(`Codex bound ${String(input.deviceLabel)}`);
          return { changed: true, binding, revision: home.revision };
        },
      },
      options,
    );

    await modelContext.registerTool(
      {
        name: "device.unbind",
        title: "Unbind a device",
        description: "Disconnect one designed device from its physical hardware endpoint.",
        inputSchema: {
          type: "object",
          properties: {
            deviceLabel: { type: "string", minLength: 1, maxLength: 80 },
          },
          required: ["deviceLabel"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.unbindDevice(input as UnbindDeviceInput);
          onActivity?.(`Codex unbound ${String(input.deviceLabel)}`);
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
        title: "Control a device",
        description:
          "Set a supported power or brightness state for one named device bound to reachable hardware. This has an immediate simulated physical side effect.",
        inputSchema: {
          type: "object",
          properties: {
            deviceLabel: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              description: "Exact visible device name.",
            },
            on: { type: "boolean" },
            brightness: { type: "number", minimum: 0, maximum: 100 },
          },
          required: ["deviceLabel"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const home = await actions.setDeviceState(input as SetDeviceStateInput);
          const device = home.devices.find(
            (item) => item.label.toLowerCase() === String(input.deviceLabel).toLowerCase(),
          );
          const binding = home.bindings.find((item) => item.deviceId === device?.id);
          const endpoint = home.endpoints.find((item) => item.id === binding?.endpointId);
          onActivity?.(
            "Codex turned " +
              (device?.label ?? "the device") +
              " " +
              (endpoint?.reportedState.on ? "on" : "off"),
          );
          return {
            changed: true,
            device,
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
          "Remove all rooms, devices, and bindings from this Portego demo. This is destructive but affects only the temporary home.",
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
          "Apply up to 50 room, device, binding, or opening changes as one atomic edit. Coordinate room and device geometry as a complete layout: honor locations stated by the user, distribute unspecified devices sensibly inside their rooms, and do not place device symbols on top of one another. Omit add_device positions when automatic placement is appropriate. If any change fails, none are saved and one undo reverses the entire set.",
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
                      "add_device",
                      "update_device",
                      "remove_device",
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
