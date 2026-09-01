# Portego

Portego is a conversational control plane and digital twin for the smart home.
It is designed so that a person can describe their home, arrange rooms and
fixtures on a visual canvas, discover nearby smart devices through a local
gateway, bind those devices to the design, and control the home from an
AI assistant through MCP.

The project is at its initial architecture stage. The implementation will be
developed in this repository as an open-source, Apache-2.0-licensed project.

## Planned system

- A WebMCP-enabled web canvas and account experience deployed on Vercel.
- A cloud API, remote MCP server, and gateway relay deployed on Render.
- A Linux gateway for device discovery, local control, and offline operation.
- Protocol adapters beginning with a simulator and selected Matter/Wi-Fi
  devices, with additional radio-based protocols added incrementally.
- An MCP App experience for ChatGPT, Codex, and other compatible clients.

The detailed product and engineering blueprint is maintained one directory
above this repository in `PORTEGO_PROJECT_BLUEPRINT.md`.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
