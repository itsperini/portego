import { type DeviceEndpoint, type DeviceState, deviceStateSchema } from "@portego/home-model";

export interface DeviceAdapter {
  readonly id: string;
  discover(): Promise<DeviceEndpoint[]>;
  execute(endpointId: string, state: DeviceState): Promise<DeviceState>;
  identify(endpointId: string): Promise<{ identified: boolean }>;
}

export class SimulatedAdapter implements DeviceAdapter {
  readonly id = "simulated";
  readonly #gatewayId: string;
  readonly #states = new Map<string, DeviceState>();

  constructor(gatewayId = "gateway_sim_1") {
    this.#gatewayId = gatewayId;
    this.#states.set("endpoint_sim_light_1", { on: false, brightness: 72 });
  }

  async discover(): Promise<DeviceEndpoint[]> {
    const timestamp = new Date().toISOString();
    return [
      {
        id: "endpoint_sim_light_1",
        gatewayId: this.#gatewayId,
        label: "Simulator light 01",
        protocol: "simulated",
        reachable: true,
        capabilities: ["power", "brightness"],
        desiredState: this.#states.get("endpoint_sim_light_1") ?? {},
        reportedState: this.#states.get("endpoint_sim_light_1") ?? {},
        updatedAt: timestamp,
      },
    ];
  }

  async execute(endpointId: string, rawState: DeviceState): Promise<DeviceState> {
    const current = this.#states.get(endpointId);
    if (!current) {
      throw new Error("The simulated endpoint does not exist.");
    }

    const requested = deviceStateSchema.parse(rawState);
    const next = {
      ...current,
      ...requested,
      ...(requested.brightness === 0 && requested.on === undefined ? { on: false } : {}),
      ...(requested.on === true && current.brightness === 0 ? { brightness: 100 } : {}),
    };
    this.#states.set(endpointId, next);

    await new Promise((resolve) => setTimeout(resolve, 45));
    return next;
  }

  async identify(endpointId: string): Promise<{ identified: boolean }> {
    if (!this.#states.has(endpointId)) {
      throw new Error("The simulated endpoint does not exist.");
    }
    return { identified: true };
  }
}
