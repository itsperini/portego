import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

describe("Cloudflare gateway relay", () => {
  it("reports its health without requiring relay credentials", async () => {
    const response = await worker.fetch?.(
      new Request("https://relay.tryportego.com/healthz"),
      {} as never,
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      ok: true,
      service: "portego-cloudflare-relay",
    });
  });
});
