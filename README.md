# Portego

Portego is a conversational control plane and digital twin for the smart home.
Describe a home to an AI assistant, see it become a spatial model, bind physical
hardware endpoints to designed devices, and control those devices through MCP.

This repository contains every Portego runtime and shared contract. The first
walking skeleton is deliberately small but complete:

1. Codex adds a room and device through site tools (WebMCP).
2. A simulated Linux gateway connects to the cloud service over WebSocket.
3. The device binds to the discovered virtual light.
4. The remote MCP tool controls the light.
5. Confirmed reported state appears on the same canvas.

## Monorepo

    apps/
      web/                 Next.js + Konva spatial editor and WebMCP tools
      server/              HTTP API, remote MCP server, gateway relay
    gateway/
      agent/               Linux gateway runtime and reconnect loop
      cli/                 local gateway setup and discovery commands
    adapters/
      simulated/           deterministic virtual device adapter
      shelly/              local Shelly mDNS and HTTP discovery
    packages/
      home-model/          rooms, devices, openings, bindings, state
      gateway-protocol/    versioned cloud-gateway messages
    docs/
      architecture/        architecture decision records
    render.yaml            Render Blueprint

The important separation is preserved in the domain model:

    Room -> Device -> Binding -> DeviceEndpoint
      \-> Opening -> related Room / outside

A designed device represents stable human intent (“Kitchen ceiling”). A device
endpoint represents replaceable physical hardware. Automations and conversations
target designed devices rather than vendor identifiers.

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

## Discover Shelly devices locally

The first real gateway integration discovers Shelly Gen1 and Gen2+ devices on
the gateway's current LAN without a Portego account or cloud connection:

    pnpm gateway:discover

The command listens for `_shelly._tcp` and Shelly `_http._tcp` mDNS
advertisements for six seconds. It verifies only likely Shelly candidates using
the local, read-only `GET /shelly` identification endpoint. It does not sweep
the subnet, change a device, request device credentials, or send discovery data
outside the machine.

If multicast discovery is unavailable but the device address is known:

    pnpm gateway:discover -- --host 192.168.1.42

Useful options:

    pnpm gateway:discover -- --timeout 12
    pnpm gateway:discover -- --host shellyplus1pm.local --json
    pnpm gateway:discover -- --no-mdns --host 192.168.1.42

The gateway machine and Shelly devices must be on a LAN where multicast DNS is
allowed. Guest networks, client isolation, VLAN boundaries, host firewalls, and
some VPNs can prevent advertisements from reaching the gateway. This MVP only
identifies devices; capability enumeration, credentials, control, claiming,
background operation, and cloud relay come next.

## Try the vertical slice

Open the canvas in the Codex built-in browser and ask:

> Create a kitchen, then add a ceiling light and turn it on at 40 percent.

The top-level page registers 20 imperative site tools:

- home.get_document
- home.update_details
- home.update_floor_details
- home.remove_floor
- home.add_room
- home.update_room
- home.remove_room
- home.add_device
- home.move_device
- home.update_device
- home.remove_device
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
- dragging rooms and devices with a 20-unit grid snap;
- resizing rooms with eight handles;
- keeping devices constrained to their room;
- renaming and individually removing rooms and devices;
- moving devices between rooms;
- explicit device binding, unbinding, and reassignment;
- configurable lights, switches, smart plugs, and sensors with type-specific controls;
- type-specific canvas and navigation icons;
- capability-safe hardware matching that rejects incomplete endpoints;
- semantic doors and windows, including room-to-room relationships;
- atomic conversational change sets with undo and redo;
- pointer-centered wheel zoom and blank-space panning;
- zoom controls and fit-to-home;
- semantic room and device updates through the API and WebMCP.

The canvas breadcrumb opens home or floor details directly in the docked right
inspector. Devices and rooms use the same contextual property rail for names,
room assignment, device type and configuration, hardware binding, capability-driven
state controls, removal, and wall openings. **Add a device** opens a draft form;
nothing is added until its room, type, and configuration are applied.
Closing it gives the space back to the canvas while keeping the selection.

Portego stores room and device geometry, not serialized Konva nodes. Manual,
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
device pairing/control, and background service installation are intentionally
outside this pre-login walking skeleton. Local Shelly identification is now the
first real protocol discovery slice.

The detailed product and engineering blueprint is maintained one directory
above this repository in PORTEGO_PROJECT_BLUEPRINT.md.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
