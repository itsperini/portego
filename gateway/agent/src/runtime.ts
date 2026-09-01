import type { DeviceAdapter } from "@portego/adapter-simulated";
import {
  type CloudMessage,
  cloudMessageSchema,
  isExpired,
  messageEnvelope,
} from "@portego/gateway-protocol";

export async function handleCloudMessage(
  rawMessage: unknown,
  gatewayId: string,
  adapter: DeviceAdapter,
): Promise<unknown[]> {
  const message = cloudMessageSchema.parse(rawMessage);

  if (message.type === "cloud.discovery.start") {
    if (isExpired(message.expiresAt)) {
      return [];
    }
    return [
      {
        ...messageEnvelope(gatewayId),
        type: "gateway.discovery.result",
        correlationId: message.messageId,
        endpoints: await adapter.discover(),
      },
    ];
  }

  return await executeDeviceCommand(message, gatewayId, adapter);
}

async function executeDeviceCommand(
  message: Extract<CloudMessage, { type: "cloud.device.set_state" }>,
  gatewayId: string,
  adapter: DeviceAdapter,
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
