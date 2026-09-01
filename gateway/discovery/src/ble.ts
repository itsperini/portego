import type {
  DiscoveryObservation,
  DiscoveryProvider,
  DiscoveryRequest,
} from "@portego/gateway-core";
import { runProcess } from "./process.js";

const DEVICE_PATTERN = /Device\s+([0-9A-F]{2}(?::[0-9A-F]{2}){5})\s+(.+)/i;

export interface BluetoothObservationData {
  address: string;
  name?: string;
  rssi?: number;
}

export function parseBluetoothctlScan(output: string): BluetoothObservationData[] {
  const devices = new Map<string, BluetoothObservationData>();
  for (const rawLine of output.replaceAll(String.fromCharCode(27), "").split(/\r?\n/)) {
    const match = DEVICE_PATTERN.exec(rawLine);
    if (!match?.[1]) {
      continue;
    }
    const address = match[1].toUpperCase();
    const detail = match[2]?.trim() ?? "";
    const existing = devices.get(address) ?? { address };
    const rssi = /RSSI:\s*(-?\d+)/i.exec(detail)?.[1];
    if (rssi) {
      existing.rssi = Number.parseInt(rssi, 10);
    } else if (!/^(RSSI|ManufacturerData|ServicesResolved|Connected):/i.test(detail)) {
      existing.name = detail.replace(/^Name:\s*/i, "");
    }
    devices.set(address, existing);
  }
  return [...devices.values()];
}

export class BluezBleDiscoveryProvider implements DiscoveryProvider {
  readonly id = "ble-bluez";

  async availability() {
    if (process.platform !== "linux") {
      return {
        available: false,
        message: "BLE scanning uses BlueZ and is enabled on the Linux gateway target.",
      };
    }
    try {
      const result = await runProcess("bluetoothctl", ["--version"], 2_000);
      return result.code === 0
        ? { available: true, message: "BlueZ bluetoothctl is available." }
        : { available: false, message: "bluetoothctl is installed but not usable." };
    } catch {
      return { available: false, message: "Install and enable BlueZ to use BLE discovery." };
    }
  }

  async discover(request: DiscoveryRequest): Promise<DiscoveryObservation[]> {
    if (!request.includeBle) {
      return [];
    }
    const seconds = Math.max(1, Math.ceil(request.timeoutMs / 1_000));
    const result = await runProcess(
      "bluetoothctl",
      ["--timeout", String(seconds), "scan", "on"],
      request.timeoutMs + 2_000,
    );
    if (result.code !== 0 && result.code !== null) {
      throw new Error(result.stderr.trim() || "BlueZ scan failed.");
    }
    return parseBluetoothctlScan(result.stdout).map((device) => ({
      providerId: this.id,
      transport: "ble",
      method: "ble",
      ...(device.name ? { name: device.name } : {}),
      addresses: [{ host: device.address, family: "ble" }],
      serviceTypes: [],
      identityHints: [`ble:${device.address.toLowerCase()}`],
      metadata: {
        bluetoothAddress: device.address,
        ...(device.rssi !== undefined ? { rssi: device.rssi } : {}),
      },
      observedAt: new Date().toISOString(),
    }));
  }
}
