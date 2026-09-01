import {
  type CommissioningInputValues,
  candidateForAssistant,
  type DiscoveryCandidate,
  deviceForAssistant,
  type GatewayRuntime,
  redactForDisplay,
} from "@portego/gateway-core";
import { z } from "zod";

export const startDiscoveryInputSchema = z.object({
  timeoutSeconds: z.number().positive().max(60).default(6),
  hosts: z.array(z.string().min(1)).max(32).default([]),
  includeBle: z.boolean().default(false),
  includeNeighbors: z.boolean().default(false),
  includeUnknown: z.boolean().default(false),
});

export const candidateInputSchema = z.object({
  candidateId: z.string().startsWith("candidate_"),
});

export const commissionDeviceInputSchema = candidateInputSchema
  .extend({
    confirmed: z.literal(true),
  })
  .strict();

export const refreshDeviceInputSchema = z.object({
  deviceId: z.string().startsWith("device_"),
});

export const gatewaySetupToolDefinitions = [
  {
    name: "gateway.capabilities",
    description:
      "Report which local discovery providers and device drivers are available before proposing setup actions.",
    inputSchema: z.object({}),
    mutatesState: false,
  },
  {
    name: "discovery.start",
    description:
      "Observe nearby smart devices and return recognized setup candidates. Passive LAN discovery is used by default; BLE and neighbor hints require explicit options.",
    inputSchema: startDiscoveryInputSchema,
    mutatesState: false,
  },
  {
    name: "discovery.get_candidate",
    description:
      "Inspect one discovered candidate, its normalized endpoints, required user input, and safe next setup steps.",
    inputSchema: candidateInputSchema,
    mutatesState: false,
  },
  {
    name: "device.commission",
    description:
      "Add a reviewed candidate to the local gateway after explicit user confirmation. Sensitive setup input is collected by the gateway's local secure-input flow, never as chatbot tool arguments.",
    inputSchema: commissionDeviceInputSchema,
    mutatesState: true,
  },
  {
    name: "device.list",
    description: "List devices already added to the local gateway and their normalized endpoints.",
    inputSchema: z.object({}),
    mutatesState: false,
  },
  {
    name: "device.refresh",
    description:
      "Refresh the reported reachability, endpoint structure, and state of one added device.",
    inputSchema: refreshDeviceInputSchema,
    mutatesState: false,
  },
] as const;

export interface LocalCommissioningInputBroker {
  take(candidate: DiscoveryCandidate): Promise<CommissioningInputValues>;
}

function candidateSummary(candidate: DiscoveryCandidate) {
  const match = candidate.matches[0];
  return {
    candidateId: candidate.id,
    name: candidate.device?.name ?? candidate.displayName,
    manufacturer: candidate.device?.manufacturer,
    model: candidate.device?.model,
    driverId: match?.driverId,
    confidence: match?.confidence,
    endpointCount: candidate.device?.endpoints.length ?? 0,
    setup: candidate.setup,
    warnings: candidate.warnings,
  };
}

export class GatewaySetupTools {
  readonly #runtime: GatewayRuntime;
  readonly #inputBroker: LocalCommissioningInputBroker | undefined;

  constructor(runtime: GatewayRuntime, inputBroker?: LocalCommissioningInputBroker) {
    this.#runtime = runtime;
    this.#inputBroker = inputBroker;
  }

  async capabilities() {
    return redactForDisplay(await this.#runtime.capabilities());
  }

  async startDiscovery(rawInput: unknown) {
    const input = startDiscoveryInputSchema.parse(rawInput);
    const session = await this.#runtime.discover({
      timeoutMs: Math.round(input.timeoutSeconds * 1_000),
      hosts: input.hosts,
      includeBle: input.includeBle,
      includeNeighbors: input.includeNeighbors,
    });
    const candidates = input.includeUnknown
      ? session.candidates
      : session.candidates.filter((candidate) => candidate.matches.length > 0);
    return redactForDisplay({
      sessionId: session.id,
      candidates: candidates.map(candidateSummary),
      providers: session.providers,
      guidance:
        "Call discovery.get_candidate before device.commission. Never infer confirmation or invent setup credentials.",
    });
  }

  async getCandidate(rawInput: unknown) {
    const input = candidateInputSchema.parse(rawInput);
    const candidate = await this.#runtime.candidate(input.candidateId);
    if (!candidate) throw new Error("Candidate not found. Run discovery.start again.");
    return candidateForAssistant(candidate);
  }

  async commissionDevice(rawInput: unknown) {
    const input = commissionDeviceInputSchema.parse(rawInput);
    const candidate = await this.#runtime.candidate(input.candidateId);
    if (!candidate) throw new Error("Candidate not found. Run discovery.start again.");
    const requiredInput = candidate.setup?.inputs.some((item) => item.required) === true;
    if (requiredInput && !this.#inputBroker) {
      throw new Error(
        "This device needs sensitive setup input. Continue in the gateway's local secure-input flow.",
      );
    }
    const commissioningInput = this.#inputBroker ? await this.#inputBroker.take(candidate) : {};
    const result = await this.#runtime.commission(input.candidateId, commissioningInput);
    return {
      message: result.message,
      device: deviceForAssistant(result.device),
    };
  }

  async listDevices() {
    const inventory = await this.#runtime.inventory();
    return {
      schemaVersion: inventory.schemaVersion,
      devices: inventory.devices.map(deviceForAssistant),
      updatedAt: inventory.updatedAt,
    };
  }

  async refreshDevice(rawInput: unknown) {
    const input = refreshDeviceInputSchema.parse(rawInput);
    return deviceForAssistant(await this.#runtime.refresh(input.deviceId));
  }
}
