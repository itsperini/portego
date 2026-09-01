import { describe, expect, it } from "vitest";
import {
  addFixture,
  addOpening,
  addRoom,
  applyHomeChanges,
  applyReportedState,
  bindFixtureToEndpoint,
  createDemoHome,
  endpointForFixture,
  moveFixture,
  removeRoom,
  setDesiredFixtureState,
  unbindFixture,
  updateFixture,
  updateFloorDetails,
  updateHomeDetails,
  updateRoomGeometry,
} from "../src/index.js";

describe("home model", () => {
  it("updates home metadata and renames a floor with all of its rooms", () => {
    let home = createDemoHome();
    home = addRoom(home, { label: "Studio", floor: "Attic" });
    home = updateHomeDetails(home, {
      name: "Casa Perini",
      description: "A family home",
      areaM2: 130,
    });
    home = updateFloorDetails(home, {
      floorName: "Attic",
      name: "Mansarda",
      description: "A flexible upper level",
    });

    expect(home).toMatchObject({ name: "Casa Perini", areaM2: 130 });
    expect(home.floors.find((floor) => floor.name === "Mansarda")).toMatchObject({
      description: "A flexible upper level",
    });
    expect(home.rooms[0]?.floor).toBe("Mansarda");
  });

  it("keeps a fixture independent from its automatically bound endpoint", () => {
    let home = createDemoHome();
    home = addRoom(home, { label: "Kitchen" });
    home = addFixture(home, {
      roomLabel: "Kitchen",
      label: "Kitchen ceiling",
      type: "light",
    });

    const fixture = home.fixtures[0];
    expect(fixture?.label).toBe("Kitchen ceiling");
    expect(fixture && endpointForFixture(home, fixture.id)?.id).toBe("endpoint_sim_light_1");
    expect(home.bindings).toHaveLength(1);
  });

  it("separates desired state from confirmed reported state", () => {
    let home = createDemoHome();
    home = addRoom(home, { label: "Kitchen" });
    home = addFixture(home, {
      roomLabel: "Kitchen",
      label: "Kitchen ceiling",
      type: "light",
    });

    const desired = setDesiredFixtureState(home, {
      fixtureLabel: "Kitchen ceiling",
      on: true,
      brightness: 40,
    });
    expect(desired.home.endpoints[0]?.desiredState).toMatchObject({ on: true, brightness: 40 });
    expect(desired.home.endpoints[0]?.reportedState.on).toBe(false);

    home = applyReportedState(desired.home, desired.endpoint.id, desired.requestedState);
    expect(home.endpoints[0]?.reportedState).toMatchObject({ on: true, brightness: 40 });
  });

  it("keeps geometry semantic when rooms and fixtures move", () => {
    let home = createDemoHome();
    home = addRoom(home, { label: "Kitchen", x: 100, y: 100, width: 300, height: 200 });
    home = addFixture(home, {
      roomLabel: "Kitchen",
      label: "Kitchen ceiling",
      type: "light",
    });

    home = updateRoomGeometry(home, {
      roomLabel: "Kitchen",
      x: 200,
      y: 160,
      width: 400,
      height: 240,
    });
    expect(home.fixtures[0]?.position).toEqual({ x: 400, y: 280 });

    home = moveFixture(home, { fixtureLabel: "Kitchen ceiling", x: 999, y: 0 });
    expect(home.fixtures[0]?.position).toEqual({ x: 572, y: 188 });
  });

  it("renames, reassigns, binds, relates, and removes home objects", () => {
    let home = createDemoHome();
    home = addRoom(home, { label: "Kitchen", x: 0, y: 0, width: 300, height: 200 });
    home = addRoom(home, { label: "Hall", x: 300, y: 0, width: 200, height: 200 });
    home = addFixture(home, {
      roomLabel: "Kitchen",
      label: "Ceiling light",
      type: "light",
      autoBind: false,
    });
    home = updateRoomGeometry(home, { roomLabel: "Hall", label: "Entry" });
    home = updateFixture(home, {
      fixtureLabel: "Ceiling light",
      label: "Entry light",
      roomLabel: "Entry",
    });
    home = bindFixtureToEndpoint(home, {
      fixtureLabel: "Entry light",
      endpointLabel: "Simulator light 01",
    });
    home = addOpening(home, {
      roomLabel: "Kitchen",
      connectsToRoomLabel: "Entry",
      label: "Kitchen door",
      type: "door",
      wall: "right",
    });

    expect(home.fixtures[0]).toMatchObject({ label: "Entry light", roomId: home.rooms[1]?.id });
    expect(home.bindings).toHaveLength(1);
    expect(home.openings[0]).toMatchObject({ type: "door", connectsToRoomId: home.rooms[1]?.id });

    home = unbindFixture(home, { fixtureLabel: "Entry light" });
    expect(home.bindings).toHaveLength(0);
    home = removeRoom(home, { roomLabel: "Entry" });
    expect(home.fixtures).toHaveLength(0);
    expect(home.openings).toHaveLength(0);
  });

  it("applies conversational change sets without mutating the original on failure", () => {
    const original = createDemoHome();
    const complete = applyHomeChanges(original, {
      changes: [
        { op: "add_room", input: { label: "Studio" } },
        {
          op: "add_fixture",
          input: { roomLabel: "Studio", label: "Desk light", type: "light" },
        },
      ],
    });
    expect(complete.rooms).toHaveLength(1);
    expect(complete.fixtures).toHaveLength(1);
    expect(original.rooms).toHaveLength(0);

    expect(() =>
      applyHomeChanges(original, {
        changes: [
          { op: "add_room", input: { label: "Studio" } },
          { op: "add_room", input: { label: "Studio" } },
        ],
      }),
    ).toThrow("already exists");
    expect(original.rooms).toHaveLength(0);
  });
});
