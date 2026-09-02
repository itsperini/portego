from datetime import UTC, datetime, timedelta
from secrets import choice, token_urlsafe
from string import ascii_uppercase, digits

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Settings
from .database import session_dependency
from .homes import empty_home, import_home, merge_canvas_update
from .models import Gateway, GatewayClaim, Home, UserSession, utcnow
from .schemas import (
    GatewayClaimApproveInput,
    GatewayClaimPollInput,
    GatewayClaimStartInput,
    GatewayDiscoverInput,
    HomeDocument,
    HomeUpdateInput,
    LoginInput,
    ProfileInput,
)
from .security import (
    AuthContext,
    LoginLimiter,
    authenticate_user,
    create_user_session,
    hash_token,
    issue_gateway_token,
    optional_auth,
    password_hash,
    require_auth,
    require_csrf,
)

router = APIRouter()
login_limiter = LoginLimiter()


def user_payload(context: AuthContext, has_home: bool) -> dict:
    return {
        "authenticated": True,
        "user": {
            "id": context.user.id,
            "email": context.user.email,
            "displayName": context.user.display_name,
        },
        "hasHome": has_home,
        "csrfToken": context.session.csrf_token,
    }


async def home_for_user(session: AsyncSession, user_id: str) -> Home | None:
    return await session.scalar(select(Home).where(Home.user_id == user_id))


@router.get("/healthz")
async def health() -> dict:
    return {"ok": True, "service": "portego-api", "version": "0.1.0"}


@router.get("/api/auth/session")
async def auth_session(
    context: AuthContext | None = Depends(optional_auth),
    session: AsyncSession = Depends(session_dependency),
) -> dict:
    if context is None:
        return {"authenticated": False, "user": None, "hasHome": False, "csrfToken": None}
    return user_payload(context, (await home_for_user(session, context.user.id)) is not None)


@router.post("/api/auth/login")
async def login(
    body: LoginInput,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(session_dependency),
) -> dict:
    settings: Settings = request.app.state.settings
    key = f"{request.client.host if request.client else 'unknown'}:{body.email.casefold()}"
    login_limiter.check(key)
    user = await authenticate_user(session, body.email, body.password)
    if user is None:
        login_limiter.fail(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The email or password is not correct.",
        )
    login_limiter.clear(key)
    user_session, token = await create_user_session(session, user, settings)
    response.set_cookie(
        settings.session_cookie,
        token,
        max_age=settings.session_days * 86_400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    context = AuthContext(user=user, session=user_session)
    return user_payload(context, (await home_for_user(session, user.id)) is not None)


@router.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    context: AuthContext = Depends(require_csrf),
    session: AsyncSession = Depends(session_dependency),
) -> Response:
    settings: Settings = request.app.state.settings
    stored = await session.get(UserSession, context.session.id)
    if stored is not None:
        await session.delete(stored)
        await session.commit()
    response.delete_cookie(settings.session_cookie, path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.patch("/api/auth/me")
async def update_profile(
    body: ProfileInput,
    context: AuthContext = Depends(require_csrf),
    session: AsyncSession = Depends(session_dependency),
) -> dict:
    if body.displayName is not None:
        context.user.display_name = body.displayName.strip()
    if body.newPassword is not None and body.currentPassword is not None:
        if not password_hash.verify(body.currentPassword, context.user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The current password is not correct.",
            )
        context.user.password_hash = password_hash.hash(body.newPassword)
    await session.commit()
    return user_payload(context, (await home_for_user(session, context.user.id)) is not None)


@router.get("/api/home")
async def get_home(
    context: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(session_dependency),
) -> dict:
    home = await home_for_user(session, context.user.id)
    if home is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No home is saved yet.")
    return home.document


@router.post(
    "/api/home",
    status_code=status.HTTP_201_CREATED,
)
async def create_home(
    context: AuthContext = Depends(require_csrf),
    session: AsyncSession = Depends(session_dependency),
) -> dict:
    if await home_for_user(session, context.user.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This account has a home.")
    document = empty_home()
    home = Home(
        id=document["id"], user_id=context.user.id, document=document, revision=document["revision"]
    )
    session.add(home)
    await session.commit()
    return document


@router.post(
    "/api/home/import",
    status_code=status.HTTP_201_CREATED,
)
async def import_cached_home(
    body: HomeDocument,
    context: AuthContext = Depends(require_csrf),
    session: AsyncSession = Depends(session_dependency),
) -> dict:
    if await home_for_user(session, context.user.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This account has a home.")
    document = import_home(body)
    home = Home(
        id=document["id"], user_id=context.user.id, document=document, revision=document["revision"]
    )
    session.add(home)
    await session.commit()
    return document


@router.put("/api/home")
async def save_home(
    body: HomeUpdateInput,
    context: AuthContext = Depends(require_csrf),
    session: AsyncSession = Depends(session_dependency),
) -> dict:
    home = await home_for_user(session, context.user.id)
    if home is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No home is saved yet.")
    if home.revision != body.baseRevision:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This home changed elsewhere. Reload before saving another change.",
        )
    if body.home.revision <= body.baseRevision:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The new home revision must advance.",
        )
    document = merge_canvas_update(home.document, body.home)
    home.document = document
    home.revision = document["revision"]
    await session.commit()
    return document


@router.post("/api/gateway/claim/start", status_code=status.HTTP_201_CREATED)
async def start_gateway_claim(
    body: GatewayClaimStartInput,
    request: Request,
    session: AsyncSession = Depends(session_dependency),
) -> dict:
    settings: Settings = request.app.state.settings
    device_code = token_urlsafe(48)
    alphabet = ascii_uppercase + digits
    raw_code = "".join(choice(alphabet) for _ in range(8))
    user_code = f"{raw_code[:4]}-{raw_code[4:]}"
    claim = GatewayClaim(
        device_code_hash=hash_token(device_code),
        user_code=user_code,
        gateway_name=body.gatewayName,
        agent_version=body.agentVersion,
        expires_at=utcnow() + timedelta(minutes=15),
    )
    session.add(claim)
    await session.commit()
    return {
        "deviceCode": device_code,
        "userCode": user_code,
        "verificationUrl": f"{settings.web_url}/?claim={user_code}",
        "expiresAt": claim.expires_at,
        "intervalSeconds": 3,
    }


@router.post("/api/gateway/claim/poll")
async def poll_gateway_claim(
    body: GatewayClaimPollInput,
    request: Request,
    session: AsyncSession = Depends(session_dependency),
) -> dict:
    claim = await session.scalar(
        select(GatewayClaim).where(GatewayClaim.device_code_hash == hash_token(body.deviceCode))
    )
    if claim is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim not found.")
    if claim.expires_at.replace(tzinfo=claim.expires_at.tzinfo or UTC) <= datetime.now(UTC):
        claim.status = "expired"
        await session.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="The claim code expired.")
    if claim.status == "pending":
        return {"status": "pending"}
    if claim.status != "approved" or not claim.gateway_id or claim.consumed_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Claim is not available.")
    settings: Settings = request.app.state.settings
    claim.status = "consumed"
    claim.consumed_at = utcnow()
    await session.commit()
    return {
        "status": "approved",
        "gatewayId": claim.gateway_id,
        "gatewayToken": issue_gateway_token(claim.gateway_id, settings),
        "websocketUrl": str(request.url_for("gateway_websocket")).replace("http", "ws", 1),
    }


@router.post("/api/gateways/claim/approve")
async def approve_gateway_claim(
    body: GatewayClaimApproveInput,
    context: AuthContext = Depends(require_csrf),
    session: AsyncSession = Depends(session_dependency),
) -> dict:
    home = await home_for_user(session, context.user.id)
    if home is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Create a home first.")
    code = body.userCode.strip().upper()
    claim = await session.scalar(select(GatewayClaim).where(GatewayClaim.user_code == code))
    if claim is None or claim.status != "pending":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim code not found.")
    expires = claim.expires_at.replace(tzinfo=claim.expires_at.tzinfo or UTC)
    if expires <= datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="The claim code expired.")
    gateway = Gateway(
        home_id=home.id,
        name=claim.gateway_name,
        agent_version=claim.agent_version,
        status="offline",
    )
    session.add(gateway)
    await session.flush()
    claim.status = "approved"
    claim.home_id = home.id
    claim.gateway_id = gateway.id
    claim.approved_at = utcnow()
    await session.commit()
    return {"id": gateway.id, "name": gateway.name, "status": gateway.status}


@router.get("/api/gateways")
async def list_gateways(
    request: Request,
    context: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(session_dependency),
) -> dict:
    home = await home_for_user(session, context.user.id)
    if home is None:
        return {"gateways": [], "methods": []}
    gateway_rows = await session.scalars(select(Gateway).where(Gateway.home_id == home.id))
    gateways = list(gateway_rows.all())
    connections = request.app.state.gateway_connections
    return {
        "gateways": [
            {
                "id": gateway.id,
                "name": gateway.name,
                "status": "online"
                if connections.online(gateway.id) or gateway.status == "online"
                else "offline",
                "agentVersion": gateway.agent_version,
                "lastSeenAt": gateway.last_seen_at,
            }
            for gateway in gateways
            if gateway.revoked_at is None
        ],
        "methods": [
            {"id": "mdns", "label": "Local network", "description": "mDNS and DNS-SD"},
            {"id": "ssdp", "label": "Network services", "description": "SSDP and UPnP"},
            {"id": "manual", "label": "Known address", "description": "A local IP or hostname"},
            {"id": "ble", "label": "Nearby Bluetooth", "description": "BLE through Linux BlueZ"},
            {"id": "matter", "label": "Matter", "description": "Matter commissioning services"},
        ],
    }


@router.post("/api/gateways/{gateway_id}/discover")
async def discover_from_gateway(
    gateway_id: str,
    body: GatewayDiscoverInput,
    request: Request,
    context: AuthContext = Depends(require_csrf),
    session: AsyncSession = Depends(session_dependency),
) -> dict:
    home = await home_for_user(session, context.user.id)
    gateway = await session.get(Gateway, gateway_id)
    if home is None or gateway is None or gateway.home_id != home.id or gateway.revoked_at:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gateway not found.")
    message = {
        "protocolVersion": "0.1",
        "type": "cloud.discovery.start",
        "messageId": token_urlsafe(18),
        "gatewayId": gateway.id,
        "sentAt": utcnow().isoformat(),
        "expiresAt": (utcnow() + timedelta(seconds=30)).isoformat(),
        "methods": body.methods,
        **({"host": body.host} if body.host else {}),
    }
    try:
        result = await request.app.state.gateway_connections.send_and_wait(
            gateway.id, message, timeout=32
        )
    except (LookupError, ConnectionError, TimeoutError) as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    return {
        "completed": True,
        "messageId": message["messageId"],
        "candidates": result.get("candidates", []),
        "providers": result.get("providers", []),
    }
