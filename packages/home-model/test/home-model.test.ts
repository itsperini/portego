import { describe, expect, it } from "vitest";
import {
  addFixture,
  addRoom,
  applyReportedState,
  createDemoHome,
  endpointForFixture,
  setDesiredFixtureState,
} from "../src/index.js";

describe("home model", () => {
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
});
