import {
  type AddFixtureInput,
  type AddOpeningInput,
  type AddRoomInput,
  type ApplyHomeChangesInput,
  addFixture,
  addOpening,
  addRoom,
  applyHomeChanges,
  applyReportedState,
  type BindFixtureInput,
  bindFixtureToEndpoint,
  createDemoHome,
  type DeviceEndpoint,
  type DeviceState,
  type HomeDocument,
  type MoveFixtureInput,
  moveFixture,
  type RemoveFixtureInput,
  type RemoveFloorInput,
  type RemoveOpeningInput,
  type RemoveRoomInput,
  removeFixture,
  removeFloor,
  removeOpening,
  removeRoom,
  resolveFixture,
  type SetFixtureStateInput,
  setDesiredFixtureState,
  setGatewayStatus,
  type UnbindFixtureInput,
  type UpdateFixtureInput,
  type UpdateFloorDetailsInput,
  type UpdateHomeDetailsInput,
  type UpdateRoomInput,
  unbindFixture,
  updateFixture,
  updateFloorDetails,
  updateHomeDetails,
  updateRoomGeometry,
  upsertEndpoints,
} from "@portego/home-model";

export type CommandExecutor = (endpointId: string, state: DeviceState) => Promise<DeviceState>;

export class PortegoService {
  #home: HomeDocument;
  #commandExecutor?: CommandExecutor;
  #undoStack: HomeDocument[] = [];
  #redoStack: HomeDocument[] = [];

  constructor(name = process.env.PORTEGO_HOME_NAME ?? "Casa Portego") {
    this.#home = createDemoHome(name);
  }

  snapshot(): HomeDocument {
    return structuredClone(this.#home);
  }

  reset(): HomeDocument {
    this.#home = createDemoHome(this.#home.name);
    this.#undoStack = [];
    this.#redoStack = [];
    return this.snapshot();
  }

  historyStatus(): { canUndo: boolean; canRedo: boolean } {
    return { canUndo: this.#undoStack.length > 0, canRedo: this.#redoStack.length > 0 };
  }

  #commit(change: (home: HomeDocument) => HomeDocument): HomeDocument {
    const before = structuredClone(this.#home);
    const next = change(this.#home);
    this.#undoStack.push(before);
    this.#redoStack = [];
    this.#home = next;
    return this.snapshot();
  }

  undo(): HomeDocument {
    const previous = this.#undoStack.pop();
    if (!previous) {
      throw new Error("There is nothing to undo.");
    }
    this.#redoStack.push(structuredClone(this.#home));
    this.#home = {
      ...previous,
      revision: this.#home.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    return this.snapshot();
  }

  redo(): HomeDocument {
    const next = this.#redoStack.pop();
    if (!next) {
      throw new Error("There is nothing to redo.");
    }
    this.#undoStack.push(structuredClone(this.#home));
    this.#home = {
      ...next,
      revision: this.#home.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    return this.snapshot();
  }

  setCommandExecutor(executor: CommandExecutor): void {
    this.#commandExecutor = executor;
  }

  clearCommandExecutor(): void {
    this.#commandExecutor = undefined;
  }

  updateHomeDetails(input: UpdateHomeDetailsInput): HomeDocument {
    return this.#commit((home) => updateHomeDetails(home, input));
  }

  updateFloorDetails(input: UpdateFloorDetailsInput): HomeDocument {
    return this.#commit((home) => updateFloorDetails(home, input));
  }

  removeFloor(input: RemoveFloorInput): HomeDocument {
    return this.#commit((home) => removeFloor(home, input));
  }

  createRoom(input: AddRoomInput): HomeDocument {
    return this.#commit((home) => addRoom(home, input));
  }

  createFixture(input: AddFixtureInput): HomeDocument {
    return this.#commit((home) => addFixture(home, input));
  }

  updateRoom(input: UpdateRoomInput): HomeDocument {
    return this.#commit((home) => updateRoomGeometry(home, input));
  }

  moveFixture(input: MoveFixtureInput): HomeDocument {
    return this.#commit((home) => moveFixture(home, input));
  }

  removeRoom(input: RemoveRoomInput): HomeDocument {
    return this.#commit((home) => removeRoom(home, input));
  }

  updateFixture(input: UpdateFixtureInput): HomeDocument {
    return this.#commit((home) => updateFixture(home, input));
  }

  removeFixture(input: RemoveFixtureInput): HomeDocument {
    return this.#commit((home) => removeFixture(home, input));
  }

  bindFixture(input: BindFixtureInput): HomeDocument {
    return this.#commit((home) => bindFixtureToEndpoint(home, input));
  }

  unbindFixture(input: UnbindFixtureInput): HomeDocument {
    return this.#commit((home) => unbindFixture(home, input));
  }

  createOpening(input: AddOpeningInput): HomeDocument {
    return this.#commit((home) => addOpening(home, input));
  }

  removeOpening(input: RemoveOpeningInput): HomeDocument {
    return this.#commit((home) => removeOpening(home, input));
  }

  applyChanges(input: ApplyHomeChangesInput): HomeDocument {
    return this.#commit((home) => applyHomeChanges(home, input));
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
    const before = structuredClone(this.#home);
    const fixture = resolveFixture(this.#home, input);
    const desired = setDesiredFixtureState(this.#home, input);
    this.#home = desired.home;
    const state = this.#commandExecutor
      ? await this.#commandExecutor(desired.endpoint.id, desired.requestedState)
      : desired.requestedState;
    this.#home = applyReportedState(this.#home, desired.endpoint.id, state);
    this.#undoStack.push(before);
    this.#redoStack = [];

    return {
      home: this.snapshot(),
      fixtureId: fixture.id,
      endpointId: desired.endpoint.id,
      state,
    };
  }
}
