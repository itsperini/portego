import { createHash, randomBytes } from "node:crypto";
import type {
  CapabilityKind,
  CommissioningInputValues,
  CommissioningPlan,
  DiscoveredDevice,
  DiscoveryCandidate,
  DriverContext,
  DriverMatchResult,
  GatewayDriver,
  NormalizedEndpoint,
} from "@portego/gateway-core";
import { assertLocalNetworkTarget } from "@portego/gateway-core";

export interface ShellyIdentity {
  nativeId: string;
  name: string;
  model: string;
  generation: number;
  app?: string;
  profile?: string;
  firmware?: string;
  mac?: string;
  authEnabled?: boolean;
}

export interface ShellyTarget {
  address: string;
  host: string;
  port: number;
  protocol: "http" | "https";
  advertisedName?: string;
}

interface ShellyCredentials {
  username: string;
  password: string;
}

interface ShellyComponent {
  key: string;
  config?: Record<string, unknown>;
  status?: Record<string, unknown>;
}

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop: string;
  algorithm: string;
  opaque?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function normalizeMac(mac: string | undefined): string | undefined {
  if (!mac) return undefined;
  const compact = mac.replaceAll(/[^a-fA-F0-9]/g, "").toUpperCase();
  return compact.length === 12 ? compact : mac;
}

function opaqueId(prefix: string, nativeId: string): string {
  return `${prefix}_${createHash("sha256").update(nativeId).digest("hex").slice(0, 16)}`;
}

export function isLikelyShellyCandidate(candidate: DiscoveryCandidate): boolean {
  if (candidate.serviceTypes.some((service) => service.toLowerCase() === "_shelly._tcp")) {
    return true;
  }
  return [
    candidate.displayName,
    ...candidate.addresses.map((address) => address.host),
    ...candidate.observations.flatMap((observation) => [
      String(observation.metadata.host ?? ""),
      String(observation.metadata.fqdn ?? ""),
    ]),
  ]
    .join(" ")
    .toLowerCase()
    .includes("shelly");
}

export function targetFromCandidate(candidate: DiscoveryCandidate): ShellyTarget {
  const address =
    candidate.addresses.find((item) => item.family === "ipv4") ?? candidate.addresses[0];
  if (!address) throw new Error("The candidate has no reachable IP address.");
  const manualOrigin = candidate.observations.find((observation) => observation.method === "manual")
    ?.metadata.url;
  const protocol =
    typeof manualOrigin === "string" && manualOrigin.startsWith("https:") ? "https" : "http";
  return {
    address: address.host,
    host: address.host,
    port: address.port ?? (protocol === "https" ? 443 : 80),
    protocol,
    advertisedName: candidate.displayName,
  };
}

function targetBaseUrl(target: ShellyTarget): string {
  const host = target.address.includes(":") ? `[${target.address}]` : target.address;
  return `${target.protocol}://${host}:${target.port}`;
}

export function normalizeShellyIdentity(
  payload: unknown,
  advertisedName?: string,
): ShellyIdentity | undefined {
  const info = asRecord(payload);
  if (!info) return undefined;
  const mac = normalizeMac(readString(info, "mac"));
  const model = readString(info, "model") ?? readString(info, "type");
  const nativeId = readString(info, "id") ?? (mac ? `shelly-${mac.toLowerCase()}` : undefined);
  if (!model || !nativeId) return undefined;
  const generation = readNumber(info, "gen") ?? 1;
  const app = readString(info, "app");
  return {
    nativeId,
    name: readString(info, "name") ?? app ?? advertisedName ?? model,
    model,
    generation,
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
  };
}

function parseDigestChallenge(header: string): DigestChallenge {
  if (!header.toLowerCase().startsWith("digest ")) {
    throw new Error("The device requested an unsupported HTTP authentication scheme.");
  }
  const values: Record<string, string> = {};
  for (const match of header.slice(7).matchAll(/([a-z0-9_-]+)=(?:"([^"]*)"|([^,\s]+))/gi)) {
    const key = match[1]?.toLowerCase();
    const value = match[2] ?? match[3];
    if (key && value) values[key] = value;
  }
  if (!values.realm || !values.nonce) {
    throw new Error("The device returned an incomplete HTTP Digest challenge.");
  }
  return {
    realm: values.realm,
    nonce: values.nonce,
    qop: values.qop?.split(",")[0]?.trim() || "auth",
    algorithm: values.algorithm?.toUpperCase() || "MD5",
    ...(values.opaque ? { opaque: values.opaque } : {}),
  };
}

function digestHash(algorithm: string, value: string): string {
  return createHash(algorithm.startsWith("SHA-256") ? "sha256" : "md5")
    .update(value)
    .digest("hex");
}

export function createDigestAuthorization(
  challengeHeader: string,
  credentials: ShellyCredentials,
  method: string,
  url: URL,
  cnonce = randomBytes(8).toString("hex"),
): string {
  const challenge = parseDigestChallenge(challengeHeader);
  const uri = `${url.pathname}${url.search}`;
  const nonceCount = "00000001";
  const ha1 = digestHash(
    challenge.algorithm,
    `${credentials.username}:${challenge.realm}:${credentials.password}`,
  );
  const ha2 = digestHash(challenge.algorithm, `${method}:${uri}`);
  const response = digestHash(
    challenge.algorithm,
    `${ha1}:${challenge.nonce}:${nonceCount}:${cnonce}:${challenge.qop}:${ha2}`,
  );
  return [
    `Digest username="${credentials.username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `algorithm=${challenge.algorithm}`,
    `response="${response}"`,
    `qop=${challenge.qop}`,
    `nc=${nonceCount}`,
    `cnonce="${cnonce}"`,
    ...(challenge.opaque ? [`opaque="${challenge.opaque}"`] : []),
  ].join(", ");
}

async function requestJson(
  context: DriverContext,
  url: string,
  init: RequestInit = {},
  credentials?: ShellyCredentials,
): Promise<unknown> {
  const method = init.method ?? "GET";
  await assertLocalNetworkTarget(new URL(url).hostname);
  let response = await context.fetch(url, {
    ...init,
    headers: { accept: "application/json", ...init.headers },
    redirect: "error",
    signal: init.signal ?? AbortSignal.timeout(3_000),
  });
  if (response.status === 401 && credentials) {
    const challenge = response.headers.get("www-authenticate");
    if (!challenge) {
      throw new Error("The device requires authentication but did not provide a challenge.");
    }
    response = await context.fetch(url, {
      ...init,
      headers: {
        accept: "application/json",
        ...init.headers,
        authorization: createDigestAuthorization(challenge, credentials, method, new URL(url)),
      },
      redirect: "error",
      signal: AbortSignal.timeout(3_000),
    });
  }
  if (!response.ok) throw new Error(`Shelly request failed with HTTP ${response.status}.`);
  return response.json();
}

function componentState(component: ShellyComponent): Record<string, unknown> {
  const status = component.status ?? {};
  const state: Record<string, unknown> = {};
  if (typeof status.output === "boolean") state.on = status.output;
  if (typeof status.brightness === "number") state.brightness = status.brightness;
  if (typeof status.state === "boolean") state.contact = status.state;
  if (typeof status.apower === "number") state.power = status.apower;
  if (typeof status.act_power === "number") state.power = status.act_power;
  if (typeof status.voltage === "number") state.voltage = status.voltage;
  if (typeof status.current === "number") state.current = status.current;
  if (typeof status.freq === "number") state.frequency = status.freq;
  if (typeof status.pf === "number") state.powerFactor = status.pf;
  if (typeof status.humidity === "number") state.humidity = status.humidity;
  if (typeof status.illuminance === "number") state.illuminance = status.illuminance;
  if (typeof status.percent === "number") state.battery = status.percent;
  if (typeof status.current_pos === "number") state.position = status.current_pos;
  if (typeof status.tC === "number") state.temperature = status.tC;
  const temperature = asRecord(status.temperature);
  if (temperature && typeof temperature.tC === "number") state.temperature = temperature.tC;
  const energy = asRecord(status.aenergy);
  if (energy && typeof energy.total === "number") state.energy = energy.total;
  if (typeof status.total_act_energy === "number") state.energy = status.total_act_energy;
  return state;
}

function endpointType(componentType: string): NormalizedEndpoint["type"] | undefined {
  if (componentType === "switch") return "switch";
  if (["light", "rgb", "rgbw", "cct"].includes(componentType)) return "light";
  if (componentType === "cover") return "cover";
  if (componentType === "thermostat") return "thermostat";
  if (["em", "em1", "pm1", "emdata", "em1data"].includes(componentType)) return "meter";
  if (
    ["input", "temperature", "humidity", "illuminance", "smoke", "flood", "bthomesensor"].includes(
      componentType,
    )
  )
    return "sensor";
  return undefined;
}

function endpointCapabilities(
  componentType: string,
  state: Record<string, unknown>,
): CapabilityKind[] {
  const capabilities = new Set<CapabilityKind>();
  if (["switch", "light", "rgb", "rgbw", "cct"].includes(componentType)) {
    capabilities.add("on_off");
  }
  if (["light", "rgb", "rgbw", "cct"].includes(componentType)) capabilities.add("brightness");
  if (["rgb", "rgbw"].includes(componentType)) capabilities.add("color");
  if (componentType === "cct") capabilities.add("color_temperature");
  if (componentType === "input") capabilities.add("contact");
  if (componentType === "cover") capabilities.add("position");
  for (const capability of [
    "temperature",
    "humidity",
    "illuminance",
    "power",
    "energy",
    "voltage",
    "current",
    "frequency",
    "battery",
  ] as const) {
    if (state[capability] !== undefined) capabilities.add(capability);
  }
  if (state.powerFactor !== undefined) capabilities.add("power_factor");
  if (componentType === "smoke") capabilities.add("smoke");
  if (componentType === "flood") capabilities.add("flood");
  return [...capabilities];
}

function normalizeComponents(
  deviceId: string,
  app: string | undefined,
  components: ShellyComponent[],
): NormalizedEndpoint[] {
  const byKey = new Map(components.map((component) => [component.key, component]));
  for (const component of components) {
    const [type, id] = component.key.split(":");
    if ((type === "em1data" || type === "emdata") && id) {
      const meter = byKey.get(`${type === "em1data" ? "em1" : "em"}:${id}`);
      if (meter) meter.status = { ...meter.status, ...component.status };
    }
  }

  return components.flatMap((component) => {
    const [componentType = "unknown", componentId = "0"] = component.key.split(":");
    if (componentType.endsWith("data")) return [];
    const type = endpointType(componentType);
    if (!type) return [];
    const state = componentState(component);
    const capabilities = endpointCapabilities(componentType, state);
    if (capabilities.length === 0) return [];
    const configuredName = component.config ? readString(component.config, "name") : undefined;
    const label =
      configuredName ?? `${app ?? "Shelly"} ${componentType} ${Number(componentId) + 1}`;
    return [
      {
        id: opaqueId("endpoint", `${deviceId}:${component.key}`),
        nativeId: component.key,
        label,
        type,
        capabilities,
        readable: true,
        controllable: ["switch", "light", "rgb", "rgbw", "cct", "cover"].includes(componentType),
        reportedState: state,
        metadata: { componentType, componentId },
      } satisfies NormalizedEndpoint,
    ];
  });
}

async function getCredentials(
  device: DiscoveredDevice,
  context: DriverContext,
): Promise<ShellyCredentials | undefined> {
  if (!device.credentialRef) return undefined;
  const value = await context.vault.get(device.credentialRef);
  if (!value || typeof value.username !== "string" || typeof value.password !== "string") {
    throw new Error("The Shelly credentials are missing from the local gateway vault.");
  }
  return { username: value.username, password: value.password };
}

async function getGen2Components(
  target: ShellyTarget,
  context: DriverContext,
  credentials?: ShellyCredentials,
): Promise<ShellyComponent[]> {
  const components: ShellyComponent[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (offset < total) {
    const payload = await requestJson(
      context,
      `${targetBaseUrl(target)}/rpc`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: 1,
          method: "Shelly.GetComponents",
          params: { offset, include: ["config", "status"] },
        }),
      },
      credentials,
    );
    const envelope = asRecord(payload);
    const result = asRecord(envelope?.result) ?? envelope;
    const page = Array.isArray(result?.components) ? (result.components as ShellyComponent[]) : [];
    total = typeof result?.total === "number" ? result.total : page.length;
    components.push(...page);
    if (page.length === 0) break;
    offset += page.length;
  }
  return components;
}

async function getGen1Endpoints(
  deviceId: string,
  target: ShellyTarget,
  context: DriverContext,
  credentials?: ShellyCredentials,
): Promise<NormalizedEndpoint[]> {
  const [settingsPayload, statusPayload] = await Promise.all([
    requestJson(context, `${targetBaseUrl(target)}/settings`, {}, credentials),
    requestJson(context, `${targetBaseUrl(target)}/status`, {}, credentials),
  ]);
  const settings = asRecord(settingsPayload) ?? {};
  const status = asRecord(statusPayload) ?? {};
  const relaySettings = Array.isArray(settings.relays) ? settings.relays : [];
  const relayStatus = Array.isArray(status.relays) ? status.relays : [];
  return relaySettings.map((rawConfig, index) => {
    const config = asRecord(rawConfig) ?? {};
    const reported = asRecord(relayStatus[index]) ?? {};
    const meter = Array.isArray(status.meters) ? asRecord(status.meters[index]) : undefined;
    const state: Record<string, unknown> = {
      ...(typeof reported.ison === "boolean" ? { on: reported.ison } : {}),
      ...(typeof meter?.power === "number" ? { power: meter.power } : {}),
      ...(typeof meter?.total === "number" ? { energy: meter.total } : {}),
    };
    const capabilities: CapabilityKind[] = ["on_off"];
    if (state.power !== undefined) capabilities.push("power");
    if (state.energy !== undefined) capabilities.push("energy");
    return {
      id: opaqueId("endpoint", `${deviceId}:relay:${index}`),
      nativeId: `relay:${index}`,
      label: readString(config, "name") ?? `Shelly relay ${index + 1}`,
      type: "switch",
      capabilities,
      readable: true,
      controllable: true,
      reportedState: state,
      metadata: { componentType: "relay", componentId: String(index) },
    };
  });
}

async function identify(
  candidate: DiscoveryCandidate,
  context: DriverContext,
): Promise<{ identity: ShellyIdentity; target: ShellyTarget }> {
  const target = targetFromCandidate(candidate);
  const payload = await requestJson(context, `${targetBaseUrl(target)}/shelly`);
  const identity = normalizeShellyIdentity(payload, target.advertisedName);
  if (!identity) {
    throw new Error("The candidate did not return a valid Shelly identity document.");
  }
  return { identity, target };
}

function deviceFromIdentity(identity: ShellyIdentity, target: ShellyTarget): DiscoveredDevice {
  const id = opaqueId("device", `shelly:${identity.nativeId}`);
  return {
    id,
    driverId: "shelly",
    protocol: identity.generation >= 2 ? "shelly-rpc" : "shelly-http-gen1",
    manufacturer: "Shelly",
    model: identity.model,
    name: identity.name,
    generation: `Gen ${identity.generation}`,
    ...(identity.firmware ? { firmware: identity.firmware } : {}),
    reachable: true,
    commissioned: identity.authEnabled !== true,
    endpoints: [],
    metadata: {
      nativeId: identity.nativeId,
      address: target.address,
      host: target.host,
      port: target.port,
      protocol: target.protocol,
      generation: identity.generation,
      ...(identity.app ? { app: identity.app } : {}),
      ...(identity.profile ? { profile: identity.profile } : {}),
      ...(identity.mac ? { mac: identity.mac } : {}),
      authEnabled: identity.authEnabled ?? false,
    },
    updatedAt: new Date().toISOString(),
  };
}

function targetFromDevice(device: DiscoveredDevice): ShellyTarget {
  const address = device.metadata.address;
  const port = device.metadata.port;
  if (typeof address !== "string" || typeof port !== "number") {
    throw new Error("The Shelly device is missing its local connection metadata.");
  }
  return {
    address,
    host: typeof device.metadata.host === "string" ? device.metadata.host : address,
    port,
    protocol: device.metadata.protocol === "https" ? "https" : "http",
  };
}

async function enumerateDevice(
  device: DiscoveredDevice,
  context: DriverContext,
): Promise<DiscoveredDevice> {
  const credentials = await getCredentials(device, context);
  const generation = Number(device.metadata.generation ?? 1);
  const endpoints =
    generation >= 2
      ? normalizeComponents(
          device.id,
          typeof device.metadata.app === "string" ? device.metadata.app : undefined,
          await getGen2Components(targetFromDevice(device), context, credentials),
        )
      : await getGen1Endpoints(device.id, targetFromDevice(device), context, credentials);
  return { ...device, reachable: true, endpoints, updatedAt: context.now().toISOString() };
}

export class ShellyDriver implements GatewayDriver {
  readonly id = "shelly";
  readonly displayName = "Shelly local API";

  async availability() {
    return { available: true, message: "Shelly local HTTP and RPC support is installed." };
  }

  async match(candidate: DiscoveryCandidate): Promise<DriverMatchResult | undefined> {
    if (candidate.serviceTypes.includes("_shelly._tcp")) {
      return { confidence: 1, reason: "Shelly-specific DNS-SD service" };
    }
    if (isLikelyShellyCandidate(candidate)) {
      return { confidence: 0.92, reason: "Shelly hostname or service identity" };
    }
    if (candidate.observations.some((observation) => observation.method === "manual")) {
      return {
        confidence: 0.5,
        reason: "Known host can be checked for the Shelly identity endpoint",
      };
    }
    return undefined;
  }

  async inspect(candidate: DiscoveryCandidate, context: DriverContext): Promise<DiscoveredDevice> {
    const { identity, target } = await identify(candidate, context);
    const device = deviceFromIdentity(identity, target);
    if (!identity.authEnabled) {
      try {
        return await enumerateDevice(device, context);
      } catch {
        return device;
      }
    }
    return device;
  }

  async plan(candidate: DiscoveryCandidate, context: DriverContext): Promise<CommissioningPlan> {
    const device = candidate.device ?? (await this.inspect(candidate, context));
    const authEnabled = device.metadata.authEnabled === true;
    return {
      driverId: this.id,
      candidateId: candidate.id,
      status: authEnabled ? "requires_input" : "ready",
      summary: authEnabled
        ? "The device is reachable, but Portego needs its local Shelly credentials."
        : "The device can be added locally without changing its configuration.",
      inputs: authEnabled
        ? [
            {
              key: "username",
              label: "Shelly username",
              valueType: "username",
              secret: false,
              required: true,
            },
            {
              key: "password",
              label: "Shelly device password",
              valueType: "password",
              secret: true,
              required: true,
            },
          ]
        : [],
      steps: [
        {
          id: "review-device",
          kind: "confirmation",
          title: "Confirm this device",
          instruction: `Confirm that ${device.name} (${device.model}) belongs to this home.`,
          requiresUserPresence: false,
        },
      ],
      safeToAutomate: !authEnabled,
      mutatesDevice: false,
    };
  }

  async commission(
    candidate: DiscoveryCandidate,
    input: CommissioningInputValues,
    context: DriverContext,
  ) {
    const { identity, target } = await identify(candidate, context);
    let device = deviceFromIdentity(identity, target);
    if (identity.authEnabled) {
      if (typeof input.username !== "string" || typeof input.password !== "string") {
        throw new Error("This Shelly requires username and password.");
      }
      const credentialRef = `shelly:${device.id}`;
      await context.vault.put(credentialRef, {
        username: input.username,
        password: input.password,
      });
      device = { ...device, credentialRef };
    }
    try {
      device = await enumerateDevice(device, context);
    } catch (error) {
      if (device.credentialRef) await context.vault.remove(device.credentialRef);
      throw error;
    }
    device = { ...device, commissioned: true };
    return {
      device,
      message: `Added ${device.name} with ${device.endpoints.length} endpoint(s) to the local gateway.`,
    };
  }

  async refresh(device: DiscoveredDevice, context: DriverContext): Promise<DiscoveredDevice> {
    try {
      return await enumerateDevice(device, context);
    } catch (error) {
      return {
        ...device,
        reachable: false,
        metadata: {
          ...device.metadata,
          lastError: error instanceof Error ? error.message : String(error),
        },
        updatedAt: context.now().toISOString(),
      };
    }
  }

  async execute(
    device: DiscoveredDevice,
    endpointId: string,
    command: Record<string, unknown>,
    context: DriverContext,
  ): Promise<Record<string, unknown>> {
    const endpoint = device.endpoints.find((item) => item.id === endpointId);
    if (!endpoint) throw new Error("The Shelly endpoint does not exist.");
    if (!endpoint.controllable) throw new Error("This Shelly endpoint is read-only.");
    const componentType = endpoint.metadata.componentType;
    const componentId = Number(endpoint.metadata.componentId);
    if (typeof componentType !== "string" || !Number.isInteger(componentId)) {
      throw new Error("The Shelly endpoint metadata is invalid.");
    }
    let method: string;
    let params: Record<string, unknown>;
    if (["switch", "light", "rgb", "rgbw", "cct"].includes(componentType)) {
      method = `${componentType[0]?.toUpperCase()}${componentType.slice(1)}.Set`;
      params = {
        id: componentId,
        ...(typeof command.on === "boolean" ? { on: command.on } : {}),
        ...(typeof command.brightness === "number" ? { brightness: command.brightness } : {}),
      };
    } else if (componentType === "cover" && typeof command.position === "number") {
      method = "Cover.GoToPosition";
      params = { id: componentId, pos: command.position };
    } else {
      throw new Error("The requested command is not supported by this Shelly endpoint.");
    }
    const payload = await requestJson(
      context,
      `${targetBaseUrl(targetFromDevice(device))}/rpc`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: 1, method, params }),
      },
      await getCredentials(device, context),
    );
    return asRecord(asRecord(payload)?.result) ?? asRecord(payload) ?? {};
  }

  async revoke(device: DiscoveredDevice, context: DriverContext): Promise<void> {
    if (device.credentialRef) await context.vault.remove(device.credentialRef);
  }
}
