import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import {
  addFixtureInputSchema,
  addOpeningInputSchema,
  addRoomInputSchema,
  applyHomeChangesInputSchema,
  bindFixtureInputSchema,
  removeFixtureInputSchema,
  removeOpeningInputSchema,
  removeRoomInputSchema,
  setFixtureStateInputSchema,
  unbindFixtureInputSchema,
  updateFixtureInputSchema,
  updateRoomInputSchema,
} from "@portego/home-model";
import { WebSocketServer } from "ws";
import { GatewayBroker } from "./gateway-broker.js";
import { createPortegoMcpServer } from "./mcp.js";
import { PortegoService } from "./service.js";

const port = Number.parseInt(process.env.PORT ?? "4000", 10);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3100";
const service = new PortegoService();
const broker = new GatewayBroker(service);
const mcpHandler = toNodeHandler(createMcpHandler(() => createPortegoMcpServer(service)));

function applyCors(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", webOrigin);
  response.setHeader("Access-Control-Allow-Headers", "content-type, mcp-protocol-version");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.setHeader("Vary", "Origin");
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  applyCors(response);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 1_000_000) {
      throw new Error("Request body is too large.");
    }
  }
  return body.length > 0 ? JSON.parse(body) : {};
}

const httpServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "OPTIONS") {
    applyCors(response);
    response.writeHead(204);
    response.end();
    return;
  }

  if (url.pathname === "/mcp") {
    await mcpHandler(request, response);
    return;
  }

  try {
    if (request.method === "GET" && url.pathname === "/healthz") {
      sendJson(response, 200, {
        ok: true,
        gateway: service.snapshot().gateway.status,
        version: "0.1.0",
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/home") {
      sendJson(response, 200, service.snapshot());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/history") {
      sendJson(response, 200, service.historyStatus());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      sendJson(
        response,
        201,
        service.createRoom(addRoomInputSchema.parse(await readJson(request))),
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/fixtures") {
      sendJson(
        response,
        201,
        service.createFixture(addFixtureInputSchema.parse(await readJson(request))),
      );
      return;
    }

    const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
    if (request.method === "PATCH" && roomMatch?.[1]) {
      const body = await readJson(request);
      sendJson(
        response,
        200,
        service.updateRoom(
          updateRoomInputSchema.parse({
            ...(typeof body === "object" && body !== null ? body : {}),
            roomId: decodeURIComponent(roomMatch[1]),
          }),
        ),
      );
      return;
    }
    if (request.method === "DELETE" && roomMatch?.[1]) {
      sendJson(
        response,
        200,
        service.removeRoom(
          removeRoomInputSchema.parse({ roomId: decodeURIComponent(roomMatch[1]) }),
        ),
      );
      return;
    }

    const fixtureMatch = url.pathname.match(/^\/api\/fixtures\/([^/]+)$/);
    if (request.method === "PATCH" && fixtureMatch?.[1]) {
      const body = await readJson(request);
      sendJson(
        response,
        200,
        service.updateFixture(
          updateFixtureInputSchema.parse({
            ...(typeof body === "object" && body !== null ? body : {}),
            fixtureId: decodeURIComponent(fixtureMatch[1]),
          }),
        ),
      );
      return;
    }
    if (request.method === "DELETE" && fixtureMatch?.[1]) {
      sendJson(
        response,
        200,
        service.removeFixture(
          removeFixtureInputSchema.parse({ fixtureId: decodeURIComponent(fixtureMatch[1]) }),
        ),
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/bindings") {
      sendJson(
        response,
        200,
        service.bindFixture(bindFixtureInputSchema.parse(await readJson(request))),
      );
      return;
    }

    const bindingMatch = url.pathname.match(/^\/api\/bindings\/([^/]+)$/);
    if (request.method === "DELETE" && bindingMatch?.[1]) {
      sendJson(
        response,
        200,
        service.unbindFixture(
          unbindFixtureInputSchema.parse({ fixtureId: decodeURIComponent(bindingMatch[1]) }),
        ),
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/openings") {
      sendJson(
        response,
        201,
        service.createOpening(addOpeningInputSchema.parse(await readJson(request))),
      );
      return;
    }

    const openingMatch = url.pathname.match(/^\/api\/openings\/([^/]+)$/);
    if (request.method === "DELETE" && openingMatch?.[1]) {
      sendJson(
        response,
        200,
        service.removeOpening(
          removeOpeningInputSchema.parse({ openingId: decodeURIComponent(openingMatch[1]) }),
        ),
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/changes") {
      sendJson(
        response,
        200,
        service.applyChanges(applyHomeChangesInputSchema.parse(await readJson(request))),
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/history/undo") {
      sendJson(response, 200, service.undo());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/history/redo") {
      sendJson(response, 200, service.redo());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/discovery") {
      await broker.discover();
      sendJson(response, 202, service.snapshot());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/devices/state") {
      const result = await service.setFixtureState(
        setFixtureStateInputSchema.parse(await readJson(request)),
      );
      sendJson(response, 200, result.home);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/reset") {
      sendJson(response, 200, service.reset());
      return;
    }

    sendJson(response, 404, { error: "Route not found." });
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : "Request failed.",
    });
  }
});

const webSocketServer = new WebSocketServer({ noServer: true });
httpServer.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== "/gateway") {
    socket.destroy();
    return;
  }
  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    webSocketServer.emit("connection", webSocket, request);
  });
});
webSocketServer.on("connection", (socket) => broker.attach(socket));

httpServer.listen(port, "0.0.0.0", () => {
  console.log("portego.server.ready", {
    http: `http://localhost:${port}`,
    mcp: `http://localhost:${port}/mcp`,
    gateway: `ws://localhost:${port}/gateway`,
  });
});

function shutdown(): void {
  webSocketServer.close();
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
