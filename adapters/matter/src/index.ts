import { createHash } from "node:crypto";
import { ManualPairingCodeCodec, QrPairingCodeCodec } from "@matter/main/types";
import type {
  CommissioningInputValues,
  CommissioningPlan,
  CommissioningResult,
  DiscoveredDevice,
  DiscoveryCandidate,
  DriverContext,
  DriverMatchResult,
  GatewayDriver,
  ProviderAvailability,
} from "@portego/gateway-core";

export interface MatterSetupPayload {
  format: "qr" | "manual";
  passcode: number;
  discriminator?: number;
  shortDiscriminator?: number;
  vendorId?: number;
  productId?: number;
}

export interface MatterControllerBackend {
  availability(): Promise<ProviderAvailability>;
  commission(
    candidate: DiscoveryCandidate,
    setup: MatterSetupPayload,
    context: DriverContext,
  ): Promise<CommissioningResult>;
  refresh(device: DiscoveredDevice, context: DriverContext): Promise<DiscoveredDevice>;
  execute(
    device: DiscoveredDevice,
    endpointId: string,
    command: Record<string, unknown>,
    context: DriverContext,
  ): Promise<Record<string, unknown>>;
  revoke(device: DiscoveredDevice, context: DriverContext): Promise<void>;
}

class UnavailableMatterController implements MatterControllerBackend {
  async availability() {
    return {
      available: false,
      message:
        "Matter discovery and setup-code validation are installed; the persistent controller backend is not enabled yet.",
    };
  }

  async commission(): Promise<never> {
    throw new Error(
      "Matter commissioning needs the persistent matter.js controller backend. Discovery and setup planning are available, but Portego will not pretend the device was paired.",
    );
  }

  async refresh(device: DiscoveredDevice): Promise<DiscoveredDevice> {
    return device;
  }

  async execute(): Promise<Record<string, unknown>> {
    throw new Error("The Matter controller backend is unavailable.");
  }

  async revoke(): Promise<void> {
    throw new Error("The Matter controller backend is unavailable.");
  }
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number.parseInt(value, 10);
  return undefined;
}

export function parseMatterSetupCode(code: string): MatterSetupPayload {
  const normalized = code.trim();
  if (normalized.toUpperCase().startsWith("MT:")) {
    const decoded = QrPairingCodeCodec.decode(normalized)[0];
    if (!decoded) throw new Error("The Matter QR payload is empty.");
    return {
      format: "qr",
      passcode: decoded.passcode,
      discriminator: decoded.discriminator,
      vendorId: Number(decoded.vendorId),
      productId: decoded.productId,
    };
  }
  const decoded = ManualPairingCodeCodec.decode(normalized);
  return {
    format: "manual",
    passcode: decoded.passcode,
    ...(decoded.discriminator !== undefined ? { discriminator: decoded.discriminator } : {}),
    ...(decoded.shortDiscriminator !== undefined
      ? { shortDiscriminator: decoded.shortDiscriminator }
      : {}),
    ...(decoded.vendorId !== undefined ? { vendorId: Number(decoded.vendorId) } : {}),
    ...(decoded.productId !== undefined ? { productId: decoded.productId } : {}),
  };
}

function matterTxt(candidate: DiscoveryCandidate): Record<string, unknown> {
  for (const observation of candidate.observations) {
    if (!observation.serviceTypes.some((service) => service.startsWith("_matter"))) continue;
    const txt = observation.metadata.txt;
    if (txt && typeof txt === "object") return txt as Record<string, unknown>;
  }
  return {};
}

function matterDevice(candidate: DiscoveryCandidate): DiscoveredDevice {
  const txt = matterTxt(candidate);
  const vendorProduct = typeof txt.VP === "string" ? txt.VP.split("+") : [];
  const vendorId = numeric(vendorProduct[0]);
  const productId = numeric(vendorProduct[1]);
  const discriminator = numeric(txt.D);
  const instance =
    candidate.observations.find((observation) => observation.serviceTypes.includes("_matterc._udp"))
      ?.metadata.fqdn ?? candidate.id;
  const id = `device_${createHash("sha256")
    .update(`matter:${String(instance)}`)
    .digest("hex")
    .slice(0, 16)}`;
  return {
    id,
    driverId: "matter",
    protocol: "matter",
    manufacturer: vendorId !== undefined ? `Matter vendor ${vendorId}` : "Matter",
    model: productId !== undefined ? `Product ${productId}` : "Commissionable device",
    name: typeof txt.DN === "string" ? txt.DN : "Matter device",
    reachable: true,
    commissioned: false,
    endpoints: [],
    metadata: {
      ...(vendorId !== undefined ? { vendorId } : {}),
      ...(productId !== undefined ? { productId } : {}),
      ...(discriminator !== undefined ? { discriminator } : {}),
      commissioningMode: numeric(txt.CM) ?? 0,
      discoveryCapabilities: txt.PH,
    },
    updatedAt: new Date().toISOString(),
  };
}

export class MatterDriver implements GatewayDriver {
  readonly id = "matter";
  readonly displayName = "Matter";
  readonly #controller: MatterControllerBackend;

  constructor(controller: MatterControllerBackend = new UnavailableMatterController()) {
    this.#controller = controller;
  }

  availability() {
    return this.#controller.availability();
  }

  async match(candidate: DiscoveryCandidate): Promise<DriverMatchResult | undefined> {
    if (candidate.serviceTypes.includes("_matterc._udp")) {
      return { confidence: 1, reason: "Matter commissionable DNS-SD service" };
    }
    if (candidate.serviceTypes.includes("_matter._tcp")) {
      return { confidence: 0.85, reason: "Matter operational DNS-SD service" };
    }
    return undefined;
  }

  async inspect(candidate: DiscoveryCandidate): Promise<DiscoveredDevice> {
    return matterDevice(candidate);
  }

  async plan(candidate: DiscoveryCandidate): Promise<CommissioningPlan> {
    const availability = await this.#controller.availability();
    return {
      driverId: this.id,
      candidateId: candidate.id,
      status: availability.available ? "requires_input" : "unsupported",
      summary: availability.available
        ? "Scan the Matter QR code or provide the manual setup code to add this device to Portego's fabric."
        : (availability.message ?? "The Matter controller backend is unavailable."),
      inputs: availability.available
        ? [
            {
              key: "setupCode",
              label: "Matter QR payload or manual setup code",
              description:
                "The code is used locally for PASE commissioning and is not sent to Portego Cloud.",
              valueType: "setup_code",
              secret: true,
              required: true,
            },
          ]
        : [],
      steps: [
        {
          id: "enable-pairing",
          kind: "physical_action",
          title: "Put the device in pairing mode",
          instruction:
            "Keep the device powered and open its commissioning window according to the manufacturer instructions.",
          requiresUserPresence: true,
        },
        {
          id: "confirm-device",
          kind: "confirmation",
          title: "Confirm the nearby device",
          instruction: "Confirm the product and room before Portego creates fabric credentials.",
          requiresUserPresence: true,
        },
      ],
      safeToAutomate: false,
      mutatesDevice: true,
    };
  }

  async commission(
    candidate: DiscoveryCandidate,
    input: CommissioningInputValues,
    context: DriverContext,
  ) {
    if (typeof input.setupCode !== "string") {
      throw new Error("Matter commissioning requires a QR payload or manual setup code.");
    }
    return this.#controller.commission(candidate, parseMatterSetupCode(input.setupCode), context);
  }

  refresh(device: DiscoveredDevice, context: DriverContext) {
    return this.#controller.refresh(device, context);
  }

  execute(
    device: DiscoveredDevice,
    endpointId: string,
    command: Record<string, unknown>,
    context: DriverContext,
  ) {
    return this.#controller.execute(device, endpointId, command, context);
  }

  revoke(device: DiscoveredDevice, context: DriverContext) {
    return this.#controller.revoke(device, context);
  }
}
