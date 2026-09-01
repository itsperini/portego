import { SimulatedAdapter } from "@portego/adapter-simulated";
import { messageEnvelope } from "@portego/gateway-protocol";
import WebSocket from "ws";
import { handleCloudMessage } from "./runtime.js";

const gatewayId = process.env.PORTEGO_GATEWAY_ID ?? "gateway_sim_1";
const serverUrl = process.env.PORTEGO_SERVER_WS ?? "ws://localhost:4000/gateway";
const adapter = new SimulatedAdapter(gatewayId);

let socket: WebSocket | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectAttempt = 0;
let shuttingDown = false;

async function connect(): Promise<void> {
  if (shuttingDown) {
    return;
  }

  socket = new WebSocket(serverUrl);
  socket.on("open", async () => {
    reconnectAttempt = 0;
    socket?.send(
      JSON.stringify({
        ...messageEnvelope(gatewayId),
        type: "gateway.hello",
        agentVersion: "0.1.0",
        endpoints: await adapter.discover(),
      }),
    );
    heartbeat = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            ...messageEnvelope(gatewayId),
            type: "gateway.heartbeat",
          }),
        );
      }
    }, 10_000);
    console.log("portego.gateway.online", { gatewayId, serverUrl });
  });

  socket.on("message", async (data) => {
    try {
      const replies = await handleCloudMessage(JSON.parse(data.toString()), gatewayId, adapter);
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
