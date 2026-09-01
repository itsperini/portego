import { describe, expect, it } from "vitest";
import { MatterDriver, parseMatterSetupCode } from "../src/index.js";

describe("Matter driver", () => {
  it("validates and decodes a manual setup code with matter.js", () => {
    expect(parseMatterSetupCode("3497-011-2332")).toEqual({
      format: "manual",
      passcode: 20202021,
      shortDiscriminator: 15,
    });
  });

  it("recognizes commissionable DNS-SD advertisements", async () => {
    const driver = new MatterDriver();
    const match = await driver.match({
      id: "candidate_matter",
      displayName: "Matter device",
      transports: ["ip"],
      addresses: [{ host: "192.0.2.30", port: 5540, family: "ipv4", protocol: "udp" }],
      serviceTypes: ["_matterc._udp"],
      observations: [],
      matches: [],
      warnings: [],
    });
    expect(match).toEqual({ confidence: 1, reason: "Matter commissionable DNS-SD service" });
  });
});
