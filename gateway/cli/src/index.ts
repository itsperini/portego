#!/usr/bin/env node

import { discoverShellyDevices, type ShellyDevice } from "@portego/adapter-shelly";
import { parseArguments } from "./arguments.js";

const HELP = `Portego gateway CLI

Discover Shelly devices on the current local network:
  portego gateway discover
  portego discover

Options:
  --timeout <seconds>          mDNS listening window (default: 6)
  --request-timeout <seconds> local HTTP timeout (default: 2)
  --host <host-or-url>         verify a known device directly; repeatable
  --no-mdns                    skip multicast discovery (requires --host)
  --json                       print the full machine-readable result
  -h, --help                   show this help

The discovery command stays on your LAN. It listens for Shelly mDNS
advertisements and verifies candidates with GET /shelly. It does not scan
every address on your subnet and does not connect to Portego Cloud.`;

function pad(value: string, width: number): string {
  return value.length >= width ? value : value.padEnd(width);
}

function authLabel(device: ShellyDevice): string {
  if (device.authEnabled === undefined) {
    return "unknown";
  }
  return device.authEnabled ? "enabled" : "off";
}

function printDevices(devices: ShellyDevice[]): void {
  const rows = devices.map((device) => [
    device.name,
    device.model,
    `Gen ${device.generation}`,
    `${device.address}:${device.port}`,
    authLabel(device),
  ]);
  const headers = ["Name", "Model", "Generation", "Address", "Auth"];
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );
  console.log(headers.map((header, index) => pad(header, widths[index] ?? 0)).join("  "));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    console.log(row.map((value, index) => pad(value, widths[index] ?? 0)).join("  "));
  }
}

async function main(): Promise<void> {
  let args: ReturnType<typeof parseArguments>;
  try {
    args = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("Run `portego --help` for usage.");
    process.exitCode = 1;
    return;
  }

  if (args.command === "help") {
    console.log(HELP);
    return;
  }

  if (!args.json) {
    const scope = args.includeMdns ? "the local network" : args.hosts.join(", ");
    console.log(`Looking for Shelly devices on ${scope}…`);
  }

  const result = await discoverShellyDevices({
    timeoutMs: args.timeoutMs,
    requestTimeoutMs: args.requestTimeoutMs,
    hosts: args.hosts,
    includeMdns: args.includeMdns,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.devices.length === 0) {
    console.log("No verified Shelly devices found.");
    console.log(
      "If you know a device address, retry with `pnpm gateway:discover -- --host 192.168.x.x`.",
    );
  } else {
    console.log(`Found ${result.devices.length} verified Shelly device(s).\n`);
    printDevices(result.devices);
  }

  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
