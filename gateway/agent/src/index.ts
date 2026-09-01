import { SimulatedAdapter } from "@portego/adapter-simulated";
import { GatewayCloudCredentialsStore } from "@portego/gateway-core";
import { messageEnvelope } from "@portego/gateway-protocol";
import { createGatewayRuntime, defaultDiscoveryProviders } from "@portego/gateway-runtime";
import WebSocket from "ws";
import { handleCloudMessage } from "./runtime.js";

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
const adapter = new SimulatedAdapter(pairedGatewayId);

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
