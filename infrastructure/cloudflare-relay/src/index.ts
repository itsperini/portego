interface Env {
  GATEWAY_RELAY: DurableObjectNamespace;
  PORTEGO_API_CALLBACK_URL: string;
  PORTEGO_GATEWAY_JWT_SECRET: string;
  PORTEGO_RELAY_SHARED_SECRET: string;
}

type GatewayClaims = { sub: string; aud: string; exp: number };
type ConnectionAttachment = { gatewayId: string };
type PendingCommand = {
  resolve: (response: Response) => void;
  timer: ReturnType<typeof setTimeout>;
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function base64UrlBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function validateGatewayToken(
  authorization: string | null,
  expectedGatewayId: string,
  secret: string,
): Promise<boolean> {
  if (!authorization?.startsWith("Bearer ")) return false;
  const token = authorization.slice(7);
  const [encodedHeader, encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra) return false;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlBytes(encodedHeader))) as {
      alg?: string;
    };
    const claims = JSON.parse(
      new TextDecoder().decode(base64UrlBytes(encodedPayload)),
    ) as GatewayClaims;
    if (
      header.alg !== "HS256" ||
      claims.sub !== expectedGatewayId ||
      claims.aud !== "portego-gateway" ||
      claims.exp * 1000 <= Date.now()
    ) {
      return false;
    }
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlBytes(encodedSignature).buffer as ArrayBuffer,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`).buffer as ArrayBuffer,
    );
  } catch {
    return false;
  }
}

function bearerMatches(request: Request, expected: string): boolean {
  return request.headers.get("Authorization") === `Bearer ${expected}`;
}

export class GatewayRelay implements DurableObject {
  readonly #state: DurableObjectState;
  readonly #env: Env;
  readonly #pending = new Map<string, PendingCommand>();

  constructor(state: DurableObjectState, env: Env) {
    this.#state = state;
    this.#env = env;
  }

  async #reportStatus(gatewayId: string, status: "online" | "offline"): Promise<void> {
    await fetch(
      `${this.#env.PORTEGO_API_CALLBACK_URL.replace(/\/$/, "")}/internal/cloudflare/gateways/${encodeURIComponent(gatewayId)}/status`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#env.PORTEGO_RELAY_SHARED_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      },
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/connect")) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return jsonResponse({ error: "WebSocket upgrade required" }, 426);
      }
      const gatewayId = request.headers.get("X-Portego-Gateway-Id");
      if (!gatewayId) return jsonResponse({ error: "Gateway identity required" }, 400);
      for (const existing of this.#state.getWebSockets("gateway")) {
        existing.close(4001, "Gateway reconnected");
      }
      const pair = new WebSocketPair();
      const [client, relay] = Object.values(pair);
      relay.serializeAttachment({ gatewayId } satisfies ConnectionAttachment);
      this.#state.acceptWebSocket(relay, ["gateway"]);
      this.#state.waitUntil(this.#reportStatus(gatewayId, "online"));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith("/command")) {
      const socket = this.#state.getWebSockets("gateway")[0];
      if (!socket) return jsonResponse({ error: "The gateway is offline." }, 409);
      const message = (await request.json()) as { messageId?: unknown };
      if (typeof message.messageId !== "string") {
        return jsonResponse({ error: "A command messageId is required." }, 400);
      }
      return new Promise<Response>((resolve) => {
        const messageId = message.messageId as string;
        const timer = setTimeout(() => {
          this.#pending.delete(messageId);
          resolve(jsonResponse({ error: "The gateway command timed out." }, 504));
        }, 32_000);
        this.#pending.set(messageId, { resolve, timer });
        socket.send(JSON.stringify(message));
      });
    }
    return jsonResponse({ error: "Not found" }, 404);
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    try {
      const message = JSON.parse(raw) as { type?: string; correlationId?: string };
      if (message.type === "gateway.heartbeat") {
        socket.send(
          JSON.stringify({ type: "cloud.heartbeat.ack", receivedAt: new Date().toISOString() }),
        );
      }
      if (message.correlationId) {
        const pending = this.#pending.get(message.correlationId);
        if (pending) {
          clearTimeout(pending.timer);
          this.#pending.delete(message.correlationId);
          pending.resolve(jsonResponse(message));
        }
      }
    } catch {
      socket.close(4400, "Invalid gateway message");
    }
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    const attachment = socket.deserializeAttachment() as ConnectionAttachment | null;
    socket.close(code, reason);
    if (attachment?.gatewayId && this.#state.getWebSockets("gateway").length === 0) {
      this.#state.waitUntil(this.#reportStatus(attachment.gatewayId, "offline"));
    }
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return jsonResponse({ ok: true, service: "portego-cloudflare-relay" });
    }
    const connect = url.pathname.match(/^\/gateway\/([^/]+)\/connect$/);
    if (connect) {
      const gatewayId = decodeURIComponent(connect[1]);
      if (
        !(await validateGatewayToken(
          request.headers.get("Authorization"),
          gatewayId,
          env.PORTEGO_GATEWAY_JWT_SECRET,
        ))
      ) {
        return jsonResponse({ error: "Invalid gateway credential" }, 401);
      }
      const forwarded = new Request(request);
      forwarded.headers.set("X-Portego-Gateway-Id", gatewayId);
      return env.GATEWAY_RELAY.getByName(gatewayId).fetch(forwarded);
    }
    const command = url.pathname.match(/^\/internal\/gateways\/([^/]+)\/command$/);
    if (command) {
      if (!bearerMatches(request, env.PORTEGO_RELAY_SHARED_SECRET)) {
        return jsonResponse({ error: "Relay credential required" }, 401);
      }
      const gatewayId = decodeURIComponent(command[1]);
      return env.GATEWAY_RELAY.getByName(gatewayId).fetch(request);
    }
    return jsonResponse({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

export default worker;
