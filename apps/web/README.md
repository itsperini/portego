# Portego web app

The web app is a Next.js interface for designing the home and controlling bound
devices. Konva renders the floor plan, but the persisted data is a validated
`HomeDocument`, not serialized canvas nodes.

## Run

From the repository root:

```sh
pnpm dev:web
```

The default API URL is `http://localhost:4000`. Set
`NEXT_PUBLIC_PORTEGO_API_URL` when using a deployed API.

## Canvas

The editor supports floors, rectangular rooms, snapping, room resizing, device
placement, doors, windows, bindings, zoom, pan, undo, and redo. Manual UI edits
and conversational edits call the same domain operations.

## WebMCP

The page registers structured tools in these groups:

- Read or update home and floor details.
- Add, update, move, or remove rooms and devices.
- Add and remove doors or windows.
- Bind designed devices to discovered physical endpoints.
- Control supported bound devices.
- Apply several changes atomically.
- Undo or redo edits.

Every operation validates names, geometry, device configuration, and
capabilities before saving. WebMCP is an additional interface; equivalent
visible controls remain available for people using the app directly.

## Persistence

Before login, the home is kept in browser storage. After login, FastAPI and
PostgreSQL become authoritative. On first login, Portego asks whether to import
the local design or start with an empty account home.
