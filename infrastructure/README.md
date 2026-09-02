# Infrastructure

Portego keeps deployment boundaries small:

- Vercel serves `apps/web`.
- Render runs `apps/api` and PostgreSQL through `render.yaml`.
- Cloudflare optionally runs the gateway relay in `cloudflare-relay`.
- A Linux or Raspberry Pi-class device runs the gateway inside the home.

The direct Render WebSocket is the default gateway transport. Cloudflare is an
optional route and does not change discovery, adapters, or the gateway protocol.

See [`cloudflare-relay/README.md`](cloudflare-relay/README.md) for local testing,
secrets, and deployment commands.
