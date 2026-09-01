import { describe, expect, it } from "vitest";
import { defaultDiscoveryProviders, defaultGatewayDrivers } from "../src/index.js";

describe("gateway composition", () => {
  it("registers protocol-neutral providers and drivers separately", () => {
    expect(defaultDiscoveryProviders().map((provider) => provider.id)).toEqual([
      "mdns",
      "ssdp",
      "manual",
      "ble-bluez",
      "network-neighbors",
    ]);
    expect(defaultGatewayDrivers().map((driver) => driver.id)).toEqual(["shelly", "matter"]);
  });
});
