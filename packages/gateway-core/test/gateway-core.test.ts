import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  aggregateObservations,
  candidateForAssistant,
  type DiscoveryProvider,
  type GatewayDriver,
  GatewayRuntime,
  GatewayStateStore,
  isLocalHostname,
  isLocalNetworkAddress,
  LocalCredentialVault,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "portego-gateway-core-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("gateway core", () => {
  it("limits device targets to private LAN and local hostname scopes", () => {
    expect(isLocalNetworkAddress("192.168.1.20")).toBe(true);
    expect(isLocalNetworkAddress("10.0.0.5")).toBe(true);
    expect(isLocalNetworkAddress("fd12:3456::10")).toBe(true);
    expect(isLocalNetworkAddress("fe80::10")).toBe(true);
    expect(isLocalNetworkAddress("169.254.169.254")).toBe(false);
    expect(isLocalNetworkAddress("169.254.1.20")).toBe(false);
    expect(isLocalNetworkAddress("100.100.100.200")).toBe(false);
    expect(isLocalNetworkAddress("127.0.0.1")).toBe(false);
    expect(isLocalNetworkAddress("8.8.8.8")).toBe(false);
    expect(isLocalHostname("shelly-kitchen.local")).toBe(true);
    expect(isLocalHostname("shelly-kitchen")).toBe(true);
    expect(isLocalHostname("example.com")).toBe(false);
  });

  it("projects candidates for assistants without local network or native identifiers", () => {
    const timestamp = new Date().toISOString();
    const projected = candidateForAssistant({
      id: "candidate_safe",
      displayName: "Kitchen light",
      transports: ["ip"],
      addresses: [{ host: "192.0.2.10", port: 80, family: "ipv4", protocol: "tcp" }],
      serviceTypes: ["_example._tcp"],
      observations: [
        {
          providerId: "mdns",
          transport: "ip",
          method: "mdns",
          name: "private-instance._example._tcp.local",
          addresses: [{ host: "192.0.2.10", port: 80 }],
          serviceTypes: ["_example._tcp"],
          identityHints: ["serial:must-not-leak"],
          metadata: { fqdn: "private-instance.local", usn: "uuid:private" },
          observedAt: timestamp,
        },
      ],
      matches: [{ driverId: "test", confidence: 1, reason: "Test" }],
      warnings: [],
      device: {
        id: "device_safe",
        driverId: "test",
        protocol: "test",
        manufacturer: "Test",
        model: "One",
        name: "Kitchen light",
        reachable: true,
        commissioned: false,
        endpoints: [
          {
            id: "endpoint_safe",
            nativeId: "switch:private",
            label: "Light",
            type: "light",
            capabilities: ["on_off"],
            readable: true,
            controllable: true,
            reportedState: { on: false },
            metadata: { serial: "private" },
          },
        ],
        metadata: { nativeId: "must-not-leak" },
        updatedAt: timestamp,
      },
    });

    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("192.0.2.10");
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("private-instance");
    expect(serialized).toContain("Kitchen light");
  });

  it("deduplicates observations from different discovery protocols", () => {
    const timestamp = new Date().toISOString();
    const candidates = aggregateObservations([
      {
        providerId: "mdns",
        transport: "ip",
        method: "mdns",
        name: "Kitchen relay",
        addresses: [{ host: "192.0.2.10", port: 80, family: "ipv4", protocol: "tcp" }],
        serviceTypes: ["_shelly._tcp"],
        identityHints: ["host:kitchen.local"],
        metadata: {},
        observedAt: timestamp,
      },
      {
        providerId: "ssdp",
        transport: "ip",
        method: "ssdp",
        addresses: [{ host: "192.0.2.10", family: "ipv4" }],
        serviceTypes: ["upnp:rootdevice"],
        identityHints: ["ssdp:device-1"],
        metadata: {},
        observedAt: timestamp,
      },
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.observations).toHaveLength(2);
  });

  it("encrypts credentials at rest", async () => {
    const directory = await temporaryDirectory();
    const vault = new LocalCredentialVault(directory);
    await vault.put("device:test", { username: "admin", password: "very-secret" });

    expect(await vault.get("device:test")).toEqual({
      username: "admin",
      password: "very-secret",
    });
    const encrypted = await readFile(join(directory, "credentials", "vault.json"), "utf8");
    expect(encrypted).not.toContain("very-secret");
  });

  it("runs provider observations through a matching driver", async () => {
    const directory = await temporaryDirectory();
    const provider: DiscoveryProvider = {
      id: "test-provider",
      availability: async () => ({ available: true }),
      discover: async () => [
        {
          providerId: "test-provider",
          transport: "virtual",
          method: "simulated",
          name: "Test light",
          addresses: [],
          serviceTypes: ["portego.test"],
          identityHints: ["test:1"],
          metadata: {},
          observedAt: new Date().toISOString(),
        },
      ],
    };
    const driver: GatewayDriver = {
      id: "test-driver",
      displayName: "Test driver",
      availability: async () => ({ available: true }),
      match: async (candidate) =>
        candidate.serviceTypes.includes("portego.test")
          ? { confidence: 1, reason: "Test service" }
          : undefined,
      inspect: async (candidate) => ({
        id: "device_test",
        driverId: "test-driver",
        protocol: "virtual",
        manufacturer: "Portego",
        model: "Test",
        name: candidate.displayName,
        reachable: true,
        commissioned: false,
        endpoints: [],
        metadata: {},
        updatedAt: new Date().toISOString(),
      }),
      plan: async (candidate) => ({
        driverId: "test-driver",
        candidateId: candidate.id,
        status: "ready",
        summary: "Ready",
        inputs: [],
        steps: [],
        safeToAutomate: true,
        mutatesDevice: false,
      }),
      commission: async (_candidate, _input, context) => ({
        message: "Added",
        device: {
          id: "device_test",
          driverId: "test-driver",
          protocol: "virtual",
          manufacturer: "Portego",
          model: "Test",
          name: "Test light",
          reachable: true,
          commissioned: true,
          endpoints: [],
          metadata: {},
          updatedAt: context.now().toISOString(),
        },
      }),
      refresh: async (device) => device,
      execute: async () => ({}),
      revoke: async () => undefined,
    };
    const store = new GatewayStateStore(directory);
    const runtime = new GatewayRuntime({ providers: [provider], drivers: [driver], store });

    const session = await runtime.discover({ timeoutMs: 1 });
    expect(session.candidates[0]).toMatchObject({
      displayName: "Test light",
      matches: [{ driverId: "test-driver", confidence: 1 }],
      setup: { status: "ready" },
    });
  });
});
