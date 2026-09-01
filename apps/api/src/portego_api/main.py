import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings
from .database import create_database
from .gateway_relay import GatewayConnections
from .models import Base, Gateway, Home, utcnow
from .routes import router
from .security import decode_gateway_token


def bearer_token(websocket: WebSocket) -> str | None:
    authorization = websocket.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    return token if scheme.casefold() == "bearer" and token else None


async def update_gateway_document(session: object, gateway: Gateway, online: bool) -> None:
    home = await session.get(Home, gateway.home_id)
    if home is None:
        return
    document = dict(home.document)
    document["gateway"] = {
        "id": gateway.id,
        "label": gateway.name,
        "status": "online" if online else "offline",
        "lastSeenAt": utcnow().isoformat(),
        "version": gateway.agent_version,
    }
    document["updatedAt"] = utcnow().isoformat()
    home.document = document


def create_app(settings: Settings | None = None) -> FastAPI:
    configured = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine, session_factory = create_database(configured)
        app.state.settings = configured
        app.state.engine = engine
        app.state.session_factory = session_factory
        app.state.gateway_connections = GatewayConnections()
        if configured.auto_create_tables:
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
        yield
        await engine.dispose()

    app = FastAPI(
        title="Portego API",
        version="0.1.0",
        docs_url="/docs" if configured.environment != "production" else None,
        redoc_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=configured.web_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-Portego-CSRF"],
    )
    app.include_router(router)

    async def mark_gateway_offline(gateway_id: str) -> None:
        async with app.state.session_factory() as session:
            gateway = await session.get(Gateway, gateway_id)
            if gateway is not None:
                gateway.status = "offline"
                gateway.last_seen_at = utcnow()
                await update_gateway_document(session, gateway, False)
                await session.commit()

    @app.websocket("/gateway/ws", name="gateway_websocket")
    async def gateway_websocket(websocket: WebSocket) -> None:
        token = bearer_token(websocket)
        if token is None:
            await websocket.close(code=4401, reason="Gateway credential required")
            return
        try:
            gateway_id = decode_gateway_token(token, configured)
        except ValueError:
            await websocket.close(code=4401, reason="Invalid gateway credential")
            return

        async with app.state.session_factory() as session:
            gateway = await session.get(Gateway, gateway_id)
            if gateway is None or gateway.revoked_at is not None:
                await websocket.close(code=4403, reason="Gateway is not active")
                return
            await app.state.gateway_connections.connect(gateway.id, websocket)
            gateway.status = "online"
            gateway.last_seen_at = utcnow()
            await update_gateway_document(session, gateway, True)
            await session.commit()

        try:
            while True:
                raw = await websocket.receive_text()
                if len(raw) > 1_000_000:
                    await websocket.close(code=4400, reason="Message is too large")
                    break
                message = json.loads(raw)
                if not isinstance(message, dict) or not isinstance(message.get("type"), str):
                    await websocket.send_json({"type": "gateway.error", "error": "Invalid message"})
                    continue
                async with app.state.session_factory() as session:
                    gateway = await session.get(Gateway, gateway_id)
                    if gateway is None or gateway.revoked_at is not None:
                        await websocket.close(code=4403, reason="Gateway was revoked")
                        break
                    gateway.last_seen_at = utcnow()
                    gateway.status = "online"
                    if message["type"] == "gateway.hello" and isinstance(
                        message.get("agentVersion"), str
                    ):
                        gateway.agent_version = message["agentVersion"][:40]
                    await update_gateway_document(session, gateway, True)
                    await session.commit()
                app.state.gateway_connections.resolve(gateway_id, message)
                if message["type"] == "gateway.heartbeat":
                    await websocket.send_json(
                        {"type": "cloud.heartbeat.ack", "receivedAt": utcnow().isoformat()}
                    )
        except (WebSocketDisconnect, json.JSONDecodeError):
            pass
        finally:
            app.state.gateway_connections.disconnect(gateway_id, websocket)
            await asyncio.shield(mark_gateway_offline(gateway_id))

    return app


app = create_app()


def run() -> None:
    uvicorn.run("portego_api.main:app", host="0.0.0.0", port=4000, reload=False)
