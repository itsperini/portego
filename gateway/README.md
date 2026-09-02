# Portego gateway

The gateway runs on a Linux computer inside the home. It discovers local smart
devices, translates them through adapters, and maintains an outbound connection
to Portego. No router port forwarding is required.

## Components

- `cli`: setup, discovery, candidate inspection, commissioning, and inventory.
- `agent`: the long-running cloud connection and command handler.
- `discovery`: mDNS/DNS-SD, SSDP/UPnP, known-host, BLE, and neighbor observations.
- `runtime`: assembles discovery providers and installed adapters.

## Pair with Portego

Direct connection to the API:

```sh
pnpm portego -- setup \
  --api https://api.tryportego.com \
  --name "Home Raspberry Pi"
```

Optional Cloudflare relay:

```sh
pnpm portego -- setup \
  --api https://api.tryportego.com \
  --name "Home Raspberry Pi" \
  --transport cloudflare \
  --relay https://relay.tryportego.com
```

Setup prints a URL and one-time code. Open the URL on any device, log in, and
approve the gateway. The gateway receives a machine-only token and stores it in
`~/.portego/cloud.json` with owner-only permissions. It never stores the user's
email, password, or browser session.

Start the agent:

```sh
pnpm dev:gateway
```

The production Raspberry Pi package will run this agent as a system service so
it starts at boot and reconnects automatically.

## Discover devices locally

Discovery does not require a Portego account:

```sh
pnpm gateway:discover
pnpm gateway:discover -- --timeout 12
pnpm gateway:discover -- --host 192.168.1.42
pnpm gateway:discover -- --ble
pnpm gateway:discover -- --all --json
```

The default scan listens for mDNS and SSDP advertisements. It does not sweep
every address in the network. Use `--host` when multicast discovery is blocked
or you already know the device address.

BLE uses Linux BlueZ and is opt-in. Matter discovery uses DNS-SD; full Matter
fabric commissioning is not enabled yet.

## Inspect and add a device

```sh
pnpm portego -- capabilities
pnpm portego -- candidate candidate_...
pnpm portego -- add candidate_... --confirm
pnpm portego -- inventory
```

If an adapter needs credentials, pass them through standard input rather than
command flags:

```sh
pnpm portego -- add candidate_... --confirm --input-stdin
```

The CLI stores secrets in the encrypted local vault and does not expose them to
the cloud or an AI tool.

## Data flow

1. A discovery provider emits protocol-neutral observations.
2. The runtime merges duplicates into candidates.
3. Adapters score and inspect matching candidates.
4. Commissioning creates normalized devices and endpoints.
5. The agent reports endpoints and handles short-lived cloud commands.

See [`../adapters/README.md`](../adapters/README.md) for adapter boundaries and
[`../packages/README.md`](../packages/README.md) for shared contracts.
