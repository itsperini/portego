# ADR 0002: Treat Konva as an editable projection

## Status

Accepted

## Context

The initial SVG floor plan proved that WebMCP changes could remain visible, but
it did not provide the interactions expected from a spatial editor. Portego
needs room movement and resizing, device placement, snapping, zooming, and
panning without coupling the product model to a browser rendering library.

## Decision

The web workspace uses `react-konva` for the center editor. Konva owns drawing,
hit detection, pointer gestures, selection handles, and viewport transforms.
It does not own persisted state.

Every completed gesture becomes a semantic domain command:

    room drag/resize -> updateRoomGeometry -> HomeDocument revision
    device drag    -> moveDevice       -> HomeDocument revision
    wall opening    -> addOpening        -> HomeDocument revision

The same commands are exposed through HTTP and page-level WebMCP tools. The
server response remains authoritative. The browser-local fallback applies the
same functions from `@portego/home-model`.

The editor uses a 1000 by 650 document coordinate system and a 20-unit snap
grid. Room changes preserve the relative placement of their devices. Device
movement is clamped to the containing room.

## Consequences

- Konva scene serialization is not a Portego storage format.
- Replacing the renderer does not require migrating home data.
- Undo and redo operate on semantic document changes rather than Konva state.
- Canvas-only objects require equivalent HTML controls for accessibility.
- Doors and windows are semantic openings attached to room walls. Doors may
  relate two rooms. Polygonal rooms and a normalized shared-wall network remain
  future concepts rather than ad-hoc drawing primitives.
