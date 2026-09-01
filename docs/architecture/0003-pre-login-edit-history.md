# ADR 0003: Keep pre-login editing reversible and domain-driven

## Status

Accepted

## Context

The pre-login canvas is intentionally temporary, but temporary should not mean
fragile. Conversational editing needs individual rename and delete operations,
explicit fixture-to-device bindings, room relationships, and a way to reverse a
mistake without resetting the entire home.

## Decision

The canonical `HomeDocument` now models rooms, fixtures, bindings, endpoints,
and wall openings. A door can reference another room; a window or exterior door
can terminate outside the modeled home.

All mutations are domain functions shared by the server, browser fallback, HTTP
API, and WebMCP layer. The service records snapshots around user-visible edits.
An atomic change set evaluates against a temporary document and is committed
only when every operation succeeds. One undo reverses the complete set.

Gateway heartbeats and endpoint discovery updates do not enter user edit
history. Device control does, because it is an intentional user-visible action.

## Consequences

- Individual delete operations cascade predictably to dependent fixtures,
  bindings, and room relationships.
- A binding can be explicitly created, removed, or reassigned without changing
  the designed fixture.
- Chatbots can make several related changes without leaving a partial layout.
- Undo and redo remain in memory with the pre-login home. Account-backed event
  history and persistence are deferred to the authenticated product.
- Device discovery and pairing remain gateway concerns and are not simulated as
  conversational setup tools in this phase.
