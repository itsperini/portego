import {
  type AddFixtureInput,
  type AddRoomInput,
  addFixture,
  addRoom,
  applyReportedState,
  createDemoHome,
  type DeviceEndpoint,
  type DeviceState,
  type HomeDocument,
  resolveFixture,
  type SetFixtureStateInput,
  setDesiredFixtureState,
  setGatewayStatus,
  upsertEndpoints,
} from "@portego/home-model";

export type CommandExecutor = (endpointId: string, state: DeviceState) => Promise<DeviceState>;

export class PortegoService {
  #home: HomeDocument;
  #commandExecutor?: CommandExecutor;

  constructor(name = process.env.PORTEGO_HOME_NAME ?? "Casa Portego") {
    this.#home = createDemoHome(name);
  }

  snapshot(): HomeDocument {
    return structuredClone(this.#home);
  }

  reset(): HomeDocument {
    this.#home = createDemoHome(this.#home.name);
    return this.snapshot();
  }

  setCommandExecutor(executor: CommandExecutor): void {
    this.#commandExecutor = executor;
  }

  clearCommandExecutor(): void {
    this.#commandExecutor = undefined;
  }

  createRoom(input: AddRoomInput): HomeDocument {
    this.#home = addRoom(this.#home, input);
    return this.snapshot();
  }

  createFixture(input: AddFixtureInput): HomeDocument {
    this.#home = addFixture(this.#home, input);
    return this.snapshot();
  }

  updateGateway(status: "online" | "connecting" | "offline"): HomeDocument {
    this.#home = setGatewayStatus(this.#home, status);
    return this.snapshot();
  }

  updateEndpoints(endpoints: DeviceEndpoint[]): HomeDocument {
    this.#home = upsertEndpoints(this.#home, endpoints);
    return this.snapshot();
  }

  applyState(endpointId: string, state: DeviceState): HomeDocument {
    this.#home = applyReportedState(this.#home, endpointId, state);
    return this.snapshot();
  }

  async setFixtureState(input: SetFixtureStateInput): Promise<{
    home: HomeDocument;
    fixtureId: string;
    endpointId: string;
    state: DeviceState;
  }> {
    const fixture = resolveFixture(this.#home, input);
    const desired = setDesiredFixtureState(this.#home, input);
    this.#home = desired.home;
    const state = this.#commandExecutor
      ? await this.#commandExecutor(desired.endpoint.id, desired.requestedState)
      : desired.requestedState;
    this.#home = applyReportedState(this.#home, desired.endpoint.id, state);

    return {
      home: this.snapshot(),
      fixtureId: fixture.id,
      endpointId: desired.endpoint.id,
      state,
    };
  }
}
