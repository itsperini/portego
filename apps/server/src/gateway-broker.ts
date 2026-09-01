import {
  cloudDeviceCommandSchema,
  cloudDiscoverCommandSchema,
  commandExpiry,
  gatewayMessageSchema,
  messageEnvelope,
} from "@portego/gateway-protocol";
import { type DeviceState, deviceEndpointSchema, deviceStateSchema } from "@portego/home-model";
import type WebSocket from "ws";
import type { PortegoService } from "./service.js";

type PendingCommand = {
  resolve: (state: DeviceState) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export class GatewayBroker {
  readonly #service: PortegoService;
  readonly #gatewayId = "gateway_sim_1";
  readonly #pending = new Map<string, PendingCommand>();
  #socket?: WebSocket;

  constructor(service: PortegoService) {
    this.#service = service;
  }

  attach(socket: WebSocket): void {
    this.#socket = socket;
    this.#service.setCommandExecutor((endpointId, state) => this.execute(endpointId, state));

    socket.on("message", (data) => {
      try {
        const message = gatewayMessageSchema.parse(JSON.parse(data.toString()));
        this.#handleMessage(message);
      } catch (error) {
        console.error("gateway.message.invalid", error);
      }
    });

    socket.on("close", () => {
      if (this.#socket === socket) {
        this.#socket = undefined;
        this.#service.clearCommandExecutor();
        this.#service.updateGateway("offline");
      }
      for (const pending of this.#pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("The gateway disconnected before acknowledging the command."));
      }
      this.#pending.clear();
    });
  }

  async discover(): Promise<void> {
    const socket = this.#requireSocket();
    const message = cloudDiscoverCommandSchema.parse({
      ...messageEnvelope(this.#gatewayId),
      type: "cloud.discovery.start",
      expiresAt: commandExpiry(),
    });
    socket.send(JSON.stringify(message));
  }

  async execute(endpointId: string, state: DeviceState): Promise<DeviceState> {
    const socket = this.#requireSocket();
    const message = cloudDeviceCommandSchema.parse({
      ...messageEnvelope(this.#gatewayId),
      type: "cloud.device.set_state",
      endpointId,
      state: deviceStateSchema.parse(state),
      expiresAt: commandExpiry(),
    });

    return await new Promise<DeviceState>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(message.messageId);
        reject(new Error("The gateway did not acknowledge the command in time."));
      }, 4_000);
      this.#pending.set(message.messageId, { resolve, reject, timeout });
      socket.send(JSON.stringify(message));
    });
  }

  #requireSocket(): WebSocket {
    if (!this.#socket || this.#socket.readyState !== this.#socket.OPEN) {
      throw new Error("The home gateway is offline.");
    }
    return this.#socket;
  }

  #handleMessage(message: ReturnType<typeof gatewayMessageSchema.parse>): void {
    if (message.type === "gateway.hello") {
      this.#service.updateEndpoints(
        message.endpoints.map((item) => deviceEndpointSchema.parse(item)),
      );
      this.#service.updateGateway("online");
      return;
    }

    if (message.type === "gateway.heartbeat") {
      this.#service.updateGateway("online");
      return;
    }

    if (message.type === "gateway.discovery.result") {
      this.#service.updateEndpoints(
        message.endpoints.map((item) => deviceEndpointSchema.parse(item)),
      );
      return;
    }

    if (message.type === "gateway.state") {
      this.#service.applyState(message.endpointId, message.state);
      return;
    }

    if (message.type === "gateway.command.result") {
      const pending = this.#pending.get(message.correlationId);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timeout);
      this.#pending.delete(message.correlationId);
      if (message.ok && message.state) {
        pending.resolve(message.state);
      } else {
        pending.reject(new Error(message.error ?? "The gateway rejected the command."));
      }
    }
  }
}
