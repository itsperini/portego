# Shared packages

These packages contain contracts reused by the web app, API prototypes, gateway,
and adapters. They are libraries, not standalone services.

- `home-model`: homes, floors, rooms, openings, designed devices, physical
  endpoints, bindings, state, and semantic editing operations.
- `gateway-core`: discovery candidates, adapter interfaces, inventory, local
  storage, and encrypted credential handling.
- `gateway-protocol`: versioned messages exchanged by the cloud and gateway.
- `gateway-tools`: validated, redacted gateway operations designed for safe AI
  use.

The central distinction is:

```text
Room → designed device → binding → physical endpoint
```

Conversations target stable names such as “Kitchen ceiling,” while a binding
can be replaced when the underlying hardware changes.
