import type { DiscoveredDevice, DiscoveryCandidate } from "./types.js";

const SENSITIVE_KEY =
  /(?:password|passcode|token|secret|credential|private|key|mac|serial|nativeId|hardwareAddress|bluetoothAddress|fqdn|usn)/i;

export function redactForDisplay(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactForDisplay);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[redacted]" : redactForDisplay(nested),
    ]),
  );
}

export function deviceForAssistant(device: DiscoveredDevice) {
  return {
    id: device.id,
    driverId: device.driverId,
    protocol: device.protocol,
    manufacturer: device.manufacturer,
    model: device.model,
    name: device.name,
    generation: device.generation,
    firmware: device.firmware,
    reachable: device.reachable,
    commissioned: device.commissioned,
    endpoints: device.endpoints.map((endpoint) => ({
      id: endpoint.id,
      label: endpoint.label,
      type: endpoint.type,
      capabilities: endpoint.capabilities,
      readable: endpoint.readable,
      controllable: endpoint.controllable,
      reportedState: endpoint.reportedState,
    })),
    updatedAt: device.updatedAt,
  };
}

export function candidateForAssistant(candidate: DiscoveryCandidate) {
  return {
    id: candidate.id,
    name: candidate.device?.name ?? candidate.displayName,
    transports: candidate.transports,
    serviceTypes: candidate.serviceTypes,
    matches: candidate.matches,
    ...(candidate.device ? { device: deviceForAssistant(candidate.device) } : {}),
    ...(candidate.setup ? { setup: candidate.setup } : {}),
    warnings: candidate.warnings,
  };
}
