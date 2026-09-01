import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function normalizeHost(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

function isLocalIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return false;
  const [first = -1, second = -1] = octets;
  if (first === 10 || (first === 192 && second === 168)) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  return false;
}

function isLocalIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  if (normalized.startsWith("::ffff:")) {
    return isLocalIpv4(normalized.slice("::ffff:".length));
  }
  const firstGroup = normalized.split(":")[0] ?? "";
  const first = Number.parseInt(firstGroup, 16);
  if (!Number.isFinite(first)) return false;
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

export function isLocalNetworkAddress(address: string): boolean {
  const normalized = normalizeHost(address);
  const family = isIP(normalized);
  if (family === 4) return isLocalIpv4(normalized);
  if (family === 6) return isLocalIpv6(normalized);
  return false;
}

export function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (!normalized || normalized === "localhost") return false;
  return normalized.endsWith(".local") || !normalized.includes(".");
}

export function assertLocalNetworkTargetSyntax(host: string): void {
  const normalized = normalizeHost(host);
  if (isIP(normalized)) {
    if (!isLocalNetworkAddress(normalized)) {
      throw new Error("Portego only connects to private or link-local device addresses.");
    }
    return;
  }
  if (!isLocalHostname(normalized)) {
    throw new Error("Portego only accepts .local or single-label local device hostnames.");
  }
}

export async function assertLocalNetworkTarget(host: string): Promise<void> {
  const normalized = normalizeHost(host);
  assertLocalNetworkTargetSyntax(normalized);
  if (isIP(normalized)) return;
  const resolved = await lookup(normalized, { all: true, verbatim: true });
  if (resolved.length === 0 || resolved.some((entry) => !isLocalNetworkAddress(entry.address))) {
    throw new Error("The device hostname did not resolve exclusively to local-network addresses.");
  }
}
