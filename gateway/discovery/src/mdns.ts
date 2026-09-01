import type {
  DiscoveryObservation,
  DiscoveryProvider,
  DiscoveryRequest,
} from "@portego/gateway-core";
import Bonjour, { type Browser, type Service } from "bonjour-service";

interface BrowseType {
  type: string;
  protocol?: "tcp" | "udp";
}

const DEFAULT_SERVICE_TYPES: BrowseType[] = [
  { type: "shelly" },
  { type: "http" },
  { type: "esphomelib" },
  { type: "googlecast" },
  { type: "hap" },
  { type: "matterc", protocol: "udp" },
  { type: "matter", protocol: "tcp" },
];

function cleanTxt(txt: unknown): Record<string, unknown> {
  if (!txt || typeof txt !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(txt as Record<string, unknown>).map(([key, value]) => [
      key,
      Buffer.isBuffer(value) ? value.toString("utf8") : value,
    ]),
  );
}

function observationFromService(service: Service): DiscoveryObservation {
  const protocol = service.protocol ?? "tcp";
  const serviceType = `_${service.type}._${protocol}`;
  const addresses = (service.addresses?.length ? service.addresses : [service.host])
    .filter(Boolean)
    .map((host) => ({
      host,
      port: service.port,
      family: host.includes(":")
        ? ("ipv6" as const)
        : /^\d+\.\d+\.\d+\.\d+$/.test(host)
          ? ("ipv4" as const)
          : ("hostname" as const),
      protocol,
    }));

  return {
    providerId: "mdns",
    transport: "ip",
    method: "mdns",
    name: service.name,
    addresses,
    serviceTypes: [serviceType],
    identityHints: [
      `mdns:${service.fqdn.toLowerCase()}`,
      `host:${service.host.toLowerCase()}`,
      ...addresses.map((address) => `address:${address.host.toLowerCase()}`),
    ],
    metadata: {
      fqdn: service.fqdn,
      host: service.host,
      port: service.port,
      txt: cleanTxt(service.txt),
    },
    observedAt: new Date().toISOString(),
  };
}

export class MdnsDiscoveryProvider implements DiscoveryProvider {
  readonly id = "mdns";
  readonly #serviceTypes: BrowseType[];

  constructor(serviceTypes = DEFAULT_SERVICE_TYPES) {
    this.#serviceTypes = serviceTypes;
  }

  async availability() {
    return { available: true, message: "Multicast DNS is available through the local IP stack." };
  }

  async discover(request: DiscoveryRequest): Promise<DiscoveryObservation[]> {
    const observations = new Map<string, DiscoveryObservation>();
    let mdnsError: Error | undefined;
    const bonjour = new Bonjour(undefined, (error: unknown) => {
      mdnsError = error instanceof Error ? error : new Error(String(error));
    });
    const browsers: Browser[] = [];
    const capture = (service: Service) => {
      const observation = observationFromService(service);
      observations.set(`${service.fqdn}:${service.port}`, observation);
    };

    try {
      for (const serviceType of this.#serviceTypes) {
        const browser = bonjour.find(serviceType, capture);
        browsers.push(browser);
        browser.update();
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, request.timeoutMs);
        request.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    } finally {
      for (const browser of browsers) {
        browser.stop();
      }
      bonjour.destroy();
    }

    if (mdnsError && observations.size === 0) {
      throw mdnsError;
    }
    return [...observations.values()];
  }
}
