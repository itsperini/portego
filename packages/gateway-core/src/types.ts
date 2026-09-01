import { z } from "zod";

export const discoveryTransportSchema = z.enum(["ip", "ble", "virtual"]);
export const discoveryMethodSchema = z.enum([
  "mdns",
  "ssdp",
  "ble",
  "manual",
  "network-neighbor",
  "simulated",
]);

export const discoveredAddressSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65_535).optional(),
  family: z.enum(["ipv4", "ipv6", "hostname", "ble"]).optional(),
  protocol: z.enum(["tcp", "udp"]).optional(),
});

export const discoveryObservationSchema = z.object({
  providerId: z.string().min(1),
  transport: discoveryTransportSchema,
  method: discoveryMethodSchema,
  name: z.string().min(1).optional(),
  addresses: z.array(discoveredAddressSchema).default([]),
  serviceTypes: z.array(z.string().min(1)).default([]),
  identityHints: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  observedAt: z.string().datetime(),
});

export const capabilityKindSchema = z.enum([
  "on_off",
  "brightness",
  "color",
  "color_temperature",
  "temperature",
  "humidity",
  "illuminance",
  "occupancy",
  "contact",
  "smoke",
  "flood",
  "power",
  "energy",
  "voltage",
  "current",
  "frequency",
  "power_factor",
  "battery",
  "lock",
  "position",
]);

export const normalizedEndpointSchema = z.object({
  id: z.string().min(1),
  nativeId: z.string().min(1),
  label: z.string().min(1),
  type: z.enum([
    "light",
    "switch",
    "plug",
    "cover",
    "lock",
    "sensor",
    "meter",
    "thermostat",
    "unknown",
  ]),
  capabilities: z.array(capabilityKindSchema),
  readable: z.boolean().default(true),
  controllable: z.boolean().default(false),
  reportedState: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const discoveredDeviceSchema = z.object({
  id: z.string().min(1),
  driverId: z.string().min(1),
  protocol: z.string().min(1),
  manufacturer: z.string().min(1),
  model: z.string().min(1),
  name: z.string().min(1),
  generation: z.string().optional(),
  firmware: z.string().optional(),
  reachable: z.boolean(),
  commissioned: z.boolean(),
  credentialRef: z.string().optional(),
  endpoints: z.array(normalizedEndpointSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  updatedAt: z.string().datetime(),
});

export const driverMatchSchema = z.object({
  driverId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
});

export const commissioningInputSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  valueType: z.enum(["string", "number", "boolean", "setup_code", "password", "username"]),
  secret: z.boolean().default(false),
  required: z.boolean().default(true),
});

export const commissioningStepSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["information", "input", "physical_action", "confirmation", "network"]),
  title: z.string().min(1),
  instruction: z.string().min(1),
  requiresUserPresence: z.boolean().default(false),
});

export const commissioningPlanSchema = z.object({
  driverId: z.string().min(1),
  candidateId: z.string().min(1),
  status: z.enum(["ready", "requires_input", "requires_action", "unsupported"]),
  summary: z.string().min(1),
  inputs: z.array(commissioningInputSchema).default([]),
  steps: z.array(commissioningStepSchema).default([]),
  safeToAutomate: z.boolean().default(false),
  mutatesDevice: z.boolean().default(false),
});

export const discoveryCandidateSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  transports: z.array(discoveryTransportSchema),
  addresses: z.array(discoveredAddressSchema),
  serviceTypes: z.array(z.string()),
  observations: z.array(discoveryObservationSchema),
  matches: z.array(driverMatchSchema).default([]),
  device: discoveredDeviceSchema.optional(),
  setup: commissioningPlanSchema.optional(),
  warnings: z.array(z.string()).default([]),
});

export const providerReportSchema = z.object({
  providerId: z.string().min(1),
  status: z.enum(["ok", "unavailable", "failed"]),
  observationCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  message: z.string().optional(),
});

export const discoverySessionSchema = z.object({
  id: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  candidates: z.array(discoveryCandidateSchema),
  providers: z.array(providerReportSchema),
});

export const inventorySchema = z.object({
  schemaVersion: z.literal(1),
  devices: z.array(discoveredDeviceSchema),
  updatedAt: z.string().datetime(),
});

export type DiscoveryTransport = z.infer<typeof discoveryTransportSchema>;
export type DiscoveryMethod = z.infer<typeof discoveryMethodSchema>;
export type DiscoveredAddress = z.infer<typeof discoveredAddressSchema>;
export type DiscoveryObservation = z.infer<typeof discoveryObservationSchema>;
export type CapabilityKind = z.infer<typeof capabilityKindSchema>;
export type NormalizedEndpoint = z.infer<typeof normalizedEndpointSchema>;
export type DiscoveredDevice = z.infer<typeof discoveredDeviceSchema>;
export type DriverMatch = z.infer<typeof driverMatchSchema>;
export type CommissioningInputDefinition = z.infer<typeof commissioningInputSchema>;
export type CommissioningStep = z.infer<typeof commissioningStepSchema>;
export type CommissioningPlan = z.infer<typeof commissioningPlanSchema>;
export type DiscoveryCandidate = z.infer<typeof discoveryCandidateSchema>;
export type ProviderReport = z.infer<typeof providerReportSchema>;
export type DiscoverySession = z.infer<typeof discoverySessionSchema>;
export type Inventory = z.infer<typeof inventorySchema>;

export interface DiscoveryRequest {
  timeoutMs: number;
  hosts?: string[];
  includeBle?: boolean;
  includeNeighbors?: boolean;
  signal?: AbortSignal;
}

export interface ProviderAvailability {
  available: boolean;
  message?: string;
}

export interface DiscoveryProvider {
  readonly id: string;
  availability(): Promise<ProviderAvailability>;
  discover(request: DiscoveryRequest): Promise<DiscoveryObservation[]>;
}

export interface CredentialVault {
  put(reference: string, value: Record<string, unknown>): Promise<void>;
  get(reference: string): Promise<Record<string, unknown> | undefined>;
  remove(reference: string): Promise<void>;
}

export interface DriverContext {
  fetch: typeof globalThis.fetch;
  vault: CredentialVault;
  now(): Date;
}

export interface DriverMatchResult {
  confidence: number;
  reason: string;
}

export interface CommissioningInputValues {
  [key: string]: string | number | boolean | undefined;
}

export interface CommissioningResult {
  device: DiscoveredDevice;
  message: string;
}

export interface GatewayDriver {
  readonly id: string;
  readonly displayName: string;
  availability(context: DriverContext): Promise<ProviderAvailability>;
  match(candidate: DiscoveryCandidate): Promise<DriverMatchResult | undefined>;
  inspect(candidate: DiscoveryCandidate, context: DriverContext): Promise<DiscoveredDevice>;
  plan(candidate: DiscoveryCandidate, context: DriverContext): Promise<CommissioningPlan>;
  commission(
    candidate: DiscoveryCandidate,
    input: CommissioningInputValues,
    context: DriverContext,
  ): Promise<CommissioningResult>;
  refresh(device: DiscoveredDevice, context: DriverContext): Promise<DiscoveredDevice>;
  execute(
    device: DiscoveredDevice,
    endpointId: string,
    command: Record<string, unknown>,
    context: DriverContext,
  ): Promise<Record<string, unknown>>;
  revoke(device: DiscoveredDevice, context: DriverContext): Promise<void>;
}
