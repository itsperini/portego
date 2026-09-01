import { describe, expect, it } from "vitest";
import {
  ManualDiscoveryProvider,
  parseBluetoothctlScan,
  parseLinuxNeighbors,
  parseMacNeighbors,
  parseSsdpResponse,
} from "../src/index.js";

describe("gateway discovery providers", () => {
  it("accepts local manual targets and rejects public or credential-bearing URLs", async () => {
    const provider = new ManualDiscoveryProvider();
    await expect(
      provider.discover({ timeoutMs: 1, hosts: ["192.168.1.20"] }),
    ).resolves.toHaveLength(1);
    await expect(provider.discover({ timeoutMs: 1, hosts: ["example.com"] })).rejects.toThrow(
      "local device hostnames",
    );
    await expect(
      provider.discover({ timeoutMs: 1, hosts: ["http://admin:secret@192.168.1.20"] }),
    ).rejects.toThrow("Credentials are not allowed");
  });

  it("parses SSDP responses without trusting header casing", () => {
    const response = parseSsdpResponse(
      Buffer.from(
        "HTTP/1.1 200 OK\r\nLOCATION: http://192.0.2.20/device.xml\r\nST: upnp:rootdevice\r\nUSN: uuid:test::upnp:rootdevice\r\n\r\n",
      ),
      { address: "192.0.2.20", family: "IPv4", port: 1900, size: 120 },
    );
    expect(response).toMatchObject({
      address: "192.0.2.20",
      headers: { location: "http://192.0.2.20/device.xml", st: "upnp:rootdevice" },
    });
  });

  it("parses BlueZ scan output", () => {
    expect(
      parseBluetoothctlScan(
        "[NEW] Device AA:BB:CC:DD:EE:FF Kitchen Sensor\n[CHG] Device AA:BB:CC:DD:EE:FF RSSI: -52",
      ),
    ).toEqual([{ address: "AA:BB:CC:DD:EE:FF", name: "Kitchen Sensor", rssi: -52 }]);
  });

  it("parses Linux and macOS neighbor tables", () => {
    expect(parseLinuxNeighbors("192.0.2.4 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE")).toEqual([
      { address: "192.0.2.4", hardwareAddress: "aa:bb:cc:dd:ee:ff" },
    ]);
    expect(parseMacNeighbors("? (192.0.2.5) at aa:bb:cc:dd:ee:00 on en0 ifscope")).toEqual([
      { address: "192.0.2.5", hardwareAddress: "aa:bb:cc:dd:ee:00" },
    ]);
  });
});
