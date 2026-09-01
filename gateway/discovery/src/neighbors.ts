import type {
  DiscoveryObservation,
  DiscoveryProvider,
  DiscoveryRequest,
} from "@portego/gateway-core";
import { runProcess } from "./process.js";

interface Neighbor {
  address: string;
  hardwareAddress?: string;
}

export function parseLinuxNeighbors(output: string): Neighbor[] {
  return output
    .split(/\r?\n/)
    .map((line) => {
      const [address] = line.trim().split(/\s+/);
      const hardwareAddress = /\blladdr\s+([0-9a-f:]{17})\b/i.exec(line)?.[1];
      return address ? { address, ...(hardwareAddress ? { hardwareAddress } : {}) } : undefined;
    })
    .filter((neighbor): neighbor is Neighbor => Boolean(neighbor));
}

export function parseMacNeighbors(output: string): Neighbor[] {
  return output
    .split(/\r?\n/)
    .map((line) => {
      const address = /\(([^)]+)\)/.exec(line)?.[1];
      const hardwareAddress = /\bat\s+([0-9a-f:]+)\s+/i.exec(line)?.[1];
      return address ? { address, ...(hardwareAddress ? { hardwareAddress } : {}) } : undefined;
    })
    .filter((neighbor): neighbor is Neighbor => Boolean(neighbor));
}

export class NetworkNeighborDiscoveryProvider implements DiscoveryProvider {
  readonly id = "network-neighbors";

  async availability() {
    if (process.platform === "linux" || process.platform === "darwin") {
      return {
        available: true,
        message:
          "Local neighbor-table hints are available but disabled unless explicitly requested.",
      };
    }
    return { available: false, message: "Neighbor-table discovery is not implemented on this OS." };
  }

  async discover(request: DiscoveryRequest): Promise<DiscoveryObservation[]> {
    if (!request.includeNeighbors) {
      return [];
    }
    const result =
      process.platform === "linux"
        ? await runProcess("ip", ["neigh", "show"], 3_000)
        : await runProcess("arp", ["-an"], 3_000);
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || "Could not read the local neighbor table.");
    }
    const neighbors =
      process.platform === "linux"
        ? parseLinuxNeighbors(result.stdout)
        : parseMacNeighbors(result.stdout);
    return neighbors.map((neighbor) => ({
      providerId: this.id,
      transport: "ip",
      method: "network-neighbor",
      addresses: [
        {
          host: neighbor.address,
          family: neighbor.address.includes(":") ? "ipv6" : "ipv4",
        },
      ],
      serviceTypes: [],
      identityHints: [
        ...(neighbor.hardwareAddress ? [`neighbor:${neighbor.hardwareAddress.toLowerCase()}`] : []),
        `address:${neighbor.address.toLowerCase()}`,
      ],
      metadata: {
        ...(neighbor.hardwareAddress ? { hardwareAddress: neighbor.hardwareAddress } : {}),
      },
      observedAt: new Date().toISOString(),
    }));
  }
}
