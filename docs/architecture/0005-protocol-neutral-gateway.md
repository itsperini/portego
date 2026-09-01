# ADR 0005: The gateway core is protocol-neutral and AI-operable

- Status: accepted
- Date: 2026-09-01

## Context

The first real gateway slice combined Shelly mDNS browsing, device
identification, and CLI presentation in one adapter. That proved local network
visibility, but it would force every future integration to implement its own
multicast sockets, deduplication, persistence, credential handling, and AI
workflow.

Home automation integration lists also mix fundamentally different concepts:
transports such as BLE, discovery protocols such as mDNS, interoperable standards
such as Matter, vendor APIs such as Shelly, message brokers such as MQTT, and
cloud account platforms. Treating all of them as equivalent adapters creates an
unsafe and unmaintainable gateway.

Portego must make setup conversational without allowing an AI to guess secrets,
pair the wrong nearby product, claim success after discovery alone, or expose
vendor identifiers to the cloud.

## Decision

Separate the gateway into six layers:

1. **Discovery providers** observe transports and emit neutral observations.
2. **Candidate aggregation** deduplicates observations without vendor logic.
3. **Driver matching** assigns scored standard or vendor drivers.
4. **Commissioning plans** declare required inputs, physical actions, mutations,
   and whether automation is safe.
5. **Local storage** persists the latest discovery and normalized inventory;
   an AES-256-GCM vault holds credentials under a gateway-only key.
6. **AI setup tools** expose a small validated facade that redacts native and
   sensitive identifiers and requires literal confirmation for commissioning.

The implemented dependency direction is:

    gateway/discovery -> packages/gateway-core
    adapters/*        -> packages/gateway-core
    gateway/runtime   -> discovery + adapters + core
    gateway/cli       -> runtime + core
    gateway-tools     -> core runtime API

Discovery providers never import vendor adapters. Drivers never open multicast
sockets. The composition root decides which providers and drivers are installed.

## Discovery providers

The default runtime installs:

- mDNS/DNS-SD for known local smart-home service families;
- SSDP/UPnP response collection;
- explicit local hostname, address, or URL observations;
- BlueZ BLE scanning on Linux, disabled unless requested;
- ARP/NDP neighbor-table hints, disabled unless requested.

Passive advertisements and explicit hosts are preferred. Portego does not scan
every private address by default. A neighbor observation only says that a host
exists; it is not treated as a smart device until a driver verifies it.

Explicit targets are constrained to private IPv4, private IPv6, or IPv6
link-local addresses and to `.local` or single-label hostnames that resolve only to those
address ranges. Loopback, public DNS names, public addresses, and the common
cloud-instance metadata address are rejected. Device HTTP redirects are also
disabled. These checks apply again at the driver request boundary so an
AI-supplied target cannot turn discovery into a general-purpose network fetch.

## Candidate and driver model

An observation contains transport, method, addresses, service types, metadata,
and internal identity hints. Aggregation joins observations that share an
address or stable hint and assigns an opaque candidate id. Native MAC addresses,
serial numbers, and service ids remain local metadata and are redacted from
AI-facing output.

A driver implements availability, matching, inspection, commissioning planning,
commissioning, endpoint refresh, execution, and credential revocation. Match
confidence is retained because one physical product may expose more than one
standard. For example, a Shelly Gen4 product can expose both Shelly RPC and
Matter operational services.

Discovery and commissioning are different states. A candidate may be reachable
and fully described while still requiring credentials, a setup code, a physical
button, or an unavailable controller backend.

## AI safety contract

The setup facade exposes:

- `gateway.capabilities`
- `discovery.start`
- `discovery.get_candidate`
- `device.commission`
- `device.list`
- `device.refresh`

The AI should discover, explain, ask for missing input, obtain confirmation, and
only then commission. `device.commission` validates `confirmed: true`. Secrets
are not accepted as chatbot tool arguments. A local secure-input broker supplies
them directly to the gateway, which stores them by reference in its encrypted
vault, never in the inventory or candidate response. The CLI currently provides
that local path through standard input; shell flags do not accept passwords or
setup codes because process lists and history can expose them.

Commissioning plans declare whether they mutate the device and whether they are
safe to automate. Matter is never reported as paired merely because a QR code or
DNS-SD record was decoded.

## Current integrations

The Shelly driver supports:

- Gen1 and Gen2+ local identity;
- HTTP Digest credentials when configured;
- paged `Shelly.GetComponents` inspection;
- normalized relays, inputs, lights, covers, meters, and common sensors;
- desired commands only for controllable endpoints;
- read-only refresh for status and capability reconciliation.

The Matter driver supports commissionable/operational DNS-SD recognition and
validates QR/manual setup codes using matter.js. Its persistent controller is an
injected backend. Until that backend is enabled, the commissioning plan is
explicitly unsupported. Matter-over-Thread will additionally require an
available Thread Border Router.

BLE discovery uses BlueZ on the Raspberry Pi/Linux target. BLE advertisements
are neutral observations; standard GATT profiles or vendor drivers are still
required before Portego can interpret or pair a device.

## Consequences

- New integrations reuse network discovery, persistence, redaction, and AI
  setup behavior.
- The gateway can explain partial support instead of failing silently.
- Protocol-specific code remains testable with injected network and controller
  backends.
- Cloud and local MCP transports can call the same gateway runtime without
  learning vendor protocols.
- The existing simulated cloud relay remains on gateway protocol `0.1` until a
  versioned candidate/commissioning message contract is introduced; local setup
  is not blocked on cloud authentication.
