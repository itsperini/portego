import { z } from "zod";

export const capabilityKindSchema = z.enum([
  "power",
  "brightness",
  "color_temperature",
  "temperature",
  "contact",
  "occupancy",
  "energy",
]);

export const positionSchema = z.object({
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(720),
});

export const roomSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  floor: z.string().trim().min(1).max(80).default("Ground floor"),
  x: z.number().min(0).max(900),
  y: z.number().min(0).max(620),
  width: z.number().min(120).max(900),
  height: z.number().min(100).max(620),
});

export const fixtureTypeSchema = z.enum(["light", "switch", "plug", "sensor"]);

export const fixtureSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  type: fixtureTypeSchema,
  position: positionSchema,
  capabilities: z.array(capabilityKindSchema).min(1),
});

export const deviceStateSchema = z.object({
  on: z.boolean().optional(),
  brightness: z.number().int().min(0).max(100).optional(),
  temperature: z.number().optional(),
});

export const deviceEndpointSchema = z.object({
  id: z.string().min(1),
  gatewayId: z.string().min(1),
  label: z.string().trim().min(1).max(120),
  protocol: z.string().min(1),
  reachable: z.boolean(),
  capabilities: z.array(capabilityKindSchema).min(1),
  desiredState: deviceStateSchema,
  reportedState: deviceStateSchema,
  updatedAt: z.string().datetime(),
});

export const bindingSchema = z.object({
  id: z.string().min(1),
  fixtureId: z.string().min(1),
  endpointId: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const wallSideSchema = z.enum(["top", "right", "bottom", "left"]);
export const openingTypeSchema = z.enum(["door", "window"]);

export const openingSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  connectsToRoomId: z.string().min(1).optional(),
  label: z.string().trim().min(1).max(80).optional(),
  type: openingTypeSchema,
  wall: wallSideSchema,
  offset: z.number().min(0.1).max(0.9),
});

export const gatewaySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["online", "connecting", "offline"]),
  lastSeenAt: z.string().datetime().nullable(),
  version: z.string(),
});

export const homeDocumentSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  revision: z.number().int().nonnegative(),
  rooms: z.array(roomSchema),
  fixtures: z.array(fixtureSchema),
  endpoints: z.array(deviceEndpointSchema),
  bindings: z.array(bindingSchema),
  openings: z.array(openingSchema),
  gateway: gatewaySchema,
  updatedAt: z.string().datetime(),
});

export const addRoomInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
  floor: z.string().trim().min(1).max(80).default("Ground floor"),
  x: z.number().min(0).max(900).optional(),
  y: z.number().min(0).max(620).optional(),
  width: z.number().min(120).max(900).optional(),
  height: z.number().min(100).max(620).optional(),
});

export const addFixtureInputSchema = z.object({
  roomId: z.string().min(1).optional(),
  roomLabel: z.string().trim().min(1).max(80).optional(),
  label: z.string().trim().min(1).max(80),
  type: fixtureTypeSchema.default("light"),
  position: positionSchema.optional(),
  autoBind: z.boolean().default(true),
});

export const updateRoomInputSchema = z
  .object({
    roomId: z.string().min(1).optional(),
    roomLabel: z.string().trim().min(1).max(80).optional(),
    label: z.string().trim().min(1).max(80).optional(),
    x: z.number().min(0).max(900).optional(),
    y: z.number().min(0).max(620).optional(),
    width: z.number().min(120).max(900).optional(),
    height: z.number().min(100).max(620).optional(),
  })
  .refine((input) => input.roomId || input.roomLabel, {
    message: "Provide roomId or roomLabel.",
  })
  .refine(
    (input) =>
      input.x !== undefined ||
      input.y !== undefined ||
      input.width !== undefined ||
      input.height !== undefined ||
      input.label !== undefined,
    { message: "Provide a new label or at least one room geometry value." },
  );

export const removeRoomInputSchema = z
  .object({
    roomId: z.string().min(1).optional(),
    roomLabel: z.string().trim().min(1).max(80).optional(),
  })
  .refine((input) => input.roomId || input.roomLabel, {
    message: "Provide roomId or roomLabel.",
  });

export const moveFixtureInputSchema = z
  .object({
    fixtureId: z.string().min(1).optional(),
    fixtureLabel: z.string().trim().min(1).max(80).optional(),
    x: z.number().min(0).max(1000),
    y: z.number().min(0).max(720),
    roomId: z.string().min(1).optional(),
    roomLabel: z.string().trim().min(1).max(80).optional(),
  })
  .refine((input) => input.fixtureId || input.fixtureLabel, {
    message: "Provide fixtureId or fixtureLabel.",
  });

export const updateFixtureInputSchema = z
  .object({
    fixtureId: z.string().min(1).optional(),
    fixtureLabel: z.string().trim().min(1).max(80).optional(),
    label: z.string().trim().min(1).max(80).optional(),
    roomId: z.string().min(1).optional(),
    roomLabel: z.string().trim().min(1).max(80).optional(),
    x: z.number().min(0).max(1000).optional(),
    y: z.number().min(0).max(720).optional(),
  })
  .refine((input) => input.fixtureId || input.fixtureLabel, {
    message: "Provide fixtureId or fixtureLabel.",
  })
  .refine(
    (input) =>
      input.label !== undefined ||
      input.roomId !== undefined ||
      input.roomLabel !== undefined ||
      input.x !== undefined ||
      input.y !== undefined,
    { message: "Provide a fixture label, room, or position to update." },
  );

export const removeFixtureInputSchema = z
  .object({
    fixtureId: z.string().min(1).optional(),
    fixtureLabel: z.string().trim().min(1).max(80).optional(),
  })
  .refine((input) => input.fixtureId || input.fixtureLabel, {
    message: "Provide fixtureId or fixtureLabel.",
  });

export const bindFixtureInputSchema = z
  .object({
    fixtureId: z.string().min(1).optional(),
    fixtureLabel: z.string().trim().min(1).max(80).optional(),
    endpointId: z.string().min(1).optional(),
    endpointLabel: z.string().trim().min(1).max(120).optional(),
  })
  .refine((input) => input.fixtureId || input.fixtureLabel, {
    message: "Provide fixtureId or fixtureLabel.",
  })
  .refine((input) => input.endpointId || input.endpointLabel, {
    message: "Provide endpointId or endpointLabel.",
  });

export const unbindFixtureInputSchema = removeFixtureInputSchema;

export const addOpeningInputSchema = z
  .object({
    roomId: z.string().min(1).optional(),
    roomLabel: z.string().trim().min(1).max(80).optional(),
    connectsToRoomId: z.string().min(1).optional(),
    connectsToRoomLabel: z.string().trim().min(1).max(80).optional(),
    label: z.string().trim().min(1).max(80).optional(),
    type: openingTypeSchema,
    wall: wallSideSchema,
    offset: z.number().min(0.1).max(0.9).default(0.5),
  })
  .refine((input) => input.roomId || input.roomLabel, {
    message: "Provide roomId or roomLabel.",
  });

export const removeOpeningInputSchema = z
  .object({
    openingId: z.string().min(1).optional(),
    label: z.string().trim().min(1).max(80).optional(),
  })
  .refine((input) => input.openingId || input.label, {
    message: "Provide openingId or label.",
  });

export const setFixtureStateInputSchema = z
  .object({
    fixtureId: z.string().min(1).optional(),
    fixtureLabel: z.string().trim().min(1).max(80).optional(),
    on: z.boolean().optional(),
    brightness: z.number().int().min(0).max(100).optional(),
  })
  .refine((input) => input.fixtureId || input.fixtureLabel, {
    message: "Provide fixtureId or fixtureLabel.",
  })
  .refine((input) => input.on !== undefined || input.brightness !== undefined, {
    message: "Provide on or brightness.",
  });

export const homeChangeSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_room"), input: addRoomInputSchema }),
  z.object({ op: z.literal("update_room"), input: updateRoomInputSchema }),
  z.object({ op: z.literal("remove_room"), input: removeRoomInputSchema }),
  z.object({ op: z.literal("add_fixture"), input: addFixtureInputSchema }),
  z.object({ op: z.literal("update_fixture"), input: updateFixtureInputSchema }),
  z.object({ op: z.literal("remove_fixture"), input: removeFixtureInputSchema }),
  z.object({ op: z.literal("bind_device"), input: bindFixtureInputSchema }),
  z.object({ op: z.literal("unbind_device"), input: unbindFixtureInputSchema }),
  z.object({ op: z.literal("add_opening"), input: addOpeningInputSchema }),
  z.object({ op: z.literal("remove_opening"), input: removeOpeningInputSchema }),
]);

export const applyHomeChangesInputSchema = z.object({
  changes: z.array(homeChangeSchema).min(1).max(50),
});

export type CapabilityKind = z.infer<typeof capabilityKindSchema>;
export type Room = z.infer<typeof roomSchema>;
export type Fixture = z.infer<typeof fixtureSchema>;
export type DeviceState = z.infer<typeof deviceStateSchema>;
export type DeviceEndpoint = z.infer<typeof deviceEndpointSchema>;
export type Binding = z.infer<typeof bindingSchema>;
export type WallSide = z.infer<typeof wallSideSchema>;
export type OpeningType = z.infer<typeof openingTypeSchema>;
export type Opening = z.infer<typeof openingSchema>;
export type Gateway = z.infer<typeof gatewaySchema>;
export type HomeDocument = z.infer<typeof homeDocumentSchema>;
export type AddRoomInput = z.input<typeof addRoomInputSchema>;
export type AddFixtureInput = z.input<typeof addFixtureInputSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomInputSchema>;
export type RemoveRoomInput = z.infer<typeof removeRoomInputSchema>;
export type MoveFixtureInput = z.infer<typeof moveFixtureInputSchema>;
export type UpdateFixtureInput = z.infer<typeof updateFixtureInputSchema>;
export type RemoveFixtureInput = z.infer<typeof removeFixtureInputSchema>;
export type BindFixtureInput = z.infer<typeof bindFixtureInputSchema>;
export type UnbindFixtureInput = z.infer<typeof unbindFixtureInputSchema>;
export type AddOpeningInput = z.input<typeof addOpeningInputSchema>;
export type RemoveOpeningInput = z.infer<typeof removeOpeningInputSchema>;
export type SetFixtureStateInput = z.infer<typeof setFixtureStateInputSchema>;
export type HomeChange = z.input<typeof homeChangeSchema>;
export type ApplyHomeChangesInput = z.input<typeof applyHomeChangesInputSchema>;

const fixtureCapabilities: Record<z.infer<typeof fixtureTypeSchema>, CapabilityKind[]> = {
  light: ["power", "brightness"],
  switch: ["power"],
  plug: ["power", "energy"],
  sensor: ["temperature"],
};

const id = (prefix: string): string =>
  typeof globalThis.crypto?.randomUUID === "function"
    ? `${prefix}_${globalThis.crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const now = (): string => new Date().toISOString();

const touch = (home: HomeDocument): HomeDocument => ({
  ...home,
  revision: home.revision + 1,
  updatedAt: now(),
});

export function createDemoHome(name = "Casa Portego"): HomeDocument {
  const timestamp = now();
  return homeDocumentSchema.parse({
    id: "home_demo",
    name,
    revision: 0,
    rooms: [],
    fixtures: [],
    endpoints: [
      {
        id: "endpoint_sim_light_1",
        gatewayId: "gateway_sim_1",
        label: "Simulator light 01",
        protocol: "simulated",
        reachable: true,
        capabilities: ["power", "brightness"],
        desiredState: { on: false, brightness: 72 },
        reportedState: { on: false, brightness: 72 },
        updatedAt: timestamp,
      },
    ],
    bindings: [],
    openings: [],
    gateway: {
      id: "gateway_sim_1",
      label: "Portego simulator",
      status: "connecting",
      lastSeenAt: null,
      version: "0.1.0",
    },
    updatedAt: timestamp,
  });
}

export function addRoom(home: HomeDocument, rawInput: AddRoomInput): HomeDocument {
  const input = addRoomInputSchema.parse(rawInput);
  if (home.rooms.some((room) => room.label.toLowerCase() === input.label.toLowerCase())) {
    throw new Error("A room with that name already exists.");
  }
  const index = home.rooms.length;
  const room: Room = {
    id: id("room"),
    label: input.label,
    floor: input.floor,
    x: input.x ?? 72 + (index % 2) * 332,
    y: input.y ?? 76 + Math.floor(index / 2) * 248,
    width: input.width ?? 300,
    height: input.height ?? 216,
  };

  return touch({ ...home, rooms: [...home.rooms, room] });
}

export function resolveRoom(
  home: HomeDocument,
  input: Pick<UpdateRoomInput, "roomId" | "roomLabel">,
): Room {
  const room = input.roomId
    ? home.rooms.find((candidate) => candidate.id === input.roomId)
    : home.rooms.find(
        (candidate) => candidate.label.toLowerCase() === input.roomLabel?.toLowerCase(),
      );
  if (!room) {
    throw new Error("Room not found.");
  }
  return room;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

export function updateRoomGeometry(home: HomeDocument, rawInput: UpdateRoomInput): HomeDocument {
  const input = updateRoomInputSchema.parse(rawInput);
  const room = resolveRoom(home, input);
  if (
    input.label &&
    home.rooms.some(
      (candidate) =>
        candidate.id !== room.id && candidate.label.toLowerCase() === input.label?.toLowerCase(),
    )
  ) {
    throw new Error("A room with that name already exists.");
  }
  const width = input.width ?? room.width;
  const height = input.height ?? room.height;
  const nextRoom: Room = {
    ...room,
    label: input.label ?? room.label,
    x: clamp(input.x ?? room.x, 0, 1000 - width),
    y: clamp(input.y ?? room.y, 0, 650 - height),
    width,
    height,
  };
  const inset = 28;
  const fixtures = home.fixtures.map((fixture) => {
    if (fixture.roomId !== room.id) {
      return fixture;
    }
    const relativeX = (fixture.position.x - room.x) / room.width;
    const relativeY = (fixture.position.y - room.y) / room.height;
    return {
      ...fixture,
      position: {
        x: clamp(
          nextRoom.x + relativeX * nextRoom.width,
          nextRoom.x + inset,
          nextRoom.x + nextRoom.width - inset,
        ),
        y: clamp(
          nextRoom.y + relativeY * nextRoom.height,
          nextRoom.y + inset,
          nextRoom.y + nextRoom.height - inset,
        ),
      },
    };
  });

  return touch({
    ...home,
    rooms: home.rooms.map((candidate) => (candidate.id === room.id ? nextRoom : candidate)),
    fixtures,
  });
}

export function removeRoom(home: HomeDocument, rawInput: RemoveRoomInput): HomeDocument {
  const input = removeRoomInputSchema.parse(rawInput);
  const room = resolveRoom(home, input);
  const fixtureIds = new Set(
    home.fixtures.filter((fixture) => fixture.roomId === room.id).map((fixture) => fixture.id),
  );
  return touch({
    ...home,
    rooms: home.rooms.filter((candidate) => candidate.id !== room.id),
    fixtures: home.fixtures.filter((fixture) => fixture.roomId !== room.id),
    bindings: home.bindings.filter((binding) => !fixtureIds.has(binding.fixtureId)),
    openings: home.openings.filter(
      (opening) => opening.roomId !== room.id && opening.connectsToRoomId !== room.id,
    ),
  });
}

export function addFixture(home: HomeDocument, rawInput: AddFixtureInput): HomeDocument {
  const input = addFixtureInputSchema.parse(rawInput);
  const room = input.roomId
    ? home.rooms.find((candidate) => candidate.id === input.roomId)
    : home.rooms.find(
        (candidate) => candidate.label.toLowerCase() === input.roomLabel?.toLowerCase(),
      );

  if (!room) {
    throw new Error("The requested room does not exist.");
  }
  if (home.fixtures.some((fixture) => fixture.label.toLowerCase() === input.label.toLowerCase())) {
    throw new Error("A fixture with that name already exists.");
  }

  const fixture: Fixture = {
    id: id("fixture"),
    roomId: room.id,
    label: input.label,
    type: input.type,
    position: input.position ?? {
      x: room.x + room.width / 2,
      y: room.y + room.height / 2,
    },
    capabilities: fixtureCapabilities[input.type],
  };

  let next = touch({ ...home, fixtures: [...home.fixtures, fixture] });
  if (!input.autoBind) {
    return next;
  }

  const boundEndpointIds = new Set(next.bindings.map((binding) => binding.endpointId));
  const endpoint = next.endpoints.find(
    (candidate) =>
      !boundEndpointIds.has(candidate.id) &&
      candidate.capabilities.some((capability) => fixture.capabilities.includes(capability)),
  );

  if (endpoint) {
    next = bindFixture(next, fixture.id, endpoint.id);
  }

  return next;
}

export function bindFixture(
  home: HomeDocument,
  fixtureId: string,
  endpointId: string,
): HomeDocument {
  if (!home.fixtures.some((fixture) => fixture.id === fixtureId)) {
    throw new Error("Fixture not found.");
  }
  if (!home.endpoints.some((endpoint) => endpoint.id === endpointId)) {
    throw new Error("Device endpoint not found.");
  }

  const bindings = home.bindings.filter(
    (binding) => binding.fixtureId !== fixtureId && binding.endpointId !== endpointId,
  );
  bindings.push({
    id: id("binding"),
    fixtureId,
    endpointId,
    createdAt: now(),
  });
  return touch({ ...home, bindings });
}

export function bindFixtureToEndpoint(
  home: HomeDocument,
  rawInput: BindFixtureInput,
): HomeDocument {
  const input = bindFixtureInputSchema.parse(rawInput);
  const fixture = resolveFixture(home, input);
  const endpoint = input.endpointId
    ? home.endpoints.find((candidate) => candidate.id === input.endpointId)
    : home.endpoints.find(
        (candidate) => candidate.label.toLowerCase() === input.endpointLabel?.toLowerCase(),
      );
  if (!endpoint) {
    throw new Error("Device endpoint not found.");
  }
  if (!endpoint.capabilities.some((capability) => fixture.capabilities.includes(capability))) {
    throw new Error("The fixture and device do not share a compatible capability.");
  }
  return bindFixture(home, fixture.id, endpoint.id);
}

export function unbindFixture(home: HomeDocument, rawInput: UnbindFixtureInput): HomeDocument {
  const input = unbindFixtureInputSchema.parse(rawInput);
  const fixture = resolveFixture(home, input);
  return touch({
    ...home,
    bindings: home.bindings.filter((binding) => binding.fixtureId !== fixture.id),
  });
}

export function upsertEndpoints(home: HomeDocument, endpoints: DeviceEndpoint[]): HomeDocument {
  const incoming = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]));
  const merged = home.endpoints
    .filter((endpoint) => !incoming.has(endpoint.id))
    .concat(endpoints.map((endpoint) => deviceEndpointSchema.parse(endpoint)));
  return touch({ ...home, endpoints: merged });
}

export function setGatewayStatus(
  home: HomeDocument,
  status: Gateway["status"],
  lastSeenAt: string | null = status === "online" ? now() : home.gateway.lastSeenAt,
): HomeDocument {
  return touch({
    ...home,
    gateway: { ...home.gateway, status, lastSeenAt },
    endpoints: home.endpoints.map((endpoint) => ({
      ...endpoint,
      reachable: status === "online",
    })),
  });
}

export function resolveFixture(
  home: HomeDocument,
  input: Pick<SetFixtureStateInput, "fixtureId" | "fixtureLabel">,
): Fixture {
  const fixture = input.fixtureId
    ? home.fixtures.find((candidate) => candidate.id === input.fixtureId)
    : home.fixtures.find(
        (candidate) => candidate.label.toLowerCase() === input.fixtureLabel?.toLowerCase(),
      );
  if (!fixture) {
    throw new Error("Fixture not found.");
  }
  return fixture;
}

export function moveFixture(home: HomeDocument, rawInput: MoveFixtureInput): HomeDocument {
  const input = moveFixtureInputSchema.parse(rawInput);
  return updateFixture(home, input);
}

export function updateFixture(home: HomeDocument, rawInput: UpdateFixtureInput): HomeDocument {
  const input = updateFixtureInputSchema.parse(rawInput);
  const fixture = resolveFixture(home, input);
  const room =
    input.roomId || input.roomLabel
      ? resolveRoom(home, { roomId: input.roomId, roomLabel: input.roomLabel })
      : roomForFixture(home, fixture);
  if (!room) {
    throw new Error("Fixture room not found.");
  }
  if (
    input.label &&
    home.fixtures.some(
      (candidate) =>
        candidate.id !== fixture.id && candidate.label.toLowerCase() === input.label?.toLowerCase(),
    )
  ) {
    throw new Error("A fixture with that name already exists.");
  }
  const inset = 28;
  const movedRooms = fixture.roomId !== room.id;
  const position = {
    x: clamp(
      input.x ?? (movedRooms ? room.x + room.width / 2 : fixture.position.x),
      room.x + inset,
      room.x + room.width - inset,
    ),
    y: clamp(
      input.y ?? (movedRooms ? room.y + room.height / 2 : fixture.position.y),
      room.y + inset,
      room.y + room.height - inset,
    ),
  };
  return touch({
    ...home,
    fixtures: home.fixtures.map((candidate) =>
      candidate.id === fixture.id
        ? { ...candidate, label: input.label ?? candidate.label, roomId: room.id, position }
        : candidate,
    ),
  });
}

export function removeFixture(home: HomeDocument, rawInput: RemoveFixtureInput): HomeDocument {
  const input = removeFixtureInputSchema.parse(rawInput);
  const fixture = resolveFixture(home, input);
  return touch({
    ...home,
    fixtures: home.fixtures.filter((candidate) => candidate.id !== fixture.id),
    bindings: home.bindings.filter((binding) => binding.fixtureId !== fixture.id),
  });
}

export function addOpening(home: HomeDocument, rawInput: AddOpeningInput): HomeDocument {
  const input = addOpeningInputSchema.parse(rawInput);
  const room = resolveRoom(home, input);
  const connectedRoom =
    input.connectsToRoomId || input.connectsToRoomLabel
      ? resolveRoom(home, {
          roomId: input.connectsToRoomId,
          roomLabel: input.connectsToRoomLabel,
        })
      : undefined;
  if (connectedRoom?.id === room.id) {
    throw new Error("An opening cannot connect a room to itself.");
  }
  const opening: Opening = {
    id: id("opening"),
    roomId: room.id,
    ...(connectedRoom ? { connectsToRoomId: connectedRoom.id } : {}),
    ...(input.label ? { label: input.label } : {}),
    type: input.type,
    wall: input.wall,
    offset: input.offset,
  };
  return touch({ ...home, openings: [...home.openings, opening] });
}

export function removeOpening(home: HomeDocument, rawInput: RemoveOpeningInput): HomeDocument {
  const input = removeOpeningInputSchema.parse(rawInput);
  const opening = input.openingId
    ? home.openings.find((candidate) => candidate.id === input.openingId)
    : home.openings.find(
        (candidate) => candidate.label?.toLowerCase() === input.label?.toLowerCase(),
      );
  if (!opening) {
    throw new Error("Opening not found.");
  }
  return touch({
    ...home,
    openings: home.openings.filter((candidate) => candidate.id !== opening.id),
  });
}

export function applyHomeChanges(
  home: HomeDocument,
  rawInput: ApplyHomeChangesInput,
): HomeDocument {
  const input = applyHomeChangesInputSchema.parse(rawInput);
  return input.changes.reduce((current, change) => {
    switch (change.op) {
      case "add_room":
        return addRoom(current, change.input);
      case "update_room":
        return updateRoomGeometry(current, change.input);
      case "remove_room":
        return removeRoom(current, change.input);
      case "add_fixture":
        return addFixture(current, change.input);
      case "update_fixture":
        return updateFixture(current, change.input);
      case "remove_fixture":
        return removeFixture(current, change.input);
      case "bind_device":
        return bindFixtureToEndpoint(current, change.input);
      case "unbind_device":
        return unbindFixture(current, change.input);
      case "add_opening":
        return addOpening(current, change.input);
      case "remove_opening":
        return removeOpening(current, change.input);
    }
    return current;
  }, home);
}

export function endpointForFixture(
  home: HomeDocument,
  fixtureId: string,
): DeviceEndpoint | undefined {
  const binding = home.bindings.find((candidate) => candidate.fixtureId === fixtureId);
  return home.endpoints.find((endpoint) => endpoint.id === binding?.endpointId);
}

export function setDesiredFixtureState(
  home: HomeDocument,
  rawInput: SetFixtureStateInput,
): { home: HomeDocument; endpoint: DeviceEndpoint; requestedState: DeviceState } {
  const input = setFixtureStateInputSchema.parse(rawInput);
  const fixture = resolveFixture(home, input);
  const endpoint = endpointForFixture(home, fixture.id);
  if (!endpoint) {
    throw new Error("Fixture is not bound to a device.");
  }

  const requestedState: DeviceState = {
    ...endpoint.desiredState,
    ...(input.on !== undefined ? { on: input.on } : {}),
    ...(input.brightness !== undefined ? { brightness: input.brightness } : {}),
  };
  const endpoints = home.endpoints.map((candidate) =>
    candidate.id === endpoint.id
      ? { ...candidate, desiredState: requestedState, updatedAt: now() }
      : candidate,
  );

  return { home: touch({ ...home, endpoints }), endpoint, requestedState };
}

export function applyReportedState(
  home: HomeDocument,
  endpointId: string,
  reportedState: DeviceState,
): HomeDocument {
  if (!home.endpoints.some((endpoint) => endpoint.id === endpointId)) {
    throw new Error("Device endpoint not found.");
  }
  return touch({
    ...home,
    endpoints: home.endpoints.map((endpoint) =>
      endpoint.id === endpointId
        ? {
            ...endpoint,
            reachable: true,
            reportedState: { ...endpoint.reportedState, ...reportedState },
            updatedAt: now(),
          }
        : endpoint,
    ),
  });
}

export function roomForFixture(home: HomeDocument, fixture: Fixture): Room | undefined {
  return home.rooms.find((room) => room.id === fixture.roomId);
}
