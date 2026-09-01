# ADR 0006: Separate human sessions from gateway identity

- Status: accepted
- Date: 2026-09-01

## Context

Portego now needs durable homes and a way to connect a Linux gateway to a
person's account. The private beta does not need public signup, social login, or
an external identity provider yet. It does need a safe boundary between a human
using the browser and an always-on gateway maintaining a machine connection.

The pre-login canvas must remain useful. A person may design a home before they
receive an account, then expect to keep that work after their first login.

## Decision

Add a FastAPI modular monolith backed by PostgreSQL. It owns:

- manually provisioned private-beta users with Argon2 password hashes;
- opaque, revocable browser sessions in an HttpOnly cookie;
- a per-session CSRF token for state-changing browser requests;
- one authoritative home document per user for the first beta;
- explicit import of the browser-local home on first login;
- gateway claim codes and gateway-scoped bearer tokens;
- the authenticated cloud-to-gateway WebSocket.

There is no signup endpoint. Operators create users with `portego-user`. A
browser session is never reused by the gateway. The gateway starts a short-lived
claim, the signed-in owner approves its displayed code, and the gateway receives
its own scoped token only once.

Guest home data remains in browser storage. Account home data is fetched from
the API and is not copied back into the guest cache. Import removes simulated
endpoint bindings because physical hardware must be discovered again by the
claimed gateway.

## Consequences

- A compromised gateway token cannot become a human browser session.
- Password and account management stay deliberately small during private beta.
- Public signup, password recovery, email verification, organizations, and
  multiple homes per user are deferred behind stable database boundaries.
- The existing TypeScript MCP prototype can be migrated onto this authoritative
  API without coupling MCP transport to the gateway relay.
- PostgreSQL and API migrations are reproducible through Docker Compose and the
  Render Blueprint.
