# Device adapters

Adapters translate a device standard or manufacturer API into Portego's common
device and endpoint model. Discovery providers find candidates; adapters decide
whether they understand them and how to inspect, commission, refresh, or control
them.

## Included adapters

- `shelly`: Shelly Gen1 and Gen2+ identification, component mapping, state, and
  guarded local commands.
- `matter`: Matter DNS-SD recognition and setup-code validation. Persistent
  fabric commissioning is still planned.
- `simulated`: deterministic devices for local development and tests.

An adapter must not scan the network itself. It receives observations from
`gateway/discovery`, returns normalized endpoints, and keeps vendor identifiers
inside the gateway whenever possible.

New adapters implement the interfaces in `@portego/gateway-core` and are wired
into `gateway/runtime`.
