import { describe, expect, it, vi } from "vitest";
import {
  discoverShellyDevices,
  isLikelyShellyService,
  normalizeShellyDevice,
} from "../src/index.js";

const target = {
  address: "192.0.2.10",
  host: "shellyplus1pm-test.local",
  port: 80,
  source: "shelly-mdns" as const,
  advertisedName: "Shelly Plus 1PM",
  url: "http://192.0.2.10:80/shelly",
};

describe("Shelly discovery", () => {
  it("recognizes Shelly's dedicated and legacy HTTP advertisements", () => {
    expect(
      isLikelyShellyService({
        name: "Shelly Plus 1PM",
        type: "shelly",
        host: "device.local",
        port: 80,
      }),
    ).toBe(true);
    expect(
      isLikelyShellyService({
        name: "shelly1pm-AABBCCDDEEFF",
        type: "http",
        host: "shelly1pm-AABBCCDDEEFF.local",
        port: 80,
      }),
    ).toBe(true);
    expect(
      isLikelyShellyService({
        name: "Printer",
        type: "http",
        host: "printer.local",
        port: 80,
      }),
    ).toBe(false);
  });

  it("normalizes Gen2+ device information", () => {
    const device = normalizeShellyDevice(
      {
        name: "Kitchen relay",
        id: "shellyplus1pm-aabbccddeeff",
        mac: "AABBCCDDEEFF",
        model: "SNSW-001P16EU",
        gen: 2,
        ver: "1.7.0",
        app: "Plus1PM",
        profile: "switch",
        auth_en: true,
      },
      target,
    );

    expect(device).toMatchObject({
      id: "shellyplus1pm-aabbccddeeff",
      name: "Kitchen relay",
      model: "SNSW-001P16EU",
      generation: 2,
      authEnabled: true,
      profile: "switch",
    });
  });

  it("normalizes Gen1 device information", () => {
    const device = normalizeShellyDevice(
      {
        type: "SHSW-PM",
        mac: "AA:BB:CC:DD:EE:FF",
        auth: false,
        fw: "20230913-112003/v1.14.0-gcb84623",
      },
      { ...target, source: "http-mdns" },
    );

    expect(device).toMatchObject({
      id: "shelly-aabbccddeeff",
      model: "SHSW-PM",
      generation: 1,
      mac: "AABBCCDDEEFF",
      authEnabled: false,
    });
  });

  it("verifies advertised devices and deduplicates them by native id", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "shellyplus1pm-aabbccddeeff",
            model: "SNSW-001P16EU",
            gen: 2,
            app: "Plus1PM",
          }),
          { status: 200 },
        ),
    );

    const result = await discoverShellyDevices({
      timeoutMs: 1,
      discoverMdns: async () => [
        {
          name: "Shelly Plus 1PM",
          type: "shelly",
          host: "shellyplus1pm-test.local",
          port: 80,
          addresses: ["192.0.2.10", "192.0.2.11"],
        },
      ],
      fetch: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.devices).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });
});
