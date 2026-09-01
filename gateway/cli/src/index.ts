#!/usr/bin/env node

import {
  type CommissioningInputValues,
  candidateForAssistant,
  type DiscoveryCandidate,
  type DiscoverySession,
  deviceForAssistant,
  redactForDisplay,
} from "@portego/gateway-core";
import { createGatewayRuntime, defaultDiscoveryProviders } from "@portego/gateway-runtime";
import { type DiscoverArguments, parseArguments } from "./arguments.js";

const HELP = `Portego gateway CLI

AI-friendly setup workflow:
  portego gateway capabilities
  portego gateway discover [--ble] [--all]
  portego gateway candidate <candidate-id>
  portego gateway add <candidate-id> --confirm [--input-stdin]
  portego gateway inventory
  portego gateway refresh <device-id>

Discovery options:
  --timeout <seconds>   listening window (default: 6)
  --host <host-or-url>  inspect a known local host; repeatable
  --no-mdns             skip multicast DNS (requires --host)
  --ble                 scan BLE on Linux through BlueZ
  --neighbors           include local ARP/NDP hints
  --all                 show unmatched observations as well
  --json                structured, redacted output for an AI client

Commissioning options:
  --confirm              confirms the selected device belongs to this home
  --input-stdin           read a JSON object from stdin for credentials/setup code

Sensitive values are never accepted as command-line flags because shell process
lists and history can expose them. Start the command with --input-stdin, paste
the requested JSON object, and then finish the input stream.`;

function runtimeForDiscovery(args: DiscoverArguments) {
  const providers = defaultDiscoveryProviders().filter(
    (provider) => args.includeMdns || provider.id !== "mdns",
  );
  return createGatewayRuntime({ providers });
}

function visibleCandidates(session: DiscoverySession, includeUnknown: boolean) {
  return includeUnknown
    ? session.candidates
    : session.candidates.filter((candidate) => candidate.matches.length > 0);
}

function candidateSummary(candidate: DiscoveryCandidate) {
  const bestMatch = candidate.matches[0];
  return {
    id: candidate.id,
    name: candidate.device?.name ?? candidate.displayName,
    manufacturer: candidate.device?.manufacturer,
    model: candidate.device?.model,
    protocol: candidate.device?.protocol,
    driver: bestMatch?.driverId,
    confidence: bestMatch?.confidence,
    endpointCount: candidate.device?.endpoints.length ?? 0,
    setupStatus: candidate.setup?.status ?? "unmatched",
    setupSummary:
      candidate.setup?.summary ?? "No installed driver can set up this observation yet.",
    nextAction: bestMatch
      ? `portego gateway candidate ${candidate.id} --json`
      : "Install or implement a compatible driver.",
    warnings: candidate.warnings,
  };
}

function printDiscovery(session: DiscoverySession, includeUnknown: boolean): void {
  const candidates = visibleCandidates(session, includeUnknown);
  const recognized = session.candidates.filter((candidate) => candidate.matches.length > 0).length;
  console.log(
    `Observed ${session.candidates.length} device candidate(s); ${recognized} recognized by installed drivers.`,
  );
  for (const candidate of candidates) {
    const summary = candidateSummary(candidate);
    console.log(`\n${summary.name}`);
    console.log(`  Candidate: ${summary.id}`);
    console.log(
      `  Driver: ${summary.driver ?? "none"}${summary.confidence !== undefined ? ` (${Math.round(summary.confidence * 100)}%)` : ""}`,
    );
    if (summary.model) console.log(`  Product: ${summary.manufacturer} ${summary.model}`);
    if (summary.endpointCount) console.log(`  Endpoints: ${summary.endpointCount}`);
    console.log(`  Setup: ${summary.setupStatus} — ${summary.setupSummary}`);
  }
  console.log("\nDiscovery providers:");
  for (const provider of session.providers) {
    console.log(
      `  ${provider.providerId}: ${provider.status}, ${provider.observationCount} observation(s)${provider.message ? ` — ${provider.message}` : ""}`,
    );
  }
}

function printCandidate(candidate: DiscoveryCandidate): void {
  const summary = candidateSummary(candidate);
  console.log(`${summary.name}\n`);
  console.log(`Candidate: ${candidate.id}`);
  console.log(`Driver: ${summary.driver ?? "No matching driver"}`);
  if (summary.model) console.log(`Product: ${summary.manufacturer} ${summary.model}`);
  console.log(`Setup: ${summary.setupStatus}`);
  console.log(summary.setupSummary);
  if (candidate.device?.endpoints.length) {
    console.log("\nDiscovered endpoints:");
    for (const endpoint of candidate.device.endpoints) {
      console.log(
        `  ${endpoint.label}: ${endpoint.type}; ${endpoint.capabilities.join(", ")}${endpoint.controllable ? "; controllable" : "; read-only"}`,
      );
    }
  }
  if (candidate.setup?.steps.length) {
    console.log("\nSetup steps:");
    for (const [index, step] of candidate.setup.steps.entries()) {
      console.log(`  ${index + 1}. ${step.title}: ${step.instruction}`);
    }
  }
  if (candidate.setup?.inputs.length) {
    console.log("\nRequired input:");
    for (const input of candidate.setup.inputs) console.log(`  ${input.label}`);
  }
  if (candidate.matches.length) {
    console.log(`\nTo add: portego gateway add ${candidate.id} --confirm`);
  }
}

async function stdinInput(): Promise<CommissioningInputValues> {
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) text += chunk;
  text = text.trim();
  if (!text) return {};
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Commissioning stdin must contain one JSON object.");
  }
  return value as CommissioningInputValues;
}

async function main(): Promise<void> {
  let args: ReturnType<typeof parseArguments>;
  try {
    args = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("Run `portego gateway --help` for usage.");
    process.exitCode = 1;
    return;
  }
  if (args.command === "help") {
    console.log(HELP);
    return;
  }

  if (args.command === "discover") {
    if (!args.json) console.log("Listening for smart devices on the local gateway…");
    const session = await runtimeForDiscovery(args).discover({
      timeoutMs: args.timeoutMs,
      hosts: args.hosts,
      includeBle: args.includeBle,
      includeNeighbors: args.includeNeighbors,
    });
    if (args.json) {
      console.log(
        JSON.stringify(
          redactForDisplay({
            sessionId: session.id,
            candidates: visibleCandidates(session, args.includeUnknown).map(candidateSummary),
            providers: session.providers,
          }),
          null,
          2,
        ),
      );
    } else {
      printDiscovery(session, args.includeUnknown);
    }
    return;
  }

  const runtime = createGatewayRuntime();
  if (args.command === "capabilities") {
    const capabilities = await runtime.capabilities();
    if (args.json) console.log(JSON.stringify(redactForDisplay(capabilities), null, 2));
    else {
      console.log("Discovery providers:");
      for (const provider of capabilities.providers) {
        console.log(
          `  ${provider.id}: ${provider.available ? "available" : "unavailable"} — ${provider.message ?? ""}`,
        );
      }
      console.log("\nDevice drivers:");
      for (const driver of capabilities.drivers) {
        console.log(
          `  ${driver.displayName}: ${driver.available ? "available" : "partial"} — ${driver.message ?? ""}`,
        );
      }
    }
    return;
  }
  if (args.command === "candidate") {
    const candidate = await runtime.candidate(args.candidateId);
    if (!candidate) throw new Error("Candidate not found. Run discovery again first.");
    if (args.json) console.log(JSON.stringify(candidateForAssistant(candidate), null, 2));
    else printCandidate(candidate);
    return;
  }
  if (args.command === "commission") {
    if (!args.confirmed) {
      throw new Error("Review the candidate and pass --confirm before adding it to this home.");
    }
    const result = await runtime.commission(
      args.candidateId,
      args.inputFromStdin ? await stdinInput() : {},
    );
    if (args.json)
      console.log(
        JSON.stringify(
          { message: result.message, device: deviceForAssistant(result.device) },
          null,
          2,
        ),
      );
    else console.log(result.message);
    return;
  }
  if (args.command === "inventory") {
    const inventory = await runtime.inventory();
    if (args.json)
      console.log(
        JSON.stringify(
          {
            schemaVersion: inventory.schemaVersion,
            devices: inventory.devices.map(deviceForAssistant),
            updatedAt: inventory.updatedAt,
          },
          null,
          2,
        ),
      );
    else if (inventory.devices.length === 0)
      console.log("No devices have been added to this gateway yet.");
    else {
      for (const device of inventory.devices) {
        console.log(`${device.name} — ${device.manufacturer} ${device.model}`);
        console.log(
          `  ${device.id}; ${device.endpoints.length} endpoint(s); ${device.reachable ? "reachable" : "offline"}`,
        );
      }
    }
    return;
  }
  if (args.command !== "refresh") throw new Error("The gateway command was not handled.");
  const device = await runtime.refresh(args.deviceId);
  if (args.json) console.log(JSON.stringify(deviceForAssistant(device), null, 2));
  else console.log(`Refreshed ${device.name}: ${device.reachable ? "reachable" : "offline"}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
