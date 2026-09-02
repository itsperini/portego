# Quarantined TypeScript server

This was the original in-memory walking skeleton. It is retained temporarily as
reference code, but it is excluded from the pnpm workspace and must not be used
as a Portego runtime.

FastAPI in [`../api`](../api) is the only authoritative backend for accounts,
homes, gateway inventory, bindings, commands, and reported state. New server
features and tests belong there. Delete this directory once any still-useful MCP
examples have been migrated.
