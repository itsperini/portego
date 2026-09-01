import type { DiscoveryCandidate, DriverContext, DriverMatch, GatewayDriver } from "./types.js";

export class DriverRegistry {
  readonly #drivers = new Map<string, GatewayDriver>();

  constructor(drivers: GatewayDriver[] = []) {
    for (const driver of drivers) {
      this.register(driver);
    }
  }

  register(driver: GatewayDriver): void {
    if (this.#drivers.has(driver.id)) {
      throw new Error(`A gateway driver with id ${driver.id} is already registered.`);
    }
    this.#drivers.set(driver.id, driver);
  }

  get(id: string): GatewayDriver | undefined {
    return this.#drivers.get(id);
  }

  list(): GatewayDriver[] {
    return [...this.#drivers.values()];
  }

  async match(candidate: DiscoveryCandidate): Promise<DriverMatch[]> {
    const matches = await Promise.all(
      this.list().map(async (driver): Promise<DriverMatch | undefined> => {
        try {
          const match = await driver.match(candidate);
          if (!match) {
            return undefined;
          }
          return { driverId: driver.id, ...match };
        } catch {
          return undefined;
        }
      }),
    );
    return matches
      .filter((match): match is DriverMatch => Boolean(match))
      .sort((left, right) => right.confidence - left.confidence);
  }

  async availability(context: DriverContext): Promise<
    Array<{
      id: string;
      displayName: string;
      available: boolean;
      message?: string;
    }>
  > {
    return Promise.all(
      this.list().map(async (driver) => ({
        id: driver.id,
        displayName: driver.displayName,
        ...(await driver.availability(context)),
      })),
    );
  }
}
