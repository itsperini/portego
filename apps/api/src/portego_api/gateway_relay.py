import asyncio
from collections.abc import Awaitable, Callable

import httpx
from fastapi import WebSocket


class CloudflareRelayClient:
    def __init__(self, relay_url: str, secret: str) -> None:
        self._relay_url = relay_url.rstrip("/")
        self._secret = secret

    async def send_and_wait(self, gateway_id: str, message: dict, timeout: float = 30) -> dict:
        async with httpx.AsyncClient(timeout=timeout + 2) as client:
            response = await client.post(
                f"{self._relay_url}/internal/gateways/{gateway_id}/command",
                headers={"Authorization": f"Bearer {self._secret}"},
                json=message,
            )
        if response.status_code == 409:
            raise LookupError("The gateway is offline.")
        if response.status_code == 504:
            raise TimeoutError("The gateway command timed out.")
        response.raise_for_status()
        result = response.json()
        if not isinstance(result, dict):
            raise ValueError("The Cloudflare relay returned an invalid response.")
        return result


class GatewayConnections:
    def __init__(self, cloudflare: CloudflareRelayClient | None = None) -> None:
        self._connections: dict[str, WebSocket] = {}
        self._pending: dict[tuple[str, str], asyncio.Future[dict]] = {}
        self._cloudflare = cloudflare

    async def connect(self, gateway_id: str, websocket: WebSocket) -> None:
        previous = self._connections.get(gateway_id)
        if previous is not None:
            await previous.close(code=4001, reason="Gateway reconnected")
        await websocket.accept()
        self._connections[gateway_id] = websocket

    def disconnect(self, gateway_id: str, websocket: WebSocket) -> None:
        if self._connections.get(gateway_id) is websocket:
            self._connections.pop(gateway_id, None)
            for key, future in list(self._pending.items()):
                if key[0] == gateway_id and not future.done():
                    future.set_exception(ConnectionError("The gateway disconnected."))
                    self._pending.pop(key, None)

    def online(self, gateway_id: str) -> bool:
        return gateway_id in self._connections

    async def send(self, gateway_id: str, message: dict) -> None:
        websocket = self._connections.get(gateway_id)
        if websocket is None:
            raise LookupError("The gateway is offline.")
        await websocket.send_json(message)

    async def send_and_wait(self, gateway_id: str, message: dict, timeout: float = 30) -> dict:
        if gateway_id not in self._connections and self._cloudflare is not None:
            return await self._cloudflare.send_and_wait(gateway_id, message, timeout)
        message_id = message.get("messageId")
        if not isinstance(message_id, str):
            raise ValueError("A correlated gateway message requires a messageId.")
        loop = asyncio.get_running_loop()
        future: asyncio.Future[dict] = loop.create_future()
        key = (gateway_id, message_id)
        self._pending[key] = future
        try:
            await self.send(gateway_id, message)
            return await asyncio.wait_for(future, timeout=timeout)
        finally:
            self._pending.pop(key, None)

    def resolve(self, gateway_id: str, message: dict) -> bool:
        correlation_id = message.get("correlationId")
        if not isinstance(correlation_id, str):
            return False
        future = self._pending.get((gateway_id, correlation_id))
        if future is None or future.done():
            return False
        future.set_result(message)
        return True


GatewayMessageHandler = Callable[[str, dict], Awaitable[None]]
