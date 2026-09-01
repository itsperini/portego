from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from hmac import compare_digest
from secrets import token_urlsafe
from time import monotonic

import jwt
from fastapi import Depends, HTTPException, Request, status
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Settings
from .database import session_dependency
from .models import User, UserSession, utcnow

password_hash = PasswordHash.recommended()
dummy_password_hash = password_hash.hash("portego-dummy-password")


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def hash_token(token: str) -> str:
    return sha256(token.encode()).hexdigest()


def aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


@dataclass
class AuthContext:
    user: User
    session: UserSession


class LoginLimiter:
    def __init__(self, limit: int = 6, window_seconds: int = 300) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.attempts: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = monotonic()
        values = self.attempts[key]
        while values and values[0] < now - self.window_seconds:
            values.popleft()
        if len(values) >= self.limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Try again in a few minutes.",
            )

    def fail(self, key: str) -> None:
        self.attempts[key].append(monotonic())

    def clear(self, key: str) -> None:
        self.attempts.pop(key, None)


async def authenticate_user(session: AsyncSession, email: str, password: str) -> User | None:
    user = await session.scalar(select(User).where(User.email == normalize_email(email)))
    if user is None:
        password_hash.verify(password, dummy_password_hash)
        return None
    if not user.active or not password_hash.verify(password, user.password_hash):
        return None
    return user


async def create_user_session(
    session: AsyncSession, user: User, settings: Settings
) -> tuple[UserSession, str]:
    token = token_urlsafe(48)
    user_session = UserSession(
        token_hash=hash_token(token),
        csrf_token=token_urlsafe(32),
        user_id=user.id,
        expires_at=utcnow() + timedelta(days=settings.session_days),
    )
    session.add(user_session)
    await session.commit()
    return user_session, token


async def optional_auth(
    request: Request, session: AsyncSession = Depends(session_dependency)
) -> AuthContext | None:
    settings: Settings = request.app.state.settings
    token = request.cookies.get(settings.session_cookie)
    if not token:
        return None
    user_session = await session.scalar(
        select(UserSession).where(UserSession.token_hash == hash_token(token))
    )
    if user_session is None or aware(user_session.expires_at) <= datetime.now(UTC):
        return None
    user = await session.get(User, user_session.user_id)
    if user is None or not user.active:
        return None
    user_session.last_seen_at = utcnow()
    await session.commit()
    return AuthContext(user=user, session=user_session)


async def require_auth(context: AuthContext | None = Depends(optional_auth)) -> AuthContext:
    if context is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Log in to continue.")
    return context


async def require_csrf(
    request: Request, context: AuthContext = Depends(require_auth)
) -> AuthContext:
    supplied = request.headers.get("x-portego-csrf", "")
    if not supplied or not compare_digest(supplied, context.session.csrf_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token.")
    return context


def issue_gateway_token(gateway_id: str, settings: Settings) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": gateway_id,
            "aud": "portego-gateway",
            "iat": now,
            "exp": now + timedelta(days=90),
        },
        settings.gateway_jwt_secret,
        algorithm="HS256",
    )


def decode_gateway_token(token: str, settings: Settings) -> str:
    try:
        payload = jwt.decode(
            token,
            settings.gateway_jwt_secret,
            algorithms=["HS256"],
            audience="portego-gateway",
        )
    except jwt.PyJWTError as error:
        raise ValueError("Invalid gateway credential") from error
    gateway_id = payload.get("sub")
    if not isinstance(gateway_id, str):
        raise ValueError("Invalid gateway credential")
    return gateway_id
