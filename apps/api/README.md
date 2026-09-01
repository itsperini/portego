# Portego API

The private-beta FastAPI service owns account sessions, persisted home
documents, gateway claiming, and the authenticated gateway WebSocket relay.
Dependencies and commands are managed by `uv`.

Create a private-beta user without exposing the password in shell history:

    uv run portego-user create --email you@example.com --name "Your name"

The command prompts for the password. There is intentionally no public signup
route.
