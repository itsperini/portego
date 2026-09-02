import {
  type CloudMessage,
  cloudMessageSchema,
  type GatewayEndpoint,
  isExpired,
  messageEnvelope,
} from "@portego/gateway-protocol";
import type { DeviceState } from "@portego/home-model";

export interface GatewayDeviceAdapter {
  discover(): Promise<GatewayEndpoint[]>;
  execute(endpointId: string, state: DeviceState): Promise<DeviceState>;
}

export async function handleCloudMessage(
  rawMessage: unknown,
  gatewayId: string,
  adapter: GatewayDeviceAdapter,
  discover?: (
    methods: Array<"mdns" | "ssdp" | "manual" | "ble" | "matter">,
    host?: string,
  ) => Promise<{ candidates: unknown[]; providers: unknown[] }>,
): Promise<unknown[]> {
  const message = cloudMessageSchema.parse(rawMessage);

  if (message.type === "cloud.heartbeat.ack") return [];

  if (message.type === "cloud.discovery.start") {
    if (isExpired(message.expiresAt)) {
      return [];
    }
    const result = discover
      ? await discover(message.methods, message.host)
      : { candidates: [], providers: [], endpoints: await adapter.discover() };
    return [
      {
        ...messageEnvelope(gatewayId),
        type: "gateway.discovery.result",
        correlationId: message.messageId,
        endpoints: [],
        ...result,
      },
    ];
  }

  return await executeDeviceCommand(message, gatewayId, adapter);
}

async function executeDeviceCommand(
  message: Extract<CloudMessage, { type: "cloud.device.set_state" }>,
  gatewayId: string,
  adapter: GatewayDeviceAdapter,
): Promise<unknown[]> {
  if (isExpired(message.expiresAt)) {
    return [
      {
        ...messageEnvelope(gatewayId),
        type: "gateway.command.result",
        correlationId: message.messageId,
        endpointId: message.endpointId,
        ok: false,
        error: "The command expired before it reached the gateway.",
      },
    ];
  }

  try {
    const state = await adapter.execute(message.endpointId, message.state);
    return [
      {
        ...messageEnvelope(gatewayId),
        type: "gateway.command.result",
        correlationId: message.messageId,
        endpointId: message.endpointId,
        ok: true,
        state,
      },
      {
        ...messageEnvelope(gatewayId),
        type: "gateway.state",
        endpointId: message.endpointId,
        state,
      },
    ];
  } catch (error) {
    return [
      {
        ...messageEnvelope(gatewayId),
        type: "gateway.command.result",
        correlationId: message.messageId,
        endpointId: message.endpointId,
        ok: false,
        error: error instanceof Error ? error.message : "The adapter failed.",
      },
    ];
  }
}
