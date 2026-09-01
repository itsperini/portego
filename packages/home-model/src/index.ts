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

export const floorSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(""),
  areaM2: z.number().positive().max(100000).optional(),
  notes: z.string().trim().max(1000).default(""),
});

export const deviceTypeSchema = z.enum(["light", "switch", "plug", "sensor"]);

export const deviceConfigSchema = z.object({
  mounting: z.enum(["ceiling", "wall", "table", "floor"]).optional(),
  dimmable: z.boolean().optional(),
  colorTemperature: z.boolean().optional(),
  mode: z.enum(["toggle", "momentary", "dimmer"]).optional(),
  channels: z.number().int().min(1).max(4).optional(),
  energyMonitoring: z.boolean().optional(),
  measures: z
    .array(z.enum(["temperature", "occupancy", "contact"]))
    .min(1)
    .optional(),
});

export const deviceSchema = z.object({
  id: z.string().min(1),
  roomId: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  type: deviceTypeSchema,
  config: deviceConfigSchema,
  position: positionSchema,
  capabilities: z.array(capabilityKindSchema).min(1),
});

export const deviceStateSchema = z.object({
  on: z.boolean().optional(),
  brightness: z.number().int().min(0).max(100).optional(),
  temperature: z.number().optional(),
  contact: z.boolean().optional(),
  occupancy: z.boolean().optional(),
  energy: z.number().nonnegative().optional(),
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
  deviceId: z.string().min(1),
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
  description: z.string().trim().max(500).default(""),
  homeType: z.string().trim().max(80).default(""),
  areaM2: z.number().positive().max(100000).optional(),
  notes: z.string().trim().max(1000).default(""),
  revision: z.number().int().nonnegative(),
  floors: z
    .array(floorSchema)
    .default([{ id: "floor_ground", name: "Ground floor", description: "", notes: "" }]),
  rooms: z.array(roomSchema),
  devices: z.array(deviceSchema),
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

export const updateHomeDetailsInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    homeType: z.string().trim().max(80).optional(),
    areaM2: z.number().positive().max(100000).nullable().optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "Provide at least one home detail to update.",
  });

export const updateFloorDetailsInputSchema = z
  .object({
    floorName: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    areaM2: z.number().positive().max(100000).nullable().optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine(
    (input) =>
      input.name !== undefined ||
      input.description !== undefined ||
      input.areaM2 !== undefined ||
      input.notes !== undefined,
    { message: "Provide at least one floor detail to update." },
  );

export const removeFloorInputSchema = z.object({
  floorName: z.string().trim().min(1).max(80),
});

export const addDeviceInputSchema = z.object({
  roomId: z.string().min(1).optional(),
  roomLabel: z.string().trim().min(1).max(80).optional(),
  label: z.string().trim().min(1).max(80),
  type: deviceTypeSchema,
  config: deviceConfigSchema.optional(),
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

export const moveDeviceInputSchema = z
  .object({
    deviceId: z.string().min(1).optional(),
    deviceLabel: z.string().trim().min(1).max(80).optional(),
    x: z.number().min(0).max(1000),
    y: z.number().min(0).max(720),
    roomId: z.string().min(1).optional(),
    roomLabel: z.string().trim().min(1).max(80).optional(),
  })
  .refine((input) => input.deviceId || input.deviceLabel, {
    message: "Provide deviceId or deviceLabel.",
  });

export const updateDeviceInputSchema = z
  .object({
    deviceId: z.string().min(1).optional(),
    deviceLabel: z.string().trim().min(1).max(80).optional(),
    label: z.string().trim().min(1).max(80).optional(),
    type: deviceTypeSchema.optional(),
    config: deviceConfigSchema.optional(),
    roomId: z.string().min(1).optional(),
    roomLabel: z.string().trim().min(1).max(80).optional(),
    x: z.number().min(0).max(1000).optional(),
    y: z.number().min(0).max(720).optional(),
  })
  .refine((input) => input.deviceId || input.deviceLabel, {
    message: "Provide deviceId or deviceLabel.",
  })
  .refine(
    (input) =>
      input.label !== undefined ||
      input.type !== undefined ||
      input.config !== undefined ||
      input.roomId !== undefined ||
      input.roomLabel !== undefined ||
      input.x !== undefined ||
      input.y !== undefined,
    { message: "Provide a device label, type, configuration, room, or position to update." },
  );

export const removeDeviceInputSchema = z
  .object({
    deviceId: z.string().min(1).optional(),
    deviceLabel: z.string().trim().min(1).max(80).optional(),
  })
  .refine((input) => input.deviceId || input.deviceLabel, {
    message: "Provide deviceId or deviceLabel.",
  });

export const bindDeviceInputSchema = z
  .object({
    deviceId: z.string().min(1).optional(),
    deviceLabel: z.string().trim().min(1).max(80).optional(),
    endpointId: z.string().min(1).optional(),
    endpointLabel: z.string().trim().min(1).max(120).optional(),
  })
  .refine((input) => input.deviceId || input.deviceLabel, {
    message: "Provide deviceId or deviceLabel.",
  })
  .refine((input) => input.endpointId || input.endpointLabel, {
    message: "Provide endpointId or endpointLabel.",
  });

export const unbindDeviceInputSchema = removeDeviceInputSchema;

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

export const setDeviceStateInputSchema = z
  .object({
    deviceId: z.string().min(1).optional(),
    deviceLabel: z.string().trim().min(1).max(80).optional(),
    on: z.boolean().optional(),
    brightness: z.number().int().min(0).max(100).optional(),
  })
  .refine((input) => input.deviceId || input.deviceLabel, {
    message: "Provide deviceId or deviceLabel.",
  })
  .refine((input) => input.on !== undefined || input.brightness !== undefined, {
    message: "Provide on or brightness.",
  });

export const homeChangeSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_room"), input: addRoomInputSchema }),
  z.object({ op: z.literal("update_room"), input: updateRoomInputSchema }),
  z.object({ op: z.literal("remove_room"), input: removeRoomInputSchema }),
  z.object({ op: z.literal("add_device"), input: addDeviceInputSchema }),
  z.object({ op: z.literal("update_device"), input: updateDeviceInputSchema }),
  z.object({ op: z.literal("remove_device"), input: removeDeviceInputSchema }),
  z.object({ op: z.literal("bind_device"), input: bindDeviceInputSchema }),
  z.object({ op: z.literal("unbind_device"), input: unbindDeviceInputSchema }),
  z.object({ op: z.literal("add_opening"), input: addOpeningInputSchema }),
  z.object({ op: z.literal("remove_opening"), input: removeOpeningInputSchema }),
]);

export const applyHomeChangesInputSchema = z.object({
  changes: z.array(homeChangeSchema).min(1).max(50),
});

export type CapabilityKind = z.infer<typeof capabilityKindSchema>;
export type Room = z.infer<typeof roomSchema>;
export type Floor = z.infer<typeof floorSchema>;
export type Device = z.infer<typeof deviceSchema>;
export type DeviceType = z.infer<typeof deviceTypeSchema>;
export type DeviceConfig = z.infer<typeof deviceConfigSchema>;
export type DeviceState = z.infer<typeof deviceStateSchema>;
export type DeviceEndpoint = z.infer<typeof deviceEndpointSchema>;
export type Binding = z.infer<typeof bindingSchema>;
export type WallSide = z.infer<typeof wallSideSchema>;
export type OpeningType = z.infer<typeof openingTypeSchema>;
export type Opening = z.infer<typeof openingSchema>;
export type Gateway = z.infer<typeof gatewaySchema>;
export type HomeDocument = z.infer<typeof homeDocumentSchema>;
export type AddRoomInput = z.input<typeof addRoomInputSchema>;
export type UpdateHomeDetailsInput = z.infer<typeof updateHomeDetailsInputSchema>;
export type UpdateFloorDetailsInput = z.infer<typeof updateFloorDetailsInputSchema>;
export type RemoveFloorInput = z.infer<typeof removeFloorInputSchema>;
export type AddDeviceInput = z.input<typeof addDeviceInputSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomInputSchema>;
export type RemoveRoomInput = z.infer<typeof removeRoomInputSchema>;
export type MoveDeviceInput = z.infer<typeof moveDeviceInputSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceInputSchema>;
export type RemoveDeviceInput = z.infer<typeof removeDeviceInputSchema>;
export type BindDeviceInput = z.infer<typeof bindDeviceInputSchema>;
export type UnbindDeviceInput = z.infer<typeof unbindDeviceInputSchema>;
export type AddOpeningInput = z.input<typeof addOpeningInputSchema>;
export type RemoveOpeningInput = z.infer<typeof removeOpeningInputSchema>;
export type SetDeviceStateInput = z.infer<typeof setDeviceStateInputSchema>;
export type HomeChange = z.input<typeof homeChangeSchema>;
export type ApplyHomeChangesInput = z.input<typeof applyHomeChangesInputSchema>;

export function normalizeDeviceConfig(
  type: DeviceType,
  rawConfig: DeviceConfig = {},
): DeviceConfig {
  switch (type) {
    case "light":
      return {
        mounting: rawConfig.mounting ?? "ceiling",
        dimmable: rawConfig.dimmable ?? true,
        colorTemperature: rawConfig.colorTemperature ?? false,
      };
    case "switch":
      return {
        mode: rawConfig.mode ?? "toggle",
        channels: rawConfig.channels ?? 1,
      };
    case "plug":
      return { energyMonitoring: rawConfig.energyMonitoring ?? false };
    case "sensor":
      return { measures: rawConfig.measures ?? ["temperature"] };
  }
}

export function capabilitiesForDevice(type: DeviceType, config: DeviceConfig): CapabilityKind[] {
  switch (type) {
    case "light":
      return [
        "power",
        ...(config.dimmable ? (["brightness"] as const) : []),
        ...(config.colorTemperature ? (["color_temperature"] as const) : []),
      ];
    case "switch":
      return ["power", ...(config.mode === "dimmer" ? (["brightness"] as const) : [])];
    case "plug":
      return ["power", ...(config.energyMonitoring ? (["energy"] as const) : [])];
    case "sensor":
      return config.measures ?? ["temperature"];
  }
}

export function endpointSupportsDevice(endpoint: DeviceEndpoint, device: Device): boolean {
  return device.capabilities.every((capability) => endpoint.capabilities.includes(capability));
}

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
    floors: [{ id: "floor_ground", name: "Ground floor", description: "", notes: "" }],
    revision: 0,
    rooms: [],
    devices: [],
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
      {
        id: "endpoint_sim_switch_1",
        gatewayId: "gateway_sim_1",
        label: "Simulator switch 01",
        protocol: "simulated",
        reachable: true,
        capabilities: ["power"],
        desiredState: { on: false },
        reportedState: { on: false },
        updatedAt: timestamp,
      },
      {
        id: "endpoint_sim_plug_1",
        gatewayId: "gateway_sim_1",
        label: "Simulator plug 01",
        protocol: "simulated",
        reachable: true,
        capabilities: ["power", "energy"],
        desiredState: { on: false },
        reportedState: { on: false, energy: 0 },
        updatedAt: timestamp,
      },
      {
        id: "endpoint_sim_sensor_1",
        gatewayId: "gateway_sim_1",
        label: "Simulator multisensor 01",
        protocol: "simulated",
        reachable: true,
        capabilities: ["temperature", "occupancy", "contact"],
        desiredState: {},
        reportedState: { temperature: 21.4, occupancy: false, contact: false },
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

export function updateHomeDetails(
  home: HomeDocument,
  rawInput: UpdateHomeDetailsInput,
): HomeDocument {
  const input = updateHomeDetailsInputSchema.parse(rawInput);
  return touch({
    ...home,
    name: input.name ?? home.name,
    description: input.description ?? home.description,
    homeType: input.homeType ?? home.homeType,
    areaM2: input.areaM2 === null ? undefined : (input.areaM2 ?? home.areaM2),
    notes: input.notes ?? home.notes,
  });
}

export function updateFloorDetails(
  home: HomeDocument,
  rawInput: UpdateFloorDetailsInput,
): HomeDocument {
  const input = updateFloorDetailsInputSchema.parse(rawInput);
  const floors = home.floors ?? [];
  const floor = floors.find(
    (candidate) => candidate.name.toLowerCase() === input.floorName.toLowerCase(),
  );
  if (!floor) throw new Error("Floor not found.");
  if (
    input.name &&
    floors.some(
      (candidate) =>
        candidate.id !== floor.id && candidate.name.toLowerCase() === input.name?.toLowerCase(),
    )
  ) {
    throw new Error("A floor with that name already exists.");
  }
  const nextName = input.name ?? floor.name;
  return touch({
    ...home,
    floors: floors.map((candidate) =>
      candidate.id === floor.id
        ? {
            ...candidate,
            name: nextName,
            description: input.description ?? candidate.description,
            areaM2: input.areaM2 === null ? undefined : (input.areaM2 ?? candidate.areaM2),
            notes: input.notes ?? candidate.notes,
          }
        : candidate,
    ),
    rooms: home.rooms.map((room) =>
      room.floor.toLowerCase() === floor.name.toLowerCase() ? { ...room, floor: nextName } : room,
    ),
  });
}

export function removeFloor(home: HomeDocument, rawInput: RemoveFloorInput): HomeDocument {
  const input = removeFloorInputSchema.parse(rawInput);
  const floor = home.floors.find(
    (candidate) => candidate.name.toLowerCase() === input.floorName.toLowerCase(),
  );
  if (!floor) throw new Error("Floor not found.");
  const roomIds = new Set(
    home.rooms
      .filter((room) => room.floor.toLowerCase() === floor.name.toLowerCase())
      .map((room) => room.id),
  );
  const deviceIds = new Set(
    home.devices.filter((device) => roomIds.has(device.roomId)).map((device) => device.id),
  );
  return touch({
    ...home,
    floors: home.floors.filter((candidate) => candidate.id !== floor.id),
    rooms: home.rooms.filter((room) => !roomIds.has(room.id)),
    devices: home.devices.filter((device) => !roomIds.has(device.roomId)),
    bindings: home.bindings.filter((binding) => !deviceIds.has(binding.deviceId)),
    openings: home.openings.filter(
      (opening) => !roomIds.has(opening.roomId) && !roomIds.has(opening.connectsToRoomId ?? ""),
    ),
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

  const floors = home.floors ?? [];
  const nextFloors = floors.some((floor) => floor.name.toLowerCase() === input.floor.toLowerCase())
    ? floors
    : [...floors, { id: id("floor"), name: input.floor, description: "", notes: "" }];

  return touch({ ...home, floors: nextFloors, rooms: [...home.rooms, room] });
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
  const devices = home.devices.map((device) => {
    if (device.roomId !== room.id) {
      return device;
    }
    const relativeX = (device.position.x - room.x) / room.width;
    const relativeY = (device.position.y - room.y) / room.height;
    return {
      ...device,
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
    devices,
  });
}

export function removeRoom(home: HomeDocument, rawInput: RemoveRoomInput): HomeDocument {
  const input = removeRoomInputSchema.parse(rawInput);
  const room = resolveRoom(home, input);
  const deviceIds = new Set(
    home.devices.filter((device) => device.roomId === room.id).map((device) => device.id),
  );
  return touch({
    ...home,
    rooms: home.rooms.filter((candidate) => candidate.id !== room.id),
    devices: home.devices.filter((device) => device.roomId !== room.id),
    bindings: home.bindings.filter((binding) => !deviceIds.has(binding.deviceId)),
    openings: home.openings.filter(
      (opening) => opening.roomId !== room.id && opening.connectsToRoomId !== room.id,
    ),
  });
}

export function addDevice(home: HomeDocument, rawInput: AddDeviceInput): HomeDocument {
  const input = addDeviceInputSchema.parse(rawInput);
  const room = input.roomId
    ? home.rooms.find((candidate) => candidate.id === input.roomId)
    : home.rooms.find(
        (candidate) => candidate.label.toLowerCase() === input.roomLabel?.toLowerCase(),
      );

  if (!room) {
    throw new Error("The requested room does not exist.");
  }
  if (home.devices.some((device) => device.label.toLowerCase() === input.label.toLowerCase())) {
    throw new Error("A device with that name already exists.");
  }

  const config = normalizeDeviceConfig(input.type, input.config);
  const device: Device = {
    id: id("device"),
    roomId: room.id,
    label: input.label,
    type: input.type,
    config,
    position: input.position ?? {
      x: room.x + room.width / 2,
      y: room.y + room.height / 2,
    },
    capabilities: capabilitiesForDevice(input.type, config),
  };

  let next = touch({ ...home, devices: [...home.devices, device] });
  if (!input.autoBind) {
    return next;
  }

  const boundEndpointIds = new Set(next.bindings.map((binding) => binding.endpointId));
  const endpoint = next.endpoints.find(
    (candidate) => !boundEndpointIds.has(candidate.id) && endpointSupportsDevice(candidate, device),
  );

  if (endpoint) {
    next = bindDevice(next, device.id, endpoint.id);
  }

  return next;
}

export function bindDevice(home: HomeDocument, deviceId: string, endpointId: string): HomeDocument {
  const device = home.devices.find((candidate) => candidate.id === deviceId);
  if (!device) {
    throw new Error("Device not found.");
  }
  const endpoint = home.endpoints.find((candidate) => candidate.id === endpointId);
  if (!endpoint) {
    throw new Error("Device endpoint not found.");
  }
  if (!endpointSupportsDevice(endpoint, device)) {
    throw new Error("The physical endpoint does not provide every capability this device needs.");
  }

  const bindings = home.bindings.filter(
    (binding) => binding.deviceId !== deviceId && binding.endpointId !== endpointId,
  );
  bindings.push({
    id: id("binding"),
    deviceId,
    endpointId,
    createdAt: now(),
  });
  return touch({ ...home, bindings });
}

export function bindDeviceToEndpoint(home: HomeDocument, rawInput: BindDeviceInput): HomeDocument {
  const input = bindDeviceInputSchema.parse(rawInput);
  const device = resolveDevice(home, input);
  const endpoint = input.endpointId
    ? home.endpoints.find((candidate) => candidate.id === input.endpointId)
    : home.endpoints.find(
        (candidate) => candidate.label.toLowerCase() === input.endpointLabel?.toLowerCase(),
      );
  if (!endpoint) {
    throw new Error("Device endpoint not found.");
  }
  if (!endpointSupportsDevice(endpoint, device)) {
    throw new Error("The physical endpoint does not provide every capability this device needs.");
  }
  return bindDevice(home, device.id, endpoint.id);
}

export function unbindDevice(home: HomeDocument, rawInput: UnbindDeviceInput): HomeDocument {
  const input = unbindDeviceInputSchema.parse(rawInput);
  const device = resolveDevice(home, input);
  return touch({
    ...home,
    bindings: home.bindings.filter((binding) => binding.deviceId !== device.id),
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

export function resolveDevice(
  home: HomeDocument,
  input: Pick<SetDeviceStateInput, "deviceId" | "deviceLabel">,
): Device {
  const device = input.deviceId
    ? home.devices.find((candidate) => candidate.id === input.deviceId)
    : home.devices.find(
        (candidate) => candidate.label.toLowerCase() === input.deviceLabel?.toLowerCase(),
      );
  if (!device) {
    throw new Error("Device not found.");
  }
  return device;
}

export function moveDevice(home: HomeDocument, rawInput: MoveDeviceInput): HomeDocument {
  const input = moveDeviceInputSchema.parse(rawInput);
  return updateDevice(home, input);
}

export function updateDevice(home: HomeDocument, rawInput: UpdateDeviceInput): HomeDocument {
  const input = updateDeviceInputSchema.parse(rawInput);
  const device = resolveDevice(home, input);
  const room =
    input.roomId || input.roomLabel
      ? resolveRoom(home, { roomId: input.roomId, roomLabel: input.roomLabel })
      : roomForDevice(home, device);
  if (!room) {
    throw new Error("Device room not found.");
  }
  if (
    input.label &&
    home.devices.some(
      (candidate) =>
        candidate.id !== device.id && candidate.label.toLowerCase() === input.label?.toLowerCase(),
    )
  ) {
    throw new Error("A device with that name already exists.");
  }
  const inset = 28;
  const movedRooms = device.roomId !== room.id;
  const position = {
    x: clamp(
      input.x ?? (movedRooms ? room.x + room.width / 2 : device.position.x),
      room.x + inset,
      room.x + room.width - inset,
    ),
    y: clamp(
      input.y ?? (movedRooms ? room.y + room.height / 2 : device.position.y),
      room.y + inset,
      room.y + room.height - inset,
    ),
  };
  const type = input.type ?? device.type;
  const config = normalizeDeviceConfig(
    type,
    input.config ?? (type === device.type ? device.config : undefined),
  );
  const capabilities = capabilitiesForDevice(type, config);
  const nextDevice: Device = {
    ...device,
    label: input.label ?? device.label,
    roomId: room.id,
    type,
    config,
    capabilities,
    position,
  };
  const binding = home.bindings.find((candidate) => candidate.deviceId === device.id);
  const endpoint = home.endpoints.find((candidate) => candidate.id === binding?.endpointId);
  const keepBinding = !endpoint || endpointSupportsDevice(endpoint, nextDevice);
  return touch({
    ...home,
    devices: home.devices.map((candidate) => (candidate.id === device.id ? nextDevice : candidate)),
    bindings: keepBinding
      ? home.bindings
      : home.bindings.filter((candidate) => candidate.deviceId !== device.id),
  });
}

export function removeDevice(home: HomeDocument, rawInput: RemoveDeviceInput): HomeDocument {
  const input = removeDeviceInputSchema.parse(rawInput);
  const device = resolveDevice(home, input);
  return touch({
    ...home,
    devices: home.devices.filter((candidate) => candidate.id !== device.id),
    bindings: home.bindings.filter((binding) => binding.deviceId !== device.id),
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
      case "add_device":
        return addDevice(current, change.input);
      case "update_device":
        return updateDevice(current, change.input);
      case "remove_device":
        return removeDevice(current, change.input);
      case "bind_device":
        return bindDeviceToEndpoint(current, change.input);
      case "unbind_device":
        return unbindDevice(current, change.input);
      case "add_opening":
        return addOpening(current, change.input);
      case "remove_opening":
        return removeOpening(current, change.input);
    }
    return current;
  }, home);
}

export function endpointForDevice(
  home: HomeDocument,
  deviceId: string,
): DeviceEndpoint | undefined {
  const binding = home.bindings.find((candidate) => candidate.deviceId === deviceId);
  return home.endpoints.find((endpoint) => endpoint.id === binding?.endpointId);
}

export function setDesiredDeviceState(
  home: HomeDocument,
  rawInput: SetDeviceStateInput,
): { home: HomeDocument; endpoint: DeviceEndpoint; requestedState: DeviceState } {
  const input = setDeviceStateInputSchema.parse(rawInput);
  const device = resolveDevice(home, input);
  if (input.on !== undefined && !device.capabilities.includes("power")) {
    throw new Error(`${device.label} does not support power control.`);
  }
  if (input.brightness !== undefined && !device.capabilities.includes("brightness")) {
    throw new Error(`${device.label} does not support brightness control.`);
  }
  const endpoint = endpointForDevice(home, device.id);
  if (!endpoint) {
    throw new Error("Device is not bound to a hardware endpoint.");
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

export function roomForDevice(home: HomeDocument, device: Device): Room | undefined {
  return home.rooms.find((room) => room.id === device.roomId);
}
