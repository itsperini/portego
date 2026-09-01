import { deviceEndpointSchema, deviceStateSchema } from "@portego/home-model";
import { z } from "zod";

export const protocolVersion = "0.1";

const envelopeSchema = z.object({
  protocolVersion: z.literal(protocolVersion),
  messageId: z.string().min(1),
  gatewayId: z.string().min(1),
  sentAt: z.string().datetime(),
});

export const gatewayHelloSchema = envelopeSchema.extend({
  type: z.literal("gateway.hello"),
  agentVersion: z.string().min(1),
  endpoints: z.array(deviceEndpointSchema),
});

export const gatewayHeartbeatSchema = envelopeSchema.extend({
  type: z.literal("gateway.heartbeat"),
});

export const gatewayDiscoveryResultSchema = envelopeSchema.extend({
  type: z.literal("gateway.discovery.result"),
  correlationId: z.string().min(1),
  endpoints: z.array(deviceEndpointSchema),
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
  expiresAt: z.string().datetime(),
});

export const cloudDeviceCommandSchema = envelopeSchema.extend({
  type: z.literal("cloud.device.set_state"),
  endpointId: z.string().min(1),
  state: deviceStateSchema,
  expiresAt: z.string().datetime(),
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
]);

export type GatewayMessage = z.infer<typeof gatewayMessageSchema>;
export type CloudMessage = z.infer<typeof cloudMessageSchema>;
export type GatewayCommandResult = z.infer<typeof gatewayCommandResultSchema>;

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
