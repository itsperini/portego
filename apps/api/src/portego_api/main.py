import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings
from .database import create_database
from .gateway_relay import CloudflareRelayClient, GatewayConnections
from .homes import apply_gateway_state, merge_gateway_endpoints
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
        "lastSeenAt": utcnow().isoformat().replace("+00:00", "Z"),
        "version": gateway.agent_version,
    }
    document["updatedAt"] = utcnow().isoformat().replace("+00:00", "Z")
    home.document = document


def create_app(settings: Settings | None = None) -> FastAPI:
    configured = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine, session_factory = create_database(configured)
        app.state.settings = configured
        app.state.engine = engine
        app.state.session_factory = session_factory
        cloudflare = (
            CloudflareRelayClient(
                configured.cloudflare_relay_url,
                configured.cloudflare_relay_secret,
            )
            if configured.cloudflare_relay_url and configured.cloudflare_relay_secret
            else None
        )
        app.state.gateway_connections = GatewayConnections(cloudflare)
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

    @app.post("/internal/cloudflare/gateways/{gateway_id}/status", include_in_schema=False)
    async def cloudflare_gateway_status(gateway_id: str, request: Request) -> dict:
        expected = configured.cloudflare_relay_secret
        if not expected or request.headers.get("authorization") != f"Bearer {expected}":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
        body = await request.json()
        reported_status = body.get("status") if isinstance(body, dict) else None
        if reported_status not in {"online", "offline"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid status",
            )
        async with app.state.session_factory() as session:
            gateway = await session.get(Gateway, gateway_id)
            if gateway is None or gateway.revoked_at is not None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Gateway not found",
                )
            gateway.status = reported_status
            gateway.last_seen_at = utcnow()
            await update_gateway_document(session, gateway, reported_status == "online")
            await session.commit()
        return {"ok": True}

    @app.post("/internal/cloudflare/gateways/{gateway_id}/event", include_in_schema=False)
    async def cloudflare_gateway_event(gateway_id: str, request: Request) -> dict:
        expected = configured.cloudflare_relay_secret
        if not expected or request.headers.get("authorization") != f"Bearer {expected}":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
        message = await request.json()
        if not isinstance(message, dict) or message.get("type") not in {
            "gateway.hello",
            "gateway.state",
        }:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Unsupported gateway event",
            )
        async with app.state.session_factory() as session:
            gateway = await session.get(Gateway, gateway_id)
            if gateway is None or gateway.revoked_at is not None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Gateway not found",
                )
            home = await session.get(Home, gateway.home_id)
            if home is not None and message["type"] == "gateway.hello":
                if isinstance(message.get("agentVersion"), str):
                    gateway.agent_version = message["agentVersion"][:40]
                home.document = merge_gateway_endpoints(
                    home.document,
                    gateway.id,
                    message.get("endpoints"),
                )
                home.revision = home.document["revision"]
            if home is not None and message["type"] == "gateway.state":
                try:
                    home.document = apply_gateway_state(
                        home.document,
                        str(message.get("endpointId", "")),
                        message.get("state"),
                    )
                    home.revision = home.document["revision"]
                except ValueError:
                    pass
            gateway.status = "online"
            gateway.last_seen_at = utcnow()
            await update_gateway_document(session, gateway, True)
            await session.commit()
        return {"ok": True}

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
                    home = await session.get(Home, gateway.home_id)
                    if home is not None and message["type"] == "gateway.hello":
                        home.document = merge_gateway_endpoints(
                            home.document,
                            gateway.id,
                            message.get("endpoints"),
                        )
                        home.revision = home.document["revision"]
                    if home is not None and message["type"] == "gateway.state":
                        try:
                            home.document = apply_gateway_state(
                                home.document,
                                str(message.get("endpointId", "")),
                                message.get("state"),
                            )
                            home.revision = home.document["revision"]
                        except ValueError:
                            pass
                    if (
                        home is not None
                        and message["type"] == "gateway.command.result"
                        and message.get("ok") is True
                        and isinstance(message.get("state"), dict)
                    ):
                        try:
                            home.document = apply_gateway_state(
                                home.document,
                                str(message.get("endpointId", "")),
                                message["state"],
                            )
                            home.revision = home.document["revision"]
                        except ValueError:
                            pass
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
