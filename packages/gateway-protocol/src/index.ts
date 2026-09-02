import { normalizedEndpointSchema } from "@portego/gateway-core";
import { deviceStateSchema } from "@portego/home-model";
import { z } from "zod";

export const protocolVersion = "0.1";
const isoTimestampSchema = z.iso.datetime({ offset: true });

const envelopeSchema = z.object({
  protocolVersion: z.literal(protocolVersion),
  messageId: z.string().min(1),
  gatewayId: z.string().min(1),
  sentAt: isoTimestampSchema,
});

export const gatewayEndpointSchema = normalizedEndpointSchema.extend({
  deviceId: z.string().min(1),
  protocol: z.string().min(1),
  reachable: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const gatewayHelloSchema = envelopeSchema.extend({
  type: z.literal("gateway.hello"),
  agentVersion: z.string().min(1),
  endpoints: z.array(gatewayEndpointSchema),
});

export const gatewayHeartbeatSchema = envelopeSchema.extend({
  type: z.literal("gateway.heartbeat"),
});

export const gatewayDiscoveryResultSchema = envelopeSchema.extend({
  type: z.literal("gateway.discovery.result"),
  correlationId: z.string().min(1),
  endpoints: z.array(gatewayEndpointSchema).default([]),
  candidates: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        manufacturer: z.string().optional(),
        model: z.string().optional(),
        protocol: z.string().optional(),
        driver: z.string().optional(),
        confidence: z.number().min(0).max(1).optional(),
        endpointCount: z.number().int().nonnegative(),
        setupStatus: z.string().min(1),
        warnings: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  providers: z
    .array(
      z.object({
        providerId: z.string().min(1),
        status: z.enum(["ok", "unavailable", "failed"]),
        observationCount: z.number().int().nonnegative(),
        message: z.string().optional(),
      }),
    )
    .default([]),
});

export const gatewayCommandResultSchema = envelopeSchema.extend({
  type: z.literal("gateway.command.result"),
  correlationId: z.string().min(1),
  endpointId: z.string().min(1),
  ok: z.boolean(),
  state: deviceStateSchema.optional(),
  error: z.string().optional(),
});

export const gatewayStateEventSchema = envelopeSchema.extend({
  type: z.literal("gateway.state"),
  endpointId: z.string().min(1),
  state: deviceStateSchema,
});

export const cloudDiscoverCommandSchema = envelopeSchema.extend({
  type: z.literal("cloud.discovery.start"),
  expiresAt: isoTimestampSchema,
  methods: z.array(z.enum(["mdns", "ssdp", "manual", "ble", "matter"])).min(1),
  host: z.string().min(1).optional(),
});

export const cloudHeartbeatAckSchema = z.object({
  type: z.literal("cloud.heartbeat.ack"),
  receivedAt: isoTimestampSchema,
});

export const cloudDeviceCommandSchema = envelopeSchema.extend({
  type: z.literal("cloud.device.set_state"),
  endpointId: z.string().min(1),
  state: deviceStateSchema,
  expiresAt: isoTimestampSchema,
});

export const gatewayMessageSchema = z.discriminatedUnion("type", [
  gatewayHelloSchema,
  gatewayHeartbeatSchema,
  gatewayDiscoveryResultSchema,
  gatewayCommandResultSchema,
  gatewayStateEventSchema,
]);

export const cloudMessageSchema = z.discriminatedUnion("type", [
  cloudDiscoverCommandSchema,
  cloudDeviceCommandSchema,
  cloudHeartbeatAckSchema,
]);

export type GatewayMessage = z.infer<typeof gatewayMessageSchema>;
export type CloudMessage = z.infer<typeof cloudMessageSchema>;
export type GatewayCommandResult = z.infer<typeof gatewayCommandResultSchema>;
export type GatewayEndpoint = z.infer<typeof gatewayEndpointSchema>;

export function messageEnvelope(gatewayId: string): {
  protocolVersion: typeof protocolVersion;
  messageId: string;
  gatewayId: string;
  sentAt: string;
} {
  return {
    protocolVersion,
    messageId: globalThis.crypto.randomUUID(),
    gatewayId,
    sentAt: new Date().toISOString(),
  };
}

export function commandExpiry(milliseconds = 10_000): string {
  return new Date(Date.now() + milliseconds).toISOString();
}

export function isExpired(expiresAt: string, at = Date.now()): boolean {
  return new Date(expiresAt).getTime() <= at;
}
