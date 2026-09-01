import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { PortegoService } from "./service.js";

export function createPortegoMcpServer(service: PortegoService): McpServer {
  const server = new McpServer({
    name: "portego",
    version: "0.1.0",
  });

  server.registerTool(
    "home.get_overview",
    {
      title: "Get home overview",
      description:
        "Read the current Portego home, including rooms, fixtures, bindings, device state, and gateway status.",
      inputSchema: z.object({}),
    },
    async () => {
      const home = service.snapshot();
      return {
        content: [
          {
            type: "text",
            text:
              home.name +
              " has " +
              home.rooms.length +
              " rooms, " +
              home.fixtures.length +
              " fixtures, and gateway status " +
              home.gateway.status +
              ".",
          },
        ],
        structuredContent: { home },
      };
    },
  );

  server.registerTool(
    "device.set_state",
    {
      title: "Set fixture state",
      description:
        "Set the power or brightness of one named, bound fixture. This changes a simulated physical device in the walking skeleton.",
      inputSchema: z.object({
        fixtureLabel: z.string().min(1).max(80),
        on: z.boolean().optional(),
        brightness: z.number().int().min(0).max(100).optional(),
      }),
    },
    async ({ fixtureLabel, on, brightness }) => {
      try {
        const result = await service.setFixtureState({
          fixtureLabel,
          ...(on !== undefined ? { on } : {}),
          ...(brightness !== undefined ? { brightness } : {}),
        });
        return {
          content: [
            {
              type: "text",
              text:
                fixtureLabel +
                " now reports " +
                (result.state.on ? "on" : "off") +
                (result.state.brightness !== undefined
                  ? ` at ${result.state.brightness} percent.`
                  : "."),
            },
          ],
          structuredContent: {
            fixtureId: result.fixtureId,
            endpointId: result.endpointId,
            state: result.state,
            revision: result.home.revision,
          },
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : "The fixture could not be controlled.",
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}
