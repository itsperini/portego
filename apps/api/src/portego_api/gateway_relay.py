import asyncio
from collections.abc import Awaitable, Callable

from fastapi import WebSocket


class GatewayConnections:
    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}
        self._pending: dict[tuple[str, str], asyncio.Future[dict]] = {}

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
