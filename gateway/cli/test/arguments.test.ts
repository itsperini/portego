import { describe, expect, it } from "vitest";
import { parseArguments } from "../src/arguments.js";

describe("gateway CLI arguments", () => {
  it("accepts protocol-neutral discovery options", () => {
    expect(
      parseArguments([
        "gateway",
        "discover",
        "--",
        "--timeout",
        "3.5",
        "--host",
        "192.0.2.10",
        "--ble",
        "--all",
        "--json",
      ]),
    ).toMatchObject({
      command: "discover",
      timeoutMs: 3_500,
      hosts: ["192.0.2.10"],
      includeBle: true,
      includeUnknown: true,
      json: true,
    });
  });

  it("requires explicit confirmation to be represented for commissioning", () => {
    expect(
      parseArguments(["gateway", "add", "candidate_test", "--confirm", "--input-stdin"]),
    ).toEqual({
      command: "commission",
      candidateId: "candidate_test",
      confirmed: true,
      inputFromStdin: true,
      json: false,
    });
  });

  it("requires a host when mDNS is disabled", () => {
    expect(() => parseArguments(["discover", "--no-mdns"])).toThrow(/--host/);
  });
});
