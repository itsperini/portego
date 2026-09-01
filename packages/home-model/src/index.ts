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
  gateway: gatewaySchema,
  updatedAt: z.string().datetime(),
});

export const addRoomInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
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

export type CapabilityKind = z.infer<typeof capabilityKindSchema>;
export type Room = z.infer<typeof roomSchema>;
export type Fixture = z.infer<typeof fixtureSchema>;
export type DeviceState = z.infer<typeof deviceStateSchema>;
export type DeviceEndpoint = z.infer<typeof deviceEndpointSchema>;
export type Binding = z.infer<typeof bindingSchema>;
export type Gateway = z.infer<typeof gatewaySchema>;
export type HomeDocument = z.infer<typeof homeDocumentSchema>;
export type AddRoomInput = z.input<typeof addRoomInputSchema>;
export type AddFixtureInput = z.input<typeof addFixtureInputSchema>;
export type SetFixtureStateInput = z.infer<typeof setFixtureStateInputSchema>;

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
  const index = home.rooms.length;
  const room: Room = {
    id: id("room"),
    label: input.label,
    x: input.x ?? 72 + (index % 2) * 332,
    y: input.y ?? 76 + Math.floor(index / 2) * 248,
    width: input.width ?? 300,
    height: input.height ?? 216,
  };

  return touch({ ...home, rooms: [...home.rooms, room] });
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
