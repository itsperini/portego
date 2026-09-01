import { describe, expect, it } from "vitest";
import { parseArguments } from "../src/arguments.js";

describe("gateway CLI arguments", () => {
  it("accepts both the top-level and gateway-prefixed discovery command", () => {
    expect(parseArguments(["discover"])).toMatchObject({ command: "discover", timeoutMs: 6_000 });
    expect(parseArguments(["gateway", "discover"])).toMatchObject({
      command: "discover",
      timeoutMs: 6_000,
    });
  });

  it("parses repeatable hosts and timeouts", () => {
    expect(
      parseArguments([
        "discover",
        "--",
        "--timeout",
        "3.5",
        "--host",
        "192.0.2.10",
        "--host",
        "shelly.local",
        "--json",
      ]),
    ).toMatchObject({
      timeoutMs: 3_500,
      hosts: ["192.0.2.10", "shelly.local"],
      json: true,
    });
  });

  it("requires a direct host when mDNS is disabled", () => {
    expect(() => parseArguments(["discover", "--no-mdns"])).toThrow(/--host/);
  });
});
