import { createSocket, type RemoteInfo } from "node:dgram";
import type {
  DiscoveryObservation,
  DiscoveryProvider,
  DiscoveryRequest,
} from "@portego/gateway-core";

const SSDP_ADDRESS = "239.255.255.250";
const SSDP_PORT = 1900;
const SEARCH_REQUEST = Buffer.from(
  [
    "M-SEARCH * HTTP/1.1",
    `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}`,
    'MAN: "ssdp:discover"',
    "MX: 2",
    "ST: ssdp:all",
    "",
    "",
  ].join("\r\n"),
);

export interface SsdpResponse {
  headers: Record<string, string>;
  address: string;
}

export function parseSsdpResponse(message: Buffer, remote: RemoteInfo): SsdpResponse | undefined {
  const text = message.toString("utf8");
  if (!/^HTTP\/1\.1 200 OK/i.test(text)) {
    return undefined;
  }
  const headers: Record<string, string> = {};
  for (const line of text.split(/\r?\n/).slice(1)) {
    const separator = line.indexOf(":");
    if (separator > 0) {
      headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
    }
  }
  return { headers, address: remote.address };
}

function observationFromResponse(response: SsdpResponse): DiscoveryObservation {
  const location = response.headers.location;
  let port: number | undefined;
  let host = response.address;
  if (location) {
    try {
      const url = new URL(location);
      host = url.hostname;
      port = url.port ? Number.parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80;
    } catch {
      // The sender address remains a usable observation when LOCATION is malformed.
    }
  }
  const usn = response.headers.usn;
  return {
    providerId: "ssdp",
    transport: "ip",
    method: "ssdp",
    ...(response.headers.server ? { name: response.headers.server } : {}),
    addresses: [
      {
        host,
        ...(port ? { port } : {}),
        family: host.includes(":") ? "ipv6" : "ipv4",
        protocol: "tcp",
      },
    ],
    serviceTypes: [response.headers.st ?? response.headers.nt ?? "ssdp:unknown"],
    identityHints: [...(usn ? [`ssdp:${usn.toLowerCase()}`] : []), `address:${host.toLowerCase()}`],
    metadata: {
      ...(location ? { location } : {}),
      ...(usn ? { usn } : {}),
      ...(response.headers.server ? { server: response.headers.server } : {}),
      ...(response.headers.st ? { searchTarget: response.headers.st } : {}),
    },
    observedAt: new Date().toISOString(),
  };
}

export class SsdpDiscoveryProvider implements DiscoveryProvider {
  readonly id = "ssdp";

  async availability() {
    return { available: true, message: "SSDP is available through the local UDP stack." };
  }

  async discover(request: DiscoveryRequest): Promise<DiscoveryObservation[]> {
    const socket = createSocket({ type: "udp4", reuseAddr: true });
    const responses = new Map<string, SsdpResponse>();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        socket.close(() => resolve());
      };
      const timer = setTimeout(finish, request.timeoutMs);
      socket.on("message", (message, remote) => {
        const response = parseSsdpResponse(message, remote);
        if (response) {
          const key = response.headers.usn ?? response.headers.location ?? remote.address;
          responses.set(key, response);
        }
      });
      socket.once("error", (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          socket.close();
          reject(error);
        }
      });
      request.signal?.addEventListener("abort", finish, { once: true });
      socket.bind(0, () => {
        socket.setMulticastTTL(2);
        socket.send(SEARCH_REQUEST, SSDP_PORT, SSDP_ADDRESS);
        const secondSend = setTimeout(
          () => socket.send(SEARCH_REQUEST, SSDP_PORT, SSDP_ADDRESS),
          Math.min(1_000, Math.max(100, request.timeoutMs / 2)),
        );
        secondSend.unref();
      });
    });

    return [...responses.values()].map(observationFromResponse);
  }
}
