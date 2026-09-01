import { isIP } from "node:net";
import Bonjour, { type Browser, type Service } from "bonjour-service";

export type ShellyDiscoverySource = "shelly-mdns" | "http-mdns" | "manual";

export interface ShellyDevice {
  id: string;
  name: string;
  model: string;
  generation: number;
  address: string;
  host: string;
  port: number;
  app?: string;
  profile?: string;
  firmware?: string;
  mac?: string;
  authEnabled?: boolean;
  source: ShellyDiscoverySource;
  discoveredAt: string;
}

export interface MdnsServiceRecord {
  name: string;
  type: string;
  host: string;
  port: number;
  fqdn?: string;
  txt?: Record<string, unknown>;
  addresses?: string[];
}

export interface ShellyDiscoveryResult {
  devices: ShellyDevice[];
  warnings: string[];
}

export interface ShellyDiscoveryOptions {
  timeoutMs?: number;
  requestTimeoutMs?: number;
  hosts?: string[];
  includeMdns?: boolean;
  discoverMdns?: (timeoutMs: number) => Promise<MdnsServiceRecord[]>;
  fetch?: FetchLike;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ShellyProbeTarget {
  address: string;
  host: string;
  port: number;
  source: ShellyDiscoverySource;
  advertisedName?: string;
  url: string;
}

const DEFAULT_DISCOVERY_TIMEOUT_MS = 6_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 2_000;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function readGeneration(record: Record<string, unknown>): number {
  const value = record.gen;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  return 1;
}

function normalizeMac(mac: string | undefined): string | undefined {
  if (!mac) {
    return undefined;
  }
  const compact = mac.replaceAll(/[^a-fA-F0-9]/g, "").toUpperCase();
  return compact.length === 12 ? compact : mac;
}

export function isLikelyShellyService(service: MdnsServiceRecord): boolean {
  if (service.type.toLowerCase() === "shelly") {
    return true;
  }

  const identity = [service.name, service.host, service.fqdn]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  return identity.includes("shelly");
}

export function normalizeShellyDevice(
  payload: unknown,
  target: ShellyProbeTarget,
): ShellyDevice | undefined {
  const info = asRecord(payload);
  if (!info) {
    return undefined;
  }

  const mac = normalizeMac(readString(info, "mac"));
  const model = readString(info, "model") ?? readString(info, "type");
  const nativeId = readString(info, "id");
  if (!model || (!nativeId && !mac)) {
    return undefined;
  }

  const app = readString(info, "app");
  const name =
    readString(info, "name") ??
    app ??
    target.advertisedName ??
    model ??
    nativeId ??
    "Shelly device";
  const generation = readGeneration(info);

  return {
    id: nativeId ?? `shelly-${mac?.toLowerCase()}`,
    name,
    model,
    generation,
    address: target.address,
    host: target.host,
    port: target.port,
    ...(app ? { app } : {}),
    ...(readString(info, "profile") ? { profile: readString(info, "profile") } : {}),
    ...(readString(info, "ver") || readString(info, "fw") || readString(info, "fw_id")
      ? {
          firmware: readString(info, "ver") ?? readString(info, "fw") ?? readString(info, "fw_id"),
        }
      : {}),
    ...(mac ? { mac } : {}),
    ...(readBoolean(info, "auth_en") !== undefined || readBoolean(info, "auth") !== undefined
      ? { authEnabled: readBoolean(info, "auth_en") ?? readBoolean(info, "auth") }
      : {}),
    source: target.source,
    discoveredAt: new Date().toISOString(),
  };
}

function serviceToTargets(service: MdnsServiceRecord): ShellyProbeTarget[] {
  if (!isLikelyShellyService(service)) {
    return [];
  }

  const source: ShellyDiscoverySource =
    service.type.toLowerCase() === "shelly" ? "shelly-mdns" : "http-mdns";
  const addresses = service.addresses?.filter((address) => isIP(address) === 4) ?? [];
  const destinations = addresses.length > 0 ? addresses : [service.host];

  return destinations.map((address) => ({
    address,
    host: service.host,
    port: service.port || 80,
    source,
    advertisedName: service.name,
    url: buildShellyUrl(address, service.port || 80),
  }));
}

function buildShellyUrl(address: string, port: number): string {
  const formatted = isIP(address) === 6 ? `[${address}]` : address;
  return `http://${formatted}:${port}/shelly`;
}

function manualHostToTarget(input: string): ShellyProbeTarget {
  const withProtocol = /^https?:\/\//i.test(input) ? input : `http://${input}`;
  const url = new URL(withProtocol);
  url.pathname = "/shelly";
  url.search = "";
  url.hash = "";
  const port = url.port ? Number.parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80;

  return {
    address: url.hostname,
    host: url.hostname,
    port,
    source: "manual",
    url: url.toString(),
  };
}

function serviceFromBonjour(service: Service): MdnsServiceRecord {
  return {
    name: service.name,
    type: service.type,
    host: service.host,
    port: service.port,
    ...(service.fqdn ? { fqdn: service.fqdn } : {}),
    ...(service.txt ? { txt: service.txt as Record<string, unknown> } : {}),
    ...(service.addresses ? { addresses: service.addresses } : {}),
  };
}

export async function discoverShellyMdnsServices(timeoutMs: number): Promise<MdnsServiceRecord[]> {
  const services = new Map<string, MdnsServiceRecord>();
  let mdnsError: Error | undefined;
  const bonjour = new Bonjour(undefined, (error: unknown) => {
    mdnsError = error instanceof Error ? error : new Error(String(error));
  });
  const browsers: Browser[] = [];

  try {
    for (const type of ["shelly", "http"]) {
      const browser = bonjour.find({ type }, (service) => {
        const record = serviceFromBonjour(service);
        if (isLikelyShellyService(record)) {
          services.set(`${record.fqdn ?? record.name}:${record.port}`, record);
        }
      });
      browsers.push(browser);
      browser.update();
    }

    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  } finally {
    for (const browser of browsers) {
      browser.stop();
    }
    bonjour.destroy();
  }

  if (mdnsError && services.size === 0) {
    throw mdnsError;
  }
  return [...services.values()];
}

async function probeTarget(
  target: ShellyProbeTarget,
  fetchImpl: FetchLike,
  requestTimeoutMs: number,
): Promise<ShellyDevice | undefined> {
  const response = await fetchImpl(target.url, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return normalizeShellyDevice(await response.json(), target);
}

export async function discoverShellyDevices(
  options: ShellyDiscoveryOptions = {},
): Promise<ShellyDiscoveryResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const warnings: string[] = [];
  const targets: ShellyProbeTarget[] = [];

  if (options.includeMdns !== false) {
    try {
      const services = await (options.discoverMdns ?? discoverShellyMdnsServices)(timeoutMs);
      targets.push(...services.flatMap(serviceToTargets));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`mDNS discovery failed: ${message}`);
    }
  }

  for (const host of options.hosts ?? []) {
    try {
      targets.push(manualHostToTarget(host));
    } catch {
      warnings.push(`Ignored invalid host: ${host}`);
    }
  }

  const uniqueTargets = [...new Map(targets.map((target) => [target.url, target])).values()];
  const devices = new Map<string, ShellyDevice>();
  await Promise.all(
    uniqueTargets.map(async (target) => {
      try {
        const device = await probeTarget(target, fetchImpl, requestTimeoutMs);
        if (device) {
          const existing = devices.get(device.id);
          if (!existing || existing.source === "http-mdns") {
            devices.set(device.id, device);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Could not verify ${target.host}: ${message}`);
      }
    }),
  );

  return {
    devices: [...devices.values()].sort((left, right) => left.name.localeCompare(right.name)),
    warnings,
  };
}
