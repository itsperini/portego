# ADR 0004: Shelly LAN discovery is passive-first

- Status: accepted
- Date: 2026-09-01

## Context

Portego's gateway needs to prove that a Linux host on the home network can find
real devices before account claiming, persistent storage, or the cloud relay are
implemented. Shelly is the first real vendor target because its devices expose
documented local APIs and advertise services on the LAN.

The first implementation must be safe to run on a home network and useful from
a laptop or a Raspberry Pi. It should avoid requiring device credentials merely
to identify a product, and it should not assume that the gateway can initiate an
inbound connection from the internet.

## Decision

Add a modular `@portego/adapter-shelly` package and a separate
`@portego/gateway-cli` package.

The `portego gateway discover` command:

1. listens for Gen2+ `_shelly._tcp` advertisements;
2. listens for `_http._tcp` and keeps only Shelly-looking Gen1 advertisements;
3. verifies each candidate with the device-local `GET /shelly` endpoint;
4. normalizes the identification response across Gen1 and Gen2+;
5. reports the result locally and exits.

Discovery is passive-first. The default command does not enumerate or probe
every address in the subnet. A user can explicitly supply one or more known
addresses with `--host` when multicast DNS is blocked.

No Portego authentication, cloud connection, device mutation, or credential
collection occurs in this slice. The existing always-running gateway agent
continues to use the simulated adapter until the Shelly adapter also supports
capability enumeration and commands.

## Consequences

- The MVP can be tested immediately on macOS or Linux and deployed later to a
  Raspberry Pi-class gateway.
- Gen1 and Gen2+ products share one normalized discovery result.
- Guest-network isolation, VLAN boundaries, VPN routing, or blocked UDP 5353 can
  make mDNS discovery return no devices; direct `--host` verification remains
  available.
- Discovery alone does not prove that a device can be controlled. Authentication,
  component enumeration, endpoint mapping, binding, and execution remain later
  milestones.
- The CLI and long-running agent remain separate entry points, so future setup
  and diagnostics do not need to be embedded in the daemon process.
