# ADR 0001: Begin with a simulated end-to-end walking skeleton

## Status

Accepted

## Context

Portego spans a browser canvas, WebMCP, a cloud service, a Linux gateway, and
physical devices. Building any component in isolation would leave the most
important product assumption untested: that a conversational change can move
through the same model used by the visible interface and device control path.

## Decision

The first implementation will keep all runtimes and shared contracts in one
pnpm monorepo. It will prove one complete path:

1. create a room and light device from a WebMCP tool;
2. bind the device to one endpoint exposed by a simulated gateway;
3. control the bound endpoint through MCP;
4. reconcile the reported state into the canvas.

The web interface retains equivalent human controls and works as a local demo
if the server is unavailable. The networked path is authoritative when the
server and gateway are running.

## Consequences

- Protocol breadth and production authentication are postponed.
- The simulated adapter becomes a permanent test dependency, not disposable
  demo code.
- Domain actions must be reusable by UI controls, WebMCP handlers, API routes,
  and MCP tools.
- The designed-device-to-hardware-endpoint binding remains explicit even with one endpoint.
