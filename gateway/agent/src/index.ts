import { GatewayCloudCredentialsStore, type Inventory } from "@portego/gateway-core";
import { type GatewayEndpoint, messageEnvelope } from "@portego/gateway-protocol";
import { createGatewayRuntime, defaultDiscoveryProviders } from "@portego/gateway-runtime";
import type { DeviceState } from "@portego/home-model";
import WebSocket from "ws";
import { type GatewayDeviceAdapter, handleCloudMessage } from "./runtime.js";

const storedCredentials = await new GatewayCloudCredentialsStore().read();
const gatewayId = process.env.PORTEGO_GATEWAY_ID ?? storedCredentials?.gatewayId;
const serverUrl = process.env.PORTEGO_SERVER_WS ?? storedCredentials?.websocketUrl;
const gatewayToken = process.env.PORTEGO_GATEWAY_TOKEN ?? storedCredentials?.gatewayToken;
if (!gatewayId || !serverUrl || !gatewayToken) {
  throw new Error("This gateway is not paired. Run `portego gateway setup` first.");
}
const pairedGatewayId = gatewayId;
const pairedServerUrl = serverUrl;
const pairedGatewayToken = gatewayToken;
const gatewayRuntime = createGatewayRuntime();

function inventoryEndpoints(inventory: Inventory): GatewayEndpoint[] {
  return inventory.devices.flatMap((device) =>
    device.endpoints.map((endpoint) => {
      const nativeId =
        typeof device.metadata.nativeId === "string" ? device.metadata.nativeId : device.id;
      const suffix = nativeId
        .replaceAll(/[^a-zA-Z0-9]/g, "")
        .slice(-6)
        .toUpperCase();
      const endpointName = endpoint.label.startsWith(device.name)
        ? endpoint.label.slice(device.name.length).trim()
        : endpoint.label;
      return {
        ...endpoint,
        deviceId: device.id,
        label: `${device.name} ${suffix} · ${endpointName || endpoint.type}`,
        protocol: device.protocol,
        reachable: device.reachable,
        updatedAt: device.updatedAt,
      };
    }),
  );
}

const adapter: GatewayDeviceAdapter = {
  async discover() {
    return inventoryEndpoints(await gatewayRuntime.inventory());
  },
  async execute(endpointId: string, state: DeviceState) {
    const inventory = await gatewayRuntime.inventory();
    const device = inventory.devices.find((item) =>
      item.endpoints.some((endpoint) => endpoint.id === endpointId),
    );
    if (!device) throw new Error("The endpoint is not in the gateway inventory.");
    await gatewayRuntime.execute(device.id, endpointId, state);
    const refreshed = await gatewayRuntime.inventory();
    const endpoint = refreshed.devices
      .find((item) => item.id === device.id)
      ?.endpoints.find((item) => item.id === endpointId);
    if (!endpoint) throw new Error("The endpoint disappeared while refreshing its state.");
    return endpoint.reportedState as DeviceState;
  },
};

async function discoverDevices(
  methods: Array<"mdns" | "ssdp" | "manual" | "ble" | "matter">,
  host?: string,
) {
  const providerIds = new Set(
    methods.flatMap((method) => {
      if (method === "ble") return ["ble-bluez"];
      if (method === "matter") return ["mdns"];
      return [method];
    }),
  );
  const runtime = createGatewayRuntime({
    providers: defaultDiscoveryProviders().filter((provider) => providerIds.has(provider.id)),
  });
  const session = await runtime.discover({
    timeoutMs: 6_000,
    ...(host ? { hosts: [host] } : {}),
    includeBle: methods.includes("ble"),
  });
  for (const candidate of session.candidates) {
    if (
      candidate.device?.endpoints.length &&
      candidate.setup?.status === "ready" &&
      candidate.setup.safeToAutomate
    ) {
      try {
        await runtime.commission(candidate.id);
      } catch (error) {
        candidate.warnings.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  const inventory = await runtime.inventory();
  return {
    candidates: session.candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.device?.name ?? candidate.displayName,
      manufacturer: candidate.device?.manufacturer,
      model: candidate.device?.model,
      protocol: candidate.device?.protocol,
      driver: candidate.matches[0]?.driverId,
      confidence: candidate.matches[0]?.confidence,
      endpointCount: candidate.device?.endpoints.length ?? 0,
      setupStatus: candidate.setup?.status ?? "unmatched",
      warnings: candidate.warnings,
    })),
    providers: session.providers.map((provider) => ({
      providerId: provider.providerId,
      status: provider.status,
      observationCount: provider.observationCount,
      message: provider.message,
    })),
    endpoints: inventoryEndpoints(inventory),
  };
}

let socket: WebSocket | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectAttempt = 0;
let shuttingDown = false;

async function connect(): Promise<void> {
  if (shuttingDown) {
    return;
  }

  socket = new WebSocket(pairedServerUrl, {
    headers: { Authorization: `Bearer ${pairedGatewayToken}` },
  });
  socket.on("open", async () => {
    reconnectAttempt = 0;
    socket?.send(
      JSON.stringify({
        ...messageEnvelope(pairedGatewayId),
        type: "gateway.hello",
        agentVersion: "0.1.0",
        endpoints: await adapter.discover(),
      }),
    );
    heartbeat = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            ...messageEnvelope(pairedGatewayId),
            type: "gateway.heartbeat",
          }),
        );
      }
    }, 10_000);
    console.log("portego.gateway.online", {
      gatewayId: pairedGatewayId,
      serverUrl: pairedServerUrl,
    });
  });

  socket.on("message", async (data) => {
    try {
      const replies = await handleCloudMessage(
        JSON.parse(data.toString()),
        pairedGatewayId,
        adapter,
        discoverDevices,
      );
      for (const reply of replies) {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(reply));
        }
      }
    } catch (error) {
      console.error("portego.gateway.command_failed", error);
    }
  });

  socket.on("close", scheduleReconnect);
  socket.on("error", (error) => {
    console.error("portego.gateway.connection_error", error.message);
  });
}

function scheduleReconnect(): void {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = undefined;
  }
  if (shuttingDown) {
    return;
  }
  const delay = Math.min(30_000, 500 * 2 ** reconnectAttempt) + Math.floor(Math.random() * 250);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(connect, delay);
  console.log("portego.gateway.reconnecting", { delay });
}

function shutdown(): void {
  shuttingDown = true;
  if (heartbeat) {
    clearInterval(heartbeat);
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  socket?.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await connect();
