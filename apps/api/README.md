# Portego API

This FastAPI service is Portego's authoritative backend. It persists the home,
gateway endpoint inventory and bindings, relays device commands, and applies
confirmed state reported by the gateway.

The browser sends device state changes to
`POST /api/devices/{device_id}/state`. The API resolves the bound endpoint,
forwards a short-lived command over the authenticated gateway WebSocket, and
returns the updated home only after the gateway acknowledges the real state.

The FastAPI service owns private-beta accounts, browser sessions, persistent
homes, gateway claims, direct gateway connections, and the optional Cloudflare
relay callback.

## Run

From the repository root:

```sh
pnpm dev:api
```

Dependencies are managed by `uv`; database schema changes use Alembic.

## Create a private-beta user

Create a private-beta user without exposing the password in shell history:

    uv run portego-user create --email you@example.com --name "Your name"

The command prompts for the password. There is intentionally no public signup
route.

## Security boundaries

- Browser sessions use opaque HttpOnly cookies and CSRF tokens.
- Passwords use Argon2 hashes.
- Gateways receive separate, gateway-scoped JWTs after one-time approval.
- Home writes use optimistic revisions to reject stale updates.
- The Cloudflare relay uses a separate shared secret for internal API calls.

Important environment variables:

```text
PORTEGO_DATABASE_URL
PORTEGO_WEB_URL
PORTEGO_WEB_ORIGINS
PORTEGO_GATEWAY_JWT_SECRET
PORTEGO_CLOUDFLARE_RELAY_URL       # optional
PORTEGO_CLOUDFLARE_RELAY_SECRET    # optional
```

The API remains the source of truth whether a gateway connects directly or
through Cloudflare.
