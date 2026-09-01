import { aggregateObservations } from "./aggregate.js";
import { DriverRegistry } from "./registry.js";
import { GatewayStateStore, LocalCredentialVault } from "./storage.js";
import type {
  CommissioningInputValues,
  CommissioningResult,
  DiscoveryCandidate,
  DiscoveryProvider,
  DiscoveryRequest,
  DiscoverySession,
  DriverContext,
  GatewayDriver,
  ProviderReport,
} from "./types.js";

export interface GatewayRuntimeOptions {
  providers: DiscoveryProvider[];
  drivers: GatewayDriver[];
  store?: GatewayStateStore;
  vault?: LocalCredentialVault;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
}

export class GatewayRuntime {
  readonly #providers: DiscoveryProvider[];
  readonly #drivers: DriverRegistry;
  readonly #store: GatewayStateStore;
  readonly #context: DriverContext;

  constructor(options: GatewayRuntimeOptions) {
    this.#providers = options.providers;
    this.#drivers = new DriverRegistry(options.drivers);
    this.#store = options.store ?? new GatewayStateStore();
    const vault = options.vault ?? new LocalCredentialVault(this.#store.stateDirectory);
    this.#context = {
      fetch: options.fetch ?? globalThis.fetch,
      vault,
      now: options.now ?? (() => new Date()),
    };
  }

  get stateDirectory(): string {
    return this.#store.stateDirectory;
  }

  async capabilities() {
    const providers = await Promise.all(
      this.#providers.map(async (provider) => ({
        id: provider.id,
        ...(await provider.availability()),
      })),
    );
    return {
      providers,
      drivers: await this.#drivers.availability(this.#context),
    };
  }

  async discover(request: DiscoveryRequest): Promise<DiscoverySession> {
    const startedAt = this.#context.now();
    const providerRuns = await Promise.all(
      this.#providers.map(async (provider) => {
        const started = Date.now();
        const availability = await provider.availability();
        if (!availability.available) {
          return {
            observations: [],
            report: {
              providerId: provider.id,
              status: "unavailable",
              observationCount: 0,
              durationMs: Date.now() - started,
              ...(availability.message ? { message: availability.message } : {}),
            } satisfies ProviderReport,
          };
        }
        try {
          const observations = await provider.discover(request);
          return {
            observations,
            report: {
              providerId: provider.id,
              status: "ok",
              observationCount: observations.length,
              durationMs: Date.now() - started,
            } satisfies ProviderReport,
          };
        } catch (error) {
          return {
            observations: [],
            report: {
              providerId: provider.id,
              status: "failed",
              observationCount: 0,
              durationMs: Date.now() - started,
              message: error instanceof Error ? error.message : String(error),
            } satisfies ProviderReport,
          };
        }
      }),
    );

    const candidates = aggregateObservations(providerRuns.flatMap((run) => run.observations));
    await Promise.all(candidates.map((candidate) => this.#enrichCandidate(candidate)));
    const completedAt = this.#context.now();
    const session: DiscoverySession = {
      id: `discovery_${crypto.randomUUID()}`,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      candidates,
      providers: providerRuns.map((run) => run.report),
    };
    await this.#store.saveDiscoverySession(session);
    return session;
  }

  async #enrichCandidate(candidate: DiscoveryCandidate): Promise<void> {
    candidate.matches = await this.#drivers.match(candidate);
    const bestMatch = candidate.matches[0];
    if (!bestMatch || bestMatch.confidence < 0.5) {
      return;
    }
    const driver = this.#drivers.get(bestMatch.driverId);
    if (!driver) {
      return;
    }
    try {
      candidate.device = await driver.inspect(candidate, this.#context);
      candidate.setup = await driver.plan(candidate, this.#context);
    } catch (error) {
      candidate.warnings.push(error instanceof Error ? error.message : String(error));
    }
  }

  async candidate(candidateId: string): Promise<DiscoveryCandidate | undefined> {
    return this.#store.getCandidate(candidateId);
  }

  async commission(
    candidateId: string,
    input: CommissioningInputValues = {},
  ): Promise<CommissioningResult> {
    const candidate = await this.#store.getCandidate(candidateId);
    if (!candidate) {
      throw new Error(
        "Candidate not found. Run discovery again and use the returned candidate id.",
      );
    }
    const match = candidate.matches[0];
    if (!match) {
      throw new Error("No installed driver recognizes this candidate.");
    }
    const driver = this.#drivers.get(match.driverId);
    if (!driver) {
      throw new Error(`The ${match.driverId} driver is not installed.`);
    }
    const result = await driver.commission(candidate, input, this.#context);
    await this.#store.saveDevice(result.device);
    return result;
  }

  async inventory() {
    return this.#store.inventory();
  }

  async refresh(deviceId: string) {
    const inventory = await this.#store.inventory();
    const device = inventory.devices.find((item) => item.id === deviceId);
    if (!device) {
      throw new Error("The device is not in this gateway's inventory.");
    }
    const driver = this.#drivers.get(device.driverId);
    if (!driver) {
      throw new Error(`The ${device.driverId} driver is not installed.`);
    }
    const refreshed = await driver.refresh(device, this.#context);
    await this.#store.saveDevice(refreshed);
    return refreshed;
  }

  async execute(deviceId: string, endpointId: string, command: Record<string, unknown>) {
    const inventory = await this.#store.inventory();
    const device = inventory.devices.find((item) => item.id === deviceId);
    if (!device) {
      throw new Error("The device is not in this gateway's inventory.");
    }
    const driver = this.#drivers.get(device.driverId);
    if (!driver) {
      throw new Error(`The ${device.driverId} driver is not installed.`);
    }
    const state = await driver.execute(device, endpointId, command, this.#context);
    await this.#store.saveDevice(await driver.refresh(device, this.#context));
    return state;
  }
}
