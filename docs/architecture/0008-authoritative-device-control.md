# 0008: FastAPI is the authoritative device-control path

## Status

Accepted.

## Decision

FastAPI owns persisted homes and the full gateway command lifecycle:

1. The gateway sends its normalized endpoint inventory in `gateway.hello` and
   after discovery.
2. FastAPI maps protocol capabilities into `HomeDocument` capabilities—for
   example, gateway `on_off` becomes canvas `power`—and persists the endpoints.
3. A designed device binds to one compatible endpoint in `HomeDocument`.
4. A control request goes to FastAPI, which sends `cloud.device.set_state` over
   the authenticated gateway connection.
5. FastAPI updates desired and reported state only after
   `gateway.command.result` confirms success. Later `gateway.state` events also
   refresh reported state.

The browser no longer simulates success for authenticated homes. It periodically
refreshes the account-backed home so physical changes and gateway events appear
on the canvas.

## Discovery and inventory

Devices whose local driver reports `ready` and `safeToAutomate` are stored in the
gateway inventory during discovery. This currently covers unauthenticated Shelly
devices: discovery does not reconfigure them, but makes their endpoints available
for an explicit canvas binding. Devices requiring credentials or a physical
commissioning action remain candidates until a dedicated setup flow is added.
