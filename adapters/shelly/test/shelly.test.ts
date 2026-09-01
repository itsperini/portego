import { describe, expect, it, vi } from "vitest";
import {
  createDigestAuthorization,
  isLikelyShellyCandidate,
  normalizeShellyIdentity,
  ShellyDriver,
} from "../src/index.js";

const candidate = {
  id: "candidate_test",
  displayName: "Shelly Plus 1PM",
  transports: ["ip" as const],
  addresses: [
    {
      host: "192.168.1.10",
      port: 80,
      family: "ipv4" as const,
      protocol: "tcp" as const,
    },
  ],
  serviceTypes: ["_shelly._tcp"],
  observations: [],
  matches: [],
  warnings: [],
};

const memoryVault = {
  values: new Map<string, Record<string, unknown>>(),
  async put(reference: string, value: Record<string, unknown>) {
    this.values.set(reference, value);
  },
  async get(reference: string) {
    return this.values.get(reference);
  },
  async remove(reference: string) {
    this.values.delete(reference);
  },
};

describe("Shelly driver", () => {
  it("recognizes Shelly service observations", () => {
    expect(isLikelyShellyCandidate(candidate)).toBe(true);
  });

  it("normalizes Gen1 and Gen2+ identities", () => {
    expect(
      normalizeShellyIdentity({
        id: "shellyplus1pm-aabbccddeeff",
        mac: "AABBCCDDEEFF",
        model: "SNSW-001P16EU",
        gen: 2,
        app: "Plus1PM",
        auth_en: true,
      }),
    ).toMatchObject({
      nativeId: "shellyplus1pm-aabbccddeeff",
      model: "SNSW-001P16EU",
      generation: 2,
      authEnabled: true,
    });
    expect(
      normalizeShellyIdentity({
        type: "SHSW-PM",
        mac: "AA:BB:CC:DD:EE:FF",
        auth: false,
      }),
    ).toMatchObject({
      nativeId: "shelly-aabbccddeeff",
      model: "SHSW-PM",
      generation: 1,
    });
  });

  it("creates a deterministic HTTP Digest authorization header", () => {
    const authorization = createDigestAuthorization(
      'Digest realm="shelly", nonce="abc", qop="auth", algorithm=SHA-256',
      { username: "admin", password: "secret" },
      "POST",
      new URL("http://192.0.2.10/rpc"),
      "fixed-cnonce",
    );
    expect(authorization).toContain('username="admin"');
    expect(authorization).toContain("algorithm=SHA-256");
    expect(authorization).toContain('uri="/rpc"');
  });

  it("inspects components and creates normalized endpoints", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "shellyplus1pm-aabbccddeeff",
            model: "SNSW-001P16EU",
            gen: 2,
            app: "Plus1PM",
            auth_en: false,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: {
              components: [
                {
                  key: "switch:0",
                  config: { id: 0, name: "Kitchen relay" },
                  status: { id: 0, output: false, apower: 3.2, voltage: 230 },
                },
              ],
              total: 1,
            },
          }),
          { status: 200 },
        ),
      );
    const device = await new ShellyDriver().inspect(candidate, {
      fetch: fetchMock,
      vault: memoryVault,
      now: () => new Date("2026-09-01T00:00:00.000Z"),
    });

    expect(device.endpoints).toEqual([
      expect.objectContaining({
        label: "Kitchen relay",
        type: "switch",
        capabilities: ["on_off", "power", "voltage"],
        reportedState: { on: false, power: 3.2, voltage: 230 },
      }),
    ]);
  });
});
