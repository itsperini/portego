# Portego

Portego is a conversational control plane and digital twin for the smart home.
Describe a home to an AI assistant, see it become a spatial model, bind physical
devices to designed fixtures, and control those fixtures through MCP.

This repository contains every Portego runtime and shared contract. The first
walking skeleton is deliberately small but complete:

1. Codex adds a room and fixture through site tools (WebMCP).
2. A simulated Linux gateway connects to the cloud service over WebSocket.
3. The fixture binds to the discovered virtual light.
4. The remote MCP tool controls the light.
5. Confirmed reported state appears on the same canvas.

## Monorepo

    apps/
      web/                 Next.js + Konva spatial editor and WebMCP tools
      server/              HTTP API, remote MCP server, gateway relay
    gateway/
      agent/               Linux gateway runtime and reconnect loop
    adapters/
      simulated/           deterministic virtual device adapter
    packages/
      home-model/          rooms, fixtures, openings, bindings, state
      gateway-protocol/    versioned cloud-gateway messages
    docs/
      architecture/        architecture decision records
    render.yaml            Render Blueprint

The important separation is preserved in the domain model:

    Room -> Fixture -> Binding -> DeviceEndpoint
      \-> Opening -> related Room / outside

A fixture represents the stable human intent (“Kitchen ceiling”). A device
endpoint represents replaceable hardware. Automations and conversations should
target fixtures rather than vendor identifiers.

## Run locally

Requirements:

- Node.js 22 or newer
- pnpm 11

Install and start all runtimes:

    corepack enable
    pnpm install
    pnpm dev

Then open:

- Web canvas: http://localhost:3100
- Service health: http://localhost:4000/healthz
- Remote MCP endpoint: http://localhost:4000/mcp
- Gateway WebSocket: ws://localhost:4000/gateway

The root development command starts the web app, server, and simulated gateway
together. If the server is unavailable, the canvas falls back to an explicit
browser-local demo so its human controls and WebMCP tools remain testable.

## Try the vertical slice

Open the canvas in the Codex built-in browser and ask:

> Create a kitchen, then add a ceiling light and turn it on at 40 percent.

The top-level page registers 17 imperative site tools:

- home.get_document
- home.add_room
- home.update_room
- home.remove_room
- home.add_fixture
- home.move_fixture
- home.update_fixture
- home.remove_fixture
- home.add_opening
- home.remove_opening
- home.apply_changes
- home.undo
- home.redo
- device.bind
- device.unbind
- device.set_state
- home.reset_demo

The same actions are available through visible controls. WebMCP is a progressive
enhancement, not a replacement for an accessible interface.

## Edit the floor plan

The center canvas uses `react-konva` as an interaction and rendering layer over
the canonical `HomeDocument`. It supports:

- multiple named floors, with a floor selector and floor-specific rooms;
- an all-floors perspective overview with miniature plans and click-to-activate sheets;
- dragging rooms and fixtures with a 20-unit grid snap;
- resizing rooms with eight handles;
- keeping fixtures constrained to their room;
- renaming and individually removing rooms and fixtures;
- moving fixtures between rooms;
- explicit device binding, unbinding, and reassignment;
- semantic doors and windows, including room-to-room relationships;
- atomic conversational change sets with undo and redo;
- pointer-centered wheel zoom and blank-space panning;
- zoom controls and fit-to-home;
- semantic room and fixture updates through the API and WebMCP.

Selecting a fixture or room reveals a compact property tab at the right edge of
the canvas. Opening it expands a docked inspector for names, room assignment,
device binding, power, brightness, removal, and wall openings. Closing it gives
the space back to the canvas while keeping the selection.

Portego stores room and fixture geometry, not serialized Konva nodes. Manual,
API, and conversational edits therefore produce the same validated model.

## Check the repository

    pnpm check

This lints the repository, type-checks every workspace, runs unit and contract
tests, and creates production builds.

## Deployment direction

- Vercel: deploy the apps/web workspace.
- Render: apply render.yaml for the server and PostgreSQL.
- Linux gateway: build gateway/agent for ARM64 or AMD64.

Production authentication, persistent database storage, gateway claiming,
device discovery/pairing, and a real protocol adapter are intentionally outside
this pre-login walking skeleton.

The detailed product and engineering blueprint is maintained one directory
above this repository in PORTEGO_PROJECT_BLUEPRINT.md.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
