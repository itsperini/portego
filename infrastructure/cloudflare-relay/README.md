# Portego Cloudflare gateway relay

This optional transport places a Cloudflare Worker and one Durable Object per
gateway in front of the existing Portego WebSocket endpoint. The gateway still
opens an outbound-only connection and never exposes the home network.

The relay validates the existing Portego gateway JWT and keeps a hibernatable
WebSocket in a Durable Object dedicated to that gateway. Render sends commands
to the object over an authenticated internal endpoint. The API remains the
source of truth for accounts, gateway revocation, commands, and device state.

## Local development

Copy `.dev.vars.example` to `.dev.vars` and give
`PORTEGO_GATEWAY_JWT_SECRET` the same development value used by the API. Then:

```sh
pnpm --filter @portego/cloudflare-relay dev
```

Pair a fresh gateway through the relay:

```sh
pnpm portego -- setup \
  --api http://localhost:4000 \
  --name "Home Raspberry Pi" \
  --transport cloudflare \
  --relay http://localhost:8787
```

## Deploy

Authenticate interactively with `pnpm wrangler login`, or set a scoped
`CLOUDFLARE_API_TOKEN` in CI. Add the gateway JWT secret without committing it:

```sh
pnpm --filter @portego/cloudflare-relay exec wrangler secret put PORTEGO_GATEWAY_JWT_SECRET
pnpm --filter @portego/cloudflare-relay exec wrangler secret put PORTEGO_RELAY_SHARED_SECRET
pnpm --filter @portego/cloudflare-relay deploy
```

Set `PORTEGO_API_CALLBACK_URL` in `wrangler.jsonc` to the deployed Render API URL. A
custom `relay.tryportego.com` route can be attached after the first deployment.

Configure Render with the deployed relay URL and the same relay-only secret:

```text
PORTEGO_CLOUDFLARE_RELAY_URL=https://portego-gateway-relay.<account>.workers.dev
PORTEGO_CLOUDFLARE_RELAY_SECRET=<same relay-only secret>
```
