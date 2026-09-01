import { isIP } from "node:net";
import type {
  DiscoveryObservation,
  DiscoveryProvider,
  DiscoveryRequest,
} from "@portego/gateway-core";
import { assertLocalNetworkTargetSyntax } from "@portego/gateway-core";

export class ManualDiscoveryProvider implements DiscoveryProvider {
  readonly id = "manual";

  async availability() {
    return {
      available: true,
      message: "Known local hostnames and addresses can be inspected directly.",
    };
  }

  async discover(request: DiscoveryRequest): Promise<DiscoveryObservation[]> {
    return (request.hosts ?? []).map((input) => {
      const withProtocol = /^https?:\/\//i.test(input) ? input : `http://${input}`;
      const url = new URL(withProtocol);
      if (url.username || url.password) {
        throw new Error("Credentials are not allowed in a discovery URL.");
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Only HTTP and HTTPS local device URLs are supported.");
      }
      const hostname = url.hostname.replace(/^\[|\]$/g, "");
      assertLocalNetworkTargetSyntax(hostname);
      const port = url.port ? Number.parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80;
      const family = isIP(hostname) === 4 ? "ipv4" : isIP(hostname) === 6 ? "ipv6" : "hostname";
      return {
        providerId: this.id,
        transport: "ip",
        method: "manual",
        name: input,
        addresses: [{ host: hostname, port, family, protocol: "tcp" }],
        serviceTypes: [],
        identityHints: [`host:${hostname.toLowerCase()}`],
        metadata: { url: url.origin },
        observedAt: new Date().toISOString(),
      } satisfies DiscoveryObservation;
    });
  }
}
